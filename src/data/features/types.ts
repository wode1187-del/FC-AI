// 功能模板系统：服装商拍 / 服装设计 / 视频生成
// 每个功能 = 预置专业提示词 + 自动推荐模型 + 默认参数
// 选择功能后一键应用到任务，无需再填关键词

export type FeatureCategory = 'shoot' | 'design' | 'video';
export type FeatureMode =
  | 'img2img'      // 图生图：参考图 -> 目标效果
  | 'text2img'     // 文生图：文字 -> 图
  | 'img2video'    // 图生视频：参考图 -> 动态视频
  | 'text2video'   // 文生视频：文字 -> 视频
  | 'video-motion' // 动作跟随：形象图 + 动作参考视频
  | 'library';     // 资产管理（我的视频）

export interface IFeatureTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: FeatureCategory;
  mode: FeatureMode;
  /** 预置专业提示词（免填关键词，直接可用） */
  prompt: string;
  negativePrompt?: string;
  /** 自动推荐模型 id（在现有图像模型或视频模型中） */
  recommendedModel: string;
  /** 自定义可选模型 id 列表；为空表示全部模型可选 */
  customModels?: string[];
  params: {
    ratio?: string;
    quality?: string;
    imageCount?: number;
    background?: string;
    /** 视频时长（秒） */
    duration?: number;
  };
  /** 是否需要上传参考图 */
  requiresImage: boolean;
  /** 是否需要动作参考视频（动作跟随） */
  requiresVideo?: boolean;
  /** 参考图槽位：定义该功能需要分框上传的多个分类（如款式/模特），驱动参考图区域分框上传引导 */
  referenceSlots?: { id: string; label: string; icon: string; hint: string }[];
  /** 底层实现流程说明（展示给用户） */
  steps: string[];
}
