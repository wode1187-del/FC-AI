import type { IModel } from '../models';

export const VIDEO_MODELS: IModel[] = [
  {
    id: 'kling-v3',
    name: 'KLING 3.0（可灵）',
    apiSource: '可灵 AI',
    apiType: 'kling',
    resolutions: ['16:9 横屏', '9:16 竖屏', '1:1 方形'],
    qualities: ['1080P 高清', '720P 标准'],
    isActive: true,
    isCustom: false,
  },
  {
    id: 'kling-v2-6',
    name: 'KLING 2.6（可灵）',
    apiSource: '可灵 AI',
    apiType: 'kling',
    resolutions: ['16:9 横屏', '9:16 竖屏', '1:1 方形'],
    qualities: ['1080P 高清', '720P 标准'],
    isActive: true,
    isCustom: false,
  },
  {
    id: 'doubao-seedance-2.5',
    name: 'SEEDANCE 2.5（即梦）',
    apiSource: '火山方舟',
    apiType: 'seedance',
    resolutions: ['16:9 横屏', '9:16 竖屏', '1:1 方形'],
    qualities: ['1080P 高清', '720P 标准'],
    isActive: true,
    isCustom: false,
  },
];

export function getVideoModelById(id: string): IModel | undefined {
  return VIDEO_MODELS.find(m => m.id === id);
}

/** 是否为视频模型 */
export function isVideoModel(modelId: string): boolean {
  return VIDEO_MODELS.some(m => m.id === modelId);
}

// ⑥ 各视频模型支持的时长范围（秒）：可灵 v3/2.6 官方 5s/10s，即梦 seedance 2.5 支持到 30s
export const VIDEO_MODEL_DURATION: Record<string, { min: number; max: number; presets: number[] }> = {
  'kling-v3': { min: 5, max: 10, presets: [5, 10] },
  'kling-v2-6': { min: 5, max: 10, presets: [5, 10] },
  'doubao-seedance-2.5': { min: 4, max: 30, presets: [5, 10, 15, 30] },
};

/** 取某视频模型的时长上限（默认 15s 兜底） */
export function getVideoDurationLimit(modelId: string): { min: number; max: number; presets: number[] } {
  return VIDEO_MODEL_DURATION[modelId] || { min: 3, max: 15, presets: [3, 5, 10, 15] };
}
