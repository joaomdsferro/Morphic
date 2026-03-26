"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface DriveFile {
  id: string;
  name: string;
  size?: string;
  mimeType: string;
  modifiedTime: string;
}

interface DownloadState {
  status: "idle" | "downloading" | "done" | "error";
  progress: number;
  error?: string;
}

type DeleteState = "confirming" | "deleting" | "deleted" | "error";

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

const EXPORT_MAP: Record<string, { mime: string; ext: string }> = {
  "application/vnd.google-apps.document": {
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ext: ".docx",
  },
  "application/vnd.google-apps.spreadsheet": {
    mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ext: ".xlsx",
  },
  "application/vnd.google-apps.presentation": {
    mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ext: ".pptx",
  },
  "application/vnd.google-apps.drawing": { mime: "image/png", ext: ".png" },
  "application/vnd.google-apps.script": {
    mime: "application/vnd.google-apps.script+json",
    ext: ".json",
  },
};

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function mimeLabel(mimeType: string) {
  const part = mimeType.split("/").pop() ?? mimeType;
  return part.replace("x-", "").toUpperCase().slice(0, 10);
}

export function GoogleDriveImport() {
  const [clientId, setClientId] = useState<string | null>(null);
  const [clientIdInput, setClientIdInput] = useState("");
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [files, setFiles] = useState<DriveFile[] | null>(null);
  const [limit, setLimit] = useState(5);
  const [includeShared, setIncludeShared] = useState(false);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [downloads, setDownloads] = useState<Record<string, DownloadState>>({});
  const [deleteStates, setDeleteStates] = useState<Record<string, DeleteState>>(
    {},
  );
  const [error, setError] = useState<string | null>(null);
  const [gisLoaded, setGisLoaded] = useState(false);
  const tokenClientRef = useRef<{ requestAccessToken: () => void } | null>(
    null,
  );

  // Hydration-safe: read localStorage only after mount + restore cached token
  useEffect(() => {
    const saved = localStorage.getItem("morphic-gdrive-client-id") ?? "";
    setClientId(saved);
    setClientIdInput(saved);

    try {
      const raw = localStorage.getItem("morphic-gdrive-token");
      if (raw) {
        const { token, expiresAt } = JSON.parse(raw) as {
          token: string;
          expiresAt: number;
        };
        if (Date.now() < expiresAt) setAccessToken(token);
        else localStorage.removeItem("morphic-gdrive-token");
      }
    } catch {
      localStorage.removeItem("morphic-gdrive-token");
    }
  }, []);

  // Load Google Identity Services script
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

  // Init token client once GIS is ready and clientId is set
  // Requires `drive` scope (not `drive.readonly`) to allow file deletion
  useEffect(() => {
    if (!gisLoaded || !clientId || !window.google) return;
    tokenClientRef.current = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: "https://www.googleapis.com/auth/drive",
      callback: (response) => {
        if (response.access_token) {
          setAccessToken(response.access_token);
          localStorage.setItem(
            "morphic-gdrive-token",
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

  const fetchFiles = useCallback(
    (token: string, count: number, shared: boolean) => {
      setLoadingFiles(true);
      setError(null);
      setDownloads({});
      setDeleteStates({});

      const q = shared ? "trashed=false" : "trashed=false and 'me' in owners";
      const params = new URLSearchParams({
        orderBy: "quotaBytesUsed desc",
        fields: "files(id,name,size,mimeType,modifiedTime)",
        pageSize: String(Math.min(count * 4, 200)), // over-fetch to account for zero-size files
        q,
      });

      fetch(`https://www.googleapis.com/drive/v3/files?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((r) => {
          if (!r.ok) throw new Error(`Drive API error ${r.status}`);
          return r.json();
        })
        .then((data) => {
          const all: DriveFile[] = data.files ?? [];
          const sorted = all
            .filter((f) => f.size && Number(f.size) > 0)
            .sort((a, b) => Number(b.size) - Number(a.size))
            .slice(0, count);
          setFiles(sorted);
        })
        .catch((e: Error) => setError(`Failed to fetch files: ${e.message}`))
        .finally(() => setLoadingFiles(false));
    },
    [],
  );

  // Fetch on sign-in
  useEffect(() => {
    if (accessToken) fetchFiles(accessToken, limit, includeShared);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  const applyLimit = useCallback(
    (newLimit: number) => {
      setLimit(newLimit);
      if (accessToken) fetchFiles(accessToken, newLimit, includeShared);
    },
    [accessToken, includeShared, fetchFiles],
  );

  const toggleShared = useCallback(
    (shared: boolean) => {
      setIncludeShared(shared);
      if (accessToken) fetchFiles(accessToken, limit, shared);
    },
    [accessToken, limit, fetchFiles],
  );

  const saveClientId = useCallback(() => {
    const id = clientIdInput.trim();
    localStorage.setItem("morphic-gdrive-client-id", id);
    setClientId(id);
  }, [clientIdInput]);

  const connect = useCallback(() => {
    tokenClientRef.current?.requestAccessToken();
  }, []);

  const signOut = useCallback(() => {
    localStorage.removeItem("morphic-gdrive-token");
    setAccessToken(null);
    setFiles(null);
    setDownloads({});
    setDeleteStates({});
  }, []);

  const resetCredentials = useCallback(() => {
    localStorage.removeItem("morphic-gdrive-client-id");
    localStorage.removeItem("morphic-gdrive-token");
    setClientId("");
    setClientIdInput("");
    setAccessToken(null);
    setFiles(null);
    setDownloads({});
    setDeleteStates({});
  }, []);

  const downloadOne = useCallback(
    async (file: DriveFile, dirHandle: FileSystemDirectoryHandle | null) => {
      setDownloads((prev) => ({
        ...prev,
        [file.id]: { status: "downloading", progress: 0 },
      }));
      try {
        const exportTarget = EXPORT_MAP[file.mimeType];
        const isWorkspace = file.mimeType.startsWith(
          "application/vnd.google-apps.",
        );

        if (isWorkspace && !exportTarget) {
          throw new Error(
            "This Google Workspace file type cannot be exported.",
          );
        }

        const fetchUrl = exportTarget
          ? `https://www.googleapis.com/drive/v3/files/${file.id}/export?mimeType=${encodeURIComponent(exportTarget.mime)}`
          : `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`;

        const response = await fetch(fetchUrl, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!response.ok) {
          if (response.status === 403 && exportTarget) {
            throw new Error(
              `Google blocked the export — the file likely exceeds the export size limit (~10 MB for Docs/Sheets). Open it in Google Drive to download manually.`,
            );
          }
          throw new Error(`HTTP ${response.status}`);
        }

        const total = Number(
          response.headers.get("content-length") ?? file.size ?? 0,
        );
        if (!response.body) throw new Error("No response body");
        const reader = response.body.getReader();
        const chunks: Array<Uint8Array<ArrayBuffer>> = [];
        let received = 0;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
          received += value.length;
          if (total > 0) {
            setDownloads((prev) => ({
              ...prev,
              [file.id]: {
                status: "downloading",
                progress: Math.round((received / total) * 100),
              },
            }));
          }
        }

        const downloadMime = exportTarget?.mime ?? file.mimeType;
        const downloadName = exportTarget
          ? file.name + exportTarget.ext
          : file.name;

        if (dirHandle) {
          const fileHandle = await dirHandle.getFileHandle(downloadName, {
            create: true,
          });
          const writable = await fileHandle.createWritable();
          for (const chunk of chunks) await writable.write(chunk);
          await writable.close();
        } else {
          const blob = new Blob(chunks, { type: downloadMime });
          const url = URL.createObjectURL(blob);
          const anchor = document.createElement("a");
          anchor.href = url;
          anchor.download = downloadName;
          anchor.click();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        }

        setDownloads((prev) => ({
          ...prev,
          [file.id]: { status: "done", progress: 100 },
        }));
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setDownloads((prev) => ({
          ...prev,
          [file.id]: { status: "error", progress: 0, error: msg },
        }));
      }
    },
    [accessToken],
  );

  const downloadFile = useCallback(
    (file: DriveFile) => downloadOne(file, null),
    [downloadOne],
  );

  const downloadAll = useCallback(async () => {
    if (!files) return;
    const pending = files.filter((f) => downloads[f.id]?.status !== "done");
    if (pending.length === 0) return;

    let dirHandle: FileSystemDirectoryHandle | null = null;
    if (
      "showDirectoryPicker" in window &&
      typeof window.showDirectoryPicker === "function"
    ) {
      try {
        dirHandle = await window.showDirectoryPicker({ mode: "readwrite" });
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return;
        // Blocked (e.g. Brave Shields) — fall through to anchor downloads
      }
    }

    // 3 concurrent workers
    const queue = [...pending];
    const worker = async () => {
      while (queue.length > 0) await downloadOne(queue.shift()!, dirHandle);
    };
    await Promise.all([worker(), worker(), worker()]);
  }, [files, downloads, downloadOne]);

  const deleteFile = useCallback(
    async (file: DriveFile) => {
      setDeleteStates((prev) => ({ ...prev, [file.id]: "deleting" }));
      try {
        const response = await fetch(
          `https://www.googleapis.com/drive/v3/files/${file.id}`,
          {
            method: "DELETE",
            headers: { Authorization: `Bearer ${accessToken}` },
          },
        );
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        setDeleteStates((prev) => ({ ...prev, [file.id]: "deleted" }));
        setFiles((prev) => prev?.filter((f) => f.id !== file.id) ?? null);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(`Failed to delete "${file.name}": ${msg}`);
        setDeleteStates((prev) => ({ ...prev, [file.id]: "error" }));
      }
    },
    [accessToken],
  );

  const cancelDelete = useCallback((fileId: string) => {
    setDeleteStates((prev) => {
      const next = { ...prev };
      delete next[fileId];
      return next;
    });
  }, []);

  // ── Not yet hydrated ─────────────────────────────────────────────────────
  if (clientId === null) return null;

  // ── Step 1: enter Client ID ──────────────────────────────────────────────
  if (!clientId) {
    return (
      <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-6 space-y-4">
        <div>
          <h2 className="text-base font-semibold text-neutral-100">
            Connect Google Drive
          </h2>
          <p className="mt-2 text-sm text-neutral-400 leading-relaxed">
            You need a Google OAuth 2.0 Client ID. To get one:
          </p>
          <ol className="mt-2 space-y-1 text-sm text-neutral-400 list-decimal list-inside">
            <li>
              Go to the{" "}
              <a
                href="https://console.cloud.google.com/apis/credentials"
                target="_blank"
                rel="noreferrer"
                className="text-blue-400 hover:underline hover:cursor-pointer"
              >
                Google Cloud Console → Credentials
              </a>
            </li>
            <li>
              Create an OAuth 2.0 Client ID of type &quot;Web application&quot;
            </li>
            <li>
              Add{" "}
              <code className="rounded bg-neutral-800 px-1 text-xs text-neutral-300">
                http://localhost:3000
              </code>{" "}
              as an Authorized JavaScript Origin
            </li>
            <li>Enable the Google Drive API for your project</li>
          </ol>
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={clientIdInput}
            onChange={(e) => setClientIdInput(e.target.value)}
            onKeyDown={(e) =>
              e.key === "Enter" && clientIdInput.trim() && saveClientId()
            }
            placeholder="123456789-abc.apps.googleusercontent.com"
            className="flex-1 rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-200 placeholder-neutral-600 focus:border-blue-500 focus:outline-none"
          />
          <button
            onClick={saveClientId}
            disabled={!clientIdInput.trim()}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 hover:cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Save
          </button>
        </div>
      </div>
    );
  }

  // ── Step 2: sign in + file list ──────────────────────────────────────────
  const allDone =
    !!files &&
    files.length > 0 &&
    files.every((f) => downloads[f.id]?.status === "done");

  return (
    <div className="space-y-4">
      {!accessToken && (
        <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-5 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-neutral-100">
              Google Drive
            </h2>
            <p className="mt-0.5 text-sm text-neutral-400">
              Sign in to browse your largest files.
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
      )}

      {error && (
        <div className="rounded-lg border border-red-800 bg-red-950/30 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {loadingFiles && (
        <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 px-5 py-4 text-sm text-neutral-400">
          Fetching your largest files…
        </div>
      )}

      {files && files.length === 0 && (
        <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 px-5 py-4 text-sm text-neutral-400">
          No files found in your Drive.
        </div>
      )}

      {files && files.length > 0 && (
        <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 overflow-hidden">
          <div className="flex items-center justify-between border-b border-neutral-800 px-4 py-3 gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <h2 className="text-sm font-semibold text-neutral-100 shrink-0">
                Top {files.length} largest files
              </h2>
              {/* Limit slider + shared toggle */}
              {accessToken && (
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min={5}
                    max={50}
                    step={5}
                    value={limit}
                    onChange={(e) => setLimit(Number(e.target.value))}
                    onMouseUp={(e) =>
                      applyLimit(Number((e.target as HTMLInputElement).value))
                    }
                    onTouchEnd={(e) =>
                      applyLimit(Number((e.target as HTMLInputElement).value))
                    }
                    disabled={loadingFiles}
                    className="w-24 accent-blue-500 hover:cursor-pointer disabled:opacity-40"
                  />
                  <button
                    onClick={() => toggleShared(!includeShared)}
                    disabled={loadingFiles}
                    className={`shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-medium border transition-colors hover:cursor-pointer disabled:opacity-40 ${
                      includeShared
                        ? "border-blue-700 bg-blue-950/40 text-blue-400"
                        : "border-neutral-700 bg-neutral-800 text-neutral-500"
                    }`}
                  >
                    {includeShared ? "Shared: on" : "Shared: off"}
                  </button>
                  <span className="text-xs text-neutral-500 tabular-nums w-6">
                    {limit}
                  </span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <button
                onClick={downloadAll}
                disabled={
                  allDone ||
                  files.some((f) => downloads[f.id]?.status === "downloading")
                }
                className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-500 hover:cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Download All
              </button>
              <button
                onClick={signOut}
                className="text-xs text-neutral-500 hover:text-neutral-300 hover:cursor-pointer"
              >
                Sign out
              </button>
            </div>
          </div>
          <ul className="divide-y divide-neutral-800">
            {files.map((file) => {
              const dl = downloads[file.id];
              const ds = deleteStates[file.id];
              const isWorkspace = file.mimeType.startsWith(
                "application/vnd.google-apps.",
              );
              const likelyExportFail =
                isWorkspace && Number(file.size ?? 0) > 10 * 1024 * 1024;
              return (
                <li
                  key={file.id}
                  className="drive-file-row flex items-center gap-3 px-4 py-3"
                >
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-sm font-medium text-neutral-100">
                      {file.name}
                    </p>
                    <p className="text-xs text-neutral-500">
                      {formatBytes(Number(file.size ?? 0))} ·{" "}
                      <span className="inline-flex items-center rounded bg-neutral-800 px-1.5 py-0.5 text-[10px] font-medium text-neutral-400">
                        {mimeLabel(file.mimeType)}
                      </span>
                      {likelyExportFail && (
                        <span
                          title="Google Workspace files over ~10 MB often fail to export via the API. Download may not work."
                          className="ml-2 inline-flex items-center rounded bg-amber-950/50 border border-amber-800/40 px-1.5 py-0.5 text-[10px] font-medium text-amber-400"
                        >
                          ⚠ export limit
                        </span>
                      )}
                    </p>
                    {dl?.status === "downloading" && (
                      <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-neutral-800">
                        <div
                          className="h-full bg-blue-500 transition-all duration-150"
                          style={{ width: `${dl.progress}%` }}
                        />
                      </div>
                    )}
                    {dl?.status === "error" && (
                      <p className="mt-1 text-xs text-red-400">{dl.error}</p>
                    )}
                  </div>

                  {/* Open in Drive — always visible */}
                  <a
                    href={`https://drive.google.com/open?id=${file.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="shrink-0 rounded-lg border border-neutral-700 px-3 py-1.5 text-xs font-medium text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 hover:cursor-pointer transition-colors"
                  >
                    ↗
                  </a>

                  {/* Download button (hidden for files that can't be exported) */}
                  {!likelyExportFail && (
                    <button
                      onClick={() => downloadFile(file)}
                      disabled={
                        dl?.status === "downloading" ||
                        ds === "deleting" ||
                        ds === "deleted"
                      }
                      className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium hover:cursor-pointer transition-colors ${
                        dl?.status === "done"
                          ? "border border-neutral-700 text-neutral-400 cursor-default"
                          : "bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                      }`}
                    >
                      {dl?.status === "downloading"
                        ? `${dl.progress}%`
                        : dl?.status === "done"
                          ? "Downloaded ✓"
                          : "Download"}
                    </button>
                  )}

                  {/* Delete button — two-step confirmation */}
                  {ds === "deleted" ? (
                    <span className="shrink-0 text-xs text-neutral-500">
                      Deleted
                    </span>
                  ) : ds === "deleting" ? (
                    <span className="shrink-0 text-xs text-neutral-400">
                      Deleting…
                    </span>
                  ) : ds === "confirming" ? (
                    <div className="shrink-0 flex items-center gap-1">
                      <button
                        onClick={() => deleteFile(file)}
                        className="rounded px-2 py-1 text-xs font-medium bg-red-600 text-white hover:bg-red-500 hover:cursor-pointer"
                      >
                        Confirm delete
                      </button>
                      <button
                        onClick={() => cancelDelete(file.id)}
                        className="rounded px-1.5 py-1 text-xs text-neutral-500 hover:text-neutral-300 hover:cursor-pointer"
                      >
                        ✕
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() =>
                        setDeleteStates((prev) => ({
                          ...prev,
                          [file.id]: "confirming",
                        }))
                      }
                      disabled={dl?.status === "downloading"}
                      className="shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium text-red-500 hover:text-red-400 hover:bg-red-950/30 hover:cursor-pointer transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Delete
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="flex items-center justify-between text-xs text-neutral-600">
        <span title={clientId ?? ""}>
          Client ID: {(clientId ?? "").slice(0, 24)}…
        </span>
        <button
          onClick={resetCredentials}
          className="hover:text-neutral-400 hover:cursor-pointer"
        >
          Reset credentials
        </button>
      </div>
    </div>
  );
}
