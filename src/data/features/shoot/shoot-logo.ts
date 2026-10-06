import type { IFeatureTemplate } from '../types';

export const shootLogo: IFeatureTemplate = {
    id: 'shoot-logo',
    name: 'Logo添加',
    description: '为商品图添加品牌Logo',
    icon: '🏷️',
    category: 'shoot',
    mode: 'img2img',
    prompt: '在上传的商品图合适位置（衣领、胸口、袖口、标签处）添加一个精致低调的品牌 Logo 刺绣/印花，Logo 融入服装材质与光影，自然不突兀，保持商品其他部分完全不变，商业摄影质感，高清细节。',
    negativePrompt: 'Logo 变形、文字乱码、突兀贴图感、模糊',
    recommendedModel: 'gpt-image-2',
    params: { ratio: '2K · 1:1 正方形 · 2048×2048', quality: 'High（高质量）', imageCount: 4 },
    requiresImage: true,
    steps: ['上传商品图', 'AI 定位 Logo 添加位置', '生成融入面料的品牌标识', '输出多张带 Logo 效果'],
  };
