//! SQLite 对话存储模块

use std::path::Path;
use std::sync::Arc;

use parking_lot::Mutex;
use rusqlite::Connection;
use serde::{Deserialize, Serialize};

/// 对话记录（写入用）
pub struct ConversationRecord {
    pub id: String,
    pub model: String,
    pub endpoint: String,
    pub system_prompt: Option<String>,
    pub request_messages: String,
    pub request_tools: Option<String>,
    pub response_content: String,
    pub input_tokens: i32,
    pub output_tokens: i32,
    pub stop_reason: String,
    pub stream: bool,
    pub duration_ms: i64,
}

/// 对话记录（查询结果 - 完整详情）
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConversationRow {
    pub id: String,
    pub created_at: String,
    pub model: String,
    pub endpoint: String,
    pub system_prompt: Option<String>,
    pub request_messages: String,
    pub request_tools: Option<String>,
    pub response_content: String,
    pub input_tokens: i32,
    pub output_tokens: i32,
    pub stop_reason: String,
    pub stream: bool,
    pub duration_ms: i64,
    pub session_id: Option<String>,
}

/// 对话列表项（轻量，不含完整大文本字段）
/// - request_messages 截断到 500 字符
/// - 不含 system_prompt / request_tools / response_content
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConversationListItem {
    pub id: String,
    pub created_at: String,
    pub model: String,
    pub endpoint: String,
    /// 截断后的请求消息（≤500 字符）
    pub request_messages_preview: String,
    pub input_tokens: i32,
    pub output_tokens: i32,
    pub stop_reason: String,
    pub stream: bool,
    pub duration_ms: i64,
    pub session_id: Option<String>,
}

/// 分页查询参数
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConversationQuery {
    /// 页码（从 1 开始）
    #[serde(default = "default_page")]
    pub page: u32,
    /// 每页条数
    #[serde(default = "default_page_size")]
    pub page_size: u32,
    /// 按模型筛选
    pub model: Option<String>,
    /// 按端点筛选（v1 / cc_v1）
    pub endpoint: Option<String>,
    /// 按 stop_reason 筛选
    pub stop_reason: Option<String>,
    /// 是否流式请求筛选
    pub stream: Option<bool>,
    /// 排序字段（created_at / duration_ms / input_tokens / output_tokens）
    #[serde(default = "default_sort_by")]
    pub sort_by: String,
    /// 排序方向（asc / desc）
    #[serde(default = "default_sort_order")]
    pub sort_order: String,
}

fn default_page() -> u32 { 1 }
fn default_page_size() -> u32 { 20 }
fn default_sort_by() -> String { "created_at".to_string() }
fn default_sort_order() -> String { "desc".to_string() }

/// 分页查询结果（列表轻量版）
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConversationPage {
    pub items: Vec<ConversationListItem>,
    pub total: u64,
    pub page: u32,
    pub page_size: u32,
    pub total_pages: u32,
}

/// Token 统计查询参数
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TokenStatsQuery {
    /// 统计最近 N 小时（默认 24）
    #[serde(default = "default_stats_hours")]
    pub hours: u32,
}

fn default_stats_hours() -> u32 { 24 }

/// Token 统计单条数据
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TokenStatsItem {
    /// 时间段标识（如 "2024-01-01T12:00:00Z"）
    pub time: String,
    /// 该时间段消耗的 token 总量（input + output）
    pub tokens: i64,
}

/// Token 统计响应
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TokenStatsResponse {
    /// 按小时聚合的统计数据
    pub items: Vec<TokenStatsItem>,
    /// 统计的总小时数
    pub hours: u32,
    /// 统计时间段内的 token 总量
    pub total_tokens: i64,
}

/// 模型列表响应
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConversationModelsResponse {
    pub models: Vec<String>,
}

/// 对话数据库
#[derive(Clone)]
pub struct ConversationDb {
    conn: Arc<Mutex<Connection>>,
}

