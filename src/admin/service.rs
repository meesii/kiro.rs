//! Admin API 业务逻辑服务

use std::collections::{HashMap, HashSet};
use std::path::PathBuf;
use std::sync::Arc;

use chrono::Utc;
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};

use crate::kiro::model::credentials::KiroCredentials;
use crate::kiro::token_manager::MultiTokenManager;

use super::error::AdminServiceError;
use super::types::{
    AddCredentialRequest, AddCredentialResponse, AddKeywordReplacementRequest,
    AdminConfigResponse, BalanceResponse, CredentialStatusItem,
    CredentialsStatusResponse, KeywordReplacementItem,
    KeywordReplacementsResponse, UpdateAdminConfigRequest,
    UpdateKeywordReplacementRequest,
};

use crate::model::config::Config;

/// 余额缓存过期时间（秒），5 分钟
const BALANCE_CACHE_TTL_SECS: i64 = 300;

/// 缓存的余额条目（含时间戳）
#[derive(Debug, Clone, Serialize, Deserialize)]
struct CachedBalance {
    /// 缓存时间（Unix 秒）
    cached_at: f64,
    /// 缓存的余额数据
    data: BalanceResponse,
}

/// Admin 服务
///
/// 封装所有 Admin API 的业务逻辑
pub struct AdminService {
    token_manager: Arc<MultiTokenManager>,
    balance_cache: Mutex<HashMap<u64, CachedBalance>>,
    /// 余额刷新错误记录，用于前端展示（不持久化）
    balance_error_map: Mutex<HashMap<u64, String>>,
    cache_path: Option<PathBuf>,
    /// 已注册的端点名称集合（用于 add_credential 校验）
    known_endpoints: HashSet<String>,
}

impl AdminService {
    pub fn new(
        token_manager: Arc<MultiTokenManager>,
        known_endpoints: impl IntoIterator<Item = String>,
    ) -> Self {
        let cache_path = token_manager
            .cache_dir()
            .map(|d| d.join("kiro_balance_cache.json"));

        let balance_cache = Self::load_balance_cache_from(&cache_path);

        Self {
            token_manager,
            balance_cache: Mutex::new(balance_cache),
            balance_error_map: Mutex::new(HashMap::new()),
            cache_path,
            known_endpoints: known_endpoints.into_iter().collect(),
        }
    }

    /// 获取所有凭据状态
    pub fn get_all_credentials(&self) -> CredentialsStatusResponse {
        let snapshot = self.token_manager.snapshot();
        let default_endpoint = self.token_manager.config().default_endpoint.clone();

        let mut credentials: Vec<CredentialStatusItem> = snapshot
            .entries
            .into_iter()
            .map(|entry| {
                let id = entry.id;
                CredentialStatusItem {
                    id,
                    priority: entry.priority,
                    disabled: entry.disabled,
                    failure_count: entry.failure_count,
                    is_current: entry.id == snapshot.current_id,
                    expires_at: entry.expires_at,
                    auth_method: entry.auth_method,
                    has_profile_arn: entry.has_profile_arn,
                    refresh_token_hash: entry.refresh_token_hash,
                    api_key_hash: entry.api_key_hash,
                    masked_api_key: entry.masked_api_key,
                    email: entry.email,
                    success_count: entry.success_count,
                    last_used_at: entry.last_used_at.clone(),
                    has_proxy: entry.has_proxy,
                    proxy_url: entry.proxy_url,
                    proxy_username: entry.proxy_username,
                    proxy_password: entry.proxy_password,
                    machine_id: entry.machine_id,
                    refresh_failure_count: entry.refresh_failure_count,
                    disabled_reason: entry.disabled_reason,
                    endpoint: entry.endpoint.unwrap_or_else(|| default_endpoint.clone()),
                    subscription_title: entry.subscription_title,
                    usage_percentage: entry.usage_percentage,
                    current_usage: None,
                    usage_limit: None,
                    balance_error: None,
                    last_api_error: entry.last_api_error.clone(),
                    last_api_error_at: entry.last_api_error_at.clone(),
                }
            })
            .collect();

        // 从 balance_cache 补充 subscription_title 和 usage_percentage
        {
            let cache = self.balance_cache.lock();
            for item in &mut credentials {
                if let Some(cached) = cache.get(&item.id) {
                    if item.subscription_title.is_none() {
                        item.subscription_title = cached.data.subscription_title.clone();
                    }
                    if item.usage_percentage.is_none() {
                        item.usage_percentage = Some(cached.data.usage_percentage);
                    }
                    if item.current_usage.is_none() {
                        item.current_usage = Some(cached.data.current_usage);
                    }
                    if item.usage_limit.is_none() {
                        item.usage_limit = Some(cached.data.usage_limit);
                    }
                }
            }
        }

        // 附加上次余额刷新失败的错误信息
        {
            let errors = self.balance_error_map.lock();
            for item in &mut credentials {
                if let Some(err) = errors.get(&item.id) {
                    item.balance_error = Some(err.clone());
                }
            }
        }

        // 按优先级排序（数字越小优先级越高）
        credentials.sort_by_key(|c| c.priority);

        CredentialsStatusResponse {
            total: snapshot.total,
            available: snapshot.available,
            current_id: snapshot.current_id,
            credentials,
        }
    }

