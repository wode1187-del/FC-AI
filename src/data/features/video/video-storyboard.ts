import type { IFeatureTemplate } from '../types';

export const videoStoryboard: IFeatureTemplate = {
    id: 'video-storyboard',
    name: '故事板视频',
    description: '专业级视频脚本生成',
    icon: '📋',
    category: 'video',
    mode: 'text2video',
    prompt: '商品广告故事：开篇特写商品细节，中景模特展示上身效果，结尾全景收尾品牌氛围，分镜流畅衔接，情绪递进，专业广告片质感，电商品牌广告级成片。',
    negativePrompt: '跳帧、镜头突兀、主体变形、模糊',
    recommendedModel: 'doubao-seedance-2.5',
    customModels: ['doubao-seedance-2.5', 'kling-v3'],
    params: { ratio: '16:9 横屏', quality: '1080P 高清', imageCount: 1, duration: 10 },
    requiresImage: false,
    steps: ['选择故事板视频', 'AI 自动编排分镜脚本', '逐镜生成并合成', '输出完整故事板成片'],
  };
