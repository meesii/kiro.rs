export interface CredentialStatusItem {
    id: number;
    priority: number;
    disabled: boolean;
    failureCount: number;
    isCurrent: boolean;
    expiresAt: string | null;
    authMethod: string | null;
    hasProfileArn: boolean;
    refreshTokenHash: string | null;
    apiKeyHash: string | null;
    maskedApiKey: string | null;
    email: string | null;
    successCount: number;
    lastUsedAt: string | null;
    hasProxy: boolean;
    /** 代理 URL */
    proxyUrl: string | null;
    /** 代理认证用户名 */
    proxyUsername: string | null;
    /** 代理认证密码 */
    proxyPassword: string | null;
    /** 凭据级 Machine ID */
    machineId: string | null;
    refreshFailureCount: number;
    disabledReason: string | null;
    endpoint: string;
    subscriptionTitle: string | null;
    usagePercentage: number | null;
    currentUsage: number | null;
    usageLimit: number | null;
    /** 余额刷新错误信息 */
    balanceError: string | null;
    /** 最近一次上游 API 调用错误摘要 */
    lastApiError: string | null;
    /** 最近一次上游 API 调用错误时间 */
    lastApiErrorAt: string | null;
}

export interface CredentialsStatusResponse {
    total: number;
    available: number;
    currentId: number;
    credentials: CredentialStatusItem[];
}

export interface BalanceResponse {
    id: number;
    subscriptionTitle: string | null;
    currentUsage: number;
    usageLimit: number;
    remaining: number;
    usagePercentage: number;
    nextResetAt: number | null;
    /** 是否为缓存数据（上游获取失败时兜底返回） */
    stale?: boolean;
}

export interface AddCredentialRequest {
    refreshToken?: string;
    authMethod: string;
    clientId?: string;
    clientSecret?: string;
    priority?: number;
    region?: string;
    authRegion?: string;
    apiRegion?: string;
    machineId?: string;
    email?: string;
    proxyUrl?: string;
    proxyUsername?: string;
    proxyPassword?: string;
    kiroApiKey?: string;
    endpoint?: string;
}

export interface AddCredentialResponse {
    success: boolean;
    message: string;
    credentialId: number;
    email: string | null;
}

export interface SuccessResponse {
    success: boolean;
    message: string;
}

export interface SetDisabledRequest {
    disabled: boolean;
}

export interface SetPriorityRequest {
    priority: number;
}

export interface SetEmailRequest {
    email: string;
}

export interface SetProxyRequest {
    /** 代理 URL（null 或空字符串表示不使用凭据级代理，回退到全局代理） */
    proxyUrl: string | null;
    /** 代理认证用户名 */
    proxyUsername: string | null;
    /** 代理认证密码 */
    proxyPassword: string | null;
}

export interface SetMachineIdRequest {
    /** 凭据级 Machine ID（64 位十六进制或 UUID 格式） */
    machineId: string | null;
}

export interface AdminErrorResponse {
    error: {
        type: string;
        message: string;
    };
}

export interface ConversationQuery {
    page?: number;
    pageSize?: number;
    model?: string;
    endpoint?: string;
    stopReason?: string;
    stream?: boolean;
    sortBy?: string;
    sortOrder?: string;
}

export interface ConversationRow {
    id: string;
    createdAt: string;
    model: string;
    endpoint: string;
    systemPrompt: string | null;
    requestMessages: string;
    requestTools: string | null;
    responseContent: string;
    inputTokens: number;
    outputTokens: number;
    stopReason: string;
    stream: boolean;
    durationMs: number;
}

export interface ConversationPage {
    items: ConversationRow[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
}

export interface TokenStatsQuery {
    hours?: number;
}

export interface TokenStatsItem {
    time: string;
    tokens: number;
}

export interface TokenStatsResponse {
    items: TokenStatsItem[];
    hours: number;
    totalTokens: number;
}

export interface ConversationModelsResponse {
    models: string[];
}

export interface KeywordReplacementItem {
    id: string;
    pattern: string;
    replacement: string;
    isRegex: boolean;
}

export interface KeywordReplacementsResponse {
    replacements: KeywordReplacementItem[];
}

export interface AddKeywordReplacementRequest {
    id: string;
    pattern: string;
    replacement: string;
    isRegex?: boolean;
}

export interface UpdateKeywordReplacementRequest {
    pattern: string;
    replacement: string;
    isRegex?: boolean;
}

export interface AdminConfigResponse {
    loadBalancingMode: string;
    keywordReplacementEnabled: boolean;
    dbPath: string | null;
}

export interface UpdateAdminConfigRequest {
    loadBalancingMode?: string;
    keywordReplacementEnabled?: boolean;
    dbPath?: string;
}
