//! Admin API 路由配置

use axum::{
    Router, middleware,
    routing::{delete, get, post, put},
};

use super::{
    handlers::{
        add_credential, add_keyword_replacement, delete_credential, delete_keyword_replacement,
        force_refresh_balance, force_refresh_token, get_admin_config, get_all_credentials,
        get_conversation_detail, get_conversation_models, get_conversation_stats, get_conversations,
        get_credential_balance, get_keyword_replacements, reset_failure_count,
        set_credential_disabled, set_credential_email, set_credential_machine_id,
        set_credential_priority, set_credential_proxy,
        update_admin_config, update_keyword_replacement,
    },
    middleware::{AdminState, admin_auth_middleware},
};

/// 创建 Admin API 路由
///
/// # 端点
/// - `GET /credentials` - 获取所有凭据状态
/// - `POST /credentials` - 添加新凭据
/// - `DELETE /credentials/:id` - 删除凭据
/// - `POST /credentials/:id/disabled` - 设置凭据禁用状态
/// - `POST /credentials/:id/priority` - 设置凭据优先级
/// - `POST /credentials/:id/reset` - 重置失败计数
/// - `POST /credentials/:id/refresh` - 强制刷新 Token
/// - `POST /credentials/:id/refresh-balance` - 强制刷新余额
/// - `GET /credentials/:id/balance` - 获取凭据余额
/// - `GET /config` - 获取 Admin 可编辑的配置（负载均衡模式、关键词替换开关、数据库路径等）
/// - `PUT /config` - 部分更新 Admin 配置
/// - `GET /config/keyword-replacements` - 获取关键词替换列表
/// - `POST /config/keyword-replacements` - 新增关键词替换
/// - `PUT /config/keyword-replacements/:id` - 更新关键词替换
/// - `DELETE /config/keyword-replacements/:id` - 删除关键词替换
/// - `GET /conversations` - 分页查询对话记录（轻量列表版）
/// - `GET /conversations/:id` - 获取单条对话完整详情
/// - `GET /conversations/stats` - 获取 Token 消耗统计（按小时聚合）
/// - `GET /conversations/models` - 获取所有不重复的模型名称
///
/// # 认证
/// 需要 Admin API Key 认证，支持：
/// - `x-api-key` header
/// - `Authorization: Bearer <token>` header
pub fn create_admin_router(state: AdminState) -> Router {
    Router::new()
        .route(
            "/credentials",
            get(get_all_credentials).post(add_credential),
        )
        .route("/credentials/{id}", delete(delete_credential))
        .route("/credentials/{id}/disabled", post(set_credential_disabled))
        .route("/credentials/{id}/priority", post(set_credential_priority))
        .route("/credentials/{id}/email", post(set_credential_email))
        .route("/credentials/{id}/proxy", post(set_credential_proxy))
        .route("/credentials/{id}/machine-id", post(set_credential_machine_id))
        .route("/credentials/{id}/reset", post(reset_failure_count))
        .route("/credentials/{id}/refresh", post(force_refresh_token))
        .route("/credentials/{id}/refresh-balance", post(force_refresh_balance))
        .route("/credentials/{id}/balance", get(get_credential_balance))
        .route(
            "/config",
            get(get_admin_config).put(update_admin_config),
        )
        .route("/conversations", get(get_conversations))
        .route("/conversations/{id}", get(get_conversation_detail))
        .route("/conversations/stats", get(get_conversation_stats))
        .route("/conversations/models", get(get_conversation_models))
        .route(
            "/config/keyword-replacements",
            get(get_keyword_replacements).post(add_keyword_replacement),
        )
        .route(
            "/config/keyword-replacements/{id}",
            put(update_keyword_replacement).delete(delete_keyword_replacement),
        )
        .layer(middleware::from_fn_with_state(
            state.clone(),
            admin_auth_middleware,
        ))
        .with_state(state)
}
