//! Kiro API Provider
//!
//! 核心组件，负责与 Kiro API 通信
//! 支持流式和非流式请求
//! 支持多凭据故障转移和重试
//! 支持按凭据级 endpoint 切换不同 Kiro API 端点

use reqwest::Client;
use std::collections::{HashMap, HashSet};
use std::sync::Arc;
use crate::http_client::{ProxyConfig, build_client};
use crate::kiro::endpoint::{KiroEndpoint, RequestContext};
use crate::kiro::machine_id;
use crate::kiro::model::credentials::KiroCredentials;
use crate::kiro::token_manager::MultiTokenManager;
use crate::model::config::TlsBackend;
use parking_lot::Mutex;

/// 每个凭据的最大重试次数
const MAX_RETRIES_PER_CREDENTIAL: usize = 3;

/// 总重试次数硬上限（避免无限重试）
const MAX_TOTAL_RETRIES: usize = 9;

/// Kiro API Provider
///
/// 核心组件，负责与 Kiro API 通信
/// 支持多凭据故障转移和重试机制
/// 按凭据 `endpoint` 字段选择 [`KiroEndpoint`] 实现
pub struct KiroProvider {
    token_manager: Arc<MultiTokenManager>,
    /// 全局代理配置（用于凭据无自定义代理时的回退）
    global_proxy: Option<ProxyConfig>,
    /// Client 缓存：key = effective proxy config, value = reqwest::Client
    /// 不同代理配置的凭据使用不同的 Client，共享相同代理的凭据复用 Client
    client_cache: Mutex<HashMap<Option<ProxyConfig>, Client>>,
    /// TLS 后端配置
    tls_backend: TlsBackend,
    /// 端点实现注册表（key: endpoint 名称）
    endpoints: HashMap<String, Arc<dyn KiroEndpoint>>,
    /// 默认端点名称（凭据未指定 endpoint 时使用）
    default_endpoint: String,
}

impl KiroProvider {
    /// 创建带代理配置和端点注册表的 KiroProvider 实例
    ///
    /// # Arguments
    /// * `token_manager` - 多凭据 Token 管理器
    /// * `proxy` - 全局代理配置
    /// * `endpoints` - 端点名 → 实现的注册表（至少包含 `default_endpoint` 对应条目）
    /// * `default_endpoint` - 凭据未显式指定 endpoint 时使用的名称
    pub fn with_proxy(
        token_manager: Arc<MultiTokenManager>,
        proxy: Option<ProxyConfig>,
        endpoints: HashMap<String, Arc<dyn KiroEndpoint>>,
        default_endpoint: String,
    ) -> Self {
        assert!(
            endpoints.contains_key(&default_endpoint),
            "默认端点 {} 未在 endpoints 注册表中",
            default_endpoint
        );
        let tls_backend = token_manager.config().tls_backend;
        // 预热：构建全局代理对应的 Client
        let initial_client = build_client(proxy.as_ref(), 720, tls_backend)
            .expect("创建 HTTP 客户端失败");
        let mut cache = HashMap::new();
        cache.insert(proxy.clone(), initial_client);

        Self {
            token_manager,
            global_proxy: proxy,
            client_cache: Mutex::new(cache),
            tls_backend,
            endpoints,
            default_endpoint,
        }
    }

    /// 根据凭据的代理配置获取（或创建并缓存）对应的 reqwest::Client
    fn client_for(&self, credentials: &KiroCredentials) -> anyhow::Result<Client> {
        let effective = credentials.effective_proxy(self.global_proxy.as_ref());
        let mut cache = self.client_cache.lock();
        if let Some(client) = cache.get(&effective) {
            return Ok(client.clone());
        }
        let client = build_client(effective.as_ref(), 720, self.tls_backend)?;
        cache.insert(effective, client.clone());
        Ok(client)
    }

    /// 根据凭据选择 endpoint 实现
    fn endpoint_for(
        &self,
        credentials: &KiroCredentials,
    ) -> anyhow::Result<Arc<dyn KiroEndpoint>> {
        let name = credentials
            .endpoint
            .as_deref()
            .unwrap_or(&self.default_endpoint);
        self.endpoints
            .get(name)
            .cloned()
            .ok_or_else(|| anyhow::anyhow!("未知端点: {}", name))
    }

    /// 发送非流式 API 请求
    ///
    /// 支持多凭据故障转移（见 [`Self::call_api_with_retry`]）
    pub async fn call_api(&self, request_body: &str) -> anyhow::Result<reqwest::Response> {
        self.call_api_with_retry(request_body, false).await
    }

