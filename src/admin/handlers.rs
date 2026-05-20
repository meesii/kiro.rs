//! Admin API HTTP 处理器

use axum::{
    Json,
    extract::{Path, Query, State},
    http::StatusCode,
    response::IntoResponse,
};

use super::{
    middleware::AdminState,
    types::{
        AddCredentialRequest, AddKeywordReplacementRequest, AdminErrorResponse,
        SetDisabledRequest, SetEmailRequest, SetMachineIdRequest, SetPriorityRequest,
        SetProxyRequest, SuccessResponse, UpdateAdminConfigRequest,
        UpdateKeywordReplacementRequest,
    },
};
use crate::db::{ConversationQuery, TokenStatsQuery};

/// GET /api/admin/credentials
/// 获取所有凭据状态
pub async fn get_all_credentials(State(state): State<AdminState>) -> impl IntoResponse {
    let response = state.service.get_all_credentials();
    Json(response)
}

/// POST /api/admin/credentials/:id/disabled
/// 设置凭据禁用状态
pub async fn set_credential_disabled(
    State(state): State<AdminState>,
    Path(id): Path<u64>,
    Json(payload): Json<SetDisabledRequest>,
) -> impl IntoResponse {
    match state.service.set_disabled(id, payload.disabled) {
        Ok(_) => {
            let action = if payload.disabled { "禁用" } else { "启用" };
            Json(SuccessResponse::new(format!("凭据 #{} 已{}", id, action))).into_response()
        }
        Err(e) => (e.status_code(), Json(e.into_response())).into_response(),
    }
}

/// POST /api/admin/credentials/:id/priority
/// 设置凭据优先级
pub async fn set_credential_priority(
    State(state): State<AdminState>,
    Path(id): Path<u64>,
    Json(payload): Json<SetPriorityRequest>,
) -> impl IntoResponse {
    match state.service.set_priority(id, payload.priority) {
        Ok(_) => Json(SuccessResponse::new(format!(
            "凭据 #{} 优先级已设置为 {}",
            id, payload.priority
        )))
        .into_response(),
        Err(e) => (e.status_code(), Json(e.into_response())).into_response(),
    }
}

/// POST /api/admin/credentials/:id/email
/// 设置凭据邮箱
pub async fn set_credential_email(
    State(state): State<AdminState>,
    Path(id): Path<u64>,
    Json(payload): Json<SetEmailRequest>,
) -> impl IntoResponse {
    let email = payload.email;
    match state.service.set_email(id, email.clone()) {
        Ok(_) => Json(SuccessResponse::new(format!(
            "凭据 #{} 邮箱已修改为 {}",
            id, email
        )))
        .into_response(),
        Err(e) => (e.status_code(), Json(e.into_response())).into_response(),
    }
}

/// POST /api/admin/credentials/:id/proxy
/// 设置凭据代理配置
pub async fn set_credential_proxy(
    State(state): State<AdminState>,
    Path(id): Path<u64>,
    Json(payload): Json<SetProxyRequest>,
) -> impl IntoResponse {
    // 空字符串视为 None
    let proxy_url = payload.proxy_url.filter(|s| !s.trim().is_empty());
    let proxy_username = payload.proxy_username.filter(|s| !s.trim().is_empty());
    let proxy_password = payload.proxy_password.filter(|s| !s.trim().is_empty());
    match state.service.set_proxy(id, proxy_url, proxy_username, proxy_password) {
        Ok(_) => Json(SuccessResponse::new(format!(
            "凭据 #{} 代理配置已更新",
            id
        )))
        .into_response(),
        Err(e) => (e.status_code(), Json(e.into_response())).into_response(),
    }
}

/// POST /api/admin/credentials/:id/machine-id
/// 设置凭据 Machine ID
pub async fn set_credential_machine_id(
    State(state): State<AdminState>,
    Path(id): Path<u64>,
    Json(payload): Json<SetMachineIdRequest>,
) -> impl IntoResponse {
    let machine_id = payload.machine_id.filter(|s| !s.trim().is_empty());
    match state.service.set_machine_id(id, machine_id) {
        Ok(_) => Json(SuccessResponse::new(format!(
            "凭据 #{} Machine ID 已更新",
            id
        )))
        .into_response(),
        Err(e) => (e.status_code(), Json(e.into_response())).into_response(),
    }
}

