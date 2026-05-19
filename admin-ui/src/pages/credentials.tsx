import { api } from '@/api/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
    use_add_credential,
    use_credentials,
    use_delete_credential,
    use_force_refresh_balance,
    use_force_refresh_token,
    use_reset_credential_failure,
    use_set_credential_disabled,
    use_set_credential_email,
    use_set_credential_machine_id,
    use_set_credential_priority,
    use_set_credential_proxy,
} from '@/hooks/use-api';
import type { CredentialStatusItem } from '@/types/api';
import { Coins, FileJson, Plus, RefreshCw, RotateCcw, Search, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { CredentialCard } from './credential-card';
import {
    AddCredentialDialog,
    BatchImportDialog,
    ClearDisabledDialog,
    DeleteConfirmDialog,
    EditEmailDialog,
    EditMachineIdDialog,
    EditProxyDialog,
} from './credential-dialogs';

/**
 * @constant {number} 每页显示数量
 */
const PAGE_SIZE = 12;

export function CredentialsPage() {
    const { data, isLoading, refetch } = use_credentials();
    const toggle_disabled = use_set_credential_disabled();
    const set_priority = use_set_credential_priority();
    const reset_failure = use_reset_credential_failure();
    const refresh_token = use_force_refresh_token();
    const refresh_balance = use_force_refresh_balance();
    const delete_cred = use_delete_credential();
    const add_cred = use_add_credential();
    const set_email = use_set_credential_email();
    const set_proxy = use_set_credential_proxy();
    const set_machine_id = use_set_credential_machine_id();

    const [selected, setSelected] = useState<Set<number>>(new Set());
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const [refreshing_ids, set_refreshing_ids] = useState<Set<number>>(new Set());

    const [add_open, set_add_open] = useState(false);
    const [batch_import_open, set_batch_import_open] = useState(false);
    const [delete_confirm, set_delete_confirm] = useState<number | null>(null);
    const [edit_email, set_edit_email] = useState<{ id: number; email: string | null } | null>(null);
    const [edit_proxy, set_edit_proxy] = useState<{ id: number; proxyUrl: string | null; proxyUsername: string | null; proxyPassword: string | null } | null>(
        null
    );
    const [edit_machine_id, set_edit_machine_id] = useState<{ id: number; machineId: string | null } | null>(null);
    const [clear_disabled_open, set_clear_disabled_open] = useState(false);

    const [sort_version, set_sort_version] = useState(0);

    const all_creds = data?.credentials ?? [];
    const filtered = all_creds.filter((c) => {
        if (!search) return true;
        const q = search.toLowerCase();
        return (
            c.email?.toLowerCase().includes(q) ||
            c.maskedApiKey?.toLowerCase().includes(q) ||
            String(c.id).includes(q) ||
            c.authMethod?.toLowerCase().includes(q) ||
            c.endpoint?.toLowerCase().includes(q)
        );
    });

    const cred_id_key = filtered
        .map((c) => c.id)
        .sort((a, b) => a - b)
        .join(',');
    const sorted_ids = useMemo(
        () =>
            [...filtered]
                .sort((a, b) => {
                    if (a.disabled !== b.disabled) return a.disabled ? 1 : -1;
                    return 0;
                })
                .map((c) => c.id),
        [cred_id_key, sort_version]
    );
    const id_to_cred = new Map(filtered.map((c) => [c.id, c]));
    const sorted = sorted_ids.map((id) => id_to_cred.get(id)).filter((c): c is CredentialStatusItem => c !== undefined);

    const total_pages = Math.ceil(sorted.length / PAGE_SIZE);
    const paged = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

    const toggle_select = (id: number) => {
        setSelected((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const toggle_all = () => {
        if (selected.size === paged.length) {
            setSelected(new Set());
        } else {
            setSelected(new Set(paged.map((c) => c.id)));
        }
    };

    const start_refresh = (id: number) => set_refreshing_ids((prev) => new Set(prev).add(id));
    const end_refresh = (id: number) =>
        set_refreshing_ids((prev) => {
            const next = new Set(prev);
            next.delete(id);
            return next;
        });

    const batch_action = {
        async refresh() {
            const ids = Array.from(selected).filter((id) => {
                const c = all_creds.find((x) => x.id === id);
                return c && c.authMethod !== 'api_key';
            });
            if (ids.length === 0) {
                toast.info('没有可刷新的凭证被选中');
                return;
            }
            let ok = 0;
            for (const id of ids) {
                start_refresh(id);
                try {
                    await refresh_token.mutateAsync(id);
                    ok++;
                } catch (e) {
                    toast.error(`刷新令牌 #${id} 失败: ${api.extract_error_message(e)}`);
                } finally {
                    end_refresh(id);
                }
            }
            toast.success(`已刷新 ${ok}/${ids.length} 个凭证`);
            setSelected(new Set());
        },

        async refresh_balance() {
            const ids = Array.from(selected);
            if (ids.length === 0) {
                toast.info('没有可刷新的凭证被选中');
                return;
            }
            let ok = 0;
            for (const id of ids) {
                start_refresh(id);
                try {
                    const res = await refresh_balance.mutateAsync(id);
                    ok++;
                    if (res.stale) {
                        toast.warning(`凭证 #${id} 返回的是缓存数据，上游获取失败`);
                    }
                } catch (e) {
                    toast.error(`刷新余额 #${id} 失败: ${api.extract_error_message(e)}`);
                } finally {
                    end_refresh(id);
                }
            }
            toast.success(`已刷新余额 ${ok}/${ids.length} 个凭证`);
            setSelected(new Set());
        },

        async reset_failure() {
            const ids = Array.from(selected).filter((id) => {
                const c = all_creds.find((x) => x.id === id);
                return c && (c.failureCount > 0 || c.refreshFailureCount > 0);
            });
            if (ids.length === 0) {
                toast.info('没有异常凭证被选中');
                return;
            }
            let ok = 0;
            for (const id of ids) {
                try {
                    await reset_failure.mutateAsync(id);
                    ok++;
                } catch (e) {
                    toast.error(`重置 #${id} 失败: ${api.extract_error_message(e)}`);
                }
            }
            toast.success(`已重置 ${ok}/${ids.length} 个凭证`);
            setSelected(new Set());
        },

        async delete_selected() {
            const ids = Array.from(selected).filter((id) => {
                const c = all_creds.find((x) => x.id === id);
                return c?.disabled;
            });
            if (ids.length === 0) {
                toast.info('没有已禁用的凭证可删除');
                return;
            }
            let ok = 0;
            for (const id of ids) {
                try {
                    await delete_cred.mutateAsync(id);
                    ok++;
                } catch (e) {
                    toast.error(`删除 #${id} 失败: ${api.extract_error_message(e)}`);
                }
            }
            toast.success(`已删除 ${ok}/${ids.length} 个凭证`);
            setSelected(new Set());
        },

        async clear_disabled() {
            const ids = all_creds.filter((c) => c.disabled).map((c) => c.id);
            if (ids.length === 0) {
                toast.info('没有已禁用的凭证');
                return;
            }
            let ok = 0;
            for (const id of ids) {
                try {
                    await delete_cred.mutateAsync(id);
                    ok++;
                } catch {}
            }
            toast.success(`已清除 ${ok} 个禁用凭证`);
            set_clear_disabled_open(false);
            setSelected(new Set());
        },
    };

    return (
        <div className="min-h-0 flex-1 p-6 flex flex-col gap-4">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-xl font-bold tracking-tight">凭证管理</h1>
                    <p className="text-muted-foreground">{data ? `共 ${data.total} 个，可用 ${data.available} 个` : '加载中...'}</p>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => set_batch_import_open(true)}>
                        <FileJson className="mr-1 size-4" /> 批量导入
                    </Button>
                    <Button size="sm" onClick={() => set_add_open(true)}>
                        <Plus className="mr-1 size-4" /> 添加凭证
                    </Button>
                </div>
            </div>

            <div className="flex items-center gap-3 flex-wrap">
                <div className="relative flex-1 max-w-sm">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                    <Input
                        placeholder="搜索邮箱、ID、认证方式..."
                        value={search}
                        onChange={(e) => {
                            setSearch(e.target.value);
                            setPage(1);
                        }}
                        className="pl-9"
                    />
                </div>
                {selected.size > 0 && (
                    <div className="flex items-center gap-2">
                        <Badge variant="secondary">已选 {selected.size} 项</Badge>
                        <Tooltip>
                            <TooltipTrigger>
                                <Button variant="outline" size="sm" onClick={batch_action.refresh}>
                                    <RefreshCw className="mr-1 size-3" /> 批量刷新令牌
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent>批量刷新令牌</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                            <TooltipTrigger>
                                <Button variant="outline" size="sm" onClick={batch_action.refresh_balance}>
                                    <Coins className="mr-1 size-3" /> 批量刷新余额
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent>批量刷新余额</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                            <TooltipTrigger>
                                <Button variant="outline" size="sm" onClick={batch_action.reset_failure}>
                                    <RotateCcw className="mr-1 size-3" /> 重置
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent>重置异常凭证</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                            <TooltipTrigger>
                                <Button variant="outline" size="sm" onClick={batch_action.delete_selected}>
                                    <Trash2 className="mr-1 size-3" /> 删除
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent>删除选中凭证</TooltipContent>
                        </Tooltip>
                    </div>
                )}
                <div className="flex items-center gap-2 ml-auto">
                    {paged.length > 0 && (
                        <Button variant="outline" size="sm" onClick={toggle_all}>
                            <Checkbox checked={paged.length > 0 && selected.size === paged.length} className="mr-1.5" />
                            全选
                        </Button>
                    )}
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                            refetch();
                            set_sort_version((v) => v + 1);
                        }}
                    >
                        <RefreshCw className="mr-1 size-4" /> 刷新
                    </Button>
                    {data && data.total - data.available > 0 && (
                        <Button variant="outline" size="sm" className="text-destructive hover:text-destructive" onClick={() => set_clear_disabled_open(true)}>
                            <Trash2 className="mr-1 size-4" /> 清除禁用
                        </Button>
                    )}
                </div>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto pr-3">
                {isLoading ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                        {Array.from({ length: 6 }).map((_, i) => (
                            <Card key={i}>
                                <CardContent className="p-5 space-y-3">
                                    <Skeleton className="h-5 w-3/4" />
                                    <Skeleton className="h-4 w-1/2" />
                                    <Skeleton className="h-8 w-full" />
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                        {paged.map((cred) => (
                            <CredentialCard
                                key={cred.id}
                                cred={cred}
                                selected={selected.has(cred.id)}
                                loading={refreshing_ids.has(cred.id)}
                                on_toggle_select={() => toggle_select(cred.id)}
                                on_toggle_disabled={(disabled) =>
                                    toggle_disabled
                                        .mutateAsync({ id: cred.id, disabled })
                                        .then(() => toast.success(disabled ? '已禁用' : '已启用'))
                                        .catch((e) => toast.error(api.extract_error_message(e)))
                                }
                                on_set_priority={(p) =>
                                    set_priority
                                        .mutateAsync({ id: cred.id, priority: p })
                                        .then(() => toast.success('优先级已更新'))
                                        .catch((e) => toast.error(api.extract_error_message(e)))
                                }
                                on_reset_failure={() =>
                                    reset_failure
                                        .mutateAsync(cred.id)
                                        .then(() => toast.success('失败计数已重置'))
                                        .catch((e) => toast.error(api.extract_error_message(e)))
                                }
                                on_refresh_token={() => {
                                    start_refresh(cred.id);
                                    refresh_token
                                        .mutateAsync(cred.id)
                                        .then(() => toast.success('令牌已刷新'))
                                        .catch((e) => toast.error(api.extract_error_message(e)))
                                        .finally(() => end_refresh(cred.id));
                                }}
                                on_refresh_balance={() => {
                                    start_refresh(cred.id);
                                    refresh_balance
                                        .mutateAsync(cred.id)
                                        .then((res) => {
                                            if (res.stale) {
                                                toast.warning('返回的是缓存数据，上游获取失败');
                                            } else {
                                                toast.success('余额已刷新');
                                            }
                                        })
                                        .catch((e) => toast.error(api.extract_error_message(e)))
                                        .finally(() => end_refresh(cred.id));
                                }}
                                on_delete={() => set_delete_confirm(cred.id)}
                                on_edit_email={() => set_edit_email({ id: cred.id, email: cred.email })}
                                on_edit_proxy={() =>
                                    set_edit_proxy({
                                        id: cred.id,
                                        proxyUrl: cred.proxyUrl,
                                        proxyUsername: cred.proxyUsername,
                                        proxyPassword: cred.proxyPassword,
                                    })
                                }
                                on_edit_machine_id={() => set_edit_machine_id({ id: cred.id, machineId: cred.machineId })}
                            />
                        ))}
                        {paged.length === 0 && (
                            <div className="col-span-full text-center py-12 text-muted-foreground">{search ? '没有匹配的凭证' : '尚未配置凭证'}</div>
                        )}
                    </div>
                )}
            </div>

            {total_pages > 1 && (
                <div className="flex items-center justify-between">
                    <p className="text-muted-foreground text-sm">
                        显示 {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, sorted.length)} / 共 {sorted.length} 条
                    </p>
                    <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                            上一页
                        </Button>
                        <span className="text-sm">
                            {page} / {total_pages}
                        </span>
                        <Button variant="outline" size="sm" disabled={page >= total_pages} onClick={() => setPage(page + 1)}>
                            下一页
                        </Button>
                    </div>
                </div>
            )}

            <AddCredentialDialog
                open={add_open}
                onOpenChange={set_add_open}
                onSubmit={async (req) => {
                    try {
                        const res = await add_cred.mutateAsync(req);
                        toast.success(res.message || `已添加凭证 #${res.credentialId}`);
                        set_add_open(false);
                    } catch (e) {
                        toast.error(api.extract_error_message(e));
                    }
                }}
            />

            <BatchImportDialog
                open={batch_import_open}
                onOpenChange={set_batch_import_open}
                onImport={async (req) => {
                    try {
                        const res = await add_cred.mutateAsync(req);
                        toast.success(`已添加 #${res.credentialId}${res.email ? ` (${res.email})` : ''}`);
                        return true;
                    } catch {
                        return false;
                    }
                }}
            />

            <ClearDisabledDialog
                count={all_creds.filter((c) => c.disabled).length}
                open={clear_disabled_open}
                onOpenChange={set_clear_disabled_open}
                onConfirm={batch_action.clear_disabled}
            />

            <DeleteConfirmDialog
                credentialId={delete_confirm}
                onOpenChange={(open) => {
                    if (!open) set_delete_confirm(null);
                }}
                onConfirm={async () => {
                    if (delete_confirm == null) return;
                    try {
                        await delete_cred.mutateAsync(delete_confirm);
                        toast.success('凭证已删除');
                        set_delete_confirm(null);
                    } catch (e) {
                        toast.error(api.extract_error_message(e));
                    }
                }}
            />

            <EditEmailDialog
                key={edit_email?.id}
                credentialId={edit_email?.id ?? null}
                currentEmail={edit_email?.email ?? null}
                onOpenChange={(open) => {
                    if (!open) set_edit_email(null);
                }}
                onConfirm={async (email) => {
                    if (edit_email == null) return;
                    await set_email.mutateAsync({ id: edit_email.id, email });
                    toast.success(`凭证 #${edit_email.id} 邮箱已修改`);
                    set_edit_email(null);
                }}
            />

            <EditProxyDialog
                key={edit_proxy?.id}
                credentialId={edit_proxy?.id ?? null}
                currentProxy={edit_proxy ?? null}
                onOpenChange={(open) => {
                    if (!open) set_edit_proxy(null);
                }}
                onConfirm={async (req) => {
                    if (edit_proxy == null) return;
                    await set_proxy.mutateAsync({
                        id: edit_proxy.id,
                        proxyUrl: req.proxyUrl,
                        proxyUsername: req.proxyUsername,
                        proxyPassword: req.proxyPassword,
                    });
                    toast.success(`凭证 #${edit_proxy.id} 代理已修改`);
                    set_edit_proxy(null);
                }}
            />

            <EditMachineIdDialog
                key={edit_machine_id?.id}
                credentialId={edit_machine_id?.id ?? null}
                currentMachineId={edit_machine_id?.machineId ?? null}
                onOpenChange={(open) => {
                    if (!open) set_edit_machine_id(null);
                }}
                onConfirm={async (machineId) => {
                    if (edit_machine_id == null) return;
                    await set_machine_id.mutateAsync({
                        id: edit_machine_id.id,
                        machineId,
                    });
                    toast.success(`凭证 #${edit_machine_id.id} Machine ID 已修改`);
                    set_edit_machine_id(null);
                }}
            />
        </div>
    );
}
