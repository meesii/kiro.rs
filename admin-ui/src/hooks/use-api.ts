import { api } from '@/api/client';
import type {
    AddCredentialRequest,
    AddKeywordReplacementRequest,
    ConversationQuery,
    SetDisabledRequest,
    SetEmailRequest,
    SetMachineIdRequest,
    SetPriorityRequest,
    SetProxyRequest,
    TokenStatsQuery,
    UpdateAdminConfigRequest,
    UpdateKeywordReplacementRequest,
} from '@/types/api';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

export function use_credentials() {
    return useQuery({
        queryKey: ['credentials'],
        queryFn: () => api.get_credentials(),
        refetchInterval: 30_000,
    });
}

export function use_add_credential() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (req: AddCredentialRequest) => api.add_credential(req),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['credentials'] }),
    });
}

export function use_delete_credential() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id: number) => api.delete_credential(id),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['credentials'] }),
    });
}

export function use_set_credential_disabled() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, ...req }: SetDisabledRequest & { id: number }) => api.set_credential_disabled(id, req),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['credentials'] }),
    });
}

export function use_set_credential_priority() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, ...req }: SetPriorityRequest & { id: number }) => api.set_credential_priority(id, req),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['credentials'] }),
    });
}

export function use_set_credential_email() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, ...req }: SetEmailRequest & { id: number }) => api.set_credential_email(id, req),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['credentials'] }),
    });
}

export function use_set_credential_proxy() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, ...req }: SetProxyRequest & { id: number }) => api.set_credential_proxy(id, req),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['credentials'] }),
    });
}

export function use_set_credential_machine_id() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, ...req }: SetMachineIdRequest & { id: number }) => api.set_credential_machine_id(id, req),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['credentials'] }),
    });
}

export function use_reset_credential_failure() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id: number) => api.reset_credential_failure(id),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['credentials'] }),
    });
}

export function use_force_refresh_token() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id: number) => api.force_refresh_token(id),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['credentials'] }),
    });
}

export function use_force_refresh_balance() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id: number) => api.force_refresh_balance(id),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['credentials'] }),
    });
}

export function use_credential_balance(id: number | null) {
    return useQuery({
        queryKey: ['credential-balance', id],
        queryFn: () => api.get_credential_balance(id!),
        enabled: id !== null,
        staleTime: 5 * 60_000,
    });
}

export function use_conversations(params?: ConversationQuery) {
    return useQuery({
        queryKey: ['conversations', params],
        queryFn: () => api.get_conversations(params),
    });
}

export function use_token_stats(params?: TokenStatsQuery) {
    return useQuery({
        queryKey: ['token-stats', params],
        queryFn: () => api.get_token_stats(params),
        refetchInterval: 60_000,
    });
}

export function use_conversation_detail(id: string | null) {
    return useQuery({
        queryKey: ['conversation-detail', id],
        queryFn: () => api.get_conversation_detail(id!),
        enabled: id !== null,
    });
}

export function use_conversation_models() {
    return useQuery({
        queryKey: ['conversation-models'],
        queryFn: () => api.get_conversation_models(),
        staleTime: 10 * 60_000,
    });
}

export function use_delete_conversations() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (ids: string[]) => api.delete_conversations(ids),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['conversations'] });
            qc.invalidateQueries({ queryKey: ['conversation-models'] });
            qc.invalidateQueries({ queryKey: ['token-stats'] });
        },
    });
}

export function use_clear_conversations() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: () => api.clear_conversations(),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['conversations'] });
            qc.invalidateQueries({ queryKey: ['conversation-models'] });
            qc.invalidateQueries({ queryKey: ['token-stats'] });
        },
    });
}

export function use_keyword_replacements() {
    return useQuery({
        queryKey: ['keyword-replacements'],
        queryFn: () => api.get_keyword_replacements(),
    });
}

export function use_add_keyword_replacement() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (req: AddKeywordReplacementRequest) => api.add_keyword_replacement(req),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['keyword-replacements'] }),
    });
}

export function use_update_keyword_replacement() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, ...req }: UpdateKeywordReplacementRequest & { id: string }) => api.update_keyword_replacement(id, req),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['keyword-replacements'] }),
    });
}

export function use_delete_keyword_replacement() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id: string) => api.delete_keyword_replacement(id),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['keyword-replacements'] }),
    });
}

export function use_admin_config() {
    return useQuery({
        queryKey: ['admin-config'],
        queryFn: () => api.get_admin_config(),
    });
}

export function use_update_admin_config() {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (req: UpdateAdminConfigRequest) => api.update_admin_config(req),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-config'] }),
    });
}