    /// 设置凭据禁用状态
    pub fn set_disabled(&self, id: u64, disabled: bool) -> Result<(), AdminServiceError> {
        // 先获取当前凭据 ID，用于判断是否需要切换
        let snapshot = self.token_manager.snapshot();
        let current_id = snapshot.current_id;

        self.token_manager
            .set_disabled(id, disabled)
            .map_err(|e| self.classify_error(e, id))?;

        // 只有禁用的是当前凭据时才尝试切换到下一个
        if disabled && id == current_id {
            let _ = self.token_manager.switch_to_next();
        }
        Ok(())
    }

    /// 设置凭据优先级
    pub fn set_priority(&self, id: u64, priority: u32) -> Result<(), AdminServiceError> {
        self.token_manager
            .set_priority(id, priority)
            .map_err(|e| self.classify_error(e, id))
    }

    /// 设置凭据邮箱
    pub fn set_email(&self, id: u64, email: String) -> Result<(), AdminServiceError> {
        self.token_manager
            .set_email(id, email)
            .map_err(|e| self.classify_error(e, id))
    }

    /// 设置凭据代理配置
    pub fn set_proxy(
        &self,
        id: u64,
        proxy_url: Option<String>,
        proxy_username: Option<String>,
        proxy_password: Option<String>,
    ) -> Result<(), AdminServiceError> {
        self.token_manager
            .set_proxy(id, proxy_url, proxy_username, proxy_password)
            .map_err(|e| self.classify_error(e, id))
    }

    /// 设置凭据 Machine ID
    pub fn set_machine_id(&self, id: u64, machine_id: Option<String>) -> Result<(), AdminServiceError> {
        self.token_manager
            .set_machine_id(id, machine_id)
            .map_err(|e| self.classify_error(e, id))
    }

    /// 重置失败计数并重新启用
    pub fn reset_and_enable(&self, id: u64) -> Result<(), AdminServiceError> {
        self.token_manager
            .reset_and_enable(id)
            .map_err(|e| self.classify_error(e, id))
    }

