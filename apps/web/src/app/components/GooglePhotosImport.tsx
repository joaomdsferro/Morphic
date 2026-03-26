"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// ── Picker API types ──────────────────────────────────────────────────────────

interface PickerSession {
  id: string;
  pickerUri: string;
  mediaItemsSet?: boolean;
}

interface PickerMediaFile {
  baseUrl: string;
  mimeType: string;
  filename: string;
  mediaFileMetadata?: {
    width?: number;
    height?: number;
    videoMetadata?: { fps?: number };
  };
}

interface PickerMediaItem {
  id: string;
  createTime: string;
  type: "PHOTO" | "VIDEO";
  mediaFile: PickerMediaFile;
}

interface DownloadState {
  status: "idle" | "downloading" | "done" | "error";
  progress: number;
  error?: string;
}

declare global {
  interface Window {
    showDirectoryPicker(options?: {
      mode?: "read" | "readwrite";
    }): Promise<FileSystemDirectoryHandle>;
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            callback: (response: {
              access_token?: string;
              error?: string;
            }) => void;
          }) => { requestAccessToken: () => void };
        };
      };
    };
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function resolutionLabel(item: PickerMediaItem) {
  const m = item.mediaFile.mediaFileMetadata;
  if (m?.width && m?.height) return `${m.width}×${m.height}`;
  return null;
}

// ── Component ─────────────────────────────────────────────────────────────────

type Phase =
  | "idle" // not signed in
  | "signed-in" // signed in, waiting for user to open picker
  | "picking" // picker tab open, polling
  | "loading" // fetching selected items
  | "ready"; // items available

