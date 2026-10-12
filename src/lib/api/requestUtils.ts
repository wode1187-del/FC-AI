/** 标准 OpenAI 尺寸（当 size 不支持时降级使用） */
export const STANDARD_SIZES = ['1024x1024', '1024x1792', '1792x1024'];

/** 找最接近的标准尺寸 */
export function findClosestStandardSize(w: number, h: number): string {
  const targetRatio = w / h;
  let best = STANDARD_SIZES[0];
  let bestDiff = Infinity;
  for (const sz of STANDARD_SIZES) {
    const [sw, sh] = sz.split('x').map(Number);
    const diff = Math.abs(targetRatio - sw / sh);
    if (diff < bestDiff) { bestDiff = diff; best = sz; }
  }
  return best;
}

/** 请求体降级阶梯：遇到 invalid_request 时依次去掉多余字段 */
export function buildBodyVariants(base: Record<string, unknown>): Array<{ label: string; body: Record<string, unknown> }> {
  const variants: Array<{ label: string; body: Record<string, unknown> }> = [];
  variants.push({ label: '完整请求体', body: { ...base } });

  // 变体2：去掉 response_format（少数 API 不支持此字段）
  if ('response_format' in base) {
    const v = { ...variants[variants.length - 1].body };
    delete v.response_format;
    variants.push({ label: '去掉 response_format', body: v });
  }

  // 变体3：去掉 quality（少数 API 不支持 quality 参数）
  if ('quality' in base) {
    const v = { ...variants[variants.length - 1].body };
    delete v.quality;
    variants.push({ label: '去掉 quality', body: v });
  }

  return variants;
}

/** 解析错误响应文本，提取 code / message */
export function parseErrorDetail(responseText: string): { code?: string; message?: string; full: string } {
  try {
    const parsed = JSON.parse(responseText);
    return {
      code: parsed?.error?.code || parsed?.code || undefined,
      message: parsed?.error?.message || parsed?.message || parsed?.error || undefined,
      full: responseText,
    };
  } catch {
    return { full: responseText };
  }
}

/** 判断是否为 invalid_request 类错误（可安全降级重试） */
export function isInvalidRequestError(status: number, errInfo: ReturnType<typeof parseErrorDetail>): boolean {
  if (errInfo.code === 'invalid_request') return true;
  if (errInfo.code === 'invalid_parameter') return true;
  if (errInfo.code === 'bad_request') return true;
  if (status === 400 || status === 422) return true;
  if (status === 503 && (errInfo.code === 'invalid_request' || (errInfo.message && String(errInfo.message).toLowerCase().includes('invalid')))) {
    return true;
  }
  const lowerFull = errInfo.full.toLowerCase();
  if (lowerFull.includes('invalid_request')) return true;
  if (lowerFull.includes('invalid size')) return true;
  if (lowerFull.includes('unsupported size')) return true;
  if (lowerFull.includes('size must be')) return true;
  if (lowerFull.includes('invalid parameter')) return true;
  return false;
}
