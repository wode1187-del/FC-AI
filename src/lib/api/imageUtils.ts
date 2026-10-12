import { logger } from '@lark-apaas/client-toolkit-lite';

/** 压缩图片：最长边限制为 maxSize，质量 quality，输出 JPEG。logPrefix 用于生成调试日志前缀 */
export const compressImage = async (file: File, maxSize = 2048, quality = 0.85, logPrefix = ''): Promise<File> => {
  logger.info(`${logPrefix} 🗜️ 开始压缩参考图：原始大小=${(file.size / 1024).toFixed(1)}KB, type=${file.type}`);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      logger.info(`${logPrefix} 🗜️ 原始尺寸: ${width}x${height}`);
      // 等比缩放
      const scale = Math.min(1, maxSize / Math.max(width, height));
      if (scale < 1) {
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        logger.warn(`${logPrefix} 🗜️ canvas 不可用，使用原始文件`);
        resolve(file);
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            resolve(file);
            return;
          }
          const compressedName = file.name.replace(/\.[^.]+$/, '') + '_compressed.jpg';
          const compressedFile = new File([blob], compressedName, { type: 'image/jpeg' });
          logger.info(`${logPrefix} 🗜️ 压缩完成: ${width}x${height}, ${(compressedFile.size / 1024).toFixed(1)}KB ` +
            `(压缩率 ${((1 - compressedFile.size / file.size) * 100).toFixed(1)}%)`);
          resolve(compressedFile);
        },
        'image/jpeg',
        quality,
      );
    };
    img.onerror = () => {
      logger.warn(`${logPrefix} 🗜️ 图片加载失败，使用原始文件`);
      resolve(file);
    };
    img.src = URL.createObjectURL(file);
  });
};

/** File 转 base64 字符串 */
export const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

/** 生成全透明 mask 文件（用于 edits 端点图生图），带简单缓存 */
export const getMaskFile = (cache: { file: File | null }): Promise<File> => {
  if (cache.file) return Promise.resolve(cache.file);
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  return new Promise<File>((resolve) => {
    canvas.toBlob(
      (blob) => {
        const file = new File([blob!], 'mask.png', { type: 'image/png' });
        cache.file = file;
        resolve(file);
      },
      'image/png',
    );
  });
};

/** 用户蒙版 dataURL(base64 PNG，白=重绘) -> File */
export const maskDataUrlToFile = async (dataUrl: string): Promise<File> => {
  const mime = dataUrl.split(';')[0].split(':')[1] || 'image/png';
  const b64 = dataUrl.split(',')[1];
  const byteStr = atob(b64);
  const bytes = new Uint8Array(byteStr.length);
  for (let i = 0; i < byteStr.length; i++) bytes[i] = byteStr.charCodeAt(i);
  return new File([bytes], 'user-mask.png', { type: mime });
};

/** 读取图片文件的原始宽高 */
export const getImageNaturalSize = (file: File): Promise<{ width: number; height: number }> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error('图片尺寸读取失败'));
    img.src = URL.createObjectURL(file);
  });
};

/** 把蒙版缩放为指定尺寸（保持 mask 与 image 严格同尺寸，inpaint 模型必需） */
export const resizeMaskFile = async (file: File, width: number, height: number): Promise<File> => {
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('蒙版图片加载失败'));
    img.src = URL.createObjectURL(file);
  });
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return file;
  ctx.drawImage(img, 0, 0, width, height);
  return await new Promise<File>((resolve) => {
    canvas.toBlob(
      (blob) => resolve(new File([blob!], 'user-mask.png', { type: 'image/png' })),
      'image/png',
    );
  });
};

/** 参考图 URL 转 Blob 工具函数。logPrefix 用于生成调试日志前缀 */
export const imageUrlToBlob = async (url: string, name: string, logPrefix = ''): Promise<File> => {
  logger.info(`${logPrefix} 🖼️ 参考图 URL 类型检测:`, { arg0: url.substring(0, 30), arg1: '...' });
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`参考图加载失败(HTTP ${resp.status})，可能是页面刷新后图片链接已过期，请重新上传参考图`);
  const blob = await resp.blob();
  if (!blob || blob.size === 0) throw new Error('参考图为空文件，请重新上传');
  const ext = name.split('.').pop()?.toLowerCase() || 'png';
  let mime = blob.type;
  if (!mime || mime === 'application/octet-stream') {
    mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 'image/png';
  }
  const file = new File([blob], name || `reference.${ext}`, { type: mime });
  logger.info(`${logPrefix} 🖼️ 参考图转换完成:`, { arg0: file.name, arg1: (file.size / 1024).toFixed(1) + 'KB', arg2: file.type });
  return file;
};
