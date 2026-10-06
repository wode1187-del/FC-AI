import type { IFeatureTemplate } from '../types';

export const designFabric: IFeatureTemplate = {
    id: 'design-fabric',
    name: '面料上身',
    description: '替换图案or面料，预览上身效果',
    icon: '🧵',
    category: 'design',
    mode: 'img2img',
    prompt: '将上传的面料或图案应用到服装款式上，面料纹理、图案印花贴合服装版型自然垂坠，褶皱处图案跟随变形自然，保持服装结构不变，模特上身或平铺展示，商业设计预览图质感，高清细节。',
    negativePrompt: '图案错乱、生硬贴图、版型变形、模糊',
    recommendedModel: 'nano-banana-2',
    customModels: ['nano-banana-2', 'gpt-image-2', 'seedream-5.0-lite'],
    params: { ratio: '2K · 3:4 竖版 · 1792×2400', quality: 'PNG 无损（推荐）', imageCount: 4 },
    requiresImage: true,
    steps: ['上传款式图 + 面料/图案图', 'AI 提取面料纹理', '贴合版型应用到服装', '输出上身效果预览'],
  };
