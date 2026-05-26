import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
    Pagination,
    PaginationContent,
    PaginationEllipsis,
    PaginationItem,
    PaginationLink,
    PaginationNext,
    PaginationPrevious,
} from '@/components/ui/pagination';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { use_clear_conversations, use_conversation_detail, use_conversation_models, use_conversations, use_delete_conversations } from '@/hooks/use-api';
import { cn } from '@/lib/utils';
import type { ConversationQuery } from '@/types/api';
import dayjs from 'dayjs';
import { ArrowUpDown, Clock, Loader2, MessageSquare, RefreshCw, Search, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

const SORT_OPTIONS = [
    { value: 'created_at', label: '时间' },
    { value: 'duration_ms', label: '耗时' },
    { value: 'input_tokens', label: '输入 Token' },
    { value: 'output_tokens', label: '输出 Token' },
    { value: 'model', label: '模型' },
];

interface ParsedMessage {
    role: string;
    content: string;
}

/**
 * 格式化工具
 */
const fmt = {
    duration(ms: number | undefined | null): string {
        if (ms == null || Number.isNaN(ms)) return '—';
        if (ms < 1000) return `${ms}ms`;
        if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
        const min = Math.floor(ms / 60_000);
        const sec = Math.floor((ms % 60_000) / 1000);
        return `${min}m ${sec}s`;
    },
    tokens(n: number | undefined | null): string {
        if (n == null || Number.isNaN(n)) return '—';
        if (n < 1000) return String(n);
        if (n < 1_000_000) return `${(n / 1000).toFixed(1)}K`;
        return `${(n / 1_000_000).toFixed(1)}M`;
    },
    time(iso: string): string {
        return dayjs(iso).format('YYYY-MM-DD HH:mm:ss') || iso;
    },
};

/**
 * 消息解析
 */
const msg = {
    extract_content(content: unknown): string {
        if (typeof content === 'string') return content;
        if (Array.isArray(content)) {
            return content
                .map((block) => {
                    if (typeof block === 'string') return block;
                    if (block && typeof block === 'object') {
                        return JSON.stringify(block, null, 2);
                    }
                    return String(block);
                })
                .join('\n\n');
        }
        if (content != null) return JSON.stringify(content, null, 2);
        return '';
    },
    format_json_text(raw: string | null | undefined): string {
        if (!raw) return '';
        try {
            return JSON.stringify(JSON.parse(raw), null, 2);
        } catch {
            return raw;
        }
    },
    parse(raw: string | undefined): ParsedMessage[] {
        if (!raw) return [];
        try {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
                return parsed.map((m) => ({
                    role: m.role || 'unknown',
                    content: msg.extract_content(m.content),
                }));
            }
            if (parsed.content) {
                return [{ role: parsed.role || 'user', content: msg.extract_content(parsed.content) }];
            }
            return [{ role: 'unknown', content: raw }];
        } catch {
            return [{ role: 'unknown', content: raw }];
        }
    },
};

/**
 * 分页工具
 */
const pager = {
    generate_numbers(current: number, total: number): (number | '...')[] {
        if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
        const pages: (number | '...')[] = [1];
        const left = Math.max(2, current - 1);
        const right = Math.min(total - 1, current + 1);
        if (left > 2) pages.push('...');
        for (let i = left; i <= right; i++) pages.push(i);
        if (right < total - 1) pages.push('...');
        pages.push(total);
        return pages;
    },
};