/// POST /api/admin/credentials/:id/reset
/// 重置失败计数并重新启用
pub async fn reset_failure_count(
    State(state): State<AdminState>,
    Path(id): Path<u64>,
) -> impl IntoResponse {
    match state.service.reset_and_enable(id) {
        Ok(_) => Json(SuccessResponse::new(format!(
            "凭据 #{} 失败计数已重置并重新启用",
            id
        )))
        .into_response(),
        Err(e) => (e.status_code(), Json(e.into_response())).into_response(),
    }
}

/// GET /api/admin/credentials/:id/balance
/// 获取指定凭据的余额
pub async fn get_credential_balance(
    State(state): State<AdminState>,
    Path(id): Path<u64>,
) -> impl IntoResponse {
    match state.service.get_balance(id).await {
        Ok(response) => Json(response).into_response(),
        Err(e) => (e.status_code(), Json(e.into_response())).into_response(),
    }
}

/// POST /api/admin/credentials
/// 添加新凭据
pub async fn add_credential(
    State(state): State<AdminState>,
    Json(payload): Json<AddCredentialRequest>,
) -> impl IntoResponse {
    match state.service.add_credential(payload).await {
        Ok(response) => Json(response).into_response(),
        Err(e) => (e.status_code(), Json(e.into_response())).into_response(),
    }
}

/// DELETE /api/admin/credentials/:id
/// 删除凭据
pub async fn delete_credential(
    State(state): State<AdminState>,
    Path(id): Path<u64>,
) -> impl IntoResponse {
    match state.service.delete_credential(id) {
        Ok(_) => Json(SuccessResponse::new(format!("凭据 #{} 已删除", id))).into_response(),
        Err(e) => (e.status_code(), Json(e.into_response())).into_response(),
    }
}

/// POST /api/admin/credentials/:id/refresh
/// 强制刷新凭据 Token
pub async fn force_refresh_token(
    State(state): State<AdminState>,
    Path(id): Path<u64>,
) -> impl IntoResponse {
    match state.service.force_refresh_token(id).await {
        Ok(_) => Json(SuccessResponse::new(format!(
            "凭据 #{} Token 已强制刷新",
            id
        )))
        .into_response(),
        Err(e) => (e.status_code(), Json(e.into_response())).into_response(),
    }
}

/// POST /api/admin/credentials/:id/refresh-balance
/// 强制刷新凭据余额（绕过缓存）
pub async fn force_refresh_balance(
    State(state): State<AdminState>,
    Path(id): Path<u64>,
) -> impl IntoResponse {
    match state.service.force_refresh_balance(id).await {
        Ok(response) => Json(response).into_response(),
        Err(e) => (e.status_code(), Json(e.into_response())).into_response(),
    }
}

/// GET /api/admin/conversations
/// 分页查询对话记录
pub async fn get_conversations(
    State(state): State<AdminState>,
    Query(query): Query<ConversationQuery>,
) -> impl IntoResponse {
    let db = match &state.db {
        Some(db) => db,
        None => {
            return (
                StatusCode::SERVICE_UNAVAILABLE,
                Json(AdminErrorResponse::api_error("对话数据库未配置")),
            )
                .into_response();
        }
    };

    match db.query_conversations(query).await {
        Ok(page) => Json(page).into_response(),
        Err(e) => {
            tracing::error!("查询对话记录失败: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(AdminErrorResponse::internal_error(format!("查询失败: {}", e))),
            )
                .into_response()
        }
    }
}

/// GET /api/admin/conversations/stats
/// 获取 Token 消耗统计（按小时聚合）
pub async fn get_conversation_stats(
    State(state): State<AdminState>,
    Query(query): Query<TokenStatsQuery>,
) -> impl IntoResponse {
    let db = match &state.db {
        Some(db) => db,
        None => {
            return (
                StatusCode::SERVICE_UNAVAILABLE,
                Json(AdminErrorResponse::api_error("对话数据库未配置")),
            )
                .into_response();
        }
    };

    match db.query_token_stats(query).await {
        Ok(stats) => Json(stats).into_response(),
        Err(e) => {
            tracing::error!("查询 Token 统计失败: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(AdminErrorResponse::internal_error(format!("查询失败: {}", e))),
            )
                .into_response()
        }
    }
}