    /// 获取凭据余额（上游优先，失败时兜底返回缓存 + stale 标识）
    pub async fn get_balance(&self, id: u64) -> Result<BalanceResponse, AdminServiceError> {
        // 始终先尝试从上游获取最新数据
        match self.fetch_balance(id).await {
            Ok(mut balance) => {
                balance.stale = false;
                // 更新缓存
                {
                    let mut cache = self.balance_cache.lock();
                    cache.insert(
                        id,
                        CachedBalance {
                            cached_at: Utc::now().timestamp() as f64,
                            data: balance.clone(),
                        },
                    );
                }
                self.save_balance_cache();
                // 成功后清除余额错误记录
                self.balance_error_map.lock().remove(&id);
                Ok(balance)
            }
            Err(upstream_err) => {
                // 上游失败，尝试兜底返回缓存（不限 TTL）
                let cached = {
                    let cache = self.balance_cache.lock();
                    cache.get(&id).cloned()
                };
                if let Some(cached) = cached {
                    let mut balance = cached.data;
                    balance.stale = true;
                    tracing::warn!(
                        "凭据 #{} 上游获取失败 ({}), 返回缓存数据",
                        id,
                        upstream_err
                    );
                    Ok(balance)
                } else {
                    Err(upstream_err)
                }
            }
        }
    }

    /// 从上游获取余额（无缓存）
    async fn fetch_balance(&self, id: u64) -> Result<BalanceResponse, AdminServiceError> {
        let usage = self
            .token_manager
            .get_usage_limits_for(id)
            .await
            .map_err(|e| self.classify_balance_error(e, id))?;

        let current_usage = usage.current_usage();
        let usage_limit = usage.usage_limit();
        let remaining = (usage_limit - current_usage).max(0.0);
        let usage_percentage = if usage_limit > 0.0 {
            (current_usage / usage_limit * 100.0).min(100.0)
        } else {
            0.0
        };

        Ok(BalanceResponse {
            id,
            subscription_title: usage.subscription_title().map(|s| s.to_string()),
            current_usage,
            usage_limit,
            remaining,
            usage_percentage,
            next_reset_at: usage.next_date_reset,
            stale: false,
        })
    }

    /// 添加新凭据
    pub async fn add_credential(
        &self,
        req: AddCredentialRequest,
    ) -> Result<AddCredentialResponse, AdminServiceError> {
        // 校验端点名：未指定则默认合法，指定则必须已注册
        if let Some(ref name) = req.endpoint {
            if !self.known_endpoints.contains(name) {
                let mut known: Vec<&str> =
                    self.known_endpoints.iter().map(|s| s.as_str()).collect();
                known.sort();
                return Err(AdminServiceError::InvalidCredential(format!(
                    "未知端点 \"{}\"，已注册端点: {:?}",
                    name, known
                )));
            }
        }

        // 构建凭据对象
        let email = req.email.clone();
        let new_cred = KiroCredentials {
            id: None,
            access_token: None,
            refresh_token: req.refresh_token,
            profile_arn: None,
            expires_at: None,
            auth_method: Some(req.auth_method),
            client_id: req.client_id,
            client_secret: req.client_secret,
            priority: req.priority,
            region: req.region,
            auth_region: req.auth_region,
            api_region: req.api_region,
            machine_id: req.machine_id,
            email: req.email,
            subscription_title: None, // 将在首次获取使用额度时自动更新
            proxy_url: req.proxy_url,
            proxy_username: req.proxy_username,
            proxy_password: req.proxy_password,
            disabled: false, // 新添加的凭据默认启用
            kiro_api_key: req.kiro_api_key,
            endpoint: req.endpoint,
        };

        // 调用 token_manager 添加凭据
        let credential_id = self
            .token_manager
            .add_credential(new_cred)
            .await
            .map_err(|e| self.classify_add_error(e))?;

        // 尝试获取余额信息并缓存，使凭据列表立即可见用量数据
        match self.token_manager.get_usage_limits_for(credential_id).await {
            Ok(usage) => {
                let current_usage = usage.current_usage();
                let usage_limit = usage.usage_limit();
                let remaining = (usage_limit - current_usage).max(0.0);
                let usage_percentage = if usage_limit > 0.0 {
                    (current_usage / usage_limit * 100.0).min(100.0)
                } else {
                    0.0
                };
                let balance = BalanceResponse {
                    id: credential_id,
                    subscription_title: usage.subscription_title().map(|s| s.to_string()),
                    current_usage,
                    usage_limit,
                    remaining,
                    usage_percentage,
                    next_reset_at: usage.next_date_reset,
                    stale: false,
                };
                {
                    let mut cache = self.balance_cache.lock();
                    cache.insert(
                        credential_id,
                        CachedBalance {
                            cached_at: Utc::now().timestamp() as f64,
                            data: balance,
                        },
                    );
                }
                self.save_balance_cache();
            }
            Err(e) => {
                tracing::warn!("添加凭据后获取余额信息失败（不影响凭据添加）: {}", e);
            }
        }

        Ok(AddCredentialResponse {
            success: true,
            message: format!("凭据添加成功，ID: {}", credential_id),
            credential_id,
            email,
        })
    }

