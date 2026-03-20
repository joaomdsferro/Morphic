"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type ImageMode = "convert" | "compress" | "upscale";
type OutputFormat = "jpeg" | "png" | "webp" | "avif" | "jxl" | "ico" | "svg";

type JobStatus = "pending" | "processing" | "done" | "error";

interface ImageJob {
  id: string;
  file: File;
  previewUrl: string;
  status: JobStatus;
  resultUrl?: string;
  resultSize?: number;
  error?: string;
}

const FORMAT_MIME: Record<OutputFormat, string> = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  avif: "image/avif",
  jxl: "image/jxl",
  ico: "image/x-icon",
  svg: "image/svg+xml",
};

const FORMAT_OPTIONS: { id: OutputFormat; label: string }[] = [
  { id: "webp", label: "WebP" },
  { id: "jpeg", label: "JPEG" },
  { id: "png", label: "PNG" },
  { id: "avif", label: "AVIF" },
  { id: "jxl", label: "JXL" },
  { id: "ico", label: "ICO" },
  { id: "svg", label: "SVG" },
];

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function extFromFile(name: string) {
  return name.split(".").pop()?.toLowerCase() || "file";
}

function baseName(name: string) {
  return name.replace(/\.[^.]+$/, "");
}

function savingLabel(original: number, output: number): string {
  if (output === 0) return "0%";
  const percent = Math.round(((original - output) / original) * 100);
  return `${percent}% saved`;
}

function FormatPill({ format }: { format: string }) {
  return (
    <span className="inline-flex items-center rounded-md bg-neutral-800 px-2 py-0.5 text-[11px] font-medium uppercase text-neutral-300">
      {format}
    </span>
  );
}

/** Encode a PNG Uint8Array as a single-image ICO binary. */
function buildIco(pngBytes: Uint8Array, width: number, height: number): Uint8Array {
  const w = width >= 256 ? 0 : width;   // 0 means 256 in the ICO spec
  const h = height >= 256 ? 0 : height;
  const offset = 6 + 16; // ICONDIR header + 1 ICONDIRENTRY
  const buf = new Uint8Array(offset + pngBytes.length);
  const view = new DataView(buf.buffer);
  // ICONDIR
  view.setUint16(0, 0, true); // reserved
  view.setUint16(2, 1, true); // type = 1 (ICO)
  view.setUint16(4, 1, true); // image count = 1
  // ICONDIRENTRY
  buf[6] = w;  buf[7] = h;
  buf[8] = 0;  buf[9] = 0;   // color count, reserved
  view.setUint16(10, 1,  true);               // planes
  view.setUint16(12, 32, true);               // bit count
  view.setUint32(14, pngBytes.length, true);  // image data size
  view.setUint32(18, offset,          true);  // image data offset
  buf.set(pngBytes, offset);
  return buf;
}

