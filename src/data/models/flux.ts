import type { IModel } from '../models';

/** FLUX / 自定义兼容接口 系列模型 */
export const fluxModels: IModel[] = [
  {
    id: 'flux-1.1-pro',
    name: 'FLUX.1.1 Pro',
    apiSource: '自定义兼容接口',
    apiType: 'custom',
    resolutions: [
      '1K · 1:1 正方形 · 1024×1024',
      '1K · 3:4 竖版 · 768×1024',
      '1K · 4:3 横版 · 1024×768',
      '1K · 9:16 竖屏 · 832×1216',
      '1K · 16:9 宽屏 · 1216×832',
      '1.4K · 1:1 高清 · 1408×1408',
      ],
    qualities: [
'Standard',
'High',
'Quality（质量优先）',
],
    isActive: true,
    isCustom: false,
  },
  {
    id: 'flux-1-dev',
    name: 'FLUX.1 Dev',
    apiSource: '自定义兼容接口',
    apiType: 'custom',
    resolutions: [
      '1K · 1:1 正方形 · 1024×1024',
      '0.5K · 1:1 标清 · 512×512',
      '1K · 3:4 竖版 · 768×1024',
      '1K · 4:3 横版 · 1024×768',
      ],
    qualities: [
'Standard',
'High',
],
    isActive: true,
    isCustom: false,
  },
  {
    id: 'flux-1-schnell',
    name: 'FLUX.1 Schnell',
    apiSource: '自定义兼容接口',
    apiType: 'custom',
    resolutions: [
      '1K · 1:1 正方形 · 1024×1024',
      '1K · 3:4 竖版 · 768×1024',
      '1K · 4:3 横版 · 1024×768',
      ],
    qualities: [
'Standard（快速）',
],
    isActive: true,
    isCustom: false,
  },
];