    /// 删除凭据
    pub fn delete_credential(&self, id: u64) -> Result<(), AdminServiceError> {
        self.token_manager
            .delete_credential(id)
            .map_err(|e| self.classify_delete_error(e, id))?;

        // 清理已删除凭据的余额缓存
        {
            let mut cache = self.balance_cache.lock();
            cache.remove(&id);
        }
        self.save_balance_cache();

        Ok(())
    }

    // ============ 关键词替换 ============

    /// 获取关键词替换列表（从磁盘读取最新配置）
    pub fn get_keyword_replacements(&self) -> KeywordReplacementsResponse {
        let config_path = match self.token_manager.config().config_path() {
            Some(p) => p.to_path_buf(),
            None => {
                return KeywordReplacementsResponse {
                    replacements: vec![],
                };
            }
        };

        let replacements = Config::load(&config_path)
            .map(|config| {
                config
                    .keyword_replacements
                    .iter()
                    .map(|kw| KeywordReplacementItem {
                        id: kw.id.clone(),
                        pattern: kw.pattern.clone(),
                        replacement: kw.replacement.clone(),
                        is_regex: kw.is_regex,
                    })
                    .collect()
            })
            .unwrap_or_default();

        KeywordReplacementsResponse { replacements }
    }

    /// 读取并修改 config.json 的通用 helper
    fn modify_config<F>(&self, action: F) -> Result<(), AdminServiceError>
    where
        F: FnOnce(&mut Config) -> Result<(), AdminServiceError>,
    {
        let config_path = self
            .token_manager
            .config()
            .config_path()
            .map(|p| p.to_path_buf())
            .ok_or_else(|| {
                AdminServiceError::InternalError("配置文件路径未知".to_string())
            })?;

        let mut config = Config::load(&config_path).map_err(|e| {
            AdminServiceError::InternalError(format!("加载配置失败: {}", e))
        })?;

        action(&mut config)?;

        config.save().map_err(|e| {
            AdminServiceError::InternalError(format!("保存配置失败: {}", e))
        })?;

        // 同步关键词配置缓存到 MultiTokenManager 内存
        self.token_manager.sync_keyword_config(
            config.keyword_replacements.clone(),
            config.keyword_replacement_enabled,
        );

        Ok(())
    }

    /// 新增关键词替换
    pub fn add_keyword_replacement(
        &self,
        req: AddKeywordReplacementRequest,
    ) -> Result<KeywordReplacementsResponse, AdminServiceError> {
        self.modify_config(|config| {
            if config.keyword_replacements.iter().any(|kw| kw.id == req.id) {
                return Err(AdminServiceError::InvalidCredential(format!(
                    "关键词 ID 已存在: {}",
                    req.id
                )));
            }
            config.keyword_replacements.push(crate::model::config::KeywordReplacement {
                id: req.id,
                pattern: req.pattern,
                replacement: req.replacement,
                is_regex: req.is_regex,
            });
            Ok(())
        })?;

        Ok(self.get_keyword_replacements())
    }

