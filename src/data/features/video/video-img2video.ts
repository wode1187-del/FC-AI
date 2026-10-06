import type { IFeatureTemplate } from '../types';

export const videoImg2video: IFeatureTemplate = {
    id: 'video-img2video',
    name: '图生视频',
    description: '上传图片生成商品展示视频',
    icon: '🖼️',
    category: 'video',
    mode: 'img2video',
    prompt: '让上传的商品图片动起来：镜头缓缓推进并围绕商品旋转展示，服装随动作自然摆动，光影柔和，画面流畅稳定，电商商品展示视频质感。',
    negativePrompt: '画面抖动、主体变形、撕裂、模糊',
    recommendedModel: 'kling-v3',
    customModels: ['kling-v3', 'kling-v2-6', 'doubao-seedance-2.5'],
    params: { ratio: '9:16 竖屏', quality: '1080P 高清', imageCount: 1, duration: 5 },
    requiresImage: true,
    steps: ['上传商品图', 'AI 驱动画面动态化', '生成展示视频', '输出 5 秒成片'],
  };