    /// 发送流式 API 请求
    pub async fn call_api_stream(&self, request_body: &str) -> anyhow::Result<reqwest::Response> {
        self.call_api_with_retry(request_body, true).await
    }

    /// 多凭据 Token 管理器（关键词替换等配置由此读取）
    pub fn token_manager(&self) -> &MultiTokenManager {
        &self.token_manager
    }

    /// 发送 MCP API 请求（WebSearch 等工具调用）
    pub async fn call_mcp(&self, request_body: &str) -> anyhow::Result<reqwest::Response> {
        self.call_mcp_with_retry(request_body).await
    }

    /// 内部方法：带重试逻辑的 MCP API 调用
    async fn call_mcp_with_retry(&self, request_body: &str) -> anyhow::Result<reqwest::Response> {
        let total_credentials = self.token_manager.total_count();
        let max_retries = (total_credentials * MAX_RETRIES_PER_CREDENTIAL).min(MAX_TOTAL_RETRIES);
        let mut last_error: Option<anyhow::Error> = None;
        let mut force_refreshed: HashSet<u64> = HashSet::new();

        for attempt in 0..max_retries {
            // MCP 调用（WebSearch 等工具）不涉及模型选择，无需按模型过滤凭据
            let ctx = match self.token_manager.acquire_context(None).await {
                Ok(c) => c,
                Err(e) => {
                    last_error = Some(e);
                    continue;
                }
            };

            let config = self.token_manager.config();
            let replaced_body = self.token_manager.apply_keyword_replacements(request_body);
            let machine_id = machine_id::generate_from_credentials(&ctx.credentials, config);

            let endpoint = match self.endpoint_for(&ctx.credentials) {
                Ok(e) => e,
                Err(e) => {
                    let msg = e.to_string();
                    self.token_manager.report_api_error(ctx.id, 0, &msg);
                    last_error = Some(Self::mcp_err_msg(ctx.id, ctx.credentials.email.as_deref(), msg));
                    if self.token_manager.report_failure(ctx.id) {
                        let _ = self.token_manager.switch_to_next();
                        continue;
                    }
                    break;
                }
            };

            let rctx = RequestContext {
                credentials: &ctx.credentials,
                token: &ctx.token,
                machine_id: &machine_id,
                config,
            };

            let url = endpoint.mcp_url(&rctx);
            let body = endpoint.transform_mcp_body(&replaced_body, &rctx);

            let base = self
                .client_for(&ctx.credentials)?
                .post(&url)
                .body(body)
                .header("content-type", "application/json")
                .header("Connection", "close");
            let request = endpoint.decorate_mcp(base, &rctx);

            let response = match request.send().await {
                Ok(resp) => resp,
                Err(e) => {
                    tracing::warn!(
                        "MCP 请求发送失败（凭据 #{}，尝试 {}/{}）: {}",
                        ctx.id,
                        attempt + 1,
                        max_retries,
                        e
                    );
                    self.token_manager
                        .report_api_error(ctx.id, 0, &e.to_string());
                    last_error = Some(Self::mcp_err_msg(ctx.id, ctx.credentials.email.as_deref(), e));
                    if self.token_manager.report_failure(ctx.id) {
                        let _ = self.token_manager.switch_to_next();
                        continue;
                    }
                    break;
                }
            };

            let status = response.status();

            // 成功响应
            if status.is_success() {
                self.token_manager.report_success(ctx.id);
                return Ok(response);
            }

            let body = response.text().await.unwrap_or_default();

            if status.as_u16() == 402 && endpoint.is_monthly_request_limit(&body) {
                let has_available = self.token_manager.report_quota_exhausted(ctx.id);
                if !has_available {
                    anyhow::bail!(
                        "MCP 请求失败（所有凭据已用尽，{}）: {} {}",
                        Self::cred_label(ctx.id, ctx.credentials.email.as_deref()),
                        status,
                        body
                    );
                }
                last_error = Some(Self::mcp_err(ctx.id, ctx.credentials.email.as_deref(), status, &body));
                continue;
            }

            if matches!(status.as_u16(), 401 | 403)
                && endpoint.is_bearer_token_invalid(&body)
                && !force_refreshed.contains(&ctx.id)
            {
                force_refreshed.insert(ctx.id);
                tracing::info!("凭据 #{} token 疑似被上游失效，尝试强制刷新", ctx.id);
                if self.token_manager.force_refresh_token_for(ctx.id).await.is_ok() {
                    tracing::info!("凭据 #{} token 强制刷新成功，重试请求", ctx.id);
                    continue;
                }
            }

            let (err, can_retry) = Self::mcp_fail_switch(
                &self.token_manager,
                ctx.id,
                ctx.credentials.email.as_deref(),
                status,
                &body,
            );
            last_error = Some(err);
            if !can_retry {
                break;
            }
        }

        Err(last_error.unwrap_or_else(|| {
            anyhow::anyhow!("MCP 请求失败：已达到最大重试次数（{}次）", max_retries)
        }))
    }