fn migrate_conversations_table(conn: &Connection) -> anyhow::Result<()> {
    let has_request_tools = conn
        .prepare("SELECT 1 FROM pragma_table_info('conversations') WHERE name = 'request_tools'")?
        .exists([])?;
    if !has_request_tools {
        conn.execute(
            "ALTER TABLE conversations ADD COLUMN request_tools TEXT",
            [],
        )?;
        tracing::info!("已迁移 conversations 表：新增 request_tools 列");
    }

    let has_session_id = conn
        .prepare("SELECT 1 FROM pragma_table_info('conversations') WHERE name = 'session_id'")?
        .exists([])?;
    if !has_session_id {
        conn.execute("ALTER TABLE conversations ADD COLUMN session_id TEXT", [])?;
        conn.execute_batch("CREATE INDEX IF NOT EXISTS idx_conversations_session_id ON conversations(session_id)")?;
        tracing::info!("已迁移 conversations 表：新增 session_id 列");
    }

    Ok(())
}

/// 从 request_messages JSON 中提取第一条 user 消息的 content，计算 MD5 作为会话标识
fn compute_session_id(request_messages: &str) -> Option<String> {
    let messages: Vec<serde_json::Value> = serde_json::from_str(request_messages).ok()?;
    let first_user = messages.iter().find(|m| m.get("role").and_then(|r| r.as_str()) == Some("user"))?;
    let content = first_user.get("content")?.to_string();
    Some(format!("{:x}", md5::compute(content.as_bytes())))
}

impl ConversationDb {
    /// 初始化数据库连接并创建表
    pub fn init(db_path: &str) -> anyhow::Result<Self> {
        let path = Path::new(db_path);
        if let Some(parent) = path.parent() {
            if !parent.exists() {
                std::fs::create_dir_all(parent)?;
            }
        }

        let conn = Connection::open(db_path)?;

        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS conversations (
                id TEXT PRIMARY KEY,
                created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
                model TEXT NOT NULL,
                endpoint TEXT NOT NULL,
                system_prompt TEXT,
                request_messages TEXT NOT NULL,
                request_tools TEXT,
                response_content TEXT NOT NULL DEFAULT '',
                input_tokens INTEGER NOT NULL DEFAULT 0,
                output_tokens INTEGER NOT NULL DEFAULT 0,
                stop_reason TEXT NOT NULL DEFAULT '',
                stream INTEGER NOT NULL DEFAULT 0,
                duration_ms INTEGER NOT NULL DEFAULT 0
            );

            CREATE INDEX IF NOT EXISTS idx_conversations_created_at
                ON conversations(created_at);
            CREATE INDEX IF NOT EXISTS idx_conversations_model
                ON conversations(model);",
        )?;

        conn.pragma_update(None, "journal_mode", "WAL")?;

        migrate_conversations_table(&conn)?;

