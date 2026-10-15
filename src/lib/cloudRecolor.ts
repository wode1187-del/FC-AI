// 独立「云端精准换色」——与「本地精确换色」完全分离
// 云端蒙版来源：可配置的 OpenAI 兼容分割端点（默认火山方舟 SAM2.1 视觉提示分割）
// 流程：云端模型根据原图生成精确衣服 mask → 本地对 mask 内做「保留明度·只改色相」换色（不重绘纹理）
// 配置存于 localStorage（fc_ai_cloud_recolor_v1），在 API 配置页「云端换色」填写，密钥只存本地。
export interface CloudRecolorConfig {
  id: string;
  name: string; // 显示名，如「方舟 SAM2.1」
  baseUrl: string; // OpenAI 兼容端点，如 https://ark.cn-beijing.volces.com/api/v3
  apiKey: string; // ARK_API_KEY 或等价 key
  model: string; // 分割模型 id
  point: { x: number; y: number } | null; // 提示点，null=自动
  active?: boolean; // 是否作为当前默认使用
}
const CFG_KEY = 'fc_ai_cloud_recolor_v1';
function genId() { return 'cr_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7); }
function normalize(raw: unknown): CloudRecolorConfig[] {
  if (Array.isArray(raw)) return raw.filter((c) => c && typeof c === 'object').map((c) => ({ ...(c as CloudRecolorConfig), point: (c as CloudRecolorConfig).point ?? null }));
  if (raw && typeof raw === 'object' && 'baseUrl' in (raw as object)) {
    // 兼容旧版单条对象 → 转数组
    const o = raw as CloudRecolorConfig;
    return [{ id: o.id ?? genId(), name: o.name ?? '云端 API 1', baseUrl: o.baseUrl ?? '', apiKey: o.apiKey ?? '', model: o.model ?? '', point: o.point ?? null, active: true }];
  }
  return [];
}
export function getCloudRecolorConfigs(): CloudRecolorConfig[] {
  try { const r = localStorage.getItem(CFG_KEY); return r ? normalize(JSON.parse(r)) : []; }
  catch { return []; }
}
export function saveCloudRecolorConfigs(list: CloudRecolorConfig[]) { localStorage.setItem(CFG_KEY, JSON.stringify(list)); }
export function getActiveCloudRecolorConfig(): CloudRecolorConfig | null {
  const list = getCloudRecolorConfigs();
  return list.find((c) => c.active) ?? list[0] ?? null;
}
export function getCloudRecolorConfig(): CloudRecolorConfig | null { return getActiveCloudRecolorConfig(); }
export function addCloudRecolorConfig(): CloudRecolorConfig {
  const c: CloudRecolorConfig = { id: genId(), name: '云端 API ' + (getCloudRecolorConfigs().length + 1), baseUrl: 'https://ark.cn-beijing.volces.com/api/v3', apiKey: '', model: '', point: null };
  const list = getCloudRecolorConfigs(); list.push(c); saveCloudRecolorConfigs(list); return c;
}
export function removeCloudRecolorConfig(id: string) { saveCloudRecolorConfigs(getCloudRecolorConfigs().filter((c) => c.id !== id)); }
export function setActiveCloudRecolorConfig(id: string) { saveCloudRecolorConfigs(getCloudRecolorConfigs().map((c) => ({ ...c, active: c.id === id }))); }

// —— HSL 工具（独立实现，不复用本地换色模块，保证两功能完全隔离）——
function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0; const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      default: h = (r - g) / d + 4;
    }
    h /= 6;
  }
  return [h, s, l];
}
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  let r = 0, g = 0, b = 0;
  if (s === 0) { r = g = b = l; }
  else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    const f = (t: number) => {
      t = (t + 1) % 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    r = f(h + 1 / 3); g = f(h); b = f(h - 1 / 3);
  }
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

function dataUrlToImageData(url: string): Promise<ImageData> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = img.width; c.height = img.height;
      const ctx = c.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      resolve(ctx.getImageData(0, 0, c.width, c.height));
    };
    img.onerror = () => reject(new Error('云端返回的 mask 图像无法解析'));
    img.src = url;
  });
}

