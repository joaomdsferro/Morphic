"use client";

import { DropZone } from "@morphic/ui";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type UiStatus =
  | "queued"
  | "processing"
  | "done"
  | "error";
type Direction = "en-us:pt-pt" | "pt-pt:en-us";
type QualityMode = "fast" | "quality";

interface PdfJob {
  id: string;
  file: File;
  status: UiStatus;
  progress: number;
  startedAt?: number;
  finishedAt?: number;
  note?: string;
  resultUrl?: string;
  sidecarUrl?: string;
  error?: string;
}

const MAX_FILE_SIZE_BYTES = 60 * 1024 * 1024;
const MAX_PAGES = 150;

function parseDirection(value: Direction) {
  const [source, target] = value.split(":") as ["en-us" | "pt-pt", "en-us" | "pt-pt"];
  return { source, target };
}

async function hasPdfHeader(file: File) {
  const probe = await file.slice(0, 4096).arrayBuffer();
  const bytes = new Uint8Array(probe);
  const header = [0x25, 0x50, 0x44, 0x46, 0x2d];
  if (bytes.length < header.length) return false;
  const limit = Math.min(bytes.length - header.length + 1, 4096);
  for (let i = 0; i < limit; i += 1) {
    let matches = true;
    for (let j = 0; j < header.length; j += 1) {
      if (bytes[i + j] !== header[j]) {
        matches = false;
        break;
      }
    }
    if (matches) return true;
  }
  return false;
}

async function fileToDataUrl(file: File) {
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("Failed reading file"));
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      if (!result.startsWith("data:")) {
        reject(new Error("Could not encode file as data URL"));
        return;
      }
      resolve(result);
    };
    reader.readAsDataURL(file);
  });
}

