"use client";

import { useMemo, useState } from "react";

type VideoMode = "convert" | "compress";

type VideoItem = {
  id: string;
  file: File;
};

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export function VideoActionStudio({ mode }: { mode: VideoMode }) {
  const [files, setFiles] = useState<VideoItem[]>([]);

  const actionLabel = useMemo(
    () => (mode === "convert" ? "Convert videos" : "Compress videos"),
    [mode],
  );

  return (
    <div className="space-y-4">
      <label className="block cursor-pointer rounded-xl border-2 border-dashed border-neutral-700 bg-neutral-900/50 p-6 text-center hover:border-neutral-600 hover:bg-neutral-900">
        <input
          className="sr-only"
          type="file"
          multiple
          accept="video/*"
          onChange={(event) => {
            const nextFiles = Array.from(event.target.files ?? []).filter(
              (file) => file.type.startsWith("video/"),
            );
            if (!nextFiles.length) return;

            setFiles((current) => [
              ...current,
              ...nextFiles.map((file) => ({
                id: crypto.randomUUID(),
                file,
              })),
            ]);
            event.target.value = "";
          }}
        />
        <p className="text-sm text-neutral-300">
          Drop videos or click to browse
        </p>
        <p className="mt-1 text-xs text-neutral-500">MP4 · MOV · MKV · WebM</p>
      </label>

      <section className="rounded-xl border border-neutral-700 bg-neutral-900/40 p-4">
        <p className="text-sm font-medium text-neutral-200">
          {actionLabel} page is available.
        </p>
        <p className="mt-1 text-xs text-neutral-400">
          The web route and upload flow are ready. Hook this page to your video
          processing engine to execute the final action.
        </p>
      </section>

      {files.length > 0 && (
        <section className="rounded-xl border border-neutral-800 bg-neutral-900/30 p-4">
          <p className="mb-3 text-xs text-neutral-400">
            {files.length} video file(s) queued
          </p>
          <ul className="space-y-2">
            {files.map((item) => (
              <li
                key={item.id}
                className="rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="truncate text-sm text-neutral-200">
                    {item.file.name}
                  </p>
                  <span className="shrink-0 text-xs text-neutral-500">
                    {formatBytes(item.file.size)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
