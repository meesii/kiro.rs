import { storage } from '@/lib/storage';
import type {
    AddCredentialRequest,
    AddCredentialResponse,
    AddKeywordReplacementRequest,
    AdminConfigResponse,
    BalanceResponse,
    ConversationListItem,
    ConversationModelsResponse,
    ConversationPage,
    ConversationQuery,
    ConversationRow,
    CredentialsStatusResponse,
    KeywordReplacementsResponse,
    SetDisabledRequest,
    SetEmailRequest,
    SetMachineIdRequest,
    SetPriorityRequest,
    SetProxyRequest,
    SuccessResponse,
    TokenStatsQuery,
    TokenStatsResponse,
    UpdateAdminConfigRequest,
    UpdateKeywordReplacementRequest,
} from '@/types/api';
import axios from 'axios';

type RawConversationRow = ConversationRow & {
    created_at?: string;
    system_prompt?: string | null;
    request_messages?: string;
    request_tools?: string | null;
    response_content?: string;
    input_tokens?: number;
    output_tokens?: number;
    stop_reason?: string;
    duration_ms?: number;
};

type RawConversationListItem = ConversationListItem & {
    created_at?: string;
    request_messages_preview?: string;
    request_messages?: string;
    input_tokens?: number;
    output_tokens?: number;
    stop_reason?: string;
    duration_ms?: number;
};

type RawConversationPage = ConversationPage & {
    page_size?: number;
    total_pages?: number;
};

function normalize_conversation_row(raw: RawConversationRow): ConversationRow {
    return {
        id: raw.id,
        createdAt: raw.createdAt ?? raw.created_at ?? '',
        model: raw.model,
        endpoint: raw.endpoint,
        systemPrompt: raw.systemPrompt ?? raw.system_prompt ?? null,
        requestMessages: raw.requestMessages ?? raw.request_messages ?? '',
        requestTools: raw.requestTools ?? raw.request_tools ?? null,
        responseContent: raw.responseContent ?? raw.response_content ?? '',
        inputTokens: raw.inputTokens ?? raw.input_tokens ?? 0,
        outputTokens: raw.outputTokens ?? raw.output_tokens ?? 0,
        stopReason: raw.stopReason ?? raw.stop_reason ?? '',
        stream: raw.stream ?? false,
        durationMs: raw.durationMs ?? raw.duration_ms ?? 0,
    };
}

function normalize_conversation_list_item(raw: RawConversationListItem): ConversationListItem {
    return {
        id: raw.id,
        createdAt: raw.createdAt ?? raw.created_at ?? '',
        model: raw.model,
        endpoint: raw.endpoint,
        requestMessagesPreview: raw.requestMessagesPreview ?? raw.request_messages_preview ?? raw.request_messages ?? '',
        inputTokens: raw.inputTokens ?? raw.input_tokens ?? 0,
        outputTokens: raw.outputTokens ?? raw.output_tokens ?? 0,
        stopReason: raw.stopReason ?? raw.stop_reason ?? '',
        stream: raw.stream ?? false,
        durationMs: raw.durationMs ?? raw.duration_ms ?? 0,
    };
}

const API_BASE = '/api/admin';

function create_api_client() {
    const client = axios.create({ baseURL: API_BASE });
    client.interceptors.request.use((config) => {
        const key = storage.get_api_key();
        if (key) {
            config.headers['x-api-key'] = key;
        }
        return config;
    });
    client.interceptors.response.use(
        (res) => res,
        (error) => {
            if (error.response?.status === 401) {
                storage.remove_api_key();
                window.location.href = '/admin/login';
            }
            return Promise.reject(error);
        }
    );
    return client;
}

const http = create_api_client();

/**
 * API 请求与工具函数
 */
