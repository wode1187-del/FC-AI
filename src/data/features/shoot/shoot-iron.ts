import type { IFeatureTemplate } from '../types';

export const shootIron: IFeatureTemplate = {
    id: 'shoot-iron',
    name: '衣服去皱',
    description: '一键去除服装褶皱',
    icon: '🧺',
    category: 'shoot',
    mode: 'img2img',
    prompt: '去除服装上的所有褶皱与折痕，让衣服变得平整挺括、版型利落，保持服装的颜色、图案、材质和结构完全不变，同时百分百保留衣服质感。高清细节。禁止重绘图片细节。禁止人物偏色。禁止皮肤变色。禁止重绘皮肤。禁止重绘背景。',
    negativePrompt: '残留褶皱、变形、纹理丢失、模糊',
    recommendedModel: 'nano-banana-2',
    customModels: ['nano-banana-2', 'gpt-image-2', 'gpt-image-2.5-flare'],
    params: { ratio: '2K · 1:1 正方形 · 2048×2048', quality: 'PNG 无损（推荐）', imageCount: 4 },
    requiresImage: true,
    steps: ['上传带褶皱的服装图', 'AI 识别褶皱区域', '非破坏编辑抹平褶皱', '输出平整服装图'],
  };
