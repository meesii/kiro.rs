import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { use_admin_config, use_credentials, use_token_stats } from '@/hooks/use-api';
import dayjs from 'dayjs';
import { Activity, AlertCircle, ArrowRight, BarChart3, CheckCircle2, KeyRound, MessageSquareText, RefreshCw, Settings } from 'lucide-react';
import { useNavigate } from 'react-router';

export function DashboardPage() {
    const { data: cred_data, isLoading: cred_loading } = use_credentials();
    const { data: admin_config } = use_admin_config();
    const { data: stats_data, isLoading: stats_loading, refetch: refetch_stats } = use_token_stats({ hours: 24 });
    const navigate = useNavigate();

    const total = cred_data?.total ?? 0;
    const available = cred_data?.available ?? 0;
    const disabled = total - available;
    const has_failures = cred_data?.credentials?.filter((c) => c.failureCount > 0 || c.refreshFailureCount > 0)?.length ?? 0;
    const lb_mode = admin_config?.loadBalancingMode ?? 'priority';

    return (
        <div className="min-h-0 flex-1 overflow-y-auto p-6 space-y-6">
            <div>
                <h1 className="text-xl font-bold tracking-tight">仪表盘</h1>
                <p className="text-muted-foreground">Kiro 实例运行概览</p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <StatCard title="凭证总数" value={cred_loading ? <Skeleton className="h-8 w-16" /> : total} icon={KeyRound} description="已注册凭证" />
                <StatCard
                    title="可用凭证"
                    value={cred_loading ? <Skeleton className="h-8 w-16" /> : available}
                    icon={CheckCircle2}
                    description="正常可用"
                    accent="text-emerald-500"
                />
                <StatCard
                    title="已禁用"
                    value={cred_loading ? <Skeleton className="h-8 w-16" /> : disabled}
                    icon={AlertCircle}
                    description="当前不可用"
                    accent={disabled > 0 ? 'text-destructive' : undefined}
                />
                <StatCard
                    title="异常凭证"
                    value={cred_loading ? <Skeleton className="h-8 w-16" /> : has_failures}
                    icon={Activity}
                    description="需要关注"
                    accent={has_failures > 0 ? 'text-amber-500' : undefined}
                />
            </div>

            <div className="grid grid-cols-3 gap-4">
                <div className="col-span-2 min-w-0">
                    <TokenChart data={stats_data} loading={stats_loading} on_refresh={refetch_stats} />
                </div>
                <Card className="col-span-1">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium">快捷操作</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                        <Button variant="outline" className="w-full justify-between" onClick={() => navigate('/credentials')}>
                            凭证管理 <ArrowRight className="size-4" />
                        </Button>
                        <Button variant="outline" className="w-full justify-between" onClick={() => navigate('/conversations')}>
                            对话记录 <MessageSquareText className="size-4" />
                        </Button>
                    </CardContent>
                </Card>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium">负载均衡模式</CardTitle>
                        <Settings className="text-muted-foreground size-4" />
                    </CardHeader>
                    <CardContent>
                        <div className="flex items-center gap-2">
                            <Badge variant={lb_mode === 'priority' ? 'default' : 'secondary'}>{lb_mode === 'priority' ? '优先级' : '均衡'}</Badge>
                            <span className="text-muted-foreground text-sm">{lb_mode === 'priority' ? '按优先级使用凭证' : '均匀分配负载'}</span>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium">当前活跃凭证</CardTitle>
                        <Activity className="text-muted-foreground size-4" />
                    </CardHeader>
                    <CardContent>
                        {cred_data?.currentId ? (
                            <p className="font-mono text-lg font-semibold">#{cred_data.currentId}</p>
                        ) : (
                            <p className="text-muted-foreground text-sm">无</p>
                        )}
                    </CardContent>
                </Card>
            </div>

            {cred_data && cred_data.credentials?.length > 0 && (
                <Card>
                    <CardHeader>
                        <CardTitle className="text-sm font-medium">凭证健康状态</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-3">
                            {cred_data.credentials.slice(0, 5).map((cred) => (
                                <div key={cred.id} className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <span className="text-muted-foreground font-mono text-sm">#{cred.id}</span>
                                        <span className="text-sm font-medium">{cred.email ?? cred.maskedApiKey ?? '未知'}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {cred.disabled && <Badge variant="destructive">已禁用</Badge>}
                                        {cred.failureCount > 0 && (
                                            <Badge variant="outline" className="text-amber-500 border-amber-500/30">
                                                {cred.failureCount} 次失败
                                            </Badge>
                                        )}
                                        {cred.isCurrent && <Badge>活跃</Badge>}
                                        {!cred.disabled && cred.failureCount === 0 && (
                                            <Badge variant="secondary" className="text-emerald-500">
                                                正常
                                            </Badge>
                                        )}
                                    </div>
                                </div>
                            ))}
                            {cred_data.credentials.length > 5 && (
                                <button
                                    onClick={() => navigate('/credentials')}
                                    className="text-muted-foreground hover:text-foreground block w-full text-center text-sm transition-colors"
                                >
                                    查看全部 {cred_data.credentials.length} 个凭证 →
                                </button>
                            )}
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}

function StatCard({
    title,
    value,
    icon: Icon,
    description,
    accent,
}: {
    title: string;
    value: React.ReactNode;
    icon: React.ElementType;
    description: string;
    accent?: string;
}) {
    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">{title}</CardTitle>
                <Icon className={`size-4 ${accent ?? 'text-muted-foreground'}`} />
            </CardHeader>
            <CardContent>
                <div className={`text-2xl font-bold ${accent ?? ''}`}>{value}</div>
                <p className="text-muted-foreground text-xs">{description}</p>
            </CardContent>
        </Card>
    );
}

interface TokenChartData {
    items: { time: string; tokens: number }[];
    totalTokens: number;
    hours: number;
}

function TokenChart({ data, loading, on_refresh }: { data?: TokenChartData; loading: boolean; on_refresh: () => void }) {
    if (loading) {
        return (
            <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="flex items-center gap-2 text-sm font-medium">
                        <BarChart3 className="size-4" />
                        Token 消耗趋势
                    </CardTitle>
                    <Button variant="ghost" size="icon" className="size-7" disabled>
                        <RefreshCw className="size-3.5" />
                    </Button>
                </CardHeader>
                <CardContent>
                    <Skeleton className="h-40 w-full" />
                </CardContent>
            </Card>
        );
    }

    if (!data || data.items.length === 0) {
        return (
            <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="flex items-center gap-2 text-sm font-medium">
                        <BarChart3 className="size-4" />
                        Token 消耗趋势
                    </CardTitle>
                    <Button variant="ghost" size="icon" className="size-7" onClick={on_refresh}>
                        <RefreshCw className="size-3.5" />
                    </Button>
                </CardHeader>
                <CardContent>
                    <div className="text-muted-foreground flex h-40 items-center justify-center text-sm">暂无数据</div>
                </CardContent>
            </Card>
        );
    }

    const max_tokens = Math.max(...data.items.map((d) => d.tokens), 1);
    const bar_count = data.items.length;
    const chart_w = 520;
    const chart_h = 160;
    const pad_l = 48;
    const pad_b = 28;
    const pad_r = 12;
    const pad_t = 12;
    const bar_area_w = chart_w - pad_l - pad_r;
    const bar_area_h = chart_h - pad_t - pad_b;
    const bar_w = Math.max(3, (bar_area_w - (bar_count - 1)) / bar_count);

    /**
     * 格式化 token 数量
     */
    function fmt_tokens(n: number): string {
        if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
        if (n >= 1000) return `${(n / 1000).toFixed(0)}K`;
        return String(n);
    }

    /**
     * UTC 时间转为北京时间小时标签
     */
    function fmt_hour_label(time: string): string {
        return dayjs(time).add(8, 'hour').format('HH');
    }

    /**
     * UTC 时间字符串转为北京时间字符串（用于 tooltip）
     */
    function to_beijing_time(time: string): string {
        return dayjs(time).add(8, 'hour').format('YYYY-MM-DD HH:mm');
    }

    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="flex items-center gap-2 text-sm font-medium">
                    <BarChart3 className="size-4" />
                    Token 消耗趋势（最近 {data.hours} 小时）
                </CardTitle>
                <div className="flex items-center gap-2">
                    <span className="text-muted-foreground text-xs">合计 {fmt_tokens(data.totalTokens)} tokens</span>
                    <Button variant="ghost" size="icon" className="size-7" onClick={on_refresh}>
                        <RefreshCw className="size-3.5" />
                    </Button>
                </div>
            </CardHeader>
            <CardContent>
                <div className="overflow-x-auto">
                    <svg viewBox={`0 0 ${chart_w} ${chart_h}`} className="w-full">
                        {data.items.map((d, i) => {
                            const x = pad_l + i * (bar_w + 1);
                            const bar_h = (d.tokens / max_tokens) * bar_area_h;
                            const y = pad_t + bar_area_h - bar_h;
                            return (
                                <g key={d.time}>
                                    <title>{`${to_beijing_time(d.time)}: ${d.tokens.toLocaleString()} tokens`}</title>
                                    <rect
                                        x={x}
                                        y={y}
                                        width={bar_w}
                                        height={bar_h}
                                        rx="2"
                                        className="fill-emerald-500/80 hover:fill-emerald-500 transition-colors"
                                    />
                                </g>
                            );
                        })}
                        {/* Y 轴刻度线 */}
                        {[0, 0.25, 0.5, 0.75, 1].map((pct) => {
                            const y = pad_t + bar_area_h * (1 - pct);
                            const val = max_tokens * pct;
                            return (
                                <g key={`y-${pct}`}>
                                    <line x1={pad_l} y1={y} x2={chart_w - pad_r} y2={y} className="stroke-muted-foreground/15" strokeDasharray="3 3" />
                                    <text x={pad_l - 4} y={y + 4} textAnchor="end" className="fill-muted-foreground text-[10px]">
                                        {fmt_tokens(val)}
                                    </text>
                                </g>
                            );
                        })}
                        {/* X 轴标签 */}
                        {data.items.map((d, i) => {
                            const x = pad_l + i * (bar_w + 1) + bar_w / 2;
                            return (
                                <text key={`x-${d.time}`} x={x} y={chart_h - 4} textAnchor="middle" className="fill-muted-foreground text-[8px]">
                                    {fmt_hour_label(d.time)}
                                </text>
                            );
                        })}
                    </svg>
                </div>
            </CardContent>
        </Card>
    );
}