/** 调用云端分割端点，返回衣服 mask（ImageData，alpha=255 为衣服区域） */
async function cloudSegmentMask(dataUrl: string, cfg: CloudRecolorConfig, customPrompt?: string): Promise<ImageData> {
  const base = cfg.baseUrl.replace(/\/$/, '');
  // 指令：优先用用户自定义识别指令（可含 {point} 占位符），否则用默认
  const pointText = cfg.point ? `提示点坐标为(${cfg.point.x}, ${cfg.point.y})，以该点所属物体为分割目标。` : '自动识别图中主要衣物。';
  let prompt: string;
  if (customPrompt && customPrompt.trim()) {
    prompt = customPrompt.trim().replace(/\{point\}/g, cfg.point ? `(${cfg.point.x}, ${cfg.point.y})` : '自动');
  } else {
    prompt = [
      '请分割图中人物的衣物区域（上衣/裙子/裤子/连衣裙等），只保留衣服，不包含脸、手、皮肤、头发、背景。',
      pointText,
      '请仅输出一张 PNG mask 图（白色=衣服区域，黑色=非衣服），base64 编码，不要输出任何其他内容。',
    ].join('');
  }
  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` },
    body: JSON.stringify({
      model: cfg.model,
      messages: [{ role: 'user', content: [{ type: 'text', text: prompt }, { type: 'image_url', image_url: { url: dataUrl } }] }],
      max_tokens: 4096,
    }),
  });
  if (!res.ok) throw new Error(`云端分割请求失败 HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const json = await res.json();
  const content: string = json?.choices?.[0]?.message?.content ?? '';
  let maskUrl: string | null = null;
  // 1) 直接是 base64 图像
  if (/^data:image|^\/9j|^iVBOR/i.test(content.trim())) maskUrl = content.trim();
  // 2) JSON 内 mask_base64 / image / image_url
  try {
    const obj = JSON.parse(content);
    if (obj?.mask_base64) maskUrl = `data:image/png;base64,${obj.mask_base64}`;
    else if (obj?.image_url) maskUrl = obj.image_url;
    else if (obj?.image) maskUrl = typeof obj.image === 'string' ? obj.image : (obj.image?.url ?? null);
  } catch { /* content 非 JSON，走直接 base64 判断 */ }
  if (!maskUrl) {
    const seg = content.match(/data:image\/[a-z+]+;base64,[A-Za-z0-9+/=]+/i)?.[0]
      ?? content.match(/https?:\/\/\S+/)?.[0] ?? null;
    maskUrl = seg;
  }
  if (!maskUrl) throw new Error('云端未返回可识别的 mask，请检查模型配置或换一个支持分割的端点/模型');
  return dataUrlToImageData(maskUrl);
}

/** 云端精准换色：云端衣服 mask + 保明度色相旋转（独立实现） */
export async function runCloudRecolor(image: ImageData, targetHex: string, cfg: CloudRecolorConfig, customPrompt?: string): Promise<ImageData> {
  // 转 dataUrl 发给云端（长边限 2048，控制请求体积）
  const c = document.createElement('canvas');
  const max = 2048;
  const scale = Math.min(1, max / Math.max(image.width, image.height));
  c.width = Math.round(image.width * scale);
  c.height = Math.round(image.height * scale);
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(
    (() => { const s = document.createElement('canvas'); s.width = image.width; s.height = image.height; s.getContext('2d')!.putImageData(image, 0, 0); return s; })(),
    0, 0, c.width, c.height,
  );
  const dataUrl = c.toDataURL('image/jpeg', 0.92);
  const mask = await cloudSegmentMask(dataUrl, cfg, customPrompt);
  // mask 对齐到原图尺寸
  const maskC = document.createElement('canvas');
  maskC.width = mask.width; maskC.height = mask.height;
  maskC.getContext('2d')!.putImageData(mask, 0, 0);
  const big = document.createElement('canvas');
  big.width = image.width; big.height = image.height;
  const bigCtx = big.getContext('2d', { willReadFrequently: true })!;
  bigCtx.drawImage(maskC, 0, 0, big.width, big.height);
  const md = bigCtx.getImageData(0, 0, big.width, big.height).data;
  const [tr, tg, tb] = hexToRgb(targetHex);
  const targetHue = rgbToHsl(tr, tg, tb)[0];
  const out = new ImageData(image.width, image.height);
  const od = out.data;
  const src = image.data;
  for (let i = 0; i < src.length; i += 4) {
    const alpha = md[i + 3] / 255;
    od[i + 3] = src[i + 3];
    if (alpha <= 0.02) { od[i] = src[i]; od[i + 1] = src[i + 1]; od[i + 2] = src[i + 2]; continue; }
    const r = src[i], g = src[i + 1], b = src[i + 2];
    const [, s, l] = rgbToHsl(r, g, b);
    const sEff = Math.max(s, 0.42);
    const [nr, ng, nb] = hslToRgb(targetHue, sEff, l);
    const a = alpha;
    od[i] = Math.round(nr * a + r * (1 - a));
    od[i + 1] = Math.round(ng * a + g * (1 - a));
    od[i + 2] = Math.round(nb * a + b * (1 - a));
  }
  return out;
}
