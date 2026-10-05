const MAX_SIDE = 1600;
const QUALITY = 0.82;

async function decode(file) {
  if ('createImageBitmap' in window) {
    try {
      // Поворот по EXIF (фото с телефона) учитывается автоматически
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      /* ниже — запасной вариант через <img> */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

// Уменьшает фото до MAX_SIDE по большей стороне и пережимает в JPEG (3–5 МБ → ~300 КБ)
export async function compressImage(file) {
  const img = await decode(file);
  const w = img.width;
  const h = img.height;
  const scale = Math.min(1, MAX_SIDE / Math.max(w, h));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff'; // прозрачный PNG не станет чёрным в JPEG
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  img.close?.();
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', QUALITY));
  if (!blob) throw new Error('не удалось обработать изображение');
  return blob;
}
