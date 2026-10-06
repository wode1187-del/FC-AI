import type { IFeatureTemplate } from '../types';

export const videoLive: IFeatureTemplate = {
    id: 'video-live',
    name: '实况图',
    description: '一键转换 LivePhoto',
    icon: '📱',
    category: 'video',
    mode: 'img2video',
    prompt: '将静态图片转换为轻微动态的实况图效果：主体细微自然的动态（发丝轻飘、衣角微动、光影流动），画面稳定，动效克制优雅，适合社交媒体分享。',
    negativePrompt: '大幅度运动、变形、抖动、模糊',
    recommendedModel: 'kling-v2-6',
    customModels: ['kling-v2-6', 'kling-v3'],
    params: { ratio: '1:1 方形', quality: '1080P 高清', imageCount: 1, duration: 3 },
    requiresImage: true,
    steps: ['上传静态图片', 'AI 生成轻微动态', '输出 3 秒实况效果', '可直接分享'],
  };