export function ConversationsPage() {
    const [page, set_page] = useState(1);
    const [page_size] = useState(20);
    const [model, set_model] = useState<string>('');
    const [stream, set_stream] = useState<string>('');
    const [sort_by, set_sort_by] = useState('created_at');
    const [sort_order, set_sort_order] = useState('desc');
    const [search_id, set_search_id] = useState('');

    const [detail_id, set_detail_id] = useState<string | null>(null);
    const [selected_ids, set_selected_ids] = useState<Set<string>>(new Set());
    const [confirm_delete, set_confirm_delete] = useState(false);
    const [confirm_clear, set_confirm_clear] = useState(false);

    const { data: models_data } = use_conversation_models();
    const delete_mutation = use_delete_conversations();
    const clear_mutation = use_clear_conversations();

    const query: ConversationQuery = {
        page,
        pageSize: page_size,
        model: model || undefined,
        stream: stream === '' ? undefined : stream === 'true',
        sortBy: sort_by,
        sortOrder: sort_order,
    };

    const { data, isLoading, isFetching, refetch } = use_conversations(query);

    const total_pages = Math.max(data?.totalPages ?? 1, 1);
    const total = data?.total ?? 0;
    const range_start = total === 0 ? 0 : (page - 1) * page_size + 1;
    const range_end = total === 0 ? 0 : Math.min(page * page_size, total);
    const items = data?.items?.filter((item) => !search_id || item.id.includes(search_id)) ?? [];

    const all_selected = items.length > 0 && items.every((item) => selected_ids.has(item.id));
    const some_selected = selected_ids.size > 0;

    function toggle_select(id: string) {
        set_selected_ids((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }

    function toggle_select_all() {
        if (all_selected) {
            set_selected_ids((prev) => {
                const next = new Set(prev);
                for (const item of items) next.delete(item.id);
                return next;
            });
        } else {
            set_selected_ids((prev) => {
                const next = new Set(prev);
                for (const item of items) next.add(item.id);
                return next;
            });
        }
    }

    function handle_delete_selected() {
        const ids = Array.from(selected_ids);
        delete_mutation.mutate(ids, {
            onSuccess: (res) => {
                toast.success(res.message);
                set_selected_ids(new Set());
                set_confirm_delete(false);
            },
            onError: (err) => {
                toast.error(`删除失败: ${err instanceof Error ? err.message : '未知错误'}`);
                set_confirm_delete(false);
            },
        });
    }

    function handle_clear_all() {
        clear_mutation.mutate(undefined, {
            onSuccess: (res) => {
                toast.success(res.message);
                set_selected_ids(new Set());
                set_confirm_clear(false);
                set_page(1);
            },
            onError: (err) => {
                toast.error(`清空失败: ${err instanceof Error ? err.message : '未知错误'}`);
                set_confirm_clear(false);
            },
        });
    }

    return (
        <div className="flex min-h-0 flex-1 flex-col gap-4 p-6">
            <div className="shrink-0">
                <h1 className="text-xl font-bold tracking-tight">对话记录</h1>
                <p className="text-muted-foreground">{data ? `${(data.total ?? 0).toLocaleString()} 条对话记录` : '加载中...'}</p>
            </div>

            <div className="flex shrink-0 flex-wrap items-center gap-3">
                <div className="relative flex-1 min-w-[200px] max-w-xs">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                    <Input placeholder="搜索 ID..." value={search_id} onChange={(e) => set_search_id(e.target.value)} className="pl-9" />
                </div>

                <Select
                    value={model}
                    onValueChange={(v: string | null) => {
                        set_model(v === 'all' ? '' : (v ?? ''));
                        set_page(1);
                    }}
                >
                    <SelectTrigger className="w-[160px]">
                        <SelectValue placeholder="全部模型" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">全部模型</SelectItem>
                        {(models_data?.models ?? []).map((m) => (
                            <SelectItem key={m} value={m}>
                                {m}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>

                <Select
                    value={stream}
                    onValueChange={(v: string | null) => {
                        set_stream(v === 'all' ? '' : (v ?? ''));
                        set_page(1);
                    }}
                >
                    <SelectTrigger className="w-[120px]">
                        <SelectValue placeholder="流式" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">全部</SelectItem>
                        <SelectItem value="true">流式</SelectItem>
                        <SelectItem value="false">非流式</SelectItem>
                    </SelectContent>
                </Select>

                <div className="flex items-center gap-1">
                    <Select value={sort_by} onValueChange={(v: string | null) => set_sort_by(v ?? 'created_at')}>
                        <SelectTrigger className="w-[140px]">
                            <SelectValue>{SORT_OPTIONS.find((o) => o.value === sort_by)?.label}</SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                            {SORT_OPTIONS.map((o) => (
                                <SelectItem key={o.value} value={o.value}>
                                    {o.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <Button variant="outline" size="icon" onClick={() => set_sort_order((o) => (o === 'desc' ? 'asc' : 'desc'))}>
                        <ArrowUpDown className={`size-4 ${sort_order === 'asc' ? 'rotate-180' : ''} transition-transform`} />
                    </Button>
                </div>

                <Button variant="outline" size="default" onClick={() => refetch()}>
                    <RefreshCw className={`mr-1.5 size-4 ${isFetching ? 'animate-spin' : ''}`} />
                    刷新
                </Button>

                {some_selected && (
                    <Button variant="destructive" size="default" onClick={() => set_confirm_delete(true)}>
                        <Trash2 className="mr-1.5 size-4" />
                        删除选中 ({selected_ids.size})
                    </Button>
                )}

                <Button variant="outline" size="default" className="text-destructive hover:text-destructive" onClick={() => set_confirm_clear(true)} disabled={total === 0}>
                    <Trash2 className="mr-1.5 size-4" />
                    清空全部
                </Button>

                {(model || stream) && (
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                            set_model('');
                            set_stream('');
                            set_page(1);
                        }}
                    >
                        <X className="mr-1 size-3" /> 清除筛选
                    </Button>
                )}
            </div>

            <Card className="flex min-h-0 flex-1 flex-col py-0">
                <div className="relative min-h-0 flex-1 overflow-auto">
                    {isFetching && !isLoading && (
                        <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/50">
                            <Loader2 className="size-6 animate-spin text-muted-foreground" />
                        </div>
                    )}
                    {isLoading ? (
                        <CardContent className="flex min-h-full flex-col justify-center gap-3 p-6">
                            {Array.from({ length: 12 }).map((_, i) => (
                                <Skeleton key={i} className="h-10 w-full" />
                            ))}
                        </CardContent>
                    ) : (
                        <Table>
                            <TableHeader className="sticky top-0 z-10 bg-card [&_tr]:border-b">
                                <TableRow>
                                    <TableHead className="w-10">
                                        <Checkbox checked={all_selected} onCheckedChange={toggle_select_all} />
                                    </TableHead>
                                    <TableHead className="w-[150px]">时间</TableHead>
                                    <TableHead className="max-w-[200px]">用户输入</TableHead>
                                    <TableHead>模型</TableHead>
                                    <TableHead className="w-24">输入</TableHead>
                                    <TableHead className="w-24">输出</TableHead>
                                    <TableHead className="w-24">耗时</TableHead>
                                    <TableHead className="w-24">停止原因</TableHead>
                                    <TableHead className="w-16">流式</TableHead>
                                    <TableHead className="w-16"></TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {items.map((conv) => (
                                    <TableRow key={conv.id} className="cursor-pointer hover:bg-muted/50" onClick={() => set_detail_id(conv.id)}>
                                        <TableCell onClick={(e) => e.stopPropagation()}>
                                            <Checkbox checked={selected_ids.has(conv.id)} onCheckedChange={() => toggle_select(conv.id)} />
                                        </TableCell>
                                        <TableCell className="text-muted-foreground text-xs whitespace-nowrap">{fmt.time(conv.createdAt)}</TableCell>
                                        <TableCell className="max-w-[200px] truncate text-xs">{conv.requestMessagesPreview}</TableCell>
                                        <TableCell>
                                            <Badge variant="outline" className=" text-xs">
                                                {conv.model.length > 24 ? conv.model.slice(0, 24) + '…' : conv.model}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className=" text-sm">{fmt.tokens(conv.inputTokens)}</TableCell>
                                        <TableCell className=" text-sm">{fmt.tokens(conv.outputTokens)}</TableCell>
                                        <TableCell className="flex items-center gap-1 text-sm">
                                            <Clock className="size-3 text-muted-foreground" />
                                            {fmt.duration(conv.durationMs)}
                                        </TableCell>
                                        <TableCell>
                                            <StopReasonBadge reason={conv.stopReason} />
                                        </TableCell>
                                        <TableCell>
                                            {conv.stream ? (
                                                <Badge variant="secondary" className="text-xs">
                                                    流式
                                                </Badge>
                                            ) : (
                                                <span className="text-muted-foreground text-xs">—</span>
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="size-7"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    set_detail_id(conv.id);
                                                }}
                                            >
                                                <MessageSquare className="size-3.5" />
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))}
                                {items.length === 0 && (
                                    <TableRow>
                                        <TableCell colSpan={10} className="h-32 text-center text-muted-foreground">
                                            暂无对话记录
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    )}
                </div>
                <CardFooter className="shrink-0 justify-between gap-4 py-3">
                    <p className="text-muted-foreground text-sm">
                        {isLoading ? '加载中...' : total === 0 ? '共 0 条' : `显示 ${range_start}–${range_end} / 共 ${total.toLocaleString()} 条`}
                    </p>
                    <Pagination className="mx-0 w-auto">
                        <PaginationContent>
                            <PaginationItem>
                                <PaginationPrevious
                                    text="上一页"
                                    onClick={() => set_page(page - 1)}
                                    className={page <= 1 || isLoading ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                                    aria-disabled={page <= 1 || isLoading}
                                />
                            </PaginationItem>
                            {pager.generate_numbers(page, total_pages).map((p, i) =>
                                p === '...' ? (
                                    <PaginationItem key={`e${i}`}>
                                        <PaginationEllipsis />
                                    </PaginationItem>
                                ) : (
                                    <PaginationItem key={p}>
                                        <PaginationLink isActive={p === page} onClick={() => set_page(p as number)} className="cursor-pointer">
                                            {p}
                                        </PaginationLink>
                                    </PaginationItem>
                                )
                            )}
                            <PaginationItem>
                                <PaginationNext
                                    text="下一页"
                                    onClick={() => set_page(page + 1)}
                                    className={page >= total_pages || isLoading ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                                    aria-disabled={page >= total_pages || isLoading}
                                />
                            </PaginationItem>
                        </PaginationContent>
                    </Pagination>
                </CardFooter>
            </Card>

            <ConversationDetailDialog
                detail_id={detail_id}
                on_open_change={(open) => {
                    if (!open) set_detail_id(null);
                }}
            />

            <Dialog open={confirm_delete} onOpenChange={set_confirm_delete}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>确认删除</DialogTitle>
                        <DialogDescription>
                            确定要删除选中的 {selected_ids.size} 条对话记录吗？此操作不可撤销。
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => set_confirm_delete(false)} disabled={delete_mutation.isPending}>
                            取消
                        </Button>
                        <Button variant="destructive" onClick={handle_delete_selected} disabled={delete_mutation.isPending}>
                            {delete_mutation.isPending && <Loader2 className="mr-1.5 size-4 animate-spin" />}
                            确认删除
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={confirm_clear} onOpenChange={set_confirm_clear}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>确认清空</DialogTitle>
                        <DialogDescription>
                            确定要清空全部 {total.toLocaleString()} 条对话记录吗？此操作不可撤销，数据库文件将被压缩。
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => set_confirm_clear(false)} disabled={clear_mutation.isPending}>
                            取消
                        </Button>
                        <Button variant="destructive" onClick={handle_clear_all} disabled={clear_mutation.isPending}>
                            {clear_mutation.isPending && <Loader2 className="mr-1.5 size-4 animate-spin" />}
                            确认清空
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

function StopReasonBadge({ reason }: { reason: string }) {
    const variant = reason === 'end_turn' ? 'default' : reason === 'max_tokens' ? 'secondary' : 'outline';
    return (
        <Badge variant={variant} className="text-xs">
            {reason === 'end_turn' ? '正常结束' : reason === 'max_tokens' ? '达到上限' : reason}
        </Badge>
    );
}

/**
 * 详情只读文本区：完整内容，由外层 flex + max-h-0 限制高度并内部滚动
 */
function DetailTextarea({ value, box_class }: { value: string; box_class?: string }) {
    return (
        <div className={cn('flex min-h-0 flex-col', box_class)}>
            <Textarea
                readOnly
                value={value}
                className="max-h-0 min-h-40 flex-1 resize-none overflow-auto field-sizing-fixed text-[12px] md:text-[12px] bg-muted/30 focus-visible:ring-0 focus-visible:border-input"
            />
        </div>
    );
}

function ConversationDetailDialog({ detail_id, on_open_change }: { detail_id: string | null; on_open_change: (open: boolean) => void }) {
    const { data: conversation, isLoading } = use_conversation_detail(detail_id);

    if (!detail_id) return null;

    const messages = conversation ? msg.parse(conversation.requestMessages) : [];
    const system_text = conversation ? msg.format_json_text(conversation.systemPrompt) : '';
    const tools_text = conversation ? msg.format_json_text(conversation.requestTools) : '';
    const response_text = conversation ? msg.format_json_text(conversation.responseContent) || conversation.responseContent || '（空）' : '（空）';

    return (
        <Dialog open={!!detail_id} onOpenChange={on_open_change}>
            <DialogContent className="flex max-h-[90vh] flex-col overflow-hidden sm:max-w-3xl">
                <DialogHeader className="shrink-0">
                    <DialogTitle className="flex items-center gap-2">
                        <MessageSquare className="size-4" />
                        对话详情
                    </DialogTitle>
                </DialogHeader>

                {isLoading ? (
                    <div className="flex min-h-40 items-center justify-center">
                        <Loader2 className="size-6 animate-spin text-muted-foreground" />
                    </div>
                ) : !conversation ? (
                    <div className="flex min-h-40 items-center justify-center text-muted-foreground">未找到对话记录</div>
                ) : (
                    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden">
                        <div className="grid shrink-0 grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                            <div>
                                <span className="text-muted-foreground">模型</span>
                                <p className=" text-xs mt-0.5">{conversation.model}</p>
                            </div>
                            <div>
                                <span className="text-muted-foreground">端点</span>
                                <p className=" text-xs mt-0.5">{conversation.endpoint}</p>
                            </div>
                            <div>
                                <span className="text-muted-foreground">耗时</span>
                                <p className=" text-xs mt-0.5">{fmt.duration(conversation.durationMs)}</p>
                            </div>
                            <div>
                                <span className="text-muted-foreground">停止原因</span>
                                <p className="mt-0.5">
                                    <StopReasonBadge reason={conversation.stopReason} />
                                </p>
                            </div>
                            <div>
                                <span className="text-muted-foreground">输入 Token</span>
                                <p className=" text-xs mt-0.5">{fmt.tokens(conversation.inputTokens)}</p>
                            </div>
                            <div>
                                <span className="text-muted-foreground">输出 Token</span>
                                <p className=" text-xs mt-0.5">{fmt.tokens(conversation.outputTokens)}</p>
                            </div>
                            <div>
                                <span className="text-muted-foreground">流式</span>
                                <p className="text-xs mt-0.5">{conversation.stream ? '是' : '否'}</p>
                            </div>
                            <div>
                                <span className="text-muted-foreground">时间</span>
                                <p className=" text-xs mt-0.5">{fmt.time(conversation.createdAt)}</p>
                            </div>
                        </div>

                        {system_text && (
                            <>
                                <Separator className="shrink-0" />
                                <div className="flex shrink-0 flex-col gap-2">
                                    <h4 className="text-sm font-medium">系统提示词</h4>
                                    <DetailTextarea value={system_text} box_class="max-h-40" />
                                </div>
                            </>
                        )}

                        {tools_text && (
                            <>
                                <Separator className="shrink-0" />
                                <div className="flex shrink-0 flex-col gap-2">
                                    <h4 className="text-sm font-medium">工具定义</h4>
                                    <DetailTextarea value={tools_text} box_class="max-h-40" />
                                </div>
                            </>
                        )}

                        <div className="flex min-h-0 max-h-80 shrink-0 flex-col gap-2 overflow-hidden">
                            <h4 className="shrink-0 text-sm font-medium">请求消息</h4>
                            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1  flex flex-col gap-2">
                                {messages.map((m, i) => (
                                    <div key={i} className="flex flex-col ">
                                        <Badge variant="outline" className="mb-1.5 text-xs uppercase">
                                            {m.role}
                                        </Badge>
                                        <DetailTextarea value={m.content} />
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden">
                            <h4 className="shrink-0 text-sm font-medium">响应内容</h4>
                            <DetailTextarea value={response_text} box_class="flex-1 " />
                        </div>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}
