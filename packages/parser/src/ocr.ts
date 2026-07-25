import Tesseract from "tesseract.js";

export interface OcrResult {
  text: string;
  lines: OcrLine[];
  confidence: number;
}

export interface OcrLine {
  text: string;
  confidence: number;
  bbox: { x0: number; y0: number; x1: number; y1: number };
}

let worker: Tesseract.Worker | null = null;

async function getWorker(): Promise<Tesseract.Worker> {
  if (!worker) {
    worker = await Tesseract.createWorker("eng", 1, {
      logger: () => {},
    });
    await worker.setParameters({
      tessedit_pageseg_mode: Tesseract.PSM.SINGLE_BLOCK,
      tessedit_char_whitelist:
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 .,$/-@#*()&%",
    });
  }
  return worker;
}

export async function performOcr(imageBuffer: Buffer): Promise<OcrResult> {
  const w = await getWorker();
  const result = await w.recognize(imageBuffer);

  const lines: OcrLine[] = [];

  for (const block of result.data.blocks ?? []) {
    for (const paragraph of block.paragraphs ?? []) {
      for (const line of paragraph.lines ?? []) {
        lines.push({
          text: line.text.trim(),
          confidence: line.confidence / 100,
          bbox: line.bbox,
        });
      }
    }
  }

  return {
    text: result.data.text,
    lines,
    confidence: result.data.confidence / 100,
  };
}

export async function terminateOcr(): Promise<void> {
  if (worker) {
    await worker.terminate();
    worker = null;
  }
}