    /// 更新关键词替换
    pub fn update_keyword_replacement(
        &self,
        id: String,
        req: UpdateKeywordReplacementRequest,
    ) -> Result<KeywordReplacementsResponse, AdminServiceError> {
        self.modify_config(|config| {
            let kw = config
                .keyword_replacements
                .iter_mut()
                .find(|kw| kw.id == id)
                .ok_or_else(|| {
                    AdminServiceError::NotFound { id: 0 }
                })?;
            kw.pattern = req.pattern;
            kw.replacement = req.replacement;
            kw.is_regex = req.is_regex;
            Ok(())
        })?;

        Ok(self.get_keyword_replacements())
    }

    /// 删除关键词替换
    pub fn delete_keyword_replacement(
        &self,
        id: String,
    ) -> Result<KeywordReplacementsResponse, AdminServiceError> {
        self.modify_config(|config| {
            let pos = config
                .keyword_replacements
                .iter()
                .position(|kw| kw.id == id)
                .ok_or_else(|| {
                    AdminServiceError::NotFound { id: 0 }
                })?;
            config.keyword_replacements.remove(pos);
            Ok(())
        })?;

        Ok(self.get_keyword_replacements())
    }

    // ============ 统一 Admin 配置 ============

    /// 获取 Admin 可编辑的配置（从磁盘读取最新配置）
    pub fn get_admin_config(&self) -> AdminConfigResponse {
        let config_path = match self.token_manager.config().config_path() {
            Some(p) => p.to_path_buf(),
            None => {
                return AdminConfigResponse {
                    load_balancing_mode: "priority".to_string(),
                    keyword_replacement_enabled: false,
                    db_path: None,
                };
            }
        };

        Config::load(&config_path)
            .map(|c| AdminConfigResponse {
                load_balancing_mode: c.load_balancing_mode,
                keyword_replacement_enabled: c.keyword_replacement_enabled,
                db_path: c.db_path,
            })
            .unwrap_or(AdminConfigResponse {
                load_balancing_mode: "priority".to_string(),
                keyword_replacement_enabled: false,
                db_path: None,
            })
    }

    /// 更新 Admin 配置（部分字段更新）
    pub fn update_admin_config(
        &self,
        req: UpdateAdminConfigRequest,
    ) -> Result<AdminConfigResponse, AdminServiceError> {
        self.modify_config(|config| {
            if let Some(ref mode) = req.load_balancing_mode {
                if mode != "priority" && mode != "balanced" {
                    return Err(AdminServiceError::InvalidCredential(format!(
                        "loadBalancingMode 必须是 'priority' 或 'balanced'，当前值: {}",
                        mode
                    )));
                }
                config.load_balancing_mode = mode.clone();
            }
            if let Some(enabled) = req.keyword_replacement_enabled {
                config.keyword_replacement_enabled = enabled;
            }
            if let Some(ref path) = req.db_path {
                config.db_path = if path.trim().is_empty() {
                    None
                } else {
                    Some(path.clone())
                };
            }
            Ok(())
        })?;

        // 负载均衡模式变更时同步更新 token_manager 内存状态
        if let Some(ref mode) = req.load_balancing_mode {
            let _ = self.token_manager.set_load_balancing_mode(mode.clone());
        }

        Ok(self.get_admin_config())
    }

    /// 强制刷新指定凭据的 Token
    pub async fn force_refresh_token(&self, id: u64) -> Result<(), AdminServiceError> {
        self.token_manager
            .force_refresh_token_for(id)
            .await
            .map_err(|e| self.classify_balance_error(e, id))
    }

    /// 强制刷新指定凭据的余额（绕过缓存，失败不兜底）
    pub async fn force_refresh_balance(&self, id: u64) -> Result<BalanceResponse, AdminServiceError> {
        let mut balance = self.fetch_balance(id).await?;
        balance.stale = false;

        // 更新缓存
        {
            let mut cache = self.balance_cache.lock();
            cache.insert(
                id,
                CachedBalance {
                    cached_at: Utc::now().timestamp() as f64,
                    data: balance.clone(),
                },
            );
        }
        self.save_balance_cache();

        // 成功后清除余额错误记录
        self.balance_error_map.lock().remove(&id);

        Ok(balance)
    }

