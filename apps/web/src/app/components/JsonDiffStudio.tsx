"use client";

import { useMemo, useState } from "react";
import { compareFiles, type JsonDiffResult } from "../utils/diffChecker";

function prettyValue(value: unknown): string {
  if (value === undefined) return "(missing)";
  if (typeof value === "string") return value;

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function JsonDiffStudio() {
  const [leftFile, setLeftFile] = useState<File | null>(null);
  const [rightFile, setRightFile] = useState<File | null>(null);
  const [result, setResult] = useState<JsonDiffResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isComparing, setIsComparing] = useState(false);

  const canCompare = leftFile !== null && rightFile !== null && !isComparing;

  const summary = useMemo(() => {
    if (!result) return null;

    const added = result.differences.filter(
      (diff) => diff.kind === "added",
    ).length;
    const removed = result.differences.filter(
      (diff) => diff.kind === "removed",
    ).length;
    const changed = result.differences.filter(
      (diff) => diff.kind === "changed",
    ).length;

    return { added, removed, changed };
  }, [result]);

  const runCompare = async () => {
    if (!leftFile || !rightFile) {
      setError("Pick both JSON files before running the comparison.");
      return;
    }

    setError(null);
    setIsComparing(true);

    try {
      const nextResult = await compareFiles(leftFile, rightFile);
      setResult(nextResult);
    } catch (nextError) {
      setResult(null);
      setError(
        nextError instanceof Error ? nextError.message : "Comparison failed.",
      );
    } finally {
      setIsComparing(false);
    }
  };

  const clearAll = () => {
    setLeftFile(null);
    setRightFile(null);
    setResult(null);
    setError(null);
  };

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-4">
        <div className="grid gap-4 md:grid-cols-2">
          <label className="rounded-lg border border-dashed border-neutral-700 bg-neutral-900/70 p-3 text-sm text-neutral-300">
            <span className="mb-2 block text-xs uppercase tracking-wide text-neutral-400">
              Left JSON
            </span>
            <input
              type="file"
              accept="application/json,.json"
              className="block w-full text-xs text-neutral-400 file:mr-3 file:rounded-md file:border file:border-neutral-600 file:bg-neutral-800 file:px-2 file:py-1 file:text-xs file:text-neutral-200 file:hover:bg-neutral-700 file:hover:cursor-pointer"
              onChange={(event) => setLeftFile(event.target.files?.[0] ?? null)}
            />
            <span className="mt-2 block truncate text-xs text-neutral-500">
              {leftFile ? leftFile.name : "No file selected"}
            </span>
          </label>

          <label className="rounded-lg border border-dashed border-neutral-700 bg-neutral-900/70 p-3 text-sm text-neutral-300">
            <span className="mb-2 block text-xs uppercase tracking-wide text-neutral-400">
              Right JSON
            </span>
            <input
              type="file"
              accept="application/json,.json"
              className="block w-full text-xs text-neutral-400 file:mr-3 file:rounded-md file:border file:border-neutral-600 file:bg-neutral-800 file:px-2 file:py-1 file:text-xs file:text-neutral-200 file:hover:bg-neutral-700 file:hover:cursor-pointer"
              onChange={(event) =>
                setRightFile(event.target.files?.[0] ?? null)
              }
            />
            <span className="mt-2 block truncate text-xs text-neutral-500">
              {rightFile ? rightFile.name : "No file selected"}
            </span>
          </label>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={runCompare}
            disabled={!canCompare}
            className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white enabled:hover:bg-blue-500 enabled:hover:cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isComparing ? "Comparing..." : "Compare files"}
          </button>
          <button
            type="button"
            onClick={clearAll}
            className="rounded-md border border-neutral-700 px-3 py-1.5 text-xs text-neutral-300 hover:bg-neutral-800 hover:cursor-pointer"
          >
            Reset
          </button>
        </div>

        {error && (
          <p className="mt-3 rounded-md border border-red-900/50 bg-neutral-900 px-3 py-2 text-xs text-red-400">
            {error}
          </p>
        )}
      </section>

      {result && (
        <section className="rounded-xl border border-neutral-800 bg-neutral-900/30 p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-neutral-200">
              {result.isEqual
                ? "Files are identical"
                : `${result.differences.length} difference(s) found`}
            </p>
            {summary && (
              <div className="flex flex-wrap gap-2 text-[11px]">
                <span className="rounded-full border border-green-700/40 bg-green-600/15 px-2 py-0.5 text-green-400">
                  Added: {summary.added}
                </span>
                <span className="rounded-full border border-red-900/50 bg-neutral-900 px-2 py-0.5 text-red-400">
                  Removed: {summary.removed}
                </span>
                <span className="rounded-full border border-blue-900/60 bg-blue-950/30 px-2 py-0.5 text-blue-300">
                  Changed: {summary.changed}
                </span>
              </div>
            )}
          </div>

          {!result.isEqual && (
            <ul className="space-y-2">
              {result.differences.map((diff) => (
                <li
                  key={`${diff.path}-${diff.kind}`}
                  className="rounded-lg border border-neutral-800 bg-neutral-900/60 p-3"
                >
                  <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
                    <span className="rounded border border-neutral-700 px-1.5 py-0.5 font-mono text-neutral-300">
                      {diff.path}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 uppercase tracking-wide ${
                        diff.kind === "added"
                          ? "border border-green-700/40 bg-green-600/15 text-green-400"
                          : diff.kind === "removed"
                            ? "border border-red-900/50 bg-neutral-900 text-red-400"
                            : "border border-blue-900/60 bg-blue-950/30 text-blue-300"
                      }`}
                    >
                      {diff.kind}
                    </span>
                  </div>

                  <div className="grid gap-2 md:grid-cols-2">
                    <div>
                      <p className="mb-1 text-[11px] uppercase tracking-wide text-neutral-500">
                        Before
                      </p>
                      <pre className="max-h-40 overflow-auto rounded-md border border-neutral-800 bg-neutral-950/40 p-2 text-[11px] text-neutral-300">
                        {prettyValue(diff.before)}
                      </pre>
                    </div>
                    <div>
                      <p className="mb-1 text-[11px] uppercase tracking-wide text-neutral-500">
                        After
                      </p>
                      <pre className="max-h-40 overflow-auto rounded-md border border-neutral-800 bg-neutral-950/40 p-2 text-[11px] text-neutral-300">
                        {prettyValue(diff.after)}
                      </pre>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