    /// 内部方法：带重试逻辑的 API 调用
    ///
    /// 重试策略：
    /// - 每个凭据最多重试 MAX_RETRIES_PER_CREDENTIAL 次
    /// - 总重试次数 = min(凭据数量 × 每凭据重试次数, MAX_TOTAL_RETRIES)
    /// - 硬上限 9 次，避免无限重试
    async fn call_api_with_retry(
        &self,
        request_body: &str,
        is_stream: bool,
    ) -> anyhow::Result<reqwest::Response> {
        let total_credentials = self.token_manager.total_count();
        let max_retries = (total_credentials * MAX_RETRIES_PER_CREDENTIAL).min(MAX_TOTAL_RETRIES);
        let mut last_error: Option<anyhow::Error> = None;
        let mut force_refreshed: HashSet<u64> = HashSet::new();
        let api_type = if is_stream { "流式" } else { "非流式" };

        // 尝试从请求体中提取模型信息
        let model = Self::extract_model_from_request(request_body);

        for attempt in 0..max_retries {
            // 获取调用上下文（绑定 index、credentials、token）
            let ctx = match self.token_manager.acquire_context(model.as_deref()).await {
                Ok(c) => c,
                Err(e) => {
                    last_error = Some(e);
                    continue;
                }
            };

            let config = self.token_manager.config();
            let replaced_body = self.token_manager.apply_keyword_replacements(request_body);
            let machine_id = machine_id::generate_from_credentials(&ctx.credentials, config);

            let endpoint = match self.endpoint_for(&ctx.credentials) {
                Ok(e) => e,
                Err(e) => {
                    self.token_manager
                        .report_api_error(ctx.id, 0, &e.to_string());
                    last_error = Some(Self::api_err_msg(
                        api_type,
                        ctx.id,
                        ctx.credentials.email.as_deref(),
                        e,
                    ));
                    if self.token_manager.report_failure(ctx.id) {
                        let _ = self.token_manager.switch_to_next();
                        continue;
                    }
                    break;
                }
            };

            let rctx = RequestContext {
                credentials: &ctx.credentials,
                token: &ctx.token,
                machine_id: &machine_id,
                config,
            };

            let url = endpoint.api_url(&rctx);
            let body = endpoint.transform_api_body(&replaced_body, &rctx);

            let base = self
                .client_for(&ctx.credentials)?
                .post(&url)
                .body(body)
                .header("content-type", "application/json")
                .header("Connection", "close");
            let request = endpoint.decorate_api(base, &rctx);

            let response = match request.send().await {
                Ok(resp) => resp,
                Err(e) => {
                    tracing::warn!(
                        "API 请求发送失败（凭据 #{}，尝试 {}/{}）: {}",
                        ctx.id,
                        attempt + 1,
                        max_retries,
                        e
                    );
                    self.token_manager
                        .report_api_error(ctx.id, 0, &e.to_string());
                    last_error = Some(Self::api_err_msg(
                        api_type,
                        ctx.id,
                        ctx.credentials.email.as_deref(),
                        e,
                    ));
                    if self.token_manager.report_failure(ctx.id) {
                        let _ = self.token_manager.switch_to_next();
                        continue;
                    }
                    break;
                }
            };

            let status = response.status();

            // 成功响应
            if status.is_success() {
                self.token_manager.report_success(ctx.id);
                return Ok(response);
            }

            let body = response.text().await.unwrap_or_default();

            if status.as_u16() == 402 && endpoint.is_monthly_request_limit(&body) {
                tracing::warn!(
                    "API 请求失败（额度已用尽，凭据 #{}，尝试 {}/{}）: {} {}",
                    ctx.id,
                    attempt + 1,
                    max_retries,
                    status,
                    body
                );

                let has_available = self.token_manager.report_quota_exhausted(ctx.id);
                if !has_available {
                    anyhow::bail!(
                        "{} API 请求失败（所有凭据已用尽，{}）: {} {}",
                        api_type,
                        Self::cred_label(ctx.id, ctx.credentials.email.as_deref()),
                        status,
                        body
                    );
                }

                last_error = Some(Self::api_err(
                    api_type,
                    ctx.id,
                    ctx.credentials.email.as_deref(),
                    status,
                    &body,
                ));
                continue;
            }

            if matches!(status.as_u16(), 401 | 403)
                && endpoint.is_bearer_token_invalid(&body)
                && !force_refreshed.contains(&ctx.id)
            {
                force_refreshed.insert(ctx.id);
                tracing::info!("凭据 #{} token 疑似被上游失效，尝试强制刷新", ctx.id);
                if self.token_manager.force_refresh_token_for(ctx.id).await.is_ok() {
                    tracing::info!("凭据 #{} token 强制刷新成功，重试请求", ctx.id);
                    continue;
                }
            }

            let (err, can_retry) = Self::api_fail_switch(
                &self.token_manager,
                api_type,
                ctx.id,
                ctx.credentials.email.as_deref(),
                status,
                &body,
            );
            last_error = Some(err);
            if !can_retry {
                break;
            }
        }

        // 所有重试都失败
        Err(last_error.unwrap_or_else(|| {
            anyhow::anyhow!(
                "{} API 请求失败：已达到最大重试次数（{}次）",
                api_type,
                max_retries
            )
        }))
    }