        Ok(Self {
            conn: Arc::new(Mutex::new(conn)),
        })
    }

    /// 保存一条对话记录（异步，不阻塞 tokio runtime）
    pub async fn save_conversation(&self, record: ConversationRecord) {
        let conn = self.conn.clone();
        let result = tokio::task::spawn_blocking(move || {
            let session_id = compute_session_id(&record.request_messages);
            let conn = conn.lock();
            conn.execute(
                "INSERT INTO conversations (id, model, endpoint, system_prompt, request_messages, request_tools, response_content, input_tokens, output_tokens, stop_reason, stream, duration_ms, session_id)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
                rusqlite::params![
                    record.id,
                    record.model,
                    record.endpoint,
                    record.system_prompt,
                    record.request_messages,
                    record.request_tools,
                    record.response_content,
                    record.input_tokens,
                    record.output_tokens,
                    record.stop_reason,
                    record.stream as i32,
                    record.duration_ms,
                    session_id,
                ],
            )
        })
        .await;

        match result {
            Ok(Ok(_)) => {
                tracing::debug!("对话记录已保存到数据库");
            }
            Ok(Err(e)) => {
                tracing::warn!("保存对话记录失败: {}", e);
            }
            Err(e) => {
                tracing::warn!("保存对话记录任务失败: {}", e);
            }
        }
    }

    /// 分页查询对话记录
    pub async fn query_conversations(&self, query: ConversationQuery) -> anyhow::Result<ConversationPage> {
        let conn = self.conn.clone();
        tokio::task::spawn_blocking(move || {
            let conn = conn.lock();

            // 构建 WHERE 子句
            let mut conditions: Vec<String> = Vec::new();
            let mut params: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();

            if let Some(ref model) = query.model {
                conditions.push(format!("model = ?{}", params.len() + 1));
                params.push(Box::new(model.clone()));
            }
            if let Some(ref endpoint) = query.endpoint {
                conditions.push(format!("endpoint = ?{}", params.len() + 1));
                params.push(Box::new(endpoint.clone()));
            }
            if let Some(ref stop_reason) = query.stop_reason {
                conditions.push(format!("stop_reason = ?{}", params.len() + 1));
                params.push(Box::new(stop_reason.clone()));
            }
            if let Some(stream) = query.stream {
                conditions.push(format!("stream = ?{}", params.len() + 1));
                params.push(Box::new(stream as i32));
            }

            let where_clause = if conditions.is_empty() {
                String::new()
            } else {
                format!("WHERE {}", conditions.join(" AND "))
            };

            // 验证排序字段防止 SQL 注入
            let sort_by = match query.sort_by.as_str() {
                "created_at" | "duration_ms" | "input_tokens" | "output_tokens" | "model" => query.sort_by.as_str(),
                _ => "created_at",
            };
            let sort_order = match query.sort_order.as_str() {
                "asc" | "ASC" => "ASC",
                _ => "DESC",
            };

            // 查询总数
            let count_sql = format!("SELECT COUNT(*) FROM conversations {}", where_clause);
            let params_ref: Vec<&dyn rusqlite::types::ToSql> = params.iter().map(|p| p.as_ref()).collect();
            let total: u64 = conn.query_row(&count_sql, params_ref.as_slice(), |row| row.get(0))?;

            // 分页计算
            let page = query.page.max(1);
            let page_size = query.page_size.clamp(1, 100);
            let offset = (page - 1) * page_size;
            let total_pages = ((total as f64) / (page_size as f64)).ceil() as u32;

            // 查询数据（轻量列表版：截断 request_messages，不含大文本字段）
            let preview_len = 500;
            let data_sql = format!(
                "SELECT id, created_at, model, endpoint, SUBSTR(request_messages, 1, {preview_len}), input_tokens, output_tokens, stop_reason, stream, duration_ms, session_id \
                 FROM conversations {} ORDER BY {} {} LIMIT ?{} OFFSET ?{}",
                where_clause, sort_by, sort_order, params.len() + 1, params.len() + 2
            );
            params.push(Box::new(page_size));
            params.push(Box::new(offset));

            let params_ref: Vec<&dyn rusqlite::types::ToSql> = params.iter().map(|p| p.as_ref()).collect();
            let mut stmt = conn.prepare(&data_sql)?;
            let rows = stmt.query_map(params_ref.as_slice(), |row| {
                Ok(ConversationListItem {
                    id: row.get(0)?,
                    created_at: row.get(1)?,
                    model: row.get(2)?,
                    endpoint: row.get(3)?,
                    request_messages_preview: row.get(4)?,
                    input_tokens: row.get(5)?,
                    output_tokens: row.get(6)?,
                    stop_reason: row.get(7)?,
                    stream: row.get::<_, i32>(8)? != 0,
                    duration_ms: row.get(9)?,
                    session_id: row.get(10)?,
                })
            })?;

            let items: Vec<ConversationListItem> = rows.filter_map(|r| r.ok()).collect();

            Ok(ConversationPage {
                items,
                total,
                page,
                page_size,
                total_pages,
            })
        })
        .await?
    }

    /// 获取单条对话的完整详情
    pub async fn get_conversation(&self, id: String) -> anyhow::Result<Option<ConversationRow>> {
        let conn = self.conn.clone();
        tokio::task::spawn_blocking(move || {
            let conn = conn.lock();
            let mut stmt = conn.prepare(
                "SELECT id, created_at, model, endpoint, system_prompt, request_messages, request_tools, response_content, input_tokens, output_tokens, stop_reason, stream, duration_ms, session_id \
                 FROM conversations WHERE id = ?1"
            )?;
            let result = stmt.query_row(rusqlite::params![id], |row| {
                Ok(ConversationRow {
                    id: row.get(0)?,
                    created_at: row.get(1)?,
                    model: row.get(2)?,
                    endpoint: row.get(3)?,
                    system_prompt: row.get(4)?,
                    request_messages: row.get(5)?,
                    request_tools: row.get(6)?,
                    response_content: row.get(7)?,
                    input_tokens: row.get(8)?,
                    output_tokens: row.get(9)?,
                    stop_reason: row.get(10)?,
                    stream: row.get::<_, i32>(11)? != 0,
                    duration_ms: row.get(12)?,
                    session_id: row.get(13)?,
                })
            });
            match result {
                Ok(row) => Ok(Some(row)),
                Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
                Err(e) => Err(e.into()),
            }
        })
        .await?
    }

    /// 批量删除对话记录并执行 VACUUM
    pub async fn delete_conversations(&self, ids: Vec<String>) -> anyhow::Result<u64> {
        let conn = self.conn.clone();
        tokio::task::spawn_blocking(move || {
            let conn = conn.lock();
            let placeholders: Vec<String> = (1..=ids.len()).map(|i| format!("?{}", i)).collect();
            let sql = format!(
                "DELETE FROM conversations WHERE id IN ({})",
                placeholders.join(", ")
            );
            let params: Vec<&dyn rusqlite::types::ToSql> =
                ids.iter().map(|id| id as &dyn rusqlite::types::ToSql).collect();
            let deleted = conn.execute(&sql, params.as_slice())?;
            conn.execute_batch("VACUUM")?;
            Ok(deleted as u64)
        })
        .await?
    }

    /// 清空所有对话记录并执行 VACUUM
    pub async fn clear_conversations(&self) -> anyhow::Result<u64> {
        let conn = self.conn.clone();
        tokio::task::spawn_blocking(move || {
            let conn = conn.lock();
            let deleted: u64 = conn.query_row("SELECT COUNT(*) FROM conversations", [], |row| row.get(0))?;
            conn.execute("DELETE FROM conversations", [])?;
            conn.execute_batch("VACUUM")?;
            Ok(deleted)
        })
        .await?
    }

    /// 获取所有不重复的模型名称
    pub async fn query_models(&self) -> anyhow::Result<ConversationModelsResponse> {
        let conn = self.conn.clone();
        tokio::task::spawn_blocking(move || {
            let conn = conn.lock();
            let mut stmt = conn.prepare("SELECT DISTINCT model FROM conversations ORDER BY model ASC")?;
            let rows = stmt.query_map([], |row| row.get::<_, String>(0))?;
            let models: Vec<String> = rows.filter_map(|r| r.ok()).collect();
            Ok(ConversationModelsResponse { models })
        })
        .await?
    }

    /// 查询指定时间段内的 token 消耗统计（按小时聚合）
    /// 始终返回完整的时间槽，无数据的小时 token 为 0
    pub async fn query_token_stats(&self, query: TokenStatsQuery) -> anyhow::Result<TokenStatsResponse> {
        let conn = self.conn.clone();
        tokio::task::spawn_blocking(move || {
            let conn = conn.lock();
            let hours = query.hours.clamp(1, 720);

            // 递归 CTE 生成完整的时间槽序列（从 N-1 小时前到当前小时）
            let sql = format!(
                "WITH RECURSIVE hours(hour) AS ( \
                    SELECT strftime('%Y-%m-%dT%H:00:00Z', datetime('now', '-{} hours')) \
                    UNION ALL \
                    SELECT strftime('%Y-%m-%dT%H:00:00Z', datetime(hour, '+1 hour')) \
                    FROM hours \
                    WHERE hour < strftime('%Y-%m-%dT%H:00:00Z', datetime('now')) \
                ) \
                SELECT \
                    hours.hour as time, \
                    COALESCE(SUM(c.input_tokens + c.output_tokens), 0) as tokens \
                FROM hours \
                LEFT JOIN conversations c ON strftime('%Y-%m-%dT%H:00:00Z', c.created_at) = hours.hour \
                GROUP BY hours.hour \
                ORDER BY hours.hour ASC",
                hours.saturating_sub(1)
            );

            let mut stmt = conn.prepare(&sql)?;
            let rows = stmt.query_map([], |row| {
                Ok(TokenStatsItem {
                    time: row.get(0)?,
                    tokens: row.get(1)?,
                })
            })?;

            let items: Vec<TokenStatsItem> = rows.filter_map(|r| r.ok()).collect();
            let total_tokens: i64 = items.iter().map(|i| i.tokens).sum();

            Ok(TokenStatsResponse {
                items,
                hours,
                total_tokens,
            })
        })
        .await?
    }
}