/// GET /api/admin/config/keyword-replacements
/// 获取关键词替换列表
pub async fn get_keyword_replacements(State(state): State<AdminState>) -> impl IntoResponse {
    let response = state.service.get_keyword_replacements();
    Json(response)
}

/// POST /api/admin/config/keyword-replacements
/// 新增关键词替换
pub async fn add_keyword_replacement(
    State(state): State<AdminState>,
    Json(payload): Json<AddKeywordReplacementRequest>,
) -> impl IntoResponse {
    match state.service.add_keyword_replacement(payload) {
        Ok(response) => Json(response).into_response(),
        Err(e) => (e.status_code(), Json(e.into_response())).into_response(),
    }
}

/// PUT /api/admin/config/keyword-replacements/:id
/// 更新关键词替换
pub async fn update_keyword_replacement(
    State(state): State<AdminState>,
    Path(id): Path<String>,
    Json(payload): Json<UpdateKeywordReplacementRequest>,
) -> impl IntoResponse {
    match state.service.update_keyword_replacement(id, payload) {
        Ok(response) => Json(response).into_response(),
        Err(e) => (e.status_code(), Json(e.into_response())).into_response(),
    }
}

/// DELETE /api/admin/config/keyword-replacements/:id
/// 删除关键词替换
pub async fn delete_keyword_replacement(
    State(state): State<AdminState>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    match state.service.delete_keyword_replacement(id) {
        Ok(response) => Json(response).into_response(),
        Err(e) => (e.status_code(), Json(e.into_response())).into_response(),
    }
}

/// GET /api/admin/config
/// 获取 Admin 可编辑的配置
pub async fn get_admin_config(State(state): State<AdminState>) -> impl IntoResponse {
    let response = state.service.get_admin_config();
    Json(response)
}

/// PUT /api/admin/config
/// 部分更新 Admin 配置
pub async fn update_admin_config(
    State(state): State<AdminState>,
    Json(payload): Json<UpdateAdminConfigRequest>,
) -> impl IntoResponse {
    match state.service.update_admin_config(payload) {
        Ok(response) => Json(response).into_response(),
        Err(e) => (e.status_code(), Json(e.into_response())).into_response(),
    }
}

/// GET /api/admin/conversations/:id
/// 获取单条对话的完整详情
pub async fn get_conversation_detail(
    State(state): State<AdminState>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    let db = match &state.db {
        Some(db) => db,
        None => {
            return (
                StatusCode::SERVICE_UNAVAILABLE,
                Json(AdminErrorResponse::api_error("对话数据库未配置")),
            )
                .into_response();
        }
    };

    match db.get_conversation(id).await {
        Ok(Some(row)) => Json(row).into_response(),
        Ok(None) => (StatusCode::NOT_FOUND, Json(AdminErrorResponse::not_found("对话记录不存在"))).into_response(),
        Err(e) => {
            tracing::error!("查询对话详情失败: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(AdminErrorResponse::internal_error(format!("查询失败: {}", e))),
            )
                .into_response()
        }
    }
}

/// GET /api/admin/conversations/models
/// 获取所有不重复的模型名称
pub async fn get_conversation_models(
    State(state): State<AdminState>,
) -> impl IntoResponse {
    let db = match &state.db {
        Some(db) => db,
        None => {
            return (
                StatusCode::SERVICE_UNAVAILABLE,
                Json(AdminErrorResponse::api_error("对话数据库未配置")),
            )
                .into_response();
        }
    };

    match db.query_models().await {
        Ok(response) => Json(response).into_response(),
        Err(e) => {
            tracing::error!("查询模型列表失败: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(AdminErrorResponse::internal_error(format!("查询失败: {}", e))),
            )
                .into_response()
        }
    }
}
