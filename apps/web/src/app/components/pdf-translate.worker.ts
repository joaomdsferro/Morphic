/* eslint-disable no-restricted-globals */
import {
  buildDirection,
  chunkSegments,
  normalizePageText,
  shouldUseOcr,
  translateSegmentLocally,
  type TranslationDirection,
} from "@/lib/pdf-translation";

type Stage = "extracting" | "translating" | "rendering";

interface StartMessage {
  type: "start";
  dataUrl?: string;
  dataUrlLength?: number;
  base64?: string;
  base64Length?: number;
  byteLength?: number;
  filename?: string;
  sourceUrl?: string;
  jobId: string;
  file?: File;
  bytes?: number[] | Uint8Array;
  buffer?: ArrayBuffer;
  sourceLanguage: "en-us" | "pt-pt";
  targetLanguage: "en-us" | "pt-pt";
  maxPages: number;
}

type WorkerMessage = StartMessage;

interface ProgressMessage {
  type: "progress";
  jobId: string;
  stage: Stage;
  progress: number;
  note?: string;
}

interface DoneMessage {
  type: "done";
  jobId: string;
  outputBuffer: ArrayBuffer;
  sidecarText: string;
  usedOcrPages: number;
  totalPages: number;
}

interface TextSegment {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
}

interface ExtractedPage {
  text: string;
  segments: TextSegment[];
}

interface ErrorMessage {
  type: "error";
  jobId: string;
  message: string;
}

const CACHE_DB = "morphic-pdf-translation-cache";
const CACHE_STORE = "translation-model";
const PDF_HEADER = [0x25, 0x50, 0x44, 0x46, 0x2d]; // %PDF-

async function openDb() {
  return await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(CACHE_DB, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(CACHE_STORE);
    };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

async function getCachedModel(direction: TranslationDirection) {
  const db = await openDb();
  return await new Promise<{ warmedAt: string } | undefined>((resolve, reject) => {
    const tx = db.transaction(CACHE_STORE, "readonly");
    const request = tx.objectStore(CACHE_STORE).get(direction);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result as { warmedAt: string } | undefined);
  });
}

async function setCachedModel(direction: TranslationDirection) {
  const db = await openDb();
  return await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(CACHE_STORE, "readwrite");
    tx.objectStore(CACHE_STORE).put({ warmedAt: new Date().toISOString() }, direction);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function extractPageTexts(bytes: Uint8Array, maxPages: number) {
  const normalizedBytes = normalizePdfBytes(bytes.slice());
  const pdfjs = await importPdfJs();
  const task = pdfjs.getDocument({
    data: normalizedBytes,
    disableWorker: true,
    useWorkerFetch: false,
    isEvalSupported: false,
    worker: null,
  });
  const doc = await task.promise;
  const totalPages = Math.min(doc.numPages, maxPages);
  const pages: ExtractedPage[] = [];

  for (let pageNumber = 1; pageNumber <= totalPages; pageNumber += 1) {
    const page = await doc.getPage(pageNumber);
    const content = await page.getTextContent();
    const lines: string[] = [];
    const segments: TextSegment[] = [];
    const viewport = page.getViewport({ scale: 1 });
    const pageHeight = viewport.height;

    for (const item of content.items as Array<{
      str?: string;
      width?: number;
      height?: number;
      transform?: number[];
    }>) {
      const value = typeof item.str === "string" ? item.str : "";
      if (!value.trim()) continue;
      lines.push(value);

      const transform = item.transform ?? [1, 0, 0, 1, 0, 0];
      const scaleX = Number.isFinite(transform[0]) ? transform[0] : 10;
      const x = Number.isFinite(transform[4]) ? transform[4] : 0;
      const yTop = Number.isFinite(transform[5]) ? transform[5] : 0;
      const fontSize = Math.max(Math.abs(scaleX), 8);
      const y = Math.max(pageHeight - yTop - fontSize, 0);
      const width = Math.max(item.width ?? value.length * fontSize * 0.45, 1);
      const height = Math.max(item.height ?? fontSize * 1.2, fontSize * 1.1);

      segments.push({
        text: value,
        x,
        y,
        width,
        height,
        fontSize,
      });
    }

    pages.push({
      text: normalizePageText(lines),
      segments,
    });
  }

  return { pages, totalPages };
}

async function importPdfJs() {
  try {
    const mod = (await import("pdfjs-dist/legacy/build/pdf.mjs")) as {
      GlobalWorkerOptions?: { workerSrc: string };
      getDocument: (params: {
        data: Uint8Array;
        disableWorker: boolean;
        useWorkerFetch: boolean;
        isEvalSupported?: boolean;
        worker?: null;
      }) => { promise: Promise<any> };
    };
    if (mod.GlobalWorkerOptions) {
      mod.GlobalWorkerOptions.workerSrc = new URL(
        "pdfjs-dist/legacy/build/pdf.worker.mjs",
        import.meta.url,
      ).toString();
    }
    return mod;
  } catch {
    try {
      const mod = (await import("pdfjs-dist/build/pdf.mjs")) as {
        GlobalWorkerOptions?: { workerSrc: string };
        getDocument: (params: {
          data: Uint8Array;
          disableWorker: boolean;
          useWorkerFetch: boolean;
          isEvalSupported?: boolean;
          worker?: null;
        }) => { promise: Promise<any> };
      };
      if (mod.GlobalWorkerOptions) {
        mod.GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/build/pdf.worker.mjs",
          import.meta.url,
        ).toString();
      }
      return mod;
    } catch {
      throw new Error(
        "PDF parser unavailable. Install dependencies with `pnpm install` in the workspace root.",
      );
    }
  }
}

