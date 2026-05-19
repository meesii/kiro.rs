import { api } from '@/api/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
    use_add_keyword_replacement,
    use_admin_config,
    use_delete_keyword_replacement,
    use_keyword_replacements,
    use_update_admin_config,
    use_update_keyword_replacement,
} from '@/hooks/use-api';
import { cn } from '@/lib/utils';
import type { KeywordReplacementItem } from '@/types/api';
import { Database, Pencil, Plus, Scale, Trash2, Zap } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

/**
 * 格式化工具
 */
const fmt = {
    mode_label: {
        priority: '优先级',
        balanced: '均衡',
    } as Record<string, string>,
};

export function SettingsPage() {
    const { data, isLoading } = use_admin_config();
    const update_config = use_update_admin_config();

    const current_mode = data?.loadBalancingMode ?? 'priority';
    const is_balanced = current_mode === 'balanced';

    const handle_toggle_mode = async (balanced: boolean) => {
        const mode = balanced ? 'balanced' : 'priority';
        try {
            await update_config.mutateAsync({ loadBalancingMode: mode });
            toast.success(`已切换为${fmt.mode_label[mode]}模式`);
        } catch (e) {
            toast.error(api.extract_error_message(e));
        }
    };

    return (
        <div className="min-h-0 flex-1 overflow-y-auto p-6 space-y-6">
            <div>
                <h1 className="text-xl font-bold tracking-tight">系统设置</h1>
                <p className="text-muted-foreground">配置您的 Kiro 实例</p>
            </div>

            <Card className="max-w-lg">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        负载均衡
                        {isLoading ? (
                            <Skeleton className="h-5 w-16" />
                        ) : (
                            <Badge variant={is_balanced ? 'default' : 'secondary'}>{fmt.mode_label[current_mode] ?? current_mode}</Badge>
                        )}
                    </CardTitle>
                    <CardDescription>控制如何为传入请求选择凭证</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-1 gap-3">
                        <button
                            type="button"
                            disabled={isLoading || update_config.isPending}
                            onClick={() => handle_toggle_mode(true)}
                            className={cn(
                                'flex items-center gap-3 rounded-lg border p-4 text-left transition-all',
                                'hover:border-primary/50 disabled:cursor-not-allowed disabled:opacity-50',
                                is_balanced ? 'ring-1 ring-primary bg-primary/5' : 'border-border'
                            )}
                        >
                            <Scale className={cn('size-5 shrink-0', is_balanced ? 'text-primary' : 'text-muted-foreground')} />
                            <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium">均衡模式</p>
                                <p className="text-muted-foreground text-xs">在所有可用凭证之间均匀分配请求</p>
                            </div>
                            <span
                                className={cn(
                                    'ml-auto flex size-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
                                    is_balanced ? 'border-transparent bg-primary' : 'border-muted-foreground/30'
                                )}
                            >
                                {is_balanced && <span className="size-2 rounded-full bg-primary-foreground" />}
                            </span>
                        </button>

                        <button
                            type="button"
                            disabled={isLoading || update_config.isPending}
                            onClick={() => handle_toggle_mode(false)}
                            className={cn(
                                'flex items-center gap-3 rounded-lg border p-4 text-left transition-all',
                                'hover:border-primary/50 disabled:cursor-not-allowed disabled:opacity-50',
                                !is_balanced ? 'ring-1 ring-primary bg-primary/5' : 'border border-border'
                            )}
                        >
                            <Zap className={cn('size-5 shrink-0', !is_balanced ? 'text-primary' : 'text-muted-foreground')} />
                            <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium">优先级模式</p>
                                <p className="text-muted-foreground text-xs">按优先级顺序使用凭证，优先级高的优先使用</p>
                            </div>
                            <span
                                className={cn(
                                    'ml-auto flex size-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
                                    !is_balanced ? 'border-transparent bg-primary' : 'border-muted-foreground/30'
                                )}
                            >
                                {!is_balanced && <span className="size-2 rounded-full bg-primary-foreground" />}
                            </span>
                        </button>
                    </div>
                </CardContent>
            </Card>

            <DatabasePathCard />

            <KeywordReplacementsCard />
        </div>
    );
}

/**
 * 生成唯一 ID
 */
function gen_id(): string {
    return crypto.randomUUID();
}

/**
 * 关键词替换表单数据
 */
