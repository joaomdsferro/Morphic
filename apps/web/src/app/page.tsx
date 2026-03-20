"use client";

import { useState, useCallback, useEffect, useRef } from "react";

// ─── Constants ────────────────────────────────────────────────────────────────

const IMAGE_INPUT_EXTS = [
  "jpeg", "jpg", "png", "webp", "avif", "jxl", "gif", "bmp", "tiff",
];

const IMAGE_OUTPUT_FORMATS = [
  { id: "jpeg", label: "JPEG", desc: "Best compatibility, lossy" },
  { id: "png",  label: "PNG",  desc: "Lossless, supports transparency" },
  { id: "webp", label: "WebP", desc: "Modern web standard" },
  { id: "avif", label: "AVIF", desc: "Tiny files, great quality" },
  { id: "jxl",  label: "JXL",  desc: "Next-gen, royalty-free" },
] as const;

type ImageFormat = (typeof IMAGE_OUTPUT_FORMATS)[number]["id"];
type FileCategory = "image" | "video";

// ─── Types ────────────────────────────────────────────────────────────────────

interface QueueFile {
  id: string;
  file: File;
  category: FileCategory;
  thumbUrl: string | null;
  outputFormat: ImageFormat;
  status: "pending" | "converting" | "done" | "error";
  progress: number;
  outputSize?: number;
  resultUrl?: string;  // blob URL of the converted file, ready to download
  error?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getExt(name: string) {
  return name.split(".").pop()?.toLowerCase() ?? "bin";
}

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1_048_576) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1_048_576).toFixed(1)} MB`;
}

function getCategory(file: File): FileCategory {
  return file.type.startsWith("video/") ? "video" : "image";
}

function savingLabel(input: number, output: number) {
  const pct = ((input - output) / input) * 100;
  return pct > 0
    ? `${pct.toFixed(0)}% smaller`
    : `${Math.abs(pct).toFixed(0)}% larger`;
}

// MIME type for each output format
const FORMAT_MIME: Record<ImageFormat, string> = {
  jpeg: "image/jpeg",
  png:  "image/png",
  webp: "image/webp",
  avif: "image/avif",
  jxl:  "image/jxl",   // browser support limited; falls back gracefully
};

/**
 * Convert an image File to the desired format using the browser's Canvas API.
 * Returns a Blob and an object URL pointing to it.
 * This runs 100% locally in the browser — no network requests.
 * JXL will be handled by the WASM module once wired up.
 */
async function convertWithCanvas(
  file: File,
  outputFormat: ImageFormat,
  quality: number,
  onProgress: (p: number) => void,
): Promise<{ blob: Blob; url: string }> {
  onProgress(10);

  const bitmap = await createImageBitmap(file);
  onProgress(40);

  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  onProgress(70);

  const mime = FORMAT_MIME[outputFormat];
  const qualityNorm = quality / 100;

  const blob = await canvas.convertToBlob({
    type: mime,
    quality: qualityNorm,
  });
  onProgress(100);

  return { blob, url: URL.createObjectURL(blob) };
}

// ─── Small atoms ──────────────────────────────────────────────────────────────

const FORMAT_PALETTE: Record<string, string> = {
  jpeg: "bg-orange-500/15 text-orange-300 border-orange-500/30",
  jpg:  "bg-orange-500/15 text-orange-300 border-orange-500/30",
  png:  "bg-blue-500/15   text-blue-300   border-blue-500/30",
  webp: "bg-green-500/15  text-green-300  border-green-500/30",
  avif: "bg-purple-500/15 text-purple-300 border-purple-500/30",
  jxl:  "bg-pink-500/15   text-pink-300   border-pink-500/30",
  gif:  "bg-yellow-500/15 text-yellow-300 border-yellow-500/30",
  bmp:  "bg-neutral-500/15 text-neutral-300 border-neutral-500/30",
  tiff: "bg-cyan-500/15   text-cyan-300   border-cyan-500/30",
  mp4:  "bg-red-500/15    text-red-300    border-red-500/30",
  mov:  "bg-red-500/15    text-red-300    border-red-500/30",
  mkv:  "bg-red-500/15    text-red-300    border-red-500/30",
};

function FormatPill({ format }: { format: string }) {
  const color =
    FORMAT_PALETTE[format.toLowerCase()] ??
    "bg-neutral-500/15 text-neutral-300 border-neutral-500/30";
  return (
    <span
      className={`inline-flex items-center rounded border px-1.5 py-px text-[10px] font-bold uppercase tracking-wider ${color}`}
    >
      {format.toUpperCase()}
    </span>
  );
}

function VideoIcon() {
  return (
    <svg
      className="h-5 w-5 text-neutral-600"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z"
      />
    </svg>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function HomePage() {
  const [queue, setQueue] = useState<QueueFile[]>([]);
  const [globalFormat, setGlobalFormat] = useState<ImageFormat>("webp");
  const [quality, setQuality] = useState(85);
  const [tab, setTab] = useState<FileCategory>("image");
  const [dragging, setDragging] = useState(false);

  // Revoke object URLs on unmount
  const queueRef = useRef(queue);
  useEffect(() => { queueRef.current = queue; }, [queue]);
  useEffect(
    () => () => queueRef.current.forEach((f) => { if (f.thumbUrl) URL.revokeObjectURL(f.thumbUrl); }),
    []
  );

  // Global drag-and-drop
  useEffect(() => {
    const over = (e: DragEvent) => { e.preventDefault(); setDragging(true); };
    const leave = (e: DragEvent) => { if (!e.relatedTarget) setDragging(false); };
    const drop = (e: DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const files = Array.from(e.dataTransfer?.files ?? []);
      if (files.length) enqueue(files);
    };
    window.addEventListener("dragover", over);
    window.addEventListener("dragleave", leave);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragover", over);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("drop", drop);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [globalFormat]);

  const enqueue = useCallback(
    (incoming: File[]) => {
      const entries: QueueFile[] = incoming.map((f) => ({
        id: crypto.randomUUID(),
        file: f,
        category: getCategory(f),
        thumbUrl: f.type.startsWith("image/") ? URL.createObjectURL(f) : null,
        outputFormat: globalFormat,
        status: "pending",
        progress: 0,
      }));
      setQueue((prev) => [...prev, ...entries]);
    },
    [globalFormat]
  );

  const convert = useCallback(async (id: string) => {
    const item = queueRef.current.find((f) => f.id === id);
    if (!item || item.status !== "pending") return;

    const tick = (p: number) =>
      setQueue((prev) =>
        prev.map((f) => (f.id === id ? { ...f, progress: p } : f))
      );

    setQueue((prev) =>
      prev.map((f) => (f.id === id ? { ...f, status: "converting", progress: 0 } : f))
    );

    try {
      const { blob, url } = await convertWithCanvas(
        item.file,
        item.outputFormat,
        quality,
        tick,
      );

      setQueue((prev) =>
        prev.map((f) =>
          f.id === id
            ? { ...f, status: "done", progress: 100, outputSize: blob.size, resultUrl: url }
            : f
        )
      );
    } catch (err) {
      setQueue((prev) =>
        prev.map((f) =>
          f.id === id
            ? { ...f, status: "error", error: err instanceof Error ? err.message : "Conversion failed" }
            : f
        )
      );
    }
  }, [quality]);

  const convertAll = () =>
    visible
      .filter((f) => f.status === "pending")
      .forEach((f) => convert(f.id));

  const remove = (id: string) => {
    setQueue((prev) => {
      const t = prev.find((f) => f.id === id);
      if (t?.thumbUrl) URL.revokeObjectURL(t.thumbUrl);
      if (t?.resultUrl) URL.revokeObjectURL(t.resultUrl);
      return prev.filter((f) => f.id !== id);
    });
  };

  const clearDone = () =>
    setQueue((prev) => {
      prev
        .filter((f) => f.status === "done")
        .forEach((f) => {
          if (f.thumbUrl) URL.revokeObjectURL(f.thumbUrl);
          if (f.resultUrl) URL.revokeObjectURL(f.resultUrl);
        });
      return prev.filter((f) => f.status !== "done");
    });

  const visible = queue.filter((f) => f.category === tab);
  const imageCount = queue.filter((f) => f.category === "image").length;
  const videoCount = queue.filter((f) => f.category === "video").length;
  const pendingCount = visible.filter((f) => f.status === "pending").length;
  const doneCount = visible.filter((f) => f.status === "done").length;
  const showQuality = (["jpeg", "webp", "avif"] as ImageFormat[]).includes(globalFormat);

  return (
    <div className="min-h-screen bg-[#080808] text-[#ededed]">
      {/* Full-screen drop overlay */}
      {dragging && (
        <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-blue-950/50 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-blue-400 bg-blue-950/70 px-20 py-14 shadow-2xl">
            <svg
              className="h-12 w-12 text-blue-300"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 7.5m0 0L7.5 12M12 7.5v9"
              />
            </svg>
            <p className="text-lg font-semibold text-blue-100">Drop to add files</p>
          </div>
        </div>
      )}

      <div className="mx-auto flex max-w-2xl flex-col gap-5 px-5 py-6">
        {/* ── Header ── */}
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-600 text-xs font-black text-white select-none">
              M
            </div>
            <span className="text-sm font-bold tracking-tight">Morphic</span>
          </div>
          <span className="flex items-center gap-1.5 rounded-full border border-neutral-800 bg-neutral-900 px-3 py-1 text-[11px] text-neutral-500">
            <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
            100% local · no uploads
          </span>
        </header>

        {/* ── Drop Zone ── */}
        <label
          className={`flex cursor-pointer flex-col items-center gap-2.5 rounded-xl border-2 border-dashed py-8 px-6 transition-all duration-150 ${
            dragging
              ? "border-blue-500 bg-blue-500/8"
              : "border-neutral-800 bg-neutral-900/40 hover:border-neutral-700 hover:bg-neutral-900"
          }`}
        >
          <input
            type="file"
            multiple
            accept={IMAGE_INPUT_EXTS.map((e) => `.${e}`).join(",")}
            className="sr-only"
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              if (files.length) enqueue(files);
              e.target.value = "";
            }}
          />
          <svg
            className="h-7 w-7 text-neutral-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 7.5m0 0L7.5 12M12 7.5v9"
            />
          </svg>
          <p className="text-sm text-neutral-400">
            Drop files or{" "}
            <span className="text-blue-400 underline underline-offset-2">
              click to browse
            </span>
          </p>
          <p className="text-[11px] text-neutral-700">
            {IMAGE_INPUT_EXTS
              .filter((e) => e !== "jpg")
              .map((e) => e.toUpperCase())
              .join(" · ")}
          </p>
        </label>

        {/* ── Controls ── */}
        <div className="flex flex-col gap-4 rounded-xl border border-neutral-800/80 bg-neutral-900/40 p-4">
          {/* Format pills */}
          <div className="flex flex-wrap items-center gap-3">
            <span className="w-18 shrink-0 text-[10px] font-semibold uppercase tracking-widest text-neutral-600">
              Convert to
            </span>
            <div className="flex flex-wrap gap-2">
              {IMAGE_OUTPUT_FORMATS.map((fmt) => (
                <button
                  key={fmt.id}
                  onClick={() => setGlobalFormat(fmt.id)}
                  title={fmt.desc}
                  className={`rounded-lg border px-3.5 py-1.5 text-xs font-semibold transition-all duration-100 ${
                    globalFormat === fmt.id
                      ? "border-blue-500 bg-blue-600 text-white shadow-md shadow-blue-500/25"
                      : "border-neutral-700 bg-neutral-800 text-neutral-400 hover:border-neutral-600 hover:text-neutral-200"
                  }`}
                >
                  {fmt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Quality slider */}
          {showQuality && (
            <div className="flex items-center gap-3">
              <span className="w-18 shrink-0 text-[10px] font-semibold uppercase tracking-widest text-neutral-600">
                Quality
              </span>
              <input
                type="range"
                min={1}
                max={100}
                value={quality}
                onChange={(e) => setQuality(Number(e.target.value))}
                className="h-1 flex-1 cursor-pointer accent-blue-500"
              />
              <span className="w-7 text-right text-xs font-semibold tabular-nums text-neutral-300">
                {quality}
              </span>
            </div>
          )}
        </div>

        {/* ── Queue ── */}
        {queue.length > 0 && (
          <section className="flex flex-col gap-3">
            {/* Tab bar + actions */}
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-1 rounded-lg border border-neutral-800 bg-neutral-900/60 p-1">
                {(["image", "video"] as FileCategory[]).map((cat) => {
                  const count = cat === "image" ? imageCount : videoCount;
                  return (
                    <button
                      key={cat}
                      onClick={() => setTab(cat)}
                      className={`flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                        tab === cat
                          ? "bg-neutral-700 text-neutral-100 shadow-sm"
                          : "text-neutral-500 hover:text-neutral-300"
                      }`}
                    >
                      {cat === "image" ? "Images" : "Videos"}
                      {count > 0 && (
                        <span
                          className={`rounded-full px-1.5 py-px text-[10px] font-bold ${
                            tab === cat
                              ? "bg-neutral-600 text-neutral-200"
                              : "bg-neutral-800 text-neutral-600"
                          }`}
                        >
                          {count}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center gap-2">
                {doneCount > 0 && (
                  <button
                    onClick={clearDone}
                    className="rounded-lg border border-neutral-800 px-3 py-1.5 text-xs font-medium text-neutral-500 hover:text-neutral-300 transition-colors"
                  >
                    Clear done
                  </button>
                )}
                {pendingCount > 0 && (
                  <button
                    onClick={convertAll}
                    className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-blue-500 active:scale-95 transition-all"
                  >
                    <svg
                      className="h-3 w-3"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
                    </svg>
                    Convert all
                    <span className="rounded-full bg-blue-500/60 px-1.5 py-px text-[10px] font-bold">
                      {pendingCount}
                    </span>
                  </button>
                )}
              </div>
            </div>

            {/* File cards */}
            {visible.length === 0 ? (
              <p className="py-8 text-center text-xs text-neutral-700">
                No {tab} files in queue.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {visible.map((item) => (
                  <li
                    key={item.id}
                    className={`overflow-hidden rounded-xl border transition-colors ${
                      item.status === "done"
                        ? "border-green-900/50 bg-neutral-900/60"
                        : item.status === "error"
                        ? "border-red-900/50 bg-neutral-900/60"
                        : "border-neutral-800 bg-neutral-900/60"
                    }`}
                  >
                    <div className="flex items-center gap-3 p-3">
                      {/* Thumbnail */}
                      <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-lg bg-neutral-800">
                        {item.thumbUrl ? (
                          <img
                            src={item.thumbUrl}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center">
                            <VideoIcon />
                          </div>
                        )}
                        {item.status === "done" && (
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
                          {item.file.name}
                        </span>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <FormatPill format={getExt(item.file.name)} />
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
                          <FormatPill format={item.outputFormat} />
                          <span className="text-[11px] text-neutral-600">
                            {formatBytes(item.file.size)}
                          </span>
                          {item.status === "done" && item.outputSize != null && (
                            <>
                              <span className="text-neutral-700">→</span>
                              <span className="text-[11px] text-neutral-400">
                                {formatBytes(item.outputSize)}
                              </span>
                              <span
                                className={`text-[11px] font-semibold ${
                                  item.outputSize < item.file.size
                                    ? "text-green-400"
                                    : "text-yellow-400"
                                }`}
                              >
                                ({savingLabel(item.file.size, item.outputSize)})
                              </span>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex shrink-0 items-center gap-1.5">
                        {item.status === "pending" && (
                          <button
                            onClick={() => convert(item.id)}
                            className="rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-xs font-medium text-neutral-300 hover:border-neutral-600 hover:bg-neutral-700 hover:text-white transition-all active:scale-95"
                          >
                            Convert
                          </button>
                        )}
                        {item.status === "converting" && (
                          <span className="animate-pulse text-[11px] text-blue-400">
                            Converting…
                          </span>
                        )}
                        {item.status === "done" && item.resultUrl && (
                          <a
                            href={item.resultUrl}
                            download={`${item.file.name.replace(/\.[^.]+$/, "")}.${item.outputFormat}`}
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
                        {item.status === "error" && (
                          <span className="text-[11px] text-red-400">
                            {item.error ?? "Error"}
                          </span>
                        )}
                        <button
                          onClick={() => remove(item.id)}
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
                    {item.status === "converting" && (
                      <div className="h-0.5 bg-neutral-800">
                        <div
                          className="h-full bg-blue-500 transition-[width] duration-150 ease-out"
                          style={{ width: `${item.progress}%` }}
                        />
                      </div>
                    )}
                    {item.status === "done" && (
                      <div className="h-0.5 bg-green-600/50" />
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {/* Empty footer */}
        {queue.length === 0 && (
          <p className="text-center text-[11px] text-neutral-800">
            Your files never leave this device.
          </p>
        )}
      </div>
    </div>
  );
}
