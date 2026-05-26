//! Anthropic API 路由配置

use std::sync::Arc;
use std::sync::atomic::AtomicBool;

use axum::{
    Router,
    extract::DefaultBodyLimit,
    middleware,
    routing::{get, post},
};

use crate::db::ConversationDb;
use crate::kiro::provider::KiroProvider;

use super::{
    handlers::{count_tokens, get_models, post_messages, post_messages_cc},
    middleware::{AppState, auth_middleware, cors_layer},
};

/// 请求体最大大小限制 (50MB)
const MAX_BODY_SIZE: usize = 50 * 1024 * 1024;

/// 创建带有 KiroProvider 的 Anthropic API 路由
pub fn create_router_with_provider(
    api_key: impl Into<String>,
    kiro_provider: Option<KiroProvider>,
    extract_thinking: bool,
    db: Option<ConversationDb>,
    db_enabled: Arc<AtomicBool>,
    strip_history_images: Arc<AtomicBool>,
) -> Router {
    let mut state = AppState::new(api_key, extract_thinking);
    if let Some(provider) = kiro_provider {
        state = state.with_kiro_provider(provider);
    }
    state.db = db;
    state.db_enabled = db_enabled;
    state.strip_history_images = strip_history_images;

    // 需要认证的 /v1 路由
    let v1_routes = Router::new()
        .route("/models", get(get_models))
        .route("/messages", post(post_messages))
        .route("/messages/count_tokens", post(count_tokens))
        .layer(middleware::from_fn_with_state(
            state.clone(),
            auth_middleware,
        ));

    // 需要认证的 /cc/v1 路由（Claude Code 兼容端点）
    // 与 /v1 的区别：流式响应会等待 contextUsageEvent 后再发送 message_start
    let cc_v1_routes = Router::new()
        .route("/messages", post(post_messages_cc))
        .route("/messages/count_tokens", post(count_tokens))
        .layer(middleware::from_fn_with_state(
            state.clone(),
            auth_middleware,
        ));

    Router::new()
        .nest("/v1", v1_routes)
        .nest("/cc/v1", cc_v1_routes)
        .layer(cors_layer())
        .layer(DefaultBodyLimit::max(MAX_BODY_SIZE))
        .with_state(state)
}