    /// 从请求体中提取模型信息
    ///
    /// 尝试解析 JSON 请求体，提取 conversationState.currentMessage.userInputMessage.modelId
    fn extract_model_from_request(request_body: &str) -> Option<String> {
        use serde_json::Value;

        let json: Value = serde_json::from_str(request_body).ok()?;

        json.get("conversationState")?
            .get("currentMessage")?
            .get("userInputMessage")?
            .get("modelId")?
            .as_str()
            .map(|s| s.to_string())
    }

    fn cred_label(cred_id: u64, email: Option<&str>) -> String {
        match email.filter(|s| !s.is_empty()) {
            Some(e) => format!("凭据 #{} ({})", cred_id, e),
            None => format!("凭据 #{}", cred_id),
        }
    }

    fn api_err(
        api_type: &str,
        cred_id: u64,
        email: Option<&str>,
        status: reqwest::StatusCode,
        body: &str,
    ) -> anyhow::Error {
        anyhow::anyhow!(
            "{} API 请求失败（{}）: {} {}",
            api_type,
            Self::cred_label(cred_id, email),
            status,
            body
        )
    }

    fn api_err_msg(
        api_type: &str,
        cred_id: u64,
        email: Option<&str>,
        err: impl std::fmt::Display,
    ) -> anyhow::Error {
        anyhow::anyhow!(
            "{} API 请求失败（{}）: {}",
            api_type,
            Self::cred_label(cred_id, email),
            err
        )
    }

    fn mcp_err(
        cred_id: u64,
        email: Option<&str>,
        status: reqwest::StatusCode,
        body: &str,
    ) -> anyhow::Error {
        anyhow::anyhow!(
            "MCP 请求失败（{}）: {} {}",
            Self::cred_label(cred_id, email),
            status,
            body
        )
    }

    fn mcp_err_msg(
        cred_id: u64,
        email: Option<&str>,
        err: impl std::fmt::Display,
    ) -> anyhow::Error {
        anyhow::anyhow!(
            "MCP 请求失败（{}）: {}",
            Self::cred_label(cred_id, email),
            err
        )
    }

    fn api_fail_switch(
        token_manager: &MultiTokenManager,
        api_type: &str,
        cred_id: u64,
        email: Option<&str>,
        status: reqwest::StatusCode,
        body: &str,
    ) -> (anyhow::Error, bool) {
        token_manager.report_api_error(cred_id, status.as_u16(), body);
        tracing::warn!(
            "{} API 请求失败（{}）: {} {}",
            api_type,
            Self::cred_label(cred_id, email),
            status,
            body
        );
        let err = Self::api_err(api_type, cred_id, email, status, body);
        let has_available = token_manager.report_failure(cred_id);
        if has_available {
            let _ = token_manager.switch_to_next();
        }
        (err, has_available)
    }

    fn mcp_fail_switch(
        token_manager: &MultiTokenManager,
        cred_id: u64,
        email: Option<&str>,
        status: reqwest::StatusCode,
        body: &str,
    ) -> (anyhow::Error, bool) {
        token_manager.report_api_error(cred_id, status.as_u16(), body);
        tracing::warn!(
            "MCP 请求失败（{}）: {} {}",
            Self::cred_label(cred_id, email),
            status,
            body
        );
        let err = Self::mcp_err(cred_id, email, status, body);
        let has_available = token_manager.report_failure(cred_id);
        if has_available {
            let _ = token_manager.switch_to_next();
        }
        (err, has_available)
    }
}
