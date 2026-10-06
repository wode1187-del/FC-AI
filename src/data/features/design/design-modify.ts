import type { IFeatureTemplate } from '../types';

export const designModify: IFeatureTemplate = {
    id: 'design-modify',
    name: '自由改款',
    description: '选中区域输入描述，一键完成改款',
    icon: '✂️',
    category: 'design',
    mode: 'img2img',
    prompt: '在保持服装整体风格与结构的基础上，对款式进行局部改款设计：调整领型、袖型、下摆、长度、版型松紧等，改款后服装细节精致、可生产落地，正面展示，干净白底，设计稿质感。',
    negativePrompt: '结构混乱、变形、文字、水印、模糊',
    recommendedModel: 'gpt-image-2.5-flare',
    customModels: ['gpt-image-2.5-flare', 'gpt-image-2', 'seedream-5.0-lite'],
    params: { ratio: '2K · 3:4 竖版 · 1536×2048', quality: 'XHigh（超高精度）', imageCount: 4 },
    requiresImage: true,
    steps: ['上传款式图', 'AI 识别款式结构', '按改款意图调整局部', '输出改款设计稿'],
  };
