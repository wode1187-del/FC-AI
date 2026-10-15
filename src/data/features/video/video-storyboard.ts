import type { IFeatureTemplate } from '../types';

export const videoStoryboard: IFeatureTemplate = {
    id: 'video-storyboard',
    name: '故事板视频',
    description: '专业广告成片（长时长文案驱动）',
    icon: '📋',
    category: 'video',
    mode: 'text2video',
    prompt: '商品广告成片：开篇特写商品细节，中景模特展示上身效果，结尾全景收尾品牌氛围，运镜流畅情绪递进，专业广告片质感，电商品牌广告级成片。',
    negativePrompt: '跳帧、镜头突兀、主体变形、模糊',
    recommendedModel: 'doubao-seedance-2.5',
    customModels: ['doubao-seedance-2.5', 'kling-v3'],
    params: { ratio: '16:9 横屏', quality: '1080P 高清', imageCount: 1, duration: 10 },
    requiresImage: false,
    steps: ['选择故事板视频', 'AI 按广告文案生成成片', '输出长时长广告视频', '可在我的视频中管理'],
  };
