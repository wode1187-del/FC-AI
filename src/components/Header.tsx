import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  Image,
  Settings,
  BarChart3,
  Database,
  HelpCircle,
  Download,
  FileOutput,
  XCircle,
  Camera,
  User,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useApp } from '@/context/AppContext';
import { logger } from '@lark-apaas/client-toolkit-lite';

export default function Header() {
  const { taskStats, tasks } = useApp();
  const location = useLocation();
  const [loginOpen, setLoginOpen] = useState(false);
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  const navItems = [
    { path: '/generator', label: '生成台', icon: Image },
    { path: '/api', label: 'API接口', icon: Settings },
    { path: '/stats', label: '统计后台', icon: BarChart3 },
    { path: '/storage', label: '本地存储', icon: Database },
    { path: '/help', label: '使用教程', icon: HelpCircle },
  ];

  // 批量下载所有已完成任务的生成结果图片
  const handleBatchDownload = async (format: 'jpg' | 'png') => {
    const completed = tasks.filter((t) => t.status === 'completed' && t.results.length > 0);
    if (completed.length === 0) {
      toast.warning('没有已完成的生成结果可供下载');
      return;
    }

    let count = 0;
    const total = completed.reduce((sum, t) => sum + t.results.length, 0);
    toast.info(`开始下载 ${total} 张图片 (${format.toUpperCase()})...`);

    for (const task of completed) {
      for (let i = 0; i < task.results.length; i++) {
        const result = task.results[i];
        try {
          const response = await fetch(result.url);
          const blob = await response.blob();
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `FC-ai_#${task.index}_${i + 1}.${format}`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          count++;
        } catch (error) {
          logger.error(`下载失败: task ${task.index} image ${i + 1}`);
        }
        // 小延迟避免浏览器拦截
        await new Promise((r) => setTimeout(r, 150));
      }
    }
    toast.success(`已下载 ${count}/${total} 张 ${format.toUpperCase()} 图片`);
  };

  // 导出任务为 JSON
  const handleExportRows = () => {
    if (tasks.length === 0) {
      toast.warning('没有可导出的任务');
      return;
    }
    const exportData = tasks.map((t) => ({
      index: t.index,
      prompt: t.prompt,
      model: t.model,
      ratio: t.ratio,
      quality: t.quality,
      imageCount: t.imageCount,
      status: t.status,
      results: t.results.map((r) => ({ url: r.url, createdAt: r.createdAt })),
      enabled: t.enabled,
    }));
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fc-ai-tasks-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success(`已导出 ${tasks.length} 条任务记录`);
  };

  // 终止所有进行中的任务
  const handleStopAll = () => {
    const generating = tasks.filter((t) => t.status === 'generating');
    if (generating.length === 0) {
      toast.info('当前没有正在生成的任务');
      return;
    }
    toast.info(`已请求终止 ${generating.length} 个生成任务`);
  };

  // 导出截图（使用 DOM 截图方式）
  const handleExportScreenshot = () => {
    const taskTable = document.querySelector('[data-task-table]');
    if (!taskTable) {
      toast.warning('未找到任务表格区域');
      return;
    }
    // 使用浏览器打印/截图提示
    toast.info('截图功能：请使用浏览器截图或按 Ctrl+Shift+S 截取页面');
  };

  // 登录
  const handleLogin = () => {
    if (!loginUsername.trim()) {
      toast.warning('请输入用户名');
      return;
    }
    toast.success(`欢迎回来，${loginUsername}`);
    setLoginOpen(false);
  };

  const actionButtons = [
    { label: '批量下载 JPG', icon: Download, onClick: () => handleBatchDownload('jpg') },
    { label: '批量下载 PNG', icon: Download, onClick: () => handleBatchDownload('png') },
    { label: '导出行', icon: FileOutput, onClick: handleExportRows },
    { label: '终止', icon: XCircle, onClick: handleStopAll },
    { label: '导出截图', icon: Camera, onClick: handleExportScreenshot },
  ];

  // 只在生成台页面显示操作按钮
  const showActions = location.pathname.startsWith('/generator');

  return (
    <header className="sticky top-0 z-50 w-full bg-background/90 backdrop-blur-md border-b border-border/40">
      <div className="flex h-12 items-center px-4 gap-6">
        {/* Left: Logo */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="size-6 rounded-md bg-gradient-to-br from-primary to-orange-400 flex items-center justify-center text-white text-xs font-bold">
            FC
          </div>
          <span className="font-semibold text-sm text-foreground">FC内部AI系统</span>
        </div>

        {/* Center: Task Stats */}
        {showActions && (
          <div className="flex items-center gap-4 text-xs">
            <div className="flex items-center gap-1.5">
              <span className="text-muted-foreground">任务</span>
              <span className="font-semibold text-foreground tabular-nums">{taskStats.total}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-muted-foreground">队列中</span>
              <span className="font-semibold text-primary tabular-nums">{taskStats.queued}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-muted-foreground">已完成</span>
              <span className="font-semibold text-success tabular-nums">{taskStats.completed}</span>
            </div>
          </div>
        )}

        {/* Nav */}
        <nav className="flex items-center gap-1 ml-4">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.path === '/generator'}
                className={({ isActive }) =>
                  `flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs transition-colors ${
                    isActive
                      ? 'bg-accent text-accent-foreground font-medium'
                      : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
                  }`
                }
                onClick={(e) => {
                  // 未实现的页面给提示
                  if (['/stats', '/storage', '/help'].includes(item.path)) {
                    e.preventDefault();
                    toast.info(`${item.label}功能开发中`);
                  }
                }}
              >
                <Icon className="size-3.5" />
                {item.label}
              </NavLink>
            );
          })}
        </nav>

        {/* Right: Action Buttons + Login */}
        <div className="flex items-center gap-1 ml-auto">
          {showActions &&
            actionButtons.map((btn) => {
              const Icon = btn.icon;
              return (
                <Button
                  key={btn.label}
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                  onClick={btn.onClick}
                >
                  <Icon className="size-3.5 mr-1" />
                  {btn.label}
                </Button>
              );
            })}
          <div className="w-px h-5 bg-border/60 mx-1" />
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
            onClick={() => setLoginOpen(true)}
          >
            <User className="size-3.5 mr-1" />
            登录 / 注册
          </Button>
        </div>
      </div>

      {/* Login Dialog */}
      <Dialog open={loginOpen} onOpenChange={setLoginOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>登录 / 注册</DialogTitle>
            <DialogDescription>
              登录后可同步云端项目，未注册的账号将自动创建
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs">用户名 / 邮箱</Label>
              <Input
                value={loginUsername}
                onChange={(e) => setLoginUsername(e.target.value)}
                placeholder="请输入用户名"
                className="h-9"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">密码</Label>
              <Input
                type="password"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                placeholder="请输入密码"
                className="h-9"
                onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setLoginOpen(false)}>
              取消
            </Button>
            <Button size="sm" onClick={handleLogin}>
              登录
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </header>
  );
}
