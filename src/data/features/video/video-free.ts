import type { IFeatureTemplate } from '../types';

export const videoFree: IFeatureTemplate = {
    id: 'video-free',
    name: '自由创作',
    description: '任意素材，随心创作',
    icon: '🎬',
    category: 'video',
    mode: 'text2video',
    prompt: '专业商品展示视频：镜头从远到近缓缓推进，围绕服装商品展示细节与质感，画面流畅稳定，自然光线，电商广告级质感，主体清晰。',
    negativePrompt: '画面抖动、主体变形、模糊、文字水印',
    recommendedModel: 'kling-v3',
    customModels: ['kling-v3', 'kling-v2-6', 'doubao-seedance-2.5'],
    params: { ratio: '16:9 横屏', quality: '1080P 高清', imageCount: 1, duration: 5 },
    requiresImage: false,
    steps: ['选择自由创作', 'AI 按预置脚本生成商品展示视频', '输出成片', '可在我的视频中管理'],
  };