interface KeywordFormData {
    pattern: string;
    replacement: string;
    is_regex: boolean;
}

const empty_form: KeywordFormData = {
    pattern: '',
    replacement: '',
    is_regex: false,
};

/**
 * 关键词替换卡片
 */
function KeywordReplacementsCard() {
    const { data, isLoading } = use_keyword_replacements();
    const { data: config_data, isLoading: config_loading } = use_admin_config();
    const add_kw = use_add_keyword_replacement();
    const update_kw = use_update_keyword_replacement();
    const delete_kw = use_delete_keyword_replacement();
    const update_config = use_update_admin_config();

    const [dialog_open, set_dialog_open] = useState(false);
    const [editing_id, set_editing_id] = useState<string | null>(null);
    const [form, set_form] = useState<KeywordFormData>({ ...empty_form });
    const [delete_target, set_delete_target] = useState<KeywordReplacementItem | null>(null);

    const replacements = data?.replacements ?? [];
    const enabled = config_data?.keywordReplacementEnabled ?? false;

    const handle_toggle_enabled = async (checked: boolean) => {
        try {
            await update_config.mutateAsync({ keywordReplacementEnabled: checked });
        } catch (e) {
            toast.error(api.extract_error_message(e));
        }
    };

    const open_add = () => {
        set_editing_id(null);
        set_form({ ...empty_form });
        set_dialog_open(true);
    };

    const open_edit = (item: KeywordReplacementItem) => {
        set_editing_id(item.id);
        set_form({ pattern: item.pattern, replacement: item.replacement, is_regex: item.isRegex });
        set_dialog_open(true);
    };

    const handle_save = async () => {
        if (!form.pattern.trim()) {
            toast.error('匹配模式不能为空');
            return;
        }
        try {
            if (editing_id) {
                await update_kw.mutateAsync({ id: editing_id, ...form });
                toast.success('关键词已更新');
            } else {
                await add_kw.mutateAsync({ id: gen_id(), ...form });
                toast.success('关键词已添加');
            }
            set_dialog_open(false);
        } catch (e) {
            toast.error(api.extract_error_message(e));
        }
    };

    const handle_delete = async () => {
        if (!delete_target) return;
        try {
            await delete_kw.mutateAsync(delete_target.id);
            toast.success('关键词已删除');
            set_delete_target(null);
        } catch (e) {
            toast.error(api.extract_error_message(e));
        }
    };

    const is_pending = add_kw.isPending || update_kw.isPending || delete_kw.isPending;

    return (
        <>
            <Card className="max-w-lg">
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle className="flex items-center gap-2">
                                关键词替换
                                {isLoading ? <Skeleton className="h-5 w-12" /> : <Badge variant="secondary">{replacements.length} 条</Badge>}
                            </CardTitle>
                            <CardDescription>用指定的关键词或正则匹配文本替换发给上游的内容</CardDescription>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                            {config_loading ? (
                                <Skeleton className="h-5 w-9" />
                            ) : (
                                <Switch checked={enabled} onCheckedChange={handle_toggle_enabled} disabled={update_config.isPending} />
                            )}
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                        <div className="space-y-2">
                            <Skeleton className="h-8 w-full" />
                            <Skeleton className="h-8 w-full" />
                        </div>
                    ) : replacements.length === 0 ? (
                        <p className="text-muted-foreground text-sm py-4 text-center">暂无关键词替换规则</p>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="w-[40%]">模式</TableHead>
                                    <TableHead className="w-[30%]">替换为</TableHead>
                                    <TableHead className="w-[15%]">正则</TableHead>
                                    <TableHead className="w-[15%] text-right">操作</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {replacements.map((item) => (
                                    <TableRow key={item.id}>
                                        <TableCell className="font-mono text-xs truncate max-w-[180px]">{item.pattern}</TableCell>
                                        <TableCell className="text-xs truncate max-w-[120px]">{item.replacement}</TableCell>
                                        <TableCell>
                                            {item.isRegex ? (
                                                <Badge variant="default" className="text-[10px]">
                                                    是
                                                </Badge>
                                            ) : (
                                                <span className="text-muted-foreground text-xs">否</span>
                                            )}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <div className="flex items-center justify-end gap-1">
                                                <Button variant="ghost" size="icon-sm" disabled={is_pending} onClick={() => open_edit(item)}>
                                                    <Pencil className="size-3.5" />
                                                </Button>
                                                <Button variant="ghost" size="icon-sm" disabled={is_pending} onClick={() => set_delete_target(item)}>
                                                    <Trash2 className="size-3.5 text-destructive" />
                                                </Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                    <div className="mt-4">
                        <Button variant="outline" size="sm" className="w-full" disabled={is_pending || isLoading} onClick={open_add}>
                            <Plus className="size-3.5 mr-1" />
                            新增关键词
                        </Button>
                    </div>
                </CardContent>
            </Card>

            <Dialog open={dialog_open} onOpenChange={set_dialog_open}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{editing_id ? '编辑关键词' : '新增关键词'}</DialogTitle>
                        <DialogDescription>{editing_id ? '修改关键词替换规则' : '添加新的关键词替换规则'}</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                        <div className="space-y-2">
                            <Label htmlFor="kw-pattern">匹配模式</Label>
                            <Input
                                id="kw-pattern"
                                placeholder="输入要匹配的文本或正则"
                                value={form.pattern}
                                onChange={(e) => set_form({ ...form, pattern: e.target.value })}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="kw-replacement">替换为</Label>
                            <Input
                                id="kw-replacement"
                                placeholder="输入替换后的文本"
                                value={form.replacement}
                                onChange={(e) => set_form({ ...form, replacement: e.target.value })}
                            />
                        </div>
                        <div className="flex items-center justify-between">
                            <Label htmlFor="kw-is-regex" className="cursor-pointer">
                                使用正则表达式
                            </Label>
                            <Switch id="kw-is-regex" checked={form.is_regex} onCheckedChange={(checked) => set_form({ ...form, is_regex: checked })} />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => set_dialog_open(false)} disabled={is_pending}>
                            取消
                        </Button>
                        <Button onClick={handle_save} disabled={is_pending || !form.pattern.trim()}>
                            {is_pending ? '保存中...' : '保存'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog
                open={delete_target !== null}
                onOpenChange={(open) => {
                    if (!open) set_delete_target(null);
                }}
            >
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>确认删除</DialogTitle>
                        <DialogDescription>确定要删除关键词「{delete_target?.pattern}」吗？此操作不可撤销。</DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => set_delete_target(null)} disabled={is_pending}>
                            取消
                        </Button>
                        <Button variant="destructive" onClick={handle_delete} disabled={is_pending}>
                            {is_pending ? '删除中...' : '删除'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}

/**
 * 数据库路径编辑卡片
 */
function DatabasePathCard() {
    const { data, isLoading } = use_admin_config();
    const update_config = use_update_admin_config();

    const [editing, set_editing] = useState(false);
    const [value, set_value] = useState('');

    const db_path = data?.dbPath ?? null;

    const start_edit = () => {
        set_value(db_path ?? '');
        set_editing(true);
    };

    const cancel_edit = () => {
        set_editing(false);
        set_value('');
    };

    const handle_save = async () => {
        try {
            const path = value.trim();
            await update_config.mutateAsync({ dbPath: path || undefined });
            toast.success('数据库路径已更新，重启后生效');
            set_editing(false);
        } catch (e) {
            toast.error(api.extract_error_message(e));
        }
    };

    return (
        <Card className="max-w-lg">
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <Database className="size-4" />
                    对话记录数据库
                </CardTitle>
                <CardDescription>SQLite 数据库文件的存储路径</CardDescription>
            </CardHeader>
            <CardContent>
                {isLoading ? (
                    <Skeleton className="h-9 w-full" />
                ) : editing ? (
                    <div className="space-y-3">
                        <Input placeholder="./conversations.db" value={value} onChange={(e) => set_value(e.target.value)} />
                        <div className="flex items-center gap-2">
                            <Button size="sm" onClick={handle_save} disabled={update_config.isPending}>
                                {update_config.isPending ? '保存中...' : '保存'}
                            </Button>
                            <Button variant="outline" size="sm" onClick={cancel_edit} disabled={update_config.isPending}>
                                取消
                            </Button>
                        </div>
                    </div>
                ) : (
                    <div className="flex items-center justify-between">
                        <span className="text-sm font-mono text-muted-foreground truncate">{db_path || '（未设置，使用默认值 conversations.db）'}</span>
                        <Button variant="outline" size="sm" onClick={start_edit}>
                            <Pencil className="size-3.5 mr-1" />
                            编辑
                        </Button>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