async function runOcrForPage(pageText: string) {
  if (pageText.trim()) return pageText;
  return "";
}

function splitTextForPdf(text: string, maxLen = 100) {
  const lines: string[] = [];
  for (const rawLine of text.split("\n")) {
    let line = rawLine;
    while (line.length > maxLen) {
      lines.push(line.slice(0, maxLen));
      line = line.slice(maxLen);
    }
    lines.push(line);
  }
  return lines;
}

async function buildTranslatedPdf(
  originalBytes: Uint8Array,
  translatedPages: string[],
  translatedSegmentsByPage: string[][],
  sourceSegmentsByPage: TextSegment[][],
  direction: TranslationDirection,
) {
  const { PDFDocument, StandardFonts, rgb } = await importPdfLib();
  const sourceDoc = await PDFDocument.load(normalizePdfBytes(originalBytes));
  const originalPageCount = sourceDoc.getPageCount();
  const outDoc = await PDFDocument.create();
  const copied = await outDoc.copyPages(
    sourceDoc,
    Array.from({ length: originalPageCount }, (_, index) => index),
  );

  copied.forEach((page) => outDoc.addPage(page));

  const font = await outDoc.embedFont(StandardFonts.Helvetica);
  for (let pageIndex = 0; pageIndex < translatedPages.length; pageIndex += 1) {
    const page = outDoc.getPage(pageIndex);
    const translatedSegments = translatedSegmentsByPage[pageIndex] ?? [];
    const sourceSegments = sourceSegmentsByPage[pageIndex] ?? [];

    const count = Math.min(translatedSegments.length, sourceSegments.length);
    for (let segmentIndex = 0; segmentIndex < count; segmentIndex += 1) {
      const source = sourceSegments[segmentIndex];
      const translated = translatedSegments[segmentIndex];
      if (!translated.trim()) continue;

      page.drawRectangle({
        x: source.x,
        y: source.y,
        width: source.width + 2,
        height: source.height + 2,
        color: rgb(1, 1, 1),
        opacity: 0.95,
      });

      page.drawText(translated, {
        x: source.x,
        y: source.y + Math.max(source.height - source.fontSize, 0),
        size: Math.max(Math.min(source.fontSize, 18), 7),
        font,
      });
    }
  }

  return await outDoc.save();
}

function normalizePdfBytes(bytes: Uint8Array): Uint8Array {
  if (bytes.length < PDF_HEADER.length) {
    throw new Error(`Invalid PDF payload: received ${bytes.length} byte(s), expected at least ${PDF_HEADER.length}. metadata={name:${payloadContext.filename ?? "unknown"}, expectedBytes:${payloadContext.byteLength ?? -1}, dataUrlLength:${payloadContext.dataUrlLength ?? -1}, actualDataUrlLength:${payloadContext.actualDataUrlLength ?? -1}, dataBodyLength:${payloadContext.dataBodyLength ?? -1}, base64Length:${payloadContext.base64Length ?? -1}, decodedByteLength:${payloadContext.decodedByteLength ?? -1}, hasDataUrl:${payloadContext.hasDataUrl}, hasBase64:${payloadContext.hasBase64}, hasSourceUrl:${payloadContext.hasSourceUrl}, hasFile:${payloadContext.hasFile}, hasBytes:${payloadContext.hasBytes}, hasBuffer:${payloadContext.hasBuffer}}`);
  }

  const scanLimit = Math.min(bytes.length - PDF_HEADER.length + 1, 4096);
  for (let i = 0; i < scanLimit; i += 1) {
    let match = true;
    for (let j = 0; j < PDF_HEADER.length; j += 1) {
      if (bytes[i + j] !== PDF_HEADER[j]) {
        match = false;
        break;
      }
    }
    if (match) {
      return i === 0 ? bytes : bytes.slice(i);
    }
  }

  throw new Error(
    "Invalid PDF file: no PDF header found. Please select a valid .pdf document.",
  );
}

