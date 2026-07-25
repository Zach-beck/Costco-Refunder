import sharp from "sharp";

export interface PreprocessResult {
  buffer: Buffer;
  width: number;
  height: number;
}

/**
 * Preprocess a receipt image for optimal OCR accuracy.
 * Converts to grayscale, applies thresholding, and normalizes dimensions.
 */
export async function preprocessReceiptImage(
  input: Buffer | string
): Promise<PreprocessResult> {
  const image = sharp(input);
  const metadata = await image.metadata();

  let pipeline = image
    .grayscale()
    .normalize()
    .sharpen({ sigma: 1.5 })
    .threshold(140);

  // Upscale if too small (Tesseract works best at 300+ DPI equivalent)
  const width = metadata.width ?? 0;
  if (width < 1000) {
    const scale = Math.ceil(1000 / width);
    pipeline = pipeline.resize(width * scale, undefined, {
      kernel: "lanczos3",
    });
  }

  // Ensure reasonable max size to prevent memory issues
  if (width > 4000) {
    pipeline = pipeline.resize(4000, undefined, {
      kernel: "lanczos3",
      withoutEnlargement: true,
    });
  }

  const outputBuffer = await pipeline.png().toBuffer();
  const outputMeta = await sharp(outputBuffer).metadata();

  return {
    buffer: outputBuffer,
    width: outputMeta.width ?? 0,
    height: outputMeta.height ?? 0,
  };
}

/**
 * Auto-crop to receipt boundaries by detecting the largest contiguous region.
 * Falls back to full image if detection fails.
 */
export async function autoCropReceipt(
  input: Buffer | string
): Promise<Buffer> {
  try {
    const trimmed = await sharp(input).trim({ threshold: 30 }).toBuffer();
    return trimmed;
  } catch {
    // trim() can fail on certain images; return original
    return Buffer.isBuffer(input) ? input : await sharp(input).toBuffer();
  }
}