export function GooglePhotosImport() {
  const [clientId, setClientId] = useState("");
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [items, setItems] = useState<PickerMediaItem[]>([]);
  const [downloads, setDownloads] = useState<Record<string, DownloadState>>({});
  const [error, setError] = useState<string | null>(null);
  const [gisLoaded, setGisLoaded] = useState(false);
  const tokenClientRef = useRef<{ requestAccessToken: () => void } | null>(
    null,
  );
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sessionRef = useRef<PickerSession | null>(null);

  // Hydration-safe localStorage read + restore cached token
  useEffect(() => {
    setClientId(localStorage.getItem("morphic-gdrive-client-id") ?? "");

    try {
      const raw = localStorage.getItem("morphic-gphotos-token");
      if (raw) {
        const { token, expiresAt } = JSON.parse(raw) as {
          token: string;
          expiresAt: number;
        };
        if (Date.now() < expiresAt) setAccessToken(token);
        else localStorage.removeItem("morphic-gphotos-token");
      }
    } catch {
      localStorage.removeItem("morphic-gphotos-token");
    }
  }, []);

  // Load GIS script
  useEffect(() => {
    if (
      document.querySelector('script[src*="accounts.google.com/gsi/client"]')
    ) {
      setGisLoaded(true);
      return;
    }
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.onload = () => setGisLoaded(true);
    document.head.appendChild(script);
  }, []);

  // Init token client for Picker scope
  useEffect(() => {
    if (!gisLoaded || !clientId || !window.google) return;
    tokenClientRef.current = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: "https://www.googleapis.com/auth/photospicker.mediaitems.readonly",
      callback: (response) => {
        if (response.access_token) {
          setAccessToken(response.access_token);
          localStorage.setItem(
            "morphic-gphotos-token",
            JSON.stringify({
              token: response.access_token,
              expiresAt: Date.now() + 55 * 60 * 1000, // 55 min (tokens last 60)
            }),
          );
          setError(null);
        } else {
          setError(
            `Authentication failed: ${response.error ?? "unknown error"}`,
          );
        }
      },
    });
  }, [gisLoaded, clientId]);

  // Cleanup polling on unmount
  useEffect(
    () => () => {
      if (pollRef.current) clearInterval(pollRef.current);
    },
    [],
  );

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const fetchSelectedItems = useCallback(
    async (sessionId: string, token: string, append: boolean) => {
      setPhase("loading");
      try {
        const incoming: PickerMediaItem[] = [];
        let nextPageToken: string | undefined;

        do {
          const params = new URLSearchParams({
            sessionId,
            pageSize: "100",
          });
          if (nextPageToken) params.set("pageToken", nextPageToken);

          const res = await fetch(
            `https://photospicker.googleapis.com/v1/mediaItems?${params.toString()}`,
            { headers: { Authorization: `Bearer ${token}` } },
          );
          if (!res.ok) throw new Error(`Picker API error ${res.status}`);

          const data = await res.json();
          incoming.push(...((data.mediaItems ?? []) as PickerMediaItem[]));
          nextPageToken = data.nextPageToken;
        } while (nextPageToken);

        const incomingUnique = incoming.filter(
          (item, index, arr) =>
            arr.findIndex((v) => v.id === item.id) === index,
        );

        setItems((prev) => {
          if (!append) return incomingUnique;
          // Merge, deduplicating by id
          const existingIds = new Set(prev.map((i) => i.id));
          return [
            ...prev,
            ...incomingUnique.filter((i) => !existingIds.has(i.id)),
          ];
        });
        setPhase("ready");
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        setPhase("idle");
      }
    },
    [],
  );

  const openPicker = useCallback(
    async (token: string, append = false) => {
      setError(null);
      try {
        // Create a picker session
        const res = await fetch(
          "https://photospicker.googleapis.com/v1/sessions",
          {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
          },
        );
        if (!res.ok)
          throw new Error(`Failed to create picker session: ${res.status}`);
        const session: PickerSession = await res.json();
        sessionRef.current = session;

        // Open Google's hosted picker in a new tab
        window.open(session.pickerUri, "_blank");
        setPhase("picking");

        // Poll until the user finishes picking
        pollRef.current = setInterval(async () => {
          try {
            const pollRes = await fetch(
              `https://photospicker.googleapis.com/v1/sessions/${session.id}`,
              { headers: { Authorization: `Bearer ${token}` } },
            );
            if (!pollRes.ok) {
              stopPolling();
              return;
            }
            const pollData: PickerSession = await pollRes.json();
            if (pollData.mediaItemsSet) {
              stopPolling();
              await fetchSelectedItems(session.id, token, append);
            }
          } catch {
            stopPolling();
          }
        }, 2500);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        setPhase("idle");
      }
    },
    [stopPolling, fetchSelectedItems],
  );

  const connect = useCallback(() => {
    tokenClientRef.current?.requestAccessToken();
  }, []);

  // After sign-in, move to a "signed in" state so user can click "Open Picker"
  useEffect(() => {
    if (accessToken && phase === "idle") setPhase("signed-in" as Phase);
  }, [accessToken, phase]);

  const reset = useCallback(() => {
    stopPolling();
    localStorage.removeItem("morphic-gphotos-token");
    setAccessToken(null);
    setPhase("idle");
    setItems([]);
    setDownloads({});
    setError(null);
    sessionRef.current = null;
  }, [stopPolling]);

  const pickMore = useCallback(() => {
    if (accessToken) openPicker(accessToken, true);
  }, [accessToken, openPicker]);

  // Removes an item from the local selection only.
  // The Google Photos Picker API is read-only — apps cannot delete photos from
  // a user's Google Photos library via API.
  const removeItem = useCallback((id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
    setDownloads((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  const downloadItem = useCallback(
    async (item: PickerMediaItem) => {
      setDownloads((prev) => ({
        ...prev,
        [item.id]: { status: "downloading", progress: 0 },
      }));
      try {
        const url =
          item.type === "VIDEO"
            ? `${item.mediaFile.baseUrl}=dv`
            : `${item.mediaFile.baseUrl}=d`;

        const response = await fetch(url, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const total = Number(response.headers.get("content-length") ?? 0);
        const reader = response.body!.getReader();
        const chunks: Uint8Array[] = [];
        let received = 0;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
          received += value.length;
          if (total > 0) {
            setDownloads((prev) => ({
              ...prev,
              [item.id]: {
                status: "downloading",
                progress: Math.round((received / total) * 100),
              },
            }));
          }
        }

        const blob = new Blob(chunks as BlobPart[], {
          type: item.mediaFile.mimeType,
        });
        const objectUrl = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = objectUrl;
        anchor.download = item.mediaFile.filename;
        anchor.click();
        URL.revokeObjectURL(objectUrl);

        setDownloads((prev) => ({
          ...prev,
          [item.id]: { status: "done", progress: 100 },
        }));
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setDownloads((prev) => ({
          ...prev,
          [item.id]: { status: "error", progress: 0, error: msg },
        }));
      }
    },
    [accessToken],
  );

  const downloadAll = useCallback(async () => {
    const pending = items.filter((i) => downloads[i.id]?.status !== "done");
    if (pending.length === 0) return;

    // Try folder picker (one Allow click for all files).
    // Falls back to anchor downloads if the API is blocked or unavailable.
    let dirHandle: FileSystemDirectoryHandle | null = null;
    if (
      "showDirectoryPicker" in window &&
      typeof window.showDirectoryPicker === "function"
    ) {
      try {
        dirHandle = await window.showDirectoryPicker({ mode: "readwrite" });
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return; // user cancelled
        // API blocked (e.g. Brave Shields) — fall through to anchor downloads
      }
    }

    async function downloadOne(item: PickerMediaItem) {
      setDownloads((prev) => ({
        ...prev,
        [item.id]: { status: "downloading", progress: 0 },
      }));
      try {
        const url =
          item.type === "VIDEO"
            ? `${item.mediaFile.baseUrl}=dv`
            : `${item.mediaFile.baseUrl}=d`;

        const response = await fetch(url, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const total = Number(response.headers.get("content-length") ?? 0);
        const reader = response.body!.getReader();
        const chunks: ArrayBuffer[] = [];
        let received = 0;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (!value) continue;
          chunks.push(value.slice().buffer);
          received += value.length;
          if (total > 0) {
            setDownloads((prev) => ({
              ...prev,
              [item.id]: {
                status: "downloading",
                progress: Math.round((received / total) * 100),
              },
            }));
          }
        }

        if (dirHandle) {
          const fileHandle = await dirHandle.getFileHandle(
            item.mediaFile.filename,
            { create: true },
          );
          const writable = await fileHandle.createWritable();
          for (const chunk of chunks) await writable.write(chunk);
          await writable.close();
        } else {
          const blob = new Blob(chunks, { type: item.mediaFile.mimeType });
          const objectUrl = URL.createObjectURL(blob);
          const anchor = document.createElement("a");
          anchor.href = objectUrl;
          anchor.download = item.mediaFile.filename;
          anchor.click();
          URL.revokeObjectURL(objectUrl);
        }

        setDownloads((prev) => ({
          ...prev,
          [item.id]: { status: "done", progress: 100 },
        }));
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setDownloads((prev) => ({
          ...prev,
          [item.id]: { status: "error", progress: 0, error: msg },
        }));
      }
    }

    // 3 concurrent workers pulling from a shared queue
    const queue = [...pending];
    const worker = async () => {
      while (queue.length > 0) await downloadOne(queue.shift()!);
    };
    await Promise.all([worker(), worker(), worker()]);
  }, [items, downloads, accessToken]);

  // ── No Client ID ─────────────────────────────────────────────────────────────
  if (!clientId) {
    return (
      <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-5 text-sm text-neutral-400">
        No Google credentials configured.{" "}
        <a
          href="/import/google-drive"
          className="text-blue-400 hover:underline hover:cursor-pointer"
        >
          Set up your Client ID in Google Drive first
        </a>{" "}
        — the same credentials work here.
      </div>
    );
  }

  // ── Idle / sign-in ────────────────────────────────────────────────────────────
  if (phase === "idle" && !accessToken) {
    return (
      <div className="space-y-4">
        {error && (
          <div className="rounded-lg border border-red-800 bg-red-950/30 px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        )}
        <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-5 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-neutral-100">
              Google Photos
            </h2>
            <p className="mt-0.5 text-sm text-neutral-400">
              Sign in to open the Google Photos picker.
            </p>
          </div>
          <button
            onClick={connect}
            disabled={!gisLoaded}
            className="shrink-0 rounded-lg border border-neutral-700 bg-neutral-900 px-4 py-2 text-sm font-medium text-neutral-200 hover:bg-neutral-800 hover:cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {gisLoaded ? "Sign in with Google" : "Loading…"}
          </button>
        </div>
      </div>
    );
  }

  // ── Signed in — prompt to open picker ────────────────────────────────────────
  if (phase === "signed-in") {
    return (
      <div className="space-y-4">
        {error && (
          <div className="rounded-lg border border-red-800 bg-red-950/30 px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        )}
        <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-5 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-neutral-100">Ready</h2>
            <p className="mt-0.5 text-sm text-neutral-400">
              Open the Google Photos picker to select files to download.
            </p>
          </div>
          <button
            onClick={() => accessToken && openPicker(accessToken)}
            className="shrink-0 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 hover:cursor-pointer"
          >
            Open Picker
          </button>
        </div>
      </div>
    );
  }

  // ── Picking ────────────────────────────────────────────────────────────────────
  if (phase === "picking") {
    return (
      <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-6 flex flex-col items-center gap-3 text-center">
        <div className="flex h-10 w-10 items-center justify-center rounded-full border border-neutral-700 bg-neutral-800">
          <span className="animate-pulse text-blue-400 text-lg">↗</span>
        </div>
        <p className="text-sm font-medium text-neutral-200">
          Google Photos picker opened in a new tab
        </p>
        <p className="text-xs text-neutral-500">
          Select your files there, then confirm — this page will update
          automatically.
        </p>
        <button
          onClick={reset}
          className="mt-1 text-xs text-neutral-600 hover:text-neutral-400 hover:cursor-pointer"
        >
          Cancel
        </button>
      </div>
    );
  }

  // ── Loading ───────────────────────────────────────────────────────────────────
  if (phase === "loading") {
    return (
      <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 px-5 py-4 text-sm text-neutral-400">
        Fetching selected items…
      </div>
    );
  }

  // ── Ready ─────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-lg border border-red-800 bg-red-950/30 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {items.length > 0 &&
        items.every((i) => downloads[i.id]?.status === "done") && (
          <div className="rounded-xl border border-amber-800/50 bg-amber-950/20 px-4 py-3 flex items-center justify-between gap-4">
            <p className="text-sm text-amber-300">
              All downloaded. Go to Google Photos to delete them.
            </p>
            <a
              href="https://photos.google.com"
              target="_blank"
              rel="noreferrer"
              className="shrink-0 rounded-lg border border-amber-700/50 px-3 py-1.5 text-xs font-medium text-amber-300 hover:bg-amber-950/40 hover:cursor-pointer transition-colors"
            >
              Open Google Photos ↗
            </a>
          </div>
        )}

      {items.length === 0 ? (
        <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 px-5 py-4 text-sm text-neutral-400">
          No items selected.
        </div>
      ) : (
        <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 overflow-hidden">
          <div className="flex items-center justify-between border-b border-neutral-800 px-4 py-3">
            <h2 className="text-sm font-semibold text-neutral-100">
              {items.length} item{items.length !== 1 ? "s" : ""} selected
            </h2>
            <div className="flex items-center gap-3">
              <button
                onClick={downloadAll}
                disabled={items.every(
                  (i) =>
                    downloads[i.id]?.status === "done" ||
                    downloads[i.id]?.status === "downloading",
                )}
                className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-500 hover:cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Download All
              </button>
              <button
                onClick={pickMore}
                className="text-xs text-blue-400 hover:text-blue-300 hover:cursor-pointer"
              >
                Pick more
              </button>
              <button
                onClick={reset}
                className="text-xs text-neutral-500 hover:text-neutral-300 hover:cursor-pointer"
              >
                Reset
              </button>
            </div>
          </div>
          <ul className="divide-y divide-neutral-800">
            {items.map((item) => {
              const dl = downloads[item.id];
              const res = resolutionLabel(item);
              return (
                <li key={item.id} className="flex items-center gap-4 px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-sm font-medium text-neutral-100">
                      {item.mediaFile.filename}
                    </p>
                    <p className="text-xs text-neutral-500">
                      {formatDate(item.createTime)}
                      {res && ` · ${res}`}
                      {item.type === "VIDEO" && (
                        <span className="ml-2 inline-flex items-center rounded bg-blue-950/60 border border-blue-900/40 px-1.5 py-0.5 text-[10px] font-medium text-blue-400">
                          VIDEO
                        </span>
                      )}
                    </p>
                    {dl?.status === "downloading" && (
                      <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-neutral-800">
                        <div
                          className="h-full bg-blue-500 transition-all duration-150"
                          style={{
                            width: `${dl.progress > 0 ? dl.progress : 15}%`,
                          }}
                        />
                      </div>
                    )}
                    {dl?.status === "error" && (
                      <p className="mt-1 text-xs text-red-400">{dl.error}</p>
                    )}
                  </div>
                  <button
                    onClick={() => downloadItem(item)}
                    disabled={dl?.status === "downloading"}
                    className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium hover:cursor-pointer transition-colors ${
                      dl?.status === "done"
                        ? "border border-neutral-700 text-neutral-400"
                        : "bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                    }`}
                  >
                    {dl?.status === "downloading"
                      ? dl.progress > 0
                        ? `${dl.progress}%`
                        : "…"
                      : dl?.status === "done"
                        ? "Downloaded ✓"
                        : "Download"}
                  </button>
                  <button
                    onClick={() => removeItem(item.id)}
                    disabled={dl?.status === "downloading"}
                    title="Remove from selection (Google Photos API does not support deletion)"
                    className="shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium text-neutral-500 hover:text-red-400 hover:bg-red-950/30 hover:cursor-pointer transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Remove
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
