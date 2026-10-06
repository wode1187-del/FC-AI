import type { IFeatureTemplate } from '../types';

export const videoLibrary: IFeatureTemplate = {
    id: 'video-library',
    name: '我的视频',
    description: '快捷管理视频资产',
    icon: '🗂️',
    category: 'video',
    mode: 'library',
    prompt: '',
    negativePrompt: '',
    recommendedModel: 'kling-v3',
    params: { ratio: '16:9 横屏', quality: '1080P 高清', imageCount: 1, duration: 5 },
    requiresImage: false,
    steps: ['查看历史生成的视频', '预览、下载、管理视频资产'],
  };
