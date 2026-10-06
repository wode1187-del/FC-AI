import type { IFeatureTemplate } from '../types';

export const shootShoes: IFeatureTemplate = {
    id: 'shoot-shoes',
    name: '鞋靴试穿',
    description: '鞋靴图一键上身试穿',
    icon: '👟',
    category: 'shoot',
    mode: 'img2img',
    prompt: '将上传的鞋靴图穿到模特脚上，鞋靴保持颜色、材质、细节完全不变，与模特整体穿搭协调，模特自然站姿或行走姿态，影棚商业摄影，柔和灯光，干净背景，高清细节。',
    negativePrompt: '鞋型变形、多余肢体、模糊、水印、文字',
    recommendedModel: 'gpt-image-2',
    params: { ratio: '2K · 3:4 竖版 · 1536×2048', quality: 'High（高质量）', imageCount: 4 },
    requiresImage: true,
    steps: ['上传鞋靴图', 'AI 识别鞋型与材质', '图生图穿到模特脚上', '输出多张试穿效果'],
  };
