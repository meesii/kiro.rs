import {
    Sidebar,
    SidebarContent,
    SidebarFooter,
    SidebarGroup,
    SidebarGroupContent,
    SidebarHeader,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
} from '@/components/ui/sidebar';
import { storage } from '@/lib/storage';
import { KeyRound, LayoutDashboard, LogOut, MessageSquareText, Settings, ShieldCheck } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router';

const nav_items = [
    { title: '仪表盘', href: '/', icon: LayoutDashboard },
    { title: '凭证管理', href: '/credentials', icon: KeyRound },
    { title: '对话记录', href: '/conversations', icon: MessageSquareText },
    { title: '系统设置', href: '/settings', icon: Settings },
];

export function AppSidebar() {
    const location = useLocation();
    const navigate = useNavigate();

    return (
        <Sidebar variant="inset">
            <SidebarHeader>
                <SidebarMenu>
                    <SidebarMenuItem>
                        <SidebarMenuButton size="lg" className="cursor-pointer" onClick={() => navigate('/')}>
                            <div className="bg-primary text-primary-foreground flex aspect-square size-8 items-center justify-center rounded-lg">
                                <ShieldCheck className="size-4" />
                            </div>
                            <div className="flex flex-col gap-0.5 leading-none">
                                <span className="font-semibold">Kiro Admin</span>
                                <span className="text-muted-foreground text-xs">管理面板</span>
                            </div>
                        </SidebarMenuButton>
                    </SidebarMenuItem>
                </SidebarMenu>
            </SidebarHeader>

            <SidebarContent>
                <SidebarGroup>
                    <SidebarGroupContent>
                        <SidebarMenu>
                            {nav_items.map((item) => (
                                <SidebarMenuItem key={item.href} className="mb-1">
                                    <SidebarMenuButton
                                        onClick={() => navigate(item.href)}
                                        isActive={item.href === '/' ? location.pathname === '/' : location.pathname.startsWith(item.href)}
                                        className="cursor-pointer px-3 py-4 hover:bg-black/10! dark:hover:bg-white/15! data-active:bg-black/15! dark:data-active:bg-white/20!"
                                    >
                                        <item.icon />
                                        <span>{item.title}</span>
                                    </SidebarMenuButton>
                                </SidebarMenuItem>
                            ))}
                        </SidebarMenu>
                    </SidebarGroupContent>
                </SidebarGroup>
            </SidebarContent>

            <SidebarFooter>
                <SidebarMenu>
                    <SidebarMenuItem>
                        <SidebarMenuButton
                            className="cursor-pointer px-3 py-4 hover:bg-black/10! dark:hover:bg-white/15! data-active:bg-black/15! dark:data-active:bg-white/20!"
                            onClick={() => {
                                storage.remove_api_key();
                                navigate('/login');
                            }}
                        >
                            <LogOut />
                            <span>退出登录</span>
                        </SidebarMenuButton>
                    </SidebarMenuItem>
                </SidebarMenu>
            </SidebarFooter>
        </Sidebar>
    );
}
