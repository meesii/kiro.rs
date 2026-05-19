import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { CredentialStatusItem } from '@/types/api';
import {
    ArrowDown,
    ArrowUp,
    Coins,
    Cpu,
    Globe,
    Key,
    MoreHorizontal,
    Pencil,
    Power,
    PowerOff,
    RefreshCw,
    RotateCcw,
    Shield,
    Trash2,
    TriangleAlert,
} from 'lucide-react';

/**
 * 格式化工具
 */
const fmt = {
    auth_method_label(method: string | null) {
        switch (method) {
            case 'social':
                return '社交登录';
            case 'idc':
                return 'IdC/IAM';
            case 'api_key':
                return 'API 密钥';
            default:
                return method ?? '未知';
        }
    },
    auth_method_icon(method: string | null) {
        switch (method) {
            case 'api_key':
                return <Key className="size-3" />;
            case 'idc':
                return <Shield className="size-3" />;
            default:
                return <Globe className="size-3" />;
        }
    },
    relative_time(date_str: string | null) {
        if (!date_str) return '从未';
        const diff = Date.now() - new Date(date_str).getTime();
        const mins = Math.floor(diff / 60000);
        if (mins < 1) return '刚刚';
        if (mins < 60) return `${mins} 分钟前`;
        const hours = Math.floor(mins / 60);
        if (hours < 24) return `${hours} 小时前`;
        const days = Math.floor(hours / 24);
        return `${days} 天前`;
    },
    is_expired(date_str: string | null) {
        if (!date_str) return false;
        return new Date(date_str).getTime() < Date.now();
    },
    usage_label(cred: CredentialStatusItem) {
        if (cred.currentUsage == null || cred.usageLimit == null) return '—';
        return (
            <span>
                已用 <span className="tabular-nums">{cred.currentUsage.toLocaleString()}</span>
                <span className="mx-0.5 text-muted-foreground">/</span>
                总额 <span className="tabular-nums">{cred.usageLimit.toLocaleString()}</span>
            </span>
        );
    },
    /**
     * 根据数值计算用量比例（0-100），优先使用 currentUsage/usageLimit
     */
    usage_ratio(cred: CredentialStatusItem): number {
        if (cred.currentUsage != null && cred.usageLimit != null && cred.usageLimit > 0) {
            return Math.min((cred.currentUsage / cred.usageLimit) * 100, 100);
        }
        return cred.usagePercentage ?? 0;
    },
    usage_class(pct: number) {
        if (pct >= 100) return 'text-destructive';
        if (pct > 80) return 'text-amber-500';
        return '';
    },
    usage_bar_class(pct: number) {
        if (pct >= 100) return 'bg-destructive';
        if (pct > 80) return 'bg-amber-500';
        return 'bg-primary';
    },
    date_short(date_str: string | null) {
        if (!date_str) return '无';
        return new Date(date_str).toLocaleDateString('zh-CN', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    },
};

/**
 * 指标项
 */
function Metric({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
    return (
        <div className={className}>
            <p className="text-[11px] leading-tight text-muted-foreground">{label}</p>
            <p className="text-sm font-medium leading-snug">{children}</p>
        </div>
    );
}

export function CredentialCard({
    cred,
    selected,
    loading,
    on_toggle_select,
    on_toggle_disabled,
    on_set_priority,
    on_reset_failure,
    on_refresh_token,
    on_refresh_balance,
    on_edit_email,
    on_edit_proxy,
    on_edit_machine_id,
    on_delete,
}: {
    cred: CredentialStatusItem;
    selected: boolean;
    loading: boolean;
    on_toggle_select: () => void;
    on_toggle_disabled: (disabled: boolean) => void;
    on_set_priority: (p: number) => void;
    on_reset_failure: () => void;
    on_refresh_token: () => void;
    on_refresh_balance: () => void;
    on_edit_email: () => void;
    on_edit_proxy: () => void;
    on_edit_machine_id: () => void;
    on_delete: () => void;
}) {
    const display_name = cred.email ?? cred.maskedApiKey ?? `凭证 #${cred.id}`;
    const has_errors = cred.failureCount > 0 || cred.refreshFailureCount > 0;
    const is_expired = fmt.is_expired(cred.expiresAt);

    return (
        <TooltipProvider>
            <Card
                className={`p-0 relative h-full hover:shadow-md hover:border-primary/30 ${selected ? 'border-primary shadow-md' : ''} ${loading ? 'animate-card-pulse' : ''}`}
            >
                <CardContent className="p-4 flex flex-1 flex-col space-y-3">
                    <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                            <Checkbox checked={selected} onCheckedChange={on_toggle_select} />
                            <div className="flex min-w-0 items-center gap-1.5">
                                {cred.isCurrent && <Badge className="shrink-0 py-0 text-[10px] px-1.5">活跃</Badge>}
                                <span className="min-w-0 truncate text-sm font-medium">{display_name}</span>
                            </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                            <span className="text-xs text-muted-foreground">{cred.disabled ? '已禁用' : '已启用'}</span>
                            <Switch checked={!cred.disabled} onCheckedChange={(checked) => on_toggle_disabled(!checked)} size="sm" />
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
                        <Badge variant="outline" className="gap-1 text-xs uppercase">
                            {fmt.auth_method_icon(cred.authMethod)}
                            {fmt.auth_method_label(cred.authMethod)}
                        </Badge>
                        {cred.subscriptionTitle && (
                            <Badge variant="outline" className="text-xs">
                                {cred.subscriptionTitle}
                            </Badge>
                        )}
                        {cred.endpoint && cred.endpoint !== 'default' && (
                            <Badge variant="outline" className="font-mono text-xs uppercase">
                                {cred.endpoint}
                            </Badge>
                        )}
                        {cred.hasProxy && (
                            <Badge variant="secondary" className="text-xs bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                                代理
                            </Badge>
                        )}
                        {cred.balanceError && (
                            <Tooltip>
                                <TooltipTrigger>
                                    <Badge variant="destructive" className="cursor-default text-xs">
                                        <TriangleAlert className="mr-1 size-3" />
                                        刷新异常
                                    </Badge>
                                </TooltipTrigger>
                                <TooltipContent>{cred.balanceError}</TooltipContent>
                            </Tooltip>
                        )}
                        {cred.lastApiError && (
                            <Tooltip>
                                <TooltipTrigger>
                                    <Badge variant="destructive" className="cursor-default text-xs">
                                        <TriangleAlert className="mr-1 size-3" />
                                        API 异常
                                    </Badge>
                                </TooltipTrigger>
                                <TooltipContent className="max-w-sm">
                                    {cred.lastApiErrorAt && (
                                        <p className="mb-1 text-xs text-muted-foreground">{fmt.relative_time(cred.lastApiErrorAt)}</p>
                                    )}
                                    <p className="text-sm wrap-break-word">{cred.lastApiError}</p>
                                </TooltipContent>
                            </Tooltip>
                        )}
                    </div>

                    <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                        <Metric label="优先级">
                            <span className="tabular-nums">{cred.priority}</span>
                        </Metric>
                        <Metric label="成功/失败">
                            <span className="tabular-nums">{cred.successCount}</span>
                            <span className="mx-0.5 text-muted-foreground">/</span>
                            <span className={`tabular-nums ${cred.failureCount > 0 ? 'text-destructive' : ''}`}>{cred.failureCount}</span>
                        </Metric>
                        <Metric label="刷新失败">
                            <span className={`tabular-nums ${cred.refreshFailureCount > 0 ? 'text-amber-500' : ''}`}>{cred.refreshFailureCount}</span>
                        </Metric>
                        <Metric label="最后调用">{fmt.relative_time(cred.lastUsedAt)}</Metric>
                        <Metric label="过期时间">
                            {is_expired ? (
                                <span className="text-destructive">已过期</span>
                            ) : cred.expiresAt ? (
                                fmt.date_short(cred.expiresAt)
                            ) : (
                                <span className="text-muted-foreground">无</span>
                            )}
                        </Metric>
                        <Metric label="API Key">
                            {cred.maskedApiKey ? (
                                <span className="font-mono text-xs">{cred.maskedApiKey}</span>
                            ) : (
                                <span className="text-muted-foreground">—</span>
                            )}
                        </Metric>
                    </div>

                    <div className="mt-auto flex items-center gap-3 border-t pt-2">
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between text-[11px] mb-1">
                                <span className="text-muted-foreground">用量</span>
                                <span className={`tabular-nums font-medium ${fmt.usage_class(fmt.usage_ratio(cred))}`}>{fmt.usage_label(cred)}</span>
                            </div>
                            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                                <div
                                    className={`h-full rounded-full transition-all ${fmt.usage_bar_class(fmt.usage_ratio(cred))}`}
                                    style={{ width: `${fmt.usage_ratio(cred)}%` }}
                                />
                            </div>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <Tooltip>
                                <TooltipTrigger>
                                    <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={on_refresh_token}>
                                        <RefreshCw className="size-3" />
                                        令牌
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent>刷新令牌</TooltipContent>
                            </Tooltip>
                            <Tooltip>
                                <TooltipTrigger>
                                    <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={on_refresh_balance}>
                                        <Coins className="size-3" />
                                        余额
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent>刷新余额</TooltipContent>
                            </Tooltip>
                            <DropdownMenu>
                                <DropdownMenuTrigger>
                                    <Button variant="outline" size="sm" className="h-7 w-7 p-0">
                                        <MoreHorizontal className="size-3" />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                    <DropdownMenuItem onClick={() => on_toggle_disabled(!cred.disabled)} className="whitespace-nowrap">
                                        {cred.disabled ? <Power className="mr-1 size-4" /> : <PowerOff className="mr-1 size-4" />}
                                        {cred.disabled ? '启用账号' : '禁用账号'}
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={on_reset_failure} disabled={!has_errors} className="whitespace-nowrap">
                                        <RotateCcw className="mr-1 size-4" />
                                        重置计数
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem onClick={on_edit_email} className="whitespace-nowrap">
                                        <Pencil className="mr-1 size-4" />
                                        修改邮箱
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={on_edit_proxy} className="whitespace-nowrap">
                                        <Globe className="mr-1 size-4" />
                                        修改代理
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={on_edit_machine_id} className="whitespace-nowrap">
                                        <Cpu className="mr-1 size-4" />
                                        修改机器码
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem onClick={() => on_set_priority(cred.priority + 1)} className="whitespace-nowrap">
                                        <ArrowUp className="mr-1 size-4" />
                                        提高优先级
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => on_set_priority(Math.max(0, cred.priority - 1))} className="whitespace-nowrap">
                                        <ArrowDown className="mr-1 size-4" />
                                        降低优先级
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                        className="whitespace-nowrap text-destructive focus:text-destructive"
                                        onClick={on_delete}
                                        disabled={!cred.disabled}
                                    >
                                        <Trash2 className="mr-1 size-4" />
                                        删除账号
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </TooltipProvider>
    );
}
