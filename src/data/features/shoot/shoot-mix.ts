import type { IFeatureTemplate } from '../types';

export const shootMix: IFeatureTemplate = {
    id: 'shoot-mix',
    name: '多款搭配',
    description: '自由组合款式，生成模特搭配图',
    icon: '🧥',
    category: 'shoot',
    mode: 'img2img',
    prompt: '将上传的多件服装款式自由组合搭配，穿在同一位模特身上形成完整穿搭，单品之间颜色与风格协调，模特自然摆姿展示整套搭配，影棚商业摄影，柔和自然光，纯色背景，高清细节。',
    negativePrompt: '服装变形、单品混色、多余肢体、模糊、水印',
    recommendedModel: 'gpt-image-2',
    params: { ratio: '2K · 3:4 竖版 · 1536×2048', quality: 'High（高质量）', imageCount: 4 },
    requiresImage: true,
    steps: ['上传多张单品图', 'AI 自动组合搭配逻辑', '生成模特完整穿搭图', '输出多套搭配效果'],
  };
