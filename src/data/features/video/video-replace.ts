import type { IFeatureTemplate } from '../types';

export const videoReplace: IFeatureTemplate = {
    id: 'video-replace',
    name: '全能替换',
    description: '一键替换视频元素',
    icon: '🔁',
    category: 'video',
    mode: 'video-motion',
    prompt: '保持原视频整体结构与节奏，替换其中的商品/背景/人物等元素，新元素与视频光影和运镜自然融合，画面流畅无痕迹。',
    negativePrompt: '元素错位、光影不协调、画面撕裂、模糊',
    recommendedModel: 'doubao-seedance-2.5',
    customModels: ['doubao-seedance-2.5', 'kling-v3'],
    params: { ratio: '16:9 横屏', quality: '1080P 高清', imageCount: 1, duration: 5 },
    requiresImage: true,
    requiresVideo: true,
    steps: ['上传原视频 + 新元素图', 'AI 识别替换目标', '融合新元素生成新视频', '输出替换后的成片'],
  };
