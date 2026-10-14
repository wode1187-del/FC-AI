import { MODEL_RESOLUTIONS } from '../../data/models';

/** 从 ratio 字符串中解析宽高，如 "2K · 3:4 竖版 · 1536×2048" → { width: 1536, height: 2048 } */
export function parseSizeFromRatio(ratioStr: string): { width: number; height: number } {
  const match = ratioStr.match(/(\d+)\s*[×xX]\s*(\d+)/);
  if (match) {
    return { width: parseInt(match[1], 10), height: parseInt(match[2], 10) };
  }
  return { width: 1024, height: 1024 };
}

/** 获取真实模型 ID（去掉 api-{type}_ 前缀，如 api-openai_ / api-custom-1_） */
export function getRealModelId(modelId: string): string {
  const match = modelId.match(/^api-[^_]+_(.+)$/);
  if (match) return match[1];
  return modelId;
}

/** 按模型名称模糊匹配对应的预设参数 key（支持带 api-{type}_ 前缀的 ID） */
export function matchModelPresetKey(modelIdOrName: string): string | null {
  const lower = modelIdOrName.toLowerCase().replace(/_/g, '-');
  let baseId = lower;
  const match2 = lower.match(/^api-[^-]+-(.+)$/);
  if (match2) {
    baseId = match2[1];
    if (MODEL_RESOLUTIONS[baseId]) return baseId;
    const match3 = lower.match(/^api-[^-]+-[^-]+-(.+)$/);
    if (match3) {
      baseId = match3[1];
      if (MODEL_RESOLUTIONS[baseId]) return baseId;
    }
  }
  if (MODEL_RESOLUTIONS[lower]) return lower;
  // 模糊匹配 —— 更具体的放前面
  if (lower.includes('seedream-v5-pro') || lower.includes('seedream-v5-flash') || lower.includes('seedream-5.0-pro') || lower.includes('seedream-5-pro') || lower.includes('seedream5-pro')) return 'seedream-5.0-pro';
  if (lower.includes('seedream-v5-lite') || lower.includes('seedream-5.0-lite') || lower.includes('seedream-5-lite') || lower.includes('seedream5-lite')) return 'seedream-5.0-lite';
  if (lower.includes('seedream')) return 'seedream-5.0-lite';
  if (lower.includes('qwen-image-3') || lower.includes('qwen-image3') || lower.includes('qwen-image-3.0')) return 'qwen-image-3';
  if (lower.includes('qwen-image')) return 'qwen-image-3';
  if (lower.includes('gemini-3.1-pro') || lower.includes('gemini-3-pro') || lower.includes('gemini3pro')) return 'gemini-3.1-pro-image';
  if (lower.includes('gemini-3.1-flash') || lower.includes('gemini-3-flash') || lower.includes('gemini3flash')) return 'nano-banana-2';
  if (lower.includes('nano-banana') || lower.includes('nanobanana') || lower.includes('爆炸香蕉')) return 'nano-banana-2';
  if (lower.includes('gemini')) return 'nano-banana-2';
  if (lower.includes('gpt-image-2.5-flare') || lower.includes('gpt-image-2-5-flare') || lower.includes('2.5-flare')) return 'gpt-image-2.5-flare';
  if (lower.includes('gpt-image-2.5-sunburst') || lower.includes('gpt-image-2-5-sunburst') || lower.includes('2.5-sunburst')) return 'gpt-image-2.5-sunburst';
  if (lower.includes('gpt-image-2.5') || lower.includes('gpt-image-2-5')) return 'gpt-image-2.5-flare';
  if (lower.includes('gpt-image')) return 'gpt-image-2';
  if (lower.includes('jimeng') || lower.includes('ji-meng') || lower.includes('即梦')) return 'jimeng-5.0';
  if (lower.includes('flux-1.1-pro') || lower.includes('flux-1-1-pro') || lower.includes('flux1.1pro')) return 'flux-1.1-pro';
  if (lower.includes('flux-2-') || lower.includes('flux-2.') || lower.includes('flux2') || lower.includes('flux-2')) return 'flux-2';
  if (lower.includes('flux-1-dev') || lower.includes('flux-1.dev') || lower.includes('flux-dev')) return 'flux-1-dev';
  if (lower.includes('flux-1-schnell') || lower.includes('flux-1.schnell') || lower.includes('flux-schnell')) return 'flux-1-schnell';
  if (lower.includes('flux-kontext') || lower.includes('flux-context') || lower.includes('kontext') || lower.includes('context')) return 'flux-kontext';
  if (lower.includes('seededit')) return 'doubao-seededit-3.0-i2i';
  if (lower.includes('inpaint')) return 'mj-inpaint';
  if (lower.includes('flux')) return 'flux-1.1-pro';
  if (lower.includes('wan-2.7-global-i2i-pro') || lower.includes('wan2.7-i2i-pro')) return 'wan-2.7-global-i2i-pro';
  if (lower.includes('wan-2.7-global-i2i') || lower.includes('wan2.7-i2i')) return 'wan-2.7-global-i2i';
  if (lower.includes('wan-2.7-global-t2i') || lower.includes('wan2.7-t2i')) return 'wan-2.7-global-t2i';
  if (lower.includes('wan')) return 'wan-2.7-global-i2i';
  if (lower.includes('grok-imagine-image-2.0') || lower.includes('grok-imagine-2') || lower.includes('grok2')) return 'grok-imagine-image-2.0';
  if (lower.includes('grok-imagine') || lower.includes('grok')) return 'grok-imagine-image-2.0';
  return null;
}