function baseName(name: string) {
  return name.replace(/\.[^.]+$/, "");
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function badgeColor(status: UiStatus) {
  if (status === "done") return "text-green-400 border-green-700/30";
  if (status === "error") return "text-red-400 border-red-700/30";
  if (status === "queued") return "text-neutral-400 border-neutral-700";
  return "text-blue-400 border-blue-700/30";
}

export function PdfTranslateStudio() {
  const [jobs, setJobs] = useState<PdfJob[]>([]);
  const [direction, setDirection] = useState<Direction>("en-us:pt-pt");
  const [qualityMode, setQualityMode] = useState<QualityMode>("fast");
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const jobsRef = useRef<PdfJob[]>([]);

  useEffect(() => {
    jobsRef.current = jobs;
  }, [jobs]);

  useEffect(() => {
    const hasProcessing = jobs.some((job) => job.status === "processing");
    if (!hasProcessing) return;
    const timer = setInterval(() => setNowMs(Date.now()), 500);
    return () => clearInterval(timer);
  }, [jobs]);

  const queuedJobs = useMemo(
    () => jobs.filter((job) => job.status === "queued").length,
    [jobs],
  );

  const updateJob = useCallback((id: string, patch: Partial<PdfJob>) => {
    setJobs((current) =>
      current.map((job) => (job.id === id ? { ...job, ...patch } : job)),
    );
  }, []);

  const onAddFiles = useCallback(async (files: File[]) => {
    const accepted = files.filter((file) => {
      const lower = file.name.toLowerCase();
      return lower.endsWith(".pdf") || file.type === "application/pdf";
    });

    if (!accepted.length) return;

    const prepared: PdfJob[] = [];
    for (const file of accepted) {
      const tooLarge = file.size > MAX_FILE_SIZE_BYTES;
      const validHeader = tooLarge ? true : await hasPdfHeader(file);
      prepared.push({
        id: crypto.randomUUID(),
        file,
        status: tooLarge || !validHeader ? "error" : "queued",
        progress: 0,
        error: tooLarge
          ? `File too large (${formatBytes(file.size)}). Limit is ${formatBytes(MAX_FILE_SIZE_BYTES)}.`
          : !validHeader
            ? "Invalid PDF header. Please choose a standard PDF file."
            : undefined,
      });
    }

    setJobs((current) => [...current, ...prepared]);
  }, []);

  const runJob = useCallback(
    async (id: string) => {
      const job = jobsRef.current.find((entry) => entry.id === id);
      if (!job || job.status !== "queued") return;
      if (activeJobId) return;

      const { source, target } = parseDirection(direction);
      setActiveJobId(id);
      const startedAt = Date.now();
      updateJob(id, {
        status: "processing",
        progress: 20,
        error: undefined,
        startedAt,
        finishedAt: undefined,
      });
      if (job.file.size === 0) {
        updateJob(id, {
          status: "error",
          finishedAt: Date.now(),
          error: "Selected file is empty (0 bytes). Please choose a valid PDF.",
        });
        setActiveJobId(null);
        return;
      }
      const formData = new FormData();
      formData.append("file", job.file);
      formData.append("direction", `${source}:${target}`);
      formData.append("quality", qualityMode);

      try {
        const response = await fetch("/api/pdf/translate", {
          method: "POST",
          body: formData,
        });
        updateJob(id, { progress: 90 });
        if (!response.ok) {
          const payload = (await response.json().catch(() => ({}))) as {
            error?: string;
          };
          throw new Error(payload.error ?? "Translation request failed.");
        }
        const blob = await response.blob();
        const resultUrl = URL.createObjectURL(blob);
        updateJob(id, {
          status: "done",
          progress: 100,
          finishedAt: Date.now(),
          resultUrl,
        });
      } catch (error) {
        updateJob(id, {
          status: "error",
          progress: 100,
          finishedAt: Date.now(),
          error: error instanceof Error ? error.message : "Translation failed.",
        });
      } finally {
        setActiveJobId(null);
      }
    },
    [activeJobId, direction, qualityMode, updateJob],
  );

  const runAll = useCallback(async () => {
    if (activeJobId) return;
    const next = jobsRef.current.find((job) => job.status === "queued");
    if (!next) return;
    await runJob(next.id);
  }, [activeJobId, runJob]);

  useEffect(() => {
    if (activeJobId) return;
    const hasQueued = jobs.some((job) => job.status === "queued");
    if (!hasQueued) return;
    const hasActive = jobs.some(
      (job) => job.status === "processing",
    );
    if (!hasActive) {
      void runAll();
    }
  }, [activeJobId, jobs, runAll]);

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

  const removeJob = useCallback((job: PdfJob) => {
    if (job.resultUrl) URL.revokeObjectURL(job.resultUrl);
    setJobs((current) => current.filter((entry) => entry.id !== job.id));
  }, []);

  const retryJob = useCallback(
    (id: string) => {
      updateJob(id, { status: "queued", error: undefined, progress: 0 });
    },
    [updateJob],
  );

  const downloadAll = useCallback(() => {
    jobsRef.current
      .filter((job) => job.status === "done" && job.resultUrl)
      .forEach((job) => {
        const anchor = document.createElement("a");
        anchor.href = job.resultUrl!;
        anchor.download = `${baseName(job.file.name)}.translated.pdf`;
        anchor.click();
      });
  }, []);

  const elapsedLabel = useCallback(
    (job: PdfJob) => {
      if (!job.startedAt) return null;
      const end = job.finishedAt ?? nowMs;
      const elapsed = Math.max(0, end - job.startedAt);
      return `${(elapsed / 1000).toFixed(elapsed < 10000 ? 1 : 0)}s`;
    },
    [nowMs],
  );

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-neutral-300">
              Translation direction
              <select
                value={direction}
                onChange={(event) => setDirection(event.target.value as Direction)}
                className="rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1 text-sm"
              >
                <option value="en-us:pt-pt">en-us → pt-pt</option>
                <option value="pt-pt:en-us">pt-pt → en-us</option>
              </select>
            </label>
            <label className="flex items-center gap-2 text-sm text-neutral-300">
              Quality
              <select
                value={qualityMode}
                onChange={(event) => setQualityMode(event.target.value as QualityMode)}
                className="rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1 text-sm"
              >
                <option value="fast">Fast (Argos)</option>
                <option value="quality">High quality (NLLB local)</option>
              </select>
            </label>
          </div>
          <p className="text-xs text-neutral-500">
            Local-only translation. High quality can be slower on large PDFs.
          </p>
        </div>
      </section>

      <DropZone onFiles={onAddFiles} accept={["pdf"]} />

      {jobs.length > 0 && (
        <section className="rounded-xl border border-neutral-800 bg-neutral-900/30 p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-neutral-400">{jobs.length} PDF(s) selected</p>
            <div className="flex items-center gap-2">
              <button
                onClick={clearDone}
                className="rounded-md border border-neutral-700 px-2.5 py-1 text-xs text-neutral-300 hover:bg-neutral-800"
              >
                Clear done
              </button>
              <button
                onClick={downloadAll}
                disabled={!jobs.some((job) => job.status === "done")}
                className="rounded-md border border-green-700/30 bg-green-600/10 px-2.5 py-1 text-xs text-green-400 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Download all
              </button>
              <button
                onClick={runAll}
                disabled={queuedJobs === 0 || Boolean(activeJobId)}
                className="rounded-md bg-blue-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Translate queued ({queuedJobs})
              </button>
            </div>
          </div>
          <ul className="flex flex-col gap-2">
            {jobs.map((job) => (
              <li
                key={job.id}
                className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-neutral-200">
                      {job.file.name}
                    </p>
                    <p className="text-[11px] text-neutral-500">
                      {formatBytes(job.file.size)}
                      {elapsedLabel(job) ? ` · ${elapsedLabel(job)}` : ""}
                    </p>
                  </div>
                  <span
                    className={`rounded-md border px-2 py-0.5 text-[11px] uppercase ${badgeColor(job.status)}`}
                  >
                    {job.status}
                  </span>
                </div>

                <div className="mt-2 h-1 overflow-hidden rounded-full bg-neutral-800">
                  <div
                    className={`h-full transition-all ${
                      job.status === "error"
                        ? "bg-red-500"
                        : job.status === "done"
                          ? "bg-green-500"
                          : "bg-blue-500"
                    }`}
                    style={{ width: `${job.progress}%` }}
                  />
                </div>

                {job.error && (
                  <p className="mt-2 text-xs text-red-400">{job.error}</p>
                )}

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {job.status === "queued" && (
                    <button
                      onClick={() => void runJob(job.id)}
                      disabled={Boolean(activeJobId)}
                      className="rounded-md border border-blue-700/30 bg-blue-600/20 px-2.5 py-1 text-xs text-blue-300 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Translate
                    </button>
                  )}
                  {job.status === "error" && (
                    <button
                      onClick={() => retryJob(job.id)}
                      className="rounded-md border border-neutral-700 px-2.5 py-1 text-xs text-neutral-300"
                    >
                      Retry
                    </button>
                  )}
                  {job.status === "done" && job.resultUrl && (
                    <>
                      <a
                        href={job.resultUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-md border border-neutral-700 px-2.5 py-1 text-xs text-neutral-300"
                      >
                        Preview
                      </a>
                      <a
                        href={job.resultUrl}
                        download={`${baseName(job.file.name)}.translated.pdf`}
                        className="rounded-md border border-green-700/30 bg-green-600/15 px-2.5 py-1 text-xs text-green-300"
                      >
                        Save PDF
                      </a>
                    </>
                  )}
                  <button
                    onClick={() => removeJob(job)}
                    className="rounded-md border border-neutral-700 px-2.5 py-1 text-xs text-neutral-300"
                  >
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
