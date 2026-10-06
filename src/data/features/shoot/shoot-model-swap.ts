import type { IFeatureTemplate } from '../types';

export const shootModelSwap: IFeatureTemplate = {
    id: 'shoot-model-swap',
    name: '模特变身',
    description: '款式不变，随心更换模特',
    icon: '💃',
    category: 'shoot',
    mode: 'img2img',
    prompt: '保持服装款式、颜色、版型完全不变，将服装穿到一位不同风格的专业女模特身上，模特可更换为不同肤色、身材、发型、气质，自然站立展示服装，影棚商业摄影，柔和灯光，干净背景，高清细节。',
    negativePrompt: '服装变形、图案错乱、多余肢体、模糊',
    recommendedModel: 'gpt-image-2',
    customModels: ['gpt-image-2', 'gpt-image-2.5-flare', 'jimeng-5.0', 'seedream-5.0-lite'],
    params: { ratio: '2K · 3:4 竖版 · 1536×2048', quality: 'High（高质量）', imageCount: 4 },
    requiresImage: true,
    steps: ['上传带模特或仅服装的图', 'AI 锁定服装不变', '替换/生成不同模特形象', '输出多款模特效果'],
  };
