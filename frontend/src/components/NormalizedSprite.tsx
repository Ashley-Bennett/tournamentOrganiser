import { useEffect, useRef } from "react";

interface CropRect {
  x: number;
  y: number;
  w: number;
  h: number;
  naturalW: number;
  naturalH: number;
}

// Cache crop results per URL so each sprite is only analysed once per session.
const cropCache = new Map<string, CropRect>();

function analyseCrop(src: string): Promise<CropRect> {
  const cached = cropCache.get(src);
  if (cached) return Promise.resolve(cached);

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const { naturalWidth: w, naturalHeight: h } = img;
      const offscreen = document.createElement("canvas");
      offscreen.width = w;
      offscreen.height = h;
      const ctx = offscreen.getContext("2d")!;
      ctx.drawImage(img, 0, 0);
      const data = ctx.getImageData(0, 0, w, h).data;

      let minX = w, minY = h, maxX = 0, maxY = 0;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          if (data[(y * w + x) * 4 + 3] > 10) {
            if (x < minX) minX = x;
            if (y < minY) minY = y;
            if (x > maxX) maxX = x;
            if (y > maxY) maxY = y;
          }
        }
      }

      const rect: CropRect = {
        x: minX,
        y: minY,
        w: maxX - minX + 1,
        h: maxY - minY + 1,
        naturalW: w,
        naturalH: h,
      };
      cropCache.set(src, rect);
      resolve(rect);
    };
    img.onerror = () => {
      // Fallback: treat entire image as the crop.
      const rect: CropRect = { x: 0, y: 0, w: 96, h: 96, naturalW: 96, naturalH: 96 };
      cropCache.set(src, rect);
      resolve(rect);
    };
    img.src = src;
  });
}

interface Props {
  src: string;
  size: number;
}

export default function NormalizedSprite({ src, size }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let cancelled = false;
    analyseCrop(src).then((crop) => {
      if (cancelled) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const scale = size / Math.max(crop.w, crop.h);
      const drawW = crop.w * scale;
      const drawH = crop.h * scale;

      ctx.clearRect(0, 0, size, size);
      ctx.imageSmoothingEnabled = false;

      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        if (cancelled) return;
        ctx.clearRect(0, 0, size, size);
        ctx.drawImage(
          img,
          crop.x, crop.y, crop.w, crop.h,
          (size - drawW) / 2, (size - drawH) / 2, drawW, drawH,
        );
      };
      img.src = src;
    });
    return () => { cancelled = true; };
  }, [src, size]);

  return (
    <canvas
      ref={canvasRef}
      width={size}
      height={size}
      style={{ display: "block" }}
    />
  );
}
