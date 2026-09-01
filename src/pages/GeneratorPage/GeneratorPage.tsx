import LeftSidebar from '@/components/LeftSidebar';
import TaskTable from '@/components/TaskTable';
import { useApp } from '@/context/AppContext';

export default function GeneratorPage() {
  const { currentProject, taskStats } = useApp();

  return (
    <div className="flex h-[calc(100vh-56px)] min-h-0">
      {/* Left Sidebar */}
      <LeftSidebar />

      {/* Main Content */}
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
        {/* Page Header */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/50 bg-card/30">
          <div className="flex items-center gap-3">
            <h1 className="text-sm font-semibold text-foreground">批量生成</h1>
            <span className="text-xs text-muted-foreground">/</span>
            <span className="text-xs text-muted-foreground">{currentProject?.name || '未命名项目'}</span>
          </div>
          <div className="flex items-center gap-4 text-xs">
            <div className="flex items-center gap-1.5">
              <span className="text-muted-foreground">任务数</span>
              <span className="font-semibold text-foreground tabular-nums">{taskStats.total}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-muted-foreground">队列中</span>
              <span className="font-semibold text-amber-600 tabular-nums">{taskStats.queued}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-muted-foreground">已完成</span>
              <span className="font-semibold text-emerald-600 tabular-nums">{taskStats.completed}</span>
            </div>
          </div>
        </div>

        {/* Task Table */}
        <div className="flex-1 min-h-0 overflow-hidden">
          <TaskTable />
        </div>
      </div>
    </div>
  );
}