let payloadContext: {
  filename?: string;
  byteLength?: number;
  dataUrlLength?: number;
  base64Length?: number;
  actualDataUrlLength?: number;
  dataBodyLength?: number;
  decodedByteLength?: number;
  hasDataUrl: boolean;
  hasBase64: boolean;
  hasSourceUrl: boolean;
  hasFile: boolean;
  hasBytes: boolean;
  hasBuffer: boolean;
} = {
  hasDataUrl: false,
  hasBase64: false,
  hasSourceUrl: false,
  hasFile: false,
  hasBytes: false,
  hasBuffer: false,
};

async function importPdfLib() {
  try {
    return (await import("pdf-lib")) as {
      PDFDocument: {
        load: (bytes: Uint8Array) => Promise<any>;
        create: () => Promise<any>;
      };
      StandardFonts: { Helvetica: string };
      rgb: (r: number, g: number, b: number) => any;
    };
  } catch {
    throw new Error(
      "PDF engine unavailable. Install dependencies with `pnpm install` in the workspace root.",
    );
  }
}

function sendProgress(message: ProgressMessage) {
  self.postMessage(message);
}

function toPdfBytes(payload: StartMessage): Uint8Array {
  if (payload.file instanceof File) {
    // handled in caller because arrayBuffer is async
    return new Uint8Array();
  }
  const rawBytes = payload.bytes;
  if (rawBytes instanceof Uint8Array) {
    return rawBytes;
  }
  if (Array.isArray(rawBytes)) {
    return new Uint8Array(rawBytes);
  }
  if (payload.buffer instanceof ArrayBuffer) {
    return new Uint8Array(payload.buffer);
  }
  return new Uint8Array();
}

async function loadPdfBytes(payload: StartMessage): Promise<Uint8Array> {
  if (typeof payload.dataUrl === "string" && payload.dataUrl.startsWith("data:")) {
    payloadContext.actualDataUrlLength = payload.dataUrl.length;
    const commaIndex = payload.dataUrl.indexOf(",");
    if (commaIndex === -1) {
      throw new Error("Malformed data URL payload: missing comma separator.");
    }
    const header = payload.dataUrl.slice(0, commaIndex);
    const body = payload.dataUrl.slice(commaIndex + 1);
    payloadContext.dataBodyLength = body.length;
    if (header.includes(";base64")) {
      const decoded = decodeBase64ToBytes(body);
      payloadContext.decodedByteLength = decoded.length;
      return decoded;
    }
    const decodedText = decodeURIComponent(body);
    const bytes = new Uint8Array(decodedText.length);
    for (let i = 0; i < decodedText.length; i += 1) {
      bytes[i] = decodedText.charCodeAt(i) & 0xff;
    }
    payloadContext.decodedByteLength = bytes.length;
    return bytes;
  }
  if (typeof payload.base64 === "string" && payload.base64.length > 0) {
    const decoded = decodeBase64ToBytes(payload.base64);
    payloadContext.decodedByteLength = decoded.length;
    if (
      payload.byteLength &&
      decoded.length > 0 &&
      Math.abs(decoded.length - payload.byteLength) > 8
    ) {
      throw new Error(
        `Decoded payload size mismatch: decoded=${decoded.length}, expected=${payload.byteLength}.`,
      );
    }
    return decoded;
  }
  if (payload.sourceUrl) {
    const response = await fetch(payload.sourceUrl);
    if (!response.ok) {
      throw new Error(`Failed to read selected PDF (status ${response.status}).`);
    }
    return new Uint8Array(await response.arrayBuffer());
  }
  if (payload.file) {
    return new Uint8Array(await payload.file.arrayBuffer());
  }
  return toPdfBytes(payload);
}

