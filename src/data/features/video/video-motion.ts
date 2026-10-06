import type { IFeatureTemplate } from '../types';

export const videoMotion: IFeatureTemplate = {
    id: 'video-motion',
    name: '动作跟随',
    description: '复刻模特动作，快速生成视频',
    icon: '🏃',
    category: 'video',
    mode: 'video-motion',
    prompt: '让图片中的人物完整复刻参考视频中的动作与表情，主体形象与服装细节保持不变，动作自然流畅，背景保持一致。',
    negativePrompt: '人物变形、动作僵硬、面部畸变、模糊',
    recommendedModel: 'kling-v3',
    customModels: ['kling-v3', 'kling-v2-6'],
    params: { ratio: '9:16 竖屏', quality: '1080P 高清', imageCount: 1, duration: 5 },
    requiresImage: true,
    requiresVideo: true,
    steps: ['上传人物形象图', '上传动作参考视频', 'AI 驱动人物复刻动作', '输出动作跟随视频'],
  };
