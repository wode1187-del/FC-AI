import type { IFeatureTemplate } from '../types';

export const shootFaceSwap: IFeatureTemplate = {
    id: 'shoot-face-swap',
    name: '智能换脸',
    description: '一键更换模特脸的五官',
    icon: '😊',
    category: 'shoot',
    mode: 'img2img',
    prompt: '保持人物的姿态、发型、服装和背景完全不变，仅更换面部的五官，生成自然逼真的新面孔，面部光影与肤色和原图协调，表情自然，高清写实，看不出替换痕迹。',
    negativePrompt: '面部变形、五官错位、肤色断层、恐怖谷、模糊',
    recommendedModel: 'gpt-image-2.5-flare',
    customModels: ['gpt-image-2.5-flare', 'gpt-image-2', 'nano-banana-2'],
    params: { ratio: '2K · 3:4 竖版 · 1536×2048', quality: 'XHigh（超高精度）', imageCount: 4 },
    requiresImage: true,
    steps: ['上传人物照片', 'AI 定位面部关键点', '生成新的自然五官', '输出多张换脸效果'],
  };