    /// 启动时刷新所有凭据的余额（含已禁用的，以便启用后立即可见）
    pub async fn refresh_all_balances(&self) {
        let snapshot = self.token_manager.snapshot();
        let all_ids: Vec<u64> = snapshot
            .entries
            .iter()
            .map(|e| e.id)
            .collect();

        if all_ids.is_empty() {
            tracing::info!("没有凭据，跳过余额刷新");
            return;
        }

        tracing::info!("开始刷新 {} 个凭据的余额...", all_ids.len());
        for id in all_ids {
            match self.get_balance(id).await {
                Ok(balance) => {
                    tracing::info!(
                        "凭据 #{} 余额刷新成功: {} ({:.1}%)",
                        id,
                        balance.subscription_title.as_deref().unwrap_or("未知"),
                        balance.usage_percentage
                    );
                    // 成功后清除之前的错误记录
                    self.balance_error_map.lock().remove(&id);
                }
                Err(e) => {
                    let err_msg = e.to_string();
                    tracing::warn!("凭据 #{} 余额刷新失败: {}", id, err_msg);
                    // 存储简化后的错误信息供前端展示
                    let short_msg = simplify_balance_error(&err_msg);
                    self.balance_error_map.lock().insert(id, short_msg);
                }
            }
        }
        tracing::info!("余额刷新完成");
    }

    // ============ 余额缓存持久化 ============

    fn load_balance_cache_from(cache_path: &Option<PathBuf>) -> HashMap<u64, CachedBalance> {
        let path = match cache_path {
            Some(p) => p,
            None => return HashMap::new(),
        };

        let content = match std::fs::read_to_string(path) {
            Ok(c) => c,
            Err(_) => return HashMap::new(),
        };

        // 文件中使用字符串 key 以兼容 JSON 格式
        let map: HashMap<String, CachedBalance> = match serde_json::from_str(&content) {
            Ok(m) => m,
            Err(e) => {
                tracing::warn!("解析余额缓存失败，将忽略: {}", e);
                return HashMap::new();
            }
        };

        let now = Utc::now().timestamp() as f64;
        map.into_iter()
            .filter_map(|(k, v)| {
                let id = k.parse::<u64>().ok()?;
                // 丢弃超过 TTL 的条目
                if (now - v.cached_at) < BALANCE_CACHE_TTL_SECS as f64 {
                    Some((id, v))
                } else {
                    None
                }
            })
            .collect()
    }

    fn save_balance_cache(&self) {
        let path = match &self.cache_path {
            Some(p) => p,
            None => return,
        };

        // 持有锁期间完成序列化和写入，防止并发损坏
        let cache = self.balance_cache.lock();
        let map: HashMap<String, &CachedBalance> =
            cache.iter().map(|(k, v)| (k.to_string(), v)).collect();

        match serde_json::to_string_pretty(&map) {
            Ok(json) => {
                if let Err(e) = std::fs::write(path, json) {
                    tracing::warn!("保存余额缓存失败: {}", e);
                }
            }
            Err(e) => tracing::warn!("序列化余额缓存失败: {}", e),
        }
    }

    // ============ 错误分类 ============

    /// 分类简单操作错误（set_disabled, set_priority, reset_and_enable）
    fn classify_error(&self, e: anyhow::Error, id: u64) -> AdminServiceError {
        let msg = e.to_string();
        if msg.contains("不存在") {
            AdminServiceError::NotFound { id }
        } else {
            AdminServiceError::InternalError(msg)
        }
    }

