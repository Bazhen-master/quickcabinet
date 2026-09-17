import { createId } from '../shared/ids';
import type { ProjectSketch } from '../domain/sketch';

// Sketches live inside the project JSON (and localStorage), so keep them reasonably small.
const MAX_SIDE_PX = 2000;
const JPEG_QUALITY = 0.86;

export function pickImageFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.addEventListener('cancel', () => resolve(null));
    input.click();
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Could not decode image'));
    image.src = src;
  });
}

export async function createSketchFromFile(file: File): Promise<ProjectSketch> {
  const url = URL.createObjectURL(file);
  try {
    const image = await loadImage(url);
    const scale = Math.min(1, MAX_SIDE_PX / Math.max(image.naturalWidth, image.naturalHeight));
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas is unavailable');
    // Flatten transparency onto white: drawings are usually dark lines on a light background.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(image, 0, 0, width, height);
    return {
      id: createId('sketch'),
      // Generic names (pasted "image", clipboard GUIDs) are replaced with "Эскиз N" by the store.
      name: file.name.replace(/\.[^.]+$/, ''),
      dataUrl: canvas.toDataURL('image/jpeg', JPEG_QUALITY),
      width,
      height,
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}
