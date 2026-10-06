import type { IFeatureTemplate } from '../types';

export const designPattern: IFeatureTemplate = {
    id: 'design-pattern',
    name: '四方生图',
    description: '输入文字，生成四方连续图案',
    icon: '🔁',
    category: 'design',
    mode: 'text2img',
    prompt: '生成一张可无缝平铺的四方连续服装面料图案，图案边缘完美衔接、无接缝，色彩协调、风格统一，适合服装印花与面料生产，高清细节，专业纺织图案设计。',
    negativePrompt: '接缝明显、图案断裂、边缘不衔接、模糊',
    recommendedModel: 'seedream-5.0-lite',
    customModels: ['seedream-5.0-lite', 'gpt-image-2', 'jimeng-5.0'],
    params: { ratio: '2K · 1:1 正方形 · 2048×2048', quality: 'Standard（官方默认）', imageCount: 4 },
    requiresImage: false,
    steps: ['选择四方生图', 'AI 生成无缝图案', '图案可无限平铺', '输出多款花型方案'],
  };