export const api = {
    get_credentials() {
        return http.get<CredentialsStatusResponse>('/credentials').then((r) => r.data);
    },

    add_credential(req: AddCredentialRequest) {
        return http.post<AddCredentialResponse>('/credentials', req).then((r) => r.data);
    },

    delete_credential(id: number) {
        return http.delete<SuccessResponse>(`/credentials/${id}`).then((r) => r.data);
    },

    set_credential_disabled(id: number, req: SetDisabledRequest) {
        return http.post<SuccessResponse>(`/credentials/${id}/disabled`, req).then((r) => r.data);
    },

    set_credential_priority(id: number, req: SetPriorityRequest) {
        return http.post<SuccessResponse>(`/credentials/${id}/priority`, req).then((r) => r.data);
    },

    set_credential_email(id: number, req: SetEmailRequest) {
        return http.post<SuccessResponse>(`/credentials/${id}/email`, req).then((r) => r.data);
    },

    set_credential_proxy(id: number, req: SetProxyRequest) {
        return http.post<SuccessResponse>(`/credentials/${id}/proxy`, req).then((r) => r.data);
    },

    set_credential_machine_id(id: number, req: SetMachineIdRequest) {
        return http.post<SuccessResponse>(`/credentials/${id}/machine-id`, req).then((r) => r.data);
    },

    reset_credential_failure(id: number) {
        return http.post<SuccessResponse>(`/credentials/${id}/reset`).then((r) => r.data);
    },

    force_refresh_token(id: number) {
        return http.post<SuccessResponse>(`/credentials/${id}/refresh`).then((r) => r.data);
    },

    force_refresh_balance(id: number) {
        return http.post<BalanceResponse>(`/credentials/${id}/refresh-balance`).then((r) => r.data);
    },

    get_credential_balance(id: number) {
        return http.get<BalanceResponse>(`/credentials/${id}/balance`).then((r) => r.data);
    },

    get_conversations(params?: ConversationQuery) {
        return http.get<RawConversationPage>('/conversations', { params }).then((r) => {
            const data = r.data;
            return {
                items: data.items.map((row) => normalize_conversation_list_item(row as RawConversationListItem)),
                total: data.total,
                page: data.page,
                pageSize: data.pageSize ?? data.page_size ?? 20,
                totalPages: data.totalPages ?? data.total_pages ?? 1,
            } satisfies ConversationPage;
        });
    },

    get_conversation_detail(id: string) {
        return http.get<ConversationRow>(`/conversations/${id}`).then((r) => normalize_conversation_row(r.data));
    },

    get_token_stats(params?: TokenStatsQuery) {
        return http.get<TokenStatsResponse>('/conversations/stats', { params }).then((r) => r.data);
    },

    get_conversation_models() {
        return http.get<ConversationModelsResponse>('/conversations/models').then((r) => r.data);
    },

    get_keyword_replacements() {
        return http.get<KeywordReplacementsResponse>('/config/keyword-replacements').then((r) => r.data);
    },

    add_keyword_replacement(req: AddKeywordReplacementRequest) {
        return http.post<KeywordReplacementsResponse>('/config/keyword-replacements', req).then((r) => r.data);
    },

    update_keyword_replacement(id: string, req: UpdateKeywordReplacementRequest) {
        return http.put<KeywordReplacementsResponse>(`/config/keyword-replacements/${id}`, req).then((r) => r.data);
    },

    delete_keyword_replacement(id: string) {
        return http.delete<KeywordReplacementsResponse>(`/config/keyword-replacements/${id}`).then((r) => r.data);
    },

    get_admin_config() {
        return http.get<AdminConfigResponse>('/config').then((r) => r.data);
    },

    update_admin_config(req: UpdateAdminConfigRequest) {
        return http.put<AdminConfigResponse>('/config', req).then((r) => r.data);
    },

    extract_error_message(error: unknown): string {
        if (axios.isAxiosError(error)) {
            const data = error.response?.data;
            if (data?.error?.message) return data.error.message;
            if (typeof data === 'string') return data;
            return error.message;
        }
        if (error instanceof Error) return error.message;
        return 'An unexpected error occurred';
    },
};
