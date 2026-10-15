import { useState } from 'react';
import { toast } from 'sonner';
import { Sparkles, Wand2 } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { FEATURE_CATEGORIES, getFeaturesByCategory, FEATURE_TEMPLATES, isVideoModel } from '@/data/featureTemplates';
import { useApp } from '@/context/AppContext';

export default function FeaturePicker() {
  const { applyFeature, activeModels, apiConfigs } = useApp();
  const [activeCat, setActiveCat] = useState<string>('shoot');
  // 视频 API（可灵/即梦）是否已验证配置
  const hasVideoApi = apiConfigs.some(c => (c.type === 'kling' || c.type === 'seedance') && !!c.baseUrl && !!c.apiKey && c.status === 'verified');

  const handleApply = (featureId: string) => {
    const tpl = FEATURE_TEMPLATES.find((f) => f.id === featureId);
    if (!tpl) return;
    // 「我的视频」为资产管理入口，不触发生成
    if (tpl.mode === 'library') {
      toast.info('「我的视频」为历史视频资产入口', {
        description: '已生成的视频会显示在任务的结果区，可在线预览与下载',
      });
      return;
    }
    // 视频功能前置引导：对应视频 API 未配置时提示先配置，避免直接生成失败
    if (isVideoModel(tpl.recommendedModel) && !hasVideoApi) {
      toast.warning('视频功能需先配置视频 API', {
        description: '请先在「API接口」页面配置并验证可灵（Kling）或即梦（Seedance）视频接口，再点生成',
      });
    }
    const applied = applyFeature(featureId);
    if (!applied) {
      toast.error('应用功能模板失败');
      return;
    }
    const isVideo = tpl.recommendedModel.startsWith('kling') || tpl.recommendedModel.includes('seedance');
    const modelReady = isVideo
      ? activeModels.some((m) => m.id === tpl.recommendedModel) || true
      : activeModels.some((m) => m.id === tpl.recommendedModel);
    toast.success(`已应用【${tpl.name}】`, {
      description: `预置提示词与推荐模型已载入（按当前已配置 API 自动适配）${tpl.requiresImage ? '，上传素材后即可生成' : '，可直接生成'}`,
    });
  };

  return (
    <div className="rounded-lg border border-border/60 bg-background/60 p-2.5 space-y-2">
      <div className="flex items-center justify-between px-0.5">
        <span className="text-xs font-semibold flex items-center gap-1">
          <Wand2 className="size-3.5 text-primary" />
          功能模板
        </span>
        <Badge variant="outline" className="text-[10px] py-0 h-4.5 font-normal text-muted-foreground">
          免填关键词 · 一键出图
        </Badge>
      </div>

      <Tabs value={activeCat} onValueChange={setActiveCat} className="w-full">
        <TabsList className="grid grid-cols-3 h-8 mb-1.5 bg-muted/50">
          {FEATURE_CATEGORIES.map((cat) => (
            <TabsTrigger key={cat.id} value={cat.id} className="text-[11px] py-0.5">
              {cat.icon} {cat.name}
            </TabsTrigger>
          ))}
        </TabsList>

        {FEATURE_CATEGORIES.map((cat) => (
          <TabsContent key={cat.id} value={cat.id} className="mt-0 space-y-1.5">
            <div className="grid grid-cols-3 gap-1.5 max-h-[240px] overflow-y-auto pr-1 feature-grid-scroll">
              {getFeaturesByCategory(cat.id).map((f) => {
                const needVideoApi = isVideoModel(f.recommendedModel) && !hasVideoApi;
                return (
                <button
                  key={f.id}
                  onClick={() => handleApply(f.id)}
                  title={needVideoApi ? `${f.description}（视频 API 未配置）` : f.description}
                  className={`group relative flex flex-col items-center gap-1 rounded-md border border-border/50 bg-card p-1.5 hover:border-primary/50 hover:bg-primary/5 transition-colors text-center ${needVideoApi ? 'border-destructive/50 ring-1 ring-destructive/20' : ''}`}
                >
                  {needVideoApi && (
                    <span className="absolute top-1 right-1 flex items-center gap-0.5 px-1 py-px rounded-full bg-destructive/10 text-destructive text-[8px] font-medium border border-destructive/30 pointer-events-none">
                      未配置
                    </span>
                  )}
                  <span className="text-base leading-none">{f.icon}</span>
                  <span className="text-[10px] leading-tight text-foreground/90 group-hover:text-primary line-clamp-2">
                    {f.name}
                  </span>
                  <span className="text-[9px] text-muted-foreground truncate w-full">
                    {f.recommendedModel.split('-').map((s: string) => s[0]?.toUpperCase() + s.slice(1)).join(' ').slice(0, 14)}
                  </span>
                </button>
                );
              })}
            </div>
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground px-0.5">
              <Sparkles className="size-3 text-amber-500" />
              点击功能即载入专业提示词 + 推荐模型 + 参数，可再自由切换自定义模型
            </div>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
