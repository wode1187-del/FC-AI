import type { IFeatureTemplate } from '../types';

export const shootIron: IFeatureTemplate = {
    id: 'shoot-iron',
    name: '衣服去皱',
    description: '一键去除服装褶皱',
    icon: '🧺',
    category: 'shoot',
    mode: 'img2img',
    prompt: '把人物的穿的衣服褶皱去除，同时百分百保留衣服质感。禁止改变衣服颜色，禁止改变人物颜色，禁止皮肤偏色，禁止图片偏色。禁止改变衣服布料材质。',
    negativePrompt: '残留褶皱、变形、纹理丢失、模糊',
    tryonTypes: [
      { id: 'full', label: '全身', icon: '🧥', prompt: '把人物的穿的衣服褶皱去除，同时百分百保留衣服质感。禁止改变衣服颜色，禁止改变人物颜色，禁止皮肤偏色，禁止图片偏色。禁止改变衣服布料材质。' },
      { id: 'top', label: '上衣', icon: '👕', prompt: '把人物的衣服褶皱去除，同时高度保留衣服质感。禁止改变衣服颜色，禁止改变人物颜色，禁止皮肤偏色，禁止图片偏色。禁止改变衣服材质。' },
      { id: 'pants', label: '裤子', icon: '👖', prompt: '把人物的裤子褶皱去除，同时高度保留衣服质感。禁止改变衣服颜色，禁止改变人物颜色，禁止皮肤偏色，禁止图片偏色。禁止改变衣服材质。' },
      { id: 'skirt', label: '裙子', icon: '👗', prompt: '把人物的裙子褶皱去除，同时高度保留裙子质感。禁止改变衣服颜色，禁止改变人物颜色，禁止皮肤偏色，禁止图片偏色。禁止改变衣服布料材质。' },
      { id: 'upper', label: '上装', icon: '👔', prompt: '针对上装区域去皱：把人物的上装褶皱去除，同时高度保留衣服质感。严禁衣服变色，严禁皮肤变色，严禁背景变色，严禁改变服装材质。只处理上半身服装区域，下半身及背景完全不动。' },
      { id: 'lower', label: '下装', icon: '🩳', prompt: '针对下装区域去皱：把人物的下装褶皱去除，同时高度保留衣服质感。严禁衣服变色，严禁皮肤变色，严禁背景变色，严禁改变服装材质。只处理下半身裤/裙区域，上半身及背景完全不动。' },
    ],
    recommendedModel: 'nano-banana-2',
    customModels: ['nano-banana-2', 'gpt-image-2', 'gpt-image-2.5-flare'],
    params: { ratio: '2K · 1:1 正方形 · 2048×2048', quality: 'PNG 无损（推荐）', imageCount: 4 },
    requiresImage: true,
    steps: ['上传带褶皱的服装图', 'AI 识别褶皱区域', '非破坏编辑抹平褶皱', '输出平整服装图'],
  };