function decodeBase64ToBytes(value: string): Uint8Array {
  const table = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const normalized = value
    .replace(/[\r\n\s]/g, "")
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  if (!normalized.length) return new Uint8Array();

  const padNeeded = (4 - (normalized.length % 4)) % 4;
  const padded = normalized + "=".repeat(padNeeded);
  const output: number[] = [];

  for (let i = 0; i < padded.length; i += 4) {
    const c1 = padded[i];
    const c2 = padded[i + 1];
    const c3 = padded[i + 2];
    const c4 = padded[i + 3];
    const i1 = table.indexOf(c1);
    const i2 = table.indexOf(c2);
    const i3 = c3 === "=" ? 0 : table.indexOf(c3);
    const i4 = c4 === "=" ? 0 : table.indexOf(c4);

    if (i1 < 0 || i2 < 0 || (c3 !== "=" && i3 < 0) || (c4 !== "=" && i4 < 0)) {
      throw new Error("Invalid base64 payload characters.");
    }

    const triple = (i1 << 18) | (i2 << 12) | (i3 << 6) | i4;
    output.push((triple >> 16) & 0xff);
    if (c3 !== "=") output.push((triple >> 8) & 0xff);
    if (c4 !== "=") output.push(triple & 0xff);
  }

  return new Uint8Array(output);
}

self.onmessage = async (event: MessageEvent<WorkerMessage>) => {
  const payload = event.data;
  if (payload.type !== "start") return;
  const { jobId, sourceLanguage, targetLanguage } = payload;
  payloadContext = {
    filename: payload.filename,
    byteLength: payload.byteLength,
    dataUrlLength: payload.dataUrlLength,
    base64Length: payload.base64Length,
    actualDataUrlLength: undefined,
    dataBodyLength: undefined,
    decodedByteLength: undefined,
    hasDataUrl: typeof payload.dataUrl === "string" && payload.dataUrl.length > 0,
    hasBase64: typeof payload.base64 === "string" && payload.base64.length > 0,
    hasSourceUrl: Boolean(payload.sourceUrl),
    hasFile: Boolean(payload.file),
    hasBytes: Boolean(payload.bytes),
    hasBuffer: Boolean(payload.buffer),
  };

  try {
    const direction = buildDirection(sourceLanguage, targetLanguage);
    const cached = await getCachedModel(direction);
    if (!cached) {
      await setCachedModel(direction);
    }

    sendProgress({ type: "progress", jobId, stage: "extracting", progress: 0 });
    const bytes = await loadPdfBytes(payload);
    const parsingBytes = bytes.slice();
    const outputBytesSource = bytes.slice();
    const { pages, totalPages } = await extractPageTexts(
      parsingBytes,
      payload.maxPages,
    );

    const translatedPages: string[] = [];
    const translatedSegmentsByPage: string[][] = [];
    const sourceSegmentsByPage: TextSegment[][] = [];
    let usedOcrPages = 0;

    for (let i = 0; i < pages.length; i += 1) {
      const extractionProgress = ((i + 1) / pages.length) * 100;
      sendProgress({
        type: "progress",
        jobId,
        stage: "extracting",
        progress: extractionProgress,
      });

      const currentText = pages[i].text;
      let workingText = currentText;
      if (shouldUseOcr(currentText)) {
        usedOcrPages += 1;
        const ocrText = await runOcrForPage(currentText);
        if (ocrText.trim()) {
          workingText = ocrText;
        }
      }

      const chunks = chunkSegments([workingText], 1800).flat();
      const translated = chunks
        .map((chunk) => translateSegmentLocally(chunk, direction))
        .join("");
      translatedPages.push(translated);

      sourceSegmentsByPage.push(pages[i].segments);
      translatedSegmentsByPage.push(
        pages[i].segments.map((segment) =>
          translateSegmentLocally(segment.text, direction),
        ),
      );

      sendProgress({
        type: "progress",
        jobId,
        stage: "translating",
        progress: ((i + 1) / pages.length) * 100,
      });
    }

    sendProgress({ type: "progress", jobId, stage: "rendering", progress: 20 });
    const outputBytes = await buildTranslatedPdf(
      outputBytesSource,
      translatedPages,
      translatedSegmentsByPage,
      sourceSegmentsByPage,
      direction,
    );
    sendProgress({ type: "progress", jobId, stage: "rendering", progress: 100 });

    const done: DoneMessage = {
      type: "done",
      jobId,
      outputBuffer: outputBytes.buffer.slice(
        outputBytes.byteOffset,
        outputBytes.byteOffset + outputBytes.byteLength,
      ),
      sidecarText: translatedPages.join("\n\n---\n\n"),
      usedOcrPages,
      totalPages,
    };
    self.postMessage(done, [done.outputBuffer]);
  } catch (error) {
    const failure: ErrorMessage = {
      type: "error",
      jobId,
      message: error instanceof Error ? error.message : "PDF translation failed",
    };
    self.postMessage(failure);
  }
};
