import type { IFeatureTemplate } from '../types';

export const shootTryon: IFeatureTemplate = {
    id: 'shoot-tryon',
    name: '款式上身',
    description: '服装图一键上身试穿',
    icon: '👕',
    category: 'shoot',
    mode: 'img2img',
    prompt: '以参考图中的模特照片为底图，保持模特的面部、身材、姿势、发型、场景背景完全不变；仅将模特身上的服装替换为另一张参考图中的服装款式，保持该服装的颜色、图案、材质细节完全不变，服装自然贴合模特身体、版型垂坠，影棚商业摄影灯光，高清电商主图质感。',
    negativePrompt: '服装变形、图案错乱、多余肢体、手指变形、水印、文字、低质量、模糊',
    recommendedModel: 'gpt-image-2',
    customModels: ['gpt-image-2', 'gpt-image-2.5-flare', 'jimeng-5.0', 'seedream-5.0-lite', 'nano-banana-2'],
    params: { ratio: '2K · 3:4 竖版 · 1536×2048', quality: 'High（高质量）', imageCount: 4 },
    requiresImage: true,
    referenceSlots: [
      { id: 'style', label: '上传款式', icon: '👕', hint: '平铺图 / 挂拍图 / 白底单品' },
      { id: 'model', label: '上传模特', icon: '💃', hint: '模特图 / 场景图' },
    ],
    steps: ['上传服装图（平铺/挂拍/白底单品均可）', 'AI 识别服装轮廓与面料细节', '图生图模型将服装穿到虚拟模特身上', '输出多张上身效果图'],
  };