/** Convert a Uint8Array to a base64 string without stack overflow. */
function uint8ToBase64(bytes: Uint8Array): string {
  const CHUNK = 8192;
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

async function processImage(
  file: File,
  mode: ImageMode,
  outputFormat: OutputFormat,
  quality: number,
  upscaleFactor: 2 | 4,
) {
  const bitmap = await createImageBitmap(file);
  const width = mode === "upscale" ? bitmap.width * upscaleFactor : bitmap.width;
  const height = mode === "upscale" ? bitmap.height * upscaleFactor : bitmap.height;

  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d");

  if (!ctx) {
    bitmap.close();
    throw new Error("Could not create drawing context");
  }

  if (mode === "upscale") {
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
  }

  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  let blob: Blob;

  if (outputFormat === "ico") {
    // ICO: Convert to PNG first, then encode as ICO
    const pngBlob = await canvas.convertToBlob({ type: "image/png" });
    const pngArrayBuf = await pngBlob.arrayBuffer();
    const pngBytes = new Uint8Array(pngArrayBuf);
    const icoBytes = buildIco(pngBytes, width, height);
    blob = new Blob([icoBytes.buffer as ArrayBuffer], { type: "image/x-icon" });
  } else if (outputFormat === "svg") {
    // SVG: Embed PNG as base64 data URI
    const pngBlob = await canvas.convertToBlob({ type: "image/png" });
    const pngBytes = new Uint8Array(await pngBlob.arrayBuffer());
    const b64 = uint8ToBase64(pngBytes);
    const svgStr = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><image href="data:image/png;base64,${b64}" width="${width}" height="${height}"/></svg>`;
    blob = new Blob([svgStr], { type: "image/svg+xml" });
  } else {
    const targetType = mode === "convert" ? FORMAT_MIME[outputFormat] : file.type || "image/jpeg";
    const targetQuality = mode === "compress" ? quality / 100 : 0.92;
    blob = await canvas.convertToBlob({
      type: targetType,
      quality: targetQuality,
    });
  }

  return blob;
}

export function ImageActionStudio({ mode }: { mode: ImageMode }) {
  const [jobs, setJobs] = useState<ImageJob[]>([]);
  const [outputFormat, setOutputFormat] = useState<OutputFormat>("webp");
  const [quality, setQuality] = useState(75);
  const [upscaleFactor, setUpscaleFactor] = useState<2 | 4>(2);

  const jobsRef = useRef<ImageJob[]>(jobs);

  useEffect(() => {
    jobsRef.current = jobs;
  }, [jobs]);

  useEffect(() => {
    return () => {
      jobsRef.current.forEach((job) => {
        URL.revokeObjectURL(job.previewUrl);
        if (job.resultUrl) URL.revokeObjectURL(job.resultUrl);
      });
    };
  }, []);

  const pendingJobs = useMemo(() => jobs.filter((job) => job.status === "pending").length, [jobs]);

  const onAddFiles = useCallback((files: File[]) => {
    const imageFiles = files.filter((file) => file.type.startsWith("image/"));
    if (!imageFiles.length) return;

    setJobs((current) => [
      ...current,
      ...imageFiles.map((file) => ({
        id: crypto.randomUUID(),
        file,
        previewUrl: URL.createObjectURL(file),
        status: "pending" as const,
      })),
    ]);
  }, []);

  const updateJob = useCallback((id: string, patch: Partial<ImageJob>) => {
    setJobs((current) => current.map((job) => (job.id === id ? { ...job, ...patch } : job)));
  }, []);

  const runJob = useCallback(
    async (id: string) => {
      const job = jobsRef.current.find((item) => item.id === id);
      if (!job || job.status !== "pending") return;

      updateJob(id, { status: "processing", error: undefined });

      try {
        const blob = await processImage(job.file, mode, outputFormat, quality, upscaleFactor);
        const resultUrl = URL.createObjectURL(blob);
        updateJob(id, { status: "done", resultUrl, resultSize: blob.size });
      } catch (error) {
        updateJob(id, {
          status: "error",
          error: error instanceof Error ? error.message : "Processing failed",
        });
      }
    },
    [mode, outputFormat, quality, upscaleFactor, updateJob],
  );

  const runAll = useCallback(async () => {
    for (const job of jobsRef.current) {
      if (job.status === "pending") {
        await runJob(job.id);
      }
    }
  }, [runJob]);

  const clearDone = useCallback(() => {
    setJobs((current) => {
      current
        .filter((job) => job.status === "done")
        .forEach((job) => {
          if (job.resultUrl) URL.revokeObjectURL(job.resultUrl);
        });

      return current.filter((job) => job.status !== "done");
    });
  }, []);

  const dropHint = mode === "convert" ? "Convert" : mode === "compress" ? "Compress" : "Upscale";

  return (
    <div className="space-y-4">
      <label className="block cursor-pointer rounded-xl border-2 border-dashed border-neutral-700 bg-neutral-900/50 p-6 text-center hover:border-neutral-600 hover:bg-neutral-900">
        <input
          className="sr-only"
          type="file"
          multiple
          accept="image/*"
          onChange={(event) => {
            const files = Array.from(event.target.files ?? []);
            onAddFiles(files);
            event.target.value = "";
          }}
        />
        <p className="text-sm text-neutral-300">Drop images or click to browse</p>
        <p className="mt-1 text-xs text-neutral-500">PNG · JPEG · WebP · AVIF · GIF · TIFF</p>
      </label>

      <section className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-4">
        <div className="flex flex-wrap gap-4">
          {mode === "convert" && (
            <label className="flex items-center gap-2 text-sm text-neutral-300">
              Output format
              <select
                className="rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1 text-sm"
                value={outputFormat}
                onChange={(event) => setOutputFormat(event.target.value as OutputFormat)}
              >
                {FORMAT_OPTIONS.map((format) => (
                  <option key={format.id} value={format.id}>
                    {format.label}
                  </option>
                ))}
              </select>
            </label>
          )}

          {mode === "compress" && (
            <label className="flex items-center gap-2 text-sm text-neutral-300">
              Quality
              <input
                type="range"
                min={20}
                max={95}
                value={quality}
                onChange={(event) => setQuality(Number(event.target.value))}
                className="accent-blue-500"
              />
              <span className="w-8 text-right text-xs">{quality}</span>
            </label>
          )}

          {mode === "upscale" && (
            <label className="flex items-center gap-2 text-sm text-neutral-300">
              Factor
              <select
                className="rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1 text-sm"
                value={upscaleFactor}
                onChange={(event) => setUpscaleFactor(Number(event.target.value) as 2 | 4)}
              >
                <option value={2}>2x</option>
                <option value={4}>4x</option>
              </select>
            </label>
          )}
        </div>
      </section>

      {jobs.length > 0 && (
        <section className="rounded-xl border border-neutral-800 bg-neutral-900/30 p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-neutral-400">{jobs.length} file(s) selected</p>
            <div className="flex gap-2">
              <button
                onClick={clearDone}
                className="rounded-md border border-neutral-700 px-2.5 py-1 text-xs text-neutral-300 hover:bg-neutral-800"
              >
                Clear done
              </button>
              {pendingJobs > 0 && (
                <button
                  onClick={runAll}
                  className="rounded-md bg-blue-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-blue-500"
                >
                  {dropHint} all ({pendingJobs})
                </button>
              )}
            </div>
          </div>

          <ul className="flex flex-col gap-2">
            {jobs.map((job) => {
              const outputExt = mode === "convert" ? outputFormat : extFromFile(job.file.name);
              const inputExt = extFromFile(job.file.name);
              const actionLabel = mode === "convert" ? "Convert" : mode === "compress" ? "Compress" : "Upscale";

              return (
                <li
                  key={job.id}
                  className={`overflow-hidden rounded-xl border transition-colors ${
                    job.status === "done"
                      ? "border-green-900/50 bg-neutral-900/60"
                      : job.status === "error"
                      ? "border-red-900/50 bg-neutral-900/60"
                      : "border-neutral-800 bg-neutral-900/60"
                  }`}
                >
                  <div className="flex items-center gap-3 p-3">
                    {/* Thumbnail */}
                    <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-lg bg-neutral-800">
                      <img
                        src={job.previewUrl}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                      {job.status === "done" && (
                        <div className="absolute inset-0 flex items-center justify-center bg-green-950/70">
                          <svg
                            className="h-5 w-5 text-green-400"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={2.5}
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M4.5 12.75l6 6 9-13.5"
                            />
                          </svg>
                        </div>
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className="truncate text-sm font-medium text-neutral-200">
                        {job.file.name}
                      </span>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <FormatPill format={inputExt} />
                        <svg
                          className="h-3 w-3 text-neutral-700"
                          viewBox="0 0 16 16"
                          fill="currentColor"
                        >
                          <path
                            fillRule="evenodd"
                            d="M1 8a.5.5 0 01.5-.5h11.793l-3.147-3.146a.5.5 0 01.708-.708l4 4a.5.5 0 010 .708l-4 4a.5.5 0 01-.708-.708L13.293 8.5H1.5A.5.5 0 011 8z"
                          />
                        </svg>
                        <FormatPill format={outputExt} />
                        <span className="text-[11px] text-neutral-600">
                          {formatBytes(job.file.size)}
                        </span>
                        {job.status === "done" && job.resultSize != null && (
                          <>
                            <span className="text-neutral-700">→</span>
                            <span className="text-[11px] text-neutral-400">
                              {formatBytes(job.resultSize)}
                            </span>
                            <span
                              className={`text-[11px] font-semibold ${
                                job.resultSize < job.file.size
                                  ? "text-green-400"
                                  : "text-yellow-400"
                              }`}
                            >
                              ({savingLabel(job.file.size, job.resultSize)})
                            </span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex shrink-0 items-center gap-1.5">
                      {job.status === "pending" && (
                        <button
                          onClick={() => runJob(job.id)}
                          className="rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-xs font-medium text-neutral-300 hover:border-neutral-600 hover:bg-neutral-700 hover:text-white transition-all active:scale-95"
                        >
                          {actionLabel}
                        </button>
                      )}
                      {job.status === "processing" && (
                        <span className="animate-pulse text-[11px] text-blue-400">
                          Processing…
                        </span>
                      )}
                      {job.status === "done" && job.resultUrl && (
                        <a
                          href={job.resultUrl}
                          download={`${baseName(job.file.name)}.${outputExt}`}
                          className="flex items-center gap-1.5 rounded-lg border border-green-700/40 bg-green-600/15 px-3 py-1.5 text-xs font-medium text-green-400 hover:bg-green-600/25 transition-colors active:scale-95"
                        >
                          <svg
                            className="h-3 w-3"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={2.5}
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 7.5m0 0L7.5 12M12 7.5v9"
                            />
                          </svg>
                          Save
                        </a>
                      )}
                      {job.status === "error" && (
                        <span className="text-[11px] text-red-400">
                          {job.error ?? "Error"}
                        </span>
                      )}
                      <button
                        onClick={() => {
                          if (job.resultUrl) URL.revokeObjectURL(job.resultUrl);
                          URL.revokeObjectURL(job.previewUrl);
                          setJobs((current) => current.filter((j) => j.id !== job.id));
                        }}
                        aria-label="Remove"
                        className="rounded-lg p-1.5 text-neutral-700 hover:bg-neutral-800 hover:text-neutral-400 transition-colors"
                      >
                        <svg
                          className="h-3.5 w-3.5"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={2}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M6 18L18 6M6 6l12 12"
                          />
                        </svg>
                      </button>
                    </div>
                  </div>

                  {/* Progress bar */}
                  {job.status === "processing" && (
                    <div className="h-0.5 bg-neutral-800">
                      <div
                        className="h-full bg-blue-500 transition-[width] duration-150 ease-out"
                        style={{ width: "100%" }}
                      />
                    </div>
                  )}
                  {job.status === "done" && (
                    <div className="h-0.5 bg-green-600/50" />
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