/** 递归从响应数据中提取模型数组（支持多种 OpenAI 兼容格式） */
export function extractModelsFromResponse(data: unknown): any[] {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  if (typeof data !== 'object') return [];

  const obj = data as Record<string, unknown>;
  const candidates = ['data', 'models', 'model_list', 'list', 'items', 'result', 'data.data'];
  for (const key of candidates) {
    if (Array.isArray(obj[key])) return obj[key] as any[];
  }
  if (obj.data && typeof obj.data === 'object') {
    const nested = extractModelsFromResponse(obj.data);
    if (nested.length > 0) return nested;
  }
  for (const key of Object.keys(obj)) {
    if (Array.isArray(obj[key])) return obj[key] as any[];
  }
  return [];
}

/** 从响应中提取分页信息 */
export function extractPaginationInfo(data: unknown): { hasMore: boolean; nextPage?: string | number | null; total?: number } {
  if (!data || typeof data !== 'object') return { hasMore: false };
  const obj = data as Record<string, unknown>;
  const hasMore = Boolean(
    obj.has_more ?? obj.hasMore ?? obj.hasNext ?? obj.has_next ?? false,
  );
  const nextPage = (obj.next_page ?? obj.nextPage ?? obj.after ?? obj.nextCursor ?? obj.page_token) as string | number | null | undefined;
  const total = typeof obj.total === 'number' ? obj.total : typeof obj.total_count === 'number' ? obj.total_count : undefined;
  return { hasMore, nextPage, total };
}

/** 从模型项中提取 id 和 name（兼容多种字段格式） */
export function extractModelInfo(item: any): { id: string; name: string } | null {
  if (!item || typeof item !== 'object') return null;
  const id = String(item.id ?? item.model ?? item.model_id ?? item.modelId ?? '').trim();
  if (!id) return null;
  const name = String(item.name ?? item.model_name ?? item.display_name ?? item.displayName ?? id).trim();
  return { id, name };
}

/** 按模型名称/ID 模糊匹配内置预设 key */
export function matchPresetKeyForModel(modelId: string, modelName: string): string {
  const lower = `${modelId} ${modelName}`.toLowerCase().replace(/_/g, '-');
  if (MODEL_RESOLUTIONS[modelId]) return modelId;
  if (lower.includes('seedream-v5-pro') || lower.includes('seedream-v5-flash') || lower.includes('seedream-5.0-pro') || lower.includes('seedream-5-pro') || lower.includes('seedream5-pro')) return 'seedream-5.0-pro';
  if (lower.includes('seedream-v5-lite') || lower.includes('seedream-5.0-lite') || lower.includes('seedream-5-lite') || lower.includes('seedream5-lite')) return 'seedream-5.0-lite';
  if (lower.includes('seedream')) return 'seedream-5.0-lite';
  if (lower.includes('qwen-image-3') || lower.includes('qwen-image3') || lower.includes('qwen-image-3.0')) return 'qwen-image-3';
  if (lower.includes('qwen-image')) return 'qwen-image-3';
  if (lower.includes('gemini-3.1-pro') || lower.includes('gemini-3-pro')) return 'gemini-3.1-pro-image';
  if (lower.includes('gemini-3.1-flash') || lower.includes('gemini-3-flash')) return 'nano-banana-2';
  if (lower.includes('nano-banana') || lower.includes('nanobanana') || lower.includes('爆炸香蕉')) return 'nano-banana-2';
  if (lower.includes('gemini')) return 'nano-banana-2';
  if (lower.includes('gpt-image')) return 'gpt-image-2';
  if (lower.includes('jimeng') || lower.includes('ji-meng') || lower.includes('即梦')) return 'jimeng-5.0';
  if (lower.includes('flux-1-1-pro') || lower.includes('flux-1.1-pro') || lower.includes('flux1.1pro')) return 'flux-1.1-pro';
  if (lower.includes('flux-2-') || lower.includes('flux-2.') || lower.includes('flux2') || lower.includes('flux-2')) return 'flux-2';
  if (lower.includes('flux-1-dev') || lower.includes('flux-1.dev') || lower.includes('flux-dev')) return 'flux-1-dev';
  if (lower.includes('flux-1-schnell') || lower.includes('flux-1.schnell') || lower.includes('flux-schnell')) return 'flux-1-schnell';
  if (lower.includes('flux-kontext') || lower.includes('flux-context') || lower.includes('kontext') || lower.includes('context')) return 'flux-kontext';
  if (lower.includes('seededit')) return 'doubao-seededit-3.0-i2i';
  if (lower.includes('inpaint')) return 'mj-inpaint';
  if (lower.includes('flux')) return 'flux-1.1-pro';
  return 'flux-1.1-pro';
}
