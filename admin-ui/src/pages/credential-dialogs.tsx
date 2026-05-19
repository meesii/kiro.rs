import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { use_credential_balance } from '@/hooks/use-api';
import { generate_machine_id } from '@/lib/crypto';
import type { AddCredentialRequest } from '@/types/api';
import { Download, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

export function AddCredentialDialog({
    open,
    onOpenChange,
    onSubmit,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSubmit: (req: AddCredentialRequest) => Promise<void>;
}) {
    const [auth_method, set_auth_method] = useState('social');
    const [refresh_tok, set_refresh_tok] = useState('');
    const [client_id, set_client_id] = useState('');
    const [client_secret, set_client_secret] = useState('');
    const [api_key, set_api_key] = useState('');
    const [priority, set_priority] = useState(0);
    const [endpoint, set_endpoint] = useState('');
    const [proxy_url, set_proxy_url] = useState('');
    const [loading, set_loading] = useState(false);

    const handle_submit = async (e: React.FormEvent) => {
        e.preventDefault();
        set_loading(true);
        try {
            await onSubmit({
                authMethod: auth_method,
                refreshToken: auth_method !== 'api_key' ? refresh_tok || undefined : undefined,
                clientId: auth_method === 'idc' ? client_id || undefined : undefined,
                clientSecret: auth_method === 'idc' ? client_secret || undefined : undefined,
                kiroApiKey: auth_method === 'api_key' ? api_key || undefined : undefined,
                priority,
                endpoint: endpoint || undefined,
                proxyUrl: proxy_url || undefined,
            });
        } finally {
            set_loading(false);
        }
    };

    return (
        <Dialog key={`add-credential-${open}`} open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-xl overflow-hidden">
                <DialogHeader className="pb-2">
                    <DialogTitle>添加凭证</DialogTitle>
                    <DialogDescription>添加一个新的凭证到凭证池</DialogDescription>
                </DialogHeader>
                <form onSubmit={handle_submit} className="space-y-5 overflow-hidden">
                    <div className="space-y-2">
                        <Label>认证方式</Label>
                        <Select value={auth_method} onValueChange={(v: string | null) => set_auth_method(v ?? 'social')}>
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="social">社交登录 (Refresh Token)</SelectItem>
                                <SelectItem value="idc">IdC / Builder-ID / IAM</SelectItem>
                                <SelectItem value="api_key">API 密钥</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    {auth_method === 'api_key' ? (
                        <div className="space-y-2">
                            <Label>API 密钥</Label>
                            <Input placeholder="ksk_xxx..." value={api_key} onChange={(e) => set_api_key(e.target.value)} />
                        </div>
                    ) : (
                        <>
                            <div className="space-y-2">
                                <Label>Refresh Token</Label>
                                <Textarea placeholder="粘贴 Refresh Token..." value={refresh_tok} onChange={(e) => set_refresh_tok(e.target.value)} rows={4} />
                            </div>
                            {auth_method === 'idc' && (
                                <>
                                    <div className="space-y-2">
                                        <Label>Client ID</Label>
                                        <Input placeholder="Client ID" value={client_id} onChange={(e) => set_client_id(e.target.value)} />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Client Secret</Label>
                                        <Input placeholder="Client Secret" value={client_secret} onChange={(e) => set_client_secret(e.target.value)} />
                                    </div>
                                </>
                            )}
                        </>
                    )}

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>优先级</Label>
                            <Input type="number" min={0} value={priority} onChange={(e) => set_priority(Number(e.target.value))} />
                        </div>
                        <div className="space-y-2">
                            <Label>端点</Label>
                            <Input placeholder="默认" value={endpoint} onChange={(e) => set_endpoint(e.target.value)} />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label>代理地址（可选）</Label>
                        <Input placeholder="http://user:pass@host:port" value={proxy_url} onChange={(e) => set_proxy_url(e.target.value)} />
                    </div>

                    <DialogFooter className="pt-2">
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                            取消
                        </Button>
                        <Button type="submit" disabled={loading}>
                            {loading ? '添加中...' : '添加凭证'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}

export function BatchImportDialog({
    open,
    onOpenChange,
    onImport,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onImport: (req: AddCredentialRequest) => Promise<boolean>;
}) {
    const [json, set_json] = useState('');
    const [loading, set_loading] = useState(false);
    const [results, set_results] = useState<{ id: string; status: string }[]>([]);

    const handle_import = async () => {
        let items: unknown[];
        try {
            items = JSON.parse(json);
            if (!Array.isArray(items)) throw new Error('必须是 JSON 数组');
        } catch (e) {
            toast.error('JSON 格式无效: ' + (e instanceof Error ? e.message : '解析错误'));
            return;
        }

        set_loading(true);
        set_results([]);
        const res: { id: string; status: string }[] = [];

        for (let i = 0; i < items.length; i++) {
            const item = items[i] as Record<string, unknown>;
            const req: AddCredentialRequest = {
                authMethod: (item.auth_method || item.authMethod || 'social') as string,
                refreshToken: (item.refresh_token || item.refreshToken) as string | undefined,
                clientId: (item.client_id || item.clientId) as string | undefined,
                clientSecret: (item.client_secret || item.clientSecret) as string | undefined,
                kiroApiKey: (item.kiro_api_key || item.kiroApiKey || item.api_key || item.apiKey) as string | undefined,
                priority: (item.priority as number) ?? 0,
                endpoint: item.endpoint as string | undefined,
                proxyUrl: (item.proxy_url || item.proxyUrl) as string | undefined,
                email: item.email as string | undefined,
            };
            const ok = await onImport(req);
            const rt = item.refresh_token || item.refreshToken;
            res.push({
                id: (item.email || (typeof rt === 'string' ? rt.slice(0, 12) : '') || `第 ${i + 1} 项`) as string,
                status: ok ? 'success' : 'failed',
            });
            set_results([...res]);
        }

        set_loading(false);
        toast.success(`已导入 ${res.filter((r) => r.status === 'success').length}/${items.length} 个凭证`);
    };

    return (
        <Dialog key={`batch-import-${open}`} open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-sm">
                <DialogHeader>
                    <DialogTitle>批量导入</DialogTitle>
                    <DialogDescription>粘贴 JSON 数组格式的凭证进行导入，每个对象包含相关字段。</DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                    <Textarea
                        placeholder='[{"refresh_token": "...", "auth_method": "social", "priority": 0}]'
                        value={json}
                        onChange={(e) => set_json(e.target.value)}
                        rows={8}
                        className="font-mono text-sm"
                    />
                    {results.length > 0 && (
                        <div className="max-h-48 space-y-1 overflow-auto rounded-md border p-3">
                            {results.map((r, i) => (
                                <div key={i} className="flex items-center gap-2 text-sm">
                                    <Badge variant={r.status === 'success' ? 'default' : 'destructive'} className="text-xs">
                                        {r.status === 'success' ? '成功' : '失败'}
                                    </Badge>
                                    <span className="font-mono">{r.id}</span>
                                </div>
                            ))}
                        </div>
                    )}
                    <DialogFooter>
                        <Button variant="outline" onClick={() => onOpenChange(false)}>
                            关闭
                        </Button>
                        <Button onClick={handle_import} disabled={loading || !json.trim()}>
                            {loading ? (
                                '导入中...'
                            ) : (
                                <>
                                    <Download className="mr-1 size-4" /> 导入
                                </>
                            )}
                        </Button>
                    </DialogFooter>
                </div>
            </DialogContent>
        </Dialog>
    );
}

export function BalanceDialog({ credentialId, onOpenChange }: { credentialId: number | null; onOpenChange: (open: boolean) => void }) {
    const { data, isLoading } = use_credential_balance(credentialId);

    return (
        <Dialog open={credentialId !== null} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-sm">
                <DialogHeader>
                    <DialogTitle>用量详情 — #{credentialId}</DialogTitle>
                </DialogHeader>
                {isLoading ? (
                    <div className="space-y-3 p-4">
                        <Skeleton className="h-4 w-full" />
                        <Skeleton className="h-4 w-3/4" />
                        <Skeleton className="h-8 w-full" />
                    </div>
                ) : data ? (
                    <div className="space-y-4">
                        <div>
                            <p className="text-muted-foreground text-sm">订阅类型</p>
                            <p className="font-medium">{data.subscriptionTitle ?? '未知'}</p>
                        </div>
                        <div>
                            <div className="flex items-center justify-between text-sm mb-2">
                                <span>用量</span>
                                <span className="font-medium tabular-nums">
                                    已用 {data.currentUsage.toLocaleString()} / 总额 {data.usageLimit.toLocaleString()}
                                </span>
                            </div>
                            <Progress value={Math.min(data.usagePercentage, 100)} className="h-2" />
                            <p className="text-muted-foreground text-xs mt-1">剩余 {data.remaining.toLocaleString()}</p>
                        </div>
                        {data.nextResetAt && (
                            <div>
                                <p className="text-muted-foreground text-sm">下次重置</p>
                                <p className="text-sm">{new Date(data.nextResetAt * 1000).toLocaleString()}</p>
                            </div>
                        )}
                    </div>
                ) : (
                    <p className="text-muted-foreground">加载用量数据失败</p>
                )}
            </DialogContent>
        </Dialog>
    );
}

export function ClearDisabledDialog({
    count,
    open,
    onOpenChange,
    onConfirm,
}: {
    count: number;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onConfirm: () => Promise<void>;
}) {
    const [loading, set_loading] = useState(false);

    const handle_confirm = async () => {
        set_loading(true);
        try {
            await onConfirm();
        } finally {
            set_loading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-sm">
                <DialogHeader>
                    <DialogTitle>清除禁用凭证</DialogTitle>
                    <DialogDescription>确定要删除全部 {count} 个已禁用的凭证吗？此操作无法撤销。</DialogDescription>
                </DialogHeader>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        取消
                    </Button>
                    <Button variant="destructive" onClick={handle_confirm} disabled={loading}>
                        {loading ? '删除中...' : `删除 ${count} 个凭证`}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

export function DeleteConfirmDialog({
    credentialId,
    onOpenChange,
    onConfirm,
}: {
    credentialId: number | null;
    onOpenChange: (open: boolean) => void;
    onConfirm: () => Promise<void>;
}) {
    const [loading, set_loading] = useState(false);

    const handle_confirm = async () => {
        set_loading(true);
        try {
            await onConfirm();
        } finally {
            set_loading(false);
        }
    };

    return (
        <Dialog open={credentialId !== null} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-sm">
                <DialogHeader>
                    <DialogTitle>删除凭证</DialogTitle>
                    <DialogDescription>确定要永久删除凭证 #{credentialId} 吗？此操作无法撤销。</DialogDescription>
                </DialogHeader>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        取消
                    </Button>
                    <Button variant="destructive" onClick={handle_confirm} disabled={loading}>
                        {loading ? '删除中...' : '删除'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

export function EditEmailDialog({
    credentialId,
    currentEmail,
    onOpenChange,
    onConfirm,
}: {
    credentialId: number | null;
    currentEmail: string | null;
    onOpenChange: (open: boolean) => void;
    onConfirm: (email: string) => Promise<void>;
}) {
    const [email, set_email] = useState(currentEmail ?? '');
    const [loading, set_loading] = useState(false);

    const handle_open_change = (open: boolean) => {
        if (!open) {
            onOpenChange(false);
        }
    };

    const handle_confirm = async () => {
        const trimmed = email.trim();
        if (!trimmed) {
            toast.error('请输入邮箱地址');
            return;
        }
        set_loading(true);
        try {
            await onConfirm(trimmed);
        } finally {
            set_loading(false);
        }
    };

    return (
        <Dialog open={credentialId !== null} onOpenChange={handle_open_change}>
            <DialogContent className="max-w-sm">
                <DialogHeader>
                    <DialogTitle>修改邮箱</DialogTitle>
                    <DialogDescription>请输入凭证 #{credentialId} 的新邮箱地址</DialogDescription>
                </DialogHeader>
                <div className="space-y-2">
                    <Label>邮箱</Label>
                    <Input type="email" placeholder="请输入账号 email" value={email} onChange={(e) => set_email(e.target.value)} />
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        取消
                    </Button>
                    <Button onClick={handle_confirm} disabled={loading}>
                        {loading ? '保存中...' : '保存'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

export function EditProxyDialog({
    credentialId,
    currentProxy,
    onOpenChange,
    onConfirm,
}: {
    credentialId: number | null;
    currentProxy: { proxyUrl: string | null; proxyUsername: string | null; proxyPassword: string | null } | null;
    onOpenChange: (open: boolean) => void;
    onConfirm: (req: { proxyUrl: string | null; proxyUsername: string | null; proxyPassword: string | null }) => Promise<void>;
}) {
    const [proxy_url, set_proxy_url] = useState(currentProxy?.proxyUrl ?? '');
    const [proxy_username, set_proxy_username] = useState(currentProxy?.proxyUsername ?? '');
    const [proxy_password, set_proxy_password] = useState(currentProxy?.proxyPassword ?? '');
    const [loading, set_loading] = useState(false);

    const handle_open_change = (open: boolean) => {
        if (!open) {
            onOpenChange(false);
        }
    };

    const handle_confirm = async () => {
        set_loading(true);
        try {
            await onConfirm({
                proxyUrl: proxy_url.trim() || null,
                proxyUsername: proxy_username.trim() || null,
                proxyPassword: proxy_password.trim() || null,
            });
        } finally {
            set_loading(false);
        }
    };

    return (
        <Dialog open={credentialId !== null} onOpenChange={handle_open_change}>
            <DialogContent className="max-w-sm">
                <DialogHeader>
                    <DialogTitle>修改代理</DialogTitle>
                    <DialogDescription>配置凭证 #{credentialId} 的代理设置，空白表示回退到全局配置</DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                    <div className="space-y-2">
                        <Label>代理地址</Label>
                        <Input placeholder="http://host:port 或 socks5://host:port" value={proxy_url} onChange={(e) => set_proxy_url(e.target.value)} />
                        <p className="text-[11px] text-muted-foreground">留空则使用全局代理，输入 "direct" 表示直连</p>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-2">
                            <Label>用户名</Label>
                            <Input placeholder="（可选）" value={proxy_username} onChange={(e) => set_proxy_username(e.target.value)} />
                        </div>
                        <div className="space-y-2">
                            <Label>密码</Label>
                            <Input type="password" placeholder="（可选）" value={proxy_password} onChange={(e) => set_proxy_password(e.target.value)} />
                        </div>
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        取消
                    </Button>
                    <Button onClick={handle_confirm} disabled={loading}>
                        {loading ? '保存中...' : '保存'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

export function EditMachineIdDialog({
    credentialId,
    currentMachineId,
    onOpenChange,
    onConfirm,
}: {
    credentialId: number | null;
    currentMachineId: string | null;
    onOpenChange: (open: boolean) => void;
    onConfirm: (machineId: string | null) => Promise<void>;
}) {
    const [machine_id, set_machine_id] = useState(currentMachineId ?? '');
    const [loading, set_loading] = useState(false);
    const [generating, set_generating] = useState(false);

    const handle_open_change = (open: boolean) => {
        if (!open) {
            onOpenChange(false);
        }
    };

    const handle_generate = async () => {
        set_generating(true);
        try {
            const generated = await generate_machine_id();
            set_machine_id(generated);
        } finally {
            set_generating(false);
        }
    };

    const handle_confirm = async () => {
        set_loading(true);
        try {
            await onConfirm(machine_id.trim() || null);
        } finally {
            set_loading(false);
        }
    };

    return (
        <Dialog open={credentialId !== null} onOpenChange={handle_open_change}>
            <DialogContent className="max-w-sm">
                <DialogHeader>
                    <DialogTitle>修改机器码</DialogTitle>
                    <DialogDescription>设置凭证 #{credentialId} 的 Machine ID，留空则使用服务端自动生成值</DialogDescription>
                </DialogHeader>
                <div className="space-y-3">
                    <div className="space-y-2">
                        <Label>Machine ID</Label>
                        <div className="flex gap-2">
                            <Input
                                placeholder="64 位十六进制或 UUID 格式"
                                value={machine_id}
                                onChange={(e) => set_machine_id(e.target.value)}
                                className="font-mono text-xs"
                            />
                            <Button variant="outline" size="icon" className="h-10 w-10 shrink-0" onClick={handle_generate} disabled={generating}>
                                <RefreshCw className={`size-4 ${generating ? 'animate-spin' : ''}`} />
                            </Button>
                        </div>
                        <p className="text-[11px] text-muted-foreground">留空回退到服务端自动派生值</p>
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        取消
                    </Button>
                    <Button onClick={handle_confirm} disabled={loading}>
                        {loading ? '保存中...' : '保存'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