    /// 分类余额查询错误（可能涉及上游 API 调用）
    fn classify_balance_error(&self, e: anyhow::Error, id: u64) -> AdminServiceError {
        let msg = e.to_string();

        // 1. 凭据不存在
        if msg.contains("不存在") {
            return AdminServiceError::NotFound { id };
        }

        // 2. API Key 凭据不支持刷新：客户端请求错误，映射为 400
        if msg.contains("API Key 凭据不支持刷新") {
            return AdminServiceError::InvalidCredential(msg);
        }

        // 3. 上游服务错误特征：HTTP 响应错误或网络错误
        let is_upstream_error =
            // HTTP 响应错误（来自 refresh_*_token 的错误消息）
            msg.contains("凭证已过期或无效") ||
            msg.contains("权限不足") ||
            msg.contains("已被限流") ||
            msg.contains("服务器错误") ||
            msg.contains("Token 刷新失败") ||
            msg.contains("暂时不可用") ||
            // 网络错误（reqwest 错误）
            msg.contains("error trying to connect") ||
            msg.contains("connection") ||
            msg.contains("timeout") ||
            msg.contains("timed out");

        if is_upstream_error {
            AdminServiceError::UpstreamError(msg)
        } else {
            // 4. 默认归类为内部错误（本地验证失败、配置错误等）
            // 包括：缺少 refreshToken、refreshToken 已被截断、无法生成 machineId 等
            AdminServiceError::InternalError(msg)
        }
    }
}

// ============ 余额错误简化 ============

/// 将完整的余额错误信息简化为前端可展示的短消息
fn simplify_balance_error(msg: &str) -> String {
    if msg.contains("权限不足") || msg.contains("invalid") || msg.contains("403") {
        "Token 或 API Key 已失效".to_string()
    } else if msg.contains("限流") || msg.contains("429") || msg.contains("Too Many") {
        "请求过于频繁，请稍后重试".to_string()
    } else if msg.contains("timeout") || msg.contains("超时") {
        "请求超时".to_string()
    } else if msg.contains("连接") || msg.contains("connect") || msg.contains("网络") {
        "网络连接失败".to_string()
    } else if msg.contains("API Key 凭据不支持刷新") {
        "API Key 不支持刷新操作".to_string()
    } else if msg.len() > 80 {
        // 截断过长消息
        format!("{}…", &msg[..80])
    } else {
        msg.to_string()
    }
}

impl AdminService {
    /// 分类添加凭据错误
    fn classify_add_error(&self, e: anyhow::Error) -> AdminServiceError {
        let msg = e.to_string();

        // 凭据验证失败（refreshToken 无效、格式错误等）
        let is_invalid_credential = msg.contains("缺少 refreshToken")
            || msg.contains("refreshToken 为空")
            || msg.contains("refreshToken 已被截断")
            || msg.contains("凭据已存在")
            || msg.contains("refreshToken 重复")
            || msg.contains("kiroApiKey 重复")
            || msg.contains("缺少 kiroApiKey")
            || msg.contains("kiroApiKey 为空")
            || msg.contains("凭证已过期或无效")
            || msg.contains("权限不足")
            || msg.contains("已被限流");

        if is_invalid_credential {
            AdminServiceError::InvalidCredential(msg)
        } else if msg.contains("error trying to connect")
            || msg.contains("connection")
            || msg.contains("timeout")
        {
            AdminServiceError::UpstreamError(msg)
        } else {
            AdminServiceError::InternalError(msg)
        }
    }

    /// 分类删除凭据错误
    fn classify_delete_error(&self, e: anyhow::Error, id: u64) -> AdminServiceError {
        let msg = e.to_string();
        if msg.contains("不存在") {
            AdminServiceError::NotFound { id }
        } else if msg.contains("只能删除已禁用的凭据") || msg.contains("请先禁用凭据") {
            AdminServiceError::InvalidCredential(msg)
        } else {
            AdminServiceError::InternalError(msg)
        }
    }
}
