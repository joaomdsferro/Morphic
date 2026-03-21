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

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            callback: (response: { access_token?: string; error?: string }) => void;
          }) => { requestAccessToken: () => void };
        };
      };
    };
  }
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function mimeLabel(mimeType: string) {
  const part = mimeType.split("/").pop() ?? mimeType;
  return part.replace("x-", "").toUpperCase().slice(0, 10);
}

export function GoogleDriveImport() {
  const [clientId, setClientId] = useState<string>("");
  const [clientIdInput, setClientIdInput] = useState("");
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [files, setFiles] = useState<DriveFile[] | null>(null);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [downloads, setDownloads] = useState<Record<string, DownloadState>>({});
  const [error, setError] = useState<string | null>(null);
  const [gisLoaded, setGisLoaded] = useState(false);
  const tokenClientRef = useRef<{ requestAccessToken: () => void } | null>(null);

  // Hydration-safe: read localStorage only after mount
  useEffect(() => {
    const saved = localStorage.getItem("morphic-gdrive-client-id") ?? "";
    setClientId(saved);
    setClientIdInput(saved);
  }, []);

  // Load Google Identity Services script
  useEffect(() => {
    if (document.querySelector('script[src*="accounts.google.com/gsi/client"]')) {
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
  useEffect(() => {
    if (!gisLoaded || !clientId || !window.google) return;
    tokenClientRef.current = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: "https://www.googleapis.com/auth/drive.readonly",
      callback: (response) => {
        if (response.access_token) {
          setAccessToken(response.access_token);
          setError(null);
        } else {
          setError(`Authentication failed: ${response.error ?? "unknown error"}`);
        }
      },
    });
  }, [gisLoaded, clientId]);

  // Fetch files after getting the access token
  useEffect(() => {
    if (!accessToken) return;
    setLoadingFiles(true);
    setError(null);

    const params = new URLSearchParams({
      orderBy: "quotaBytesUsed desc",
      fields: "files(id,name,size,mimeType,modifiedTime)",
      pageSize: "50",
      q: "trashed=false",
    });

    fetch(`https://www.googleapis.com/drive/v3/files?${params}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
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
          .slice(0, 5);
        setFiles(sorted);
      })
      .catch((e: Error) => setError(`Failed to fetch files: ${e.message}`))
      .finally(() => setLoadingFiles(false));
  }, [accessToken]);

  const saveClientId = useCallback(() => {
    const id = clientIdInput.trim();
    localStorage.setItem("morphic-gdrive-client-id", id);
    setClientId(id);
  }, [clientIdInput]);

  const connect = useCallback(() => {
    tokenClientRef.current?.requestAccessToken();
  }, []);

  const signOut = useCallback(() => {
    setAccessToken(null);
    setFiles(null);
    setDownloads({});
  }, []);

  const resetCredentials = useCallback(() => {
    localStorage.removeItem("morphic-gdrive-client-id");
    setClientId("");
    setClientIdInput("");
    setAccessToken(null);
    setFiles(null);
    setDownloads({});
  }, []);

  const downloadFile = useCallback(
    async (file: DriveFile) => {
      setDownloads((prev) => ({ ...prev, [file.id]: { status: "downloading", progress: 0 } }));
      try {
        const response = await fetch(
          `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const total = Number(response.headers.get("content-length") ?? file.size ?? 0);
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
              [file.id]: { status: "downloading", progress: Math.round((received / total) * 100) },
            }));
          }
        }

        const blob = new Blob(chunks, { type: file.mimeType });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = file.name;
        anchor.click();
        URL.revokeObjectURL(url);

        setDownloads((prev) => ({ ...prev, [file.id]: { status: "done", progress: 100 } }));
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setDownloads((prev) => ({ ...prev, [file.id]: { status: "error", progress: 0, error: msg } }));
      }
    },
    [accessToken]
  );

  // ── Step 1: enter Client ID ──────────────────────────────────────────────
  if (!clientId) {
    return (
      <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-6 space-y-4">
        <div>
          <h2 className="text-base font-semibold text-neutral-100">Connect Google Drive</h2>
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
            <li>Create an OAuth 2.0 Client ID of type "Web application"</li>
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
            onKeyDown={(e) => e.key === "Enter" && clientIdInput.trim() && saveClientId()}
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
  return (
    <div className="space-y-4">
      {!accessToken && (
        <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-5 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-neutral-100">Google Drive</h2>
            <p className="mt-0.5 text-sm text-neutral-400">
              Sign in to see your 5 largest files.
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
          No binary files found in your Drive.
        </div>
      )}

      {files && files.length > 0 && (
        <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 overflow-hidden">
          <div className="flex items-center justify-between border-b border-neutral-800 px-4 py-3">
            <h2 className="text-sm font-semibold text-neutral-100">
              Top {files.length} largest files
            </h2>
            <button
              onClick={signOut}
              className="text-xs text-neutral-500 hover:text-neutral-300 hover:cursor-pointer"
            >
              Sign out
            </button>
          </div>
          <ul className="divide-y divide-neutral-800">
            {files.map((file) => {
              const dl = downloads[file.id];
              return (
                <li key={file.id} className="flex items-center gap-4 px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-sm font-medium text-neutral-100">{file.name}</p>
                    <p className="text-xs text-neutral-500">
                      {formatBytes(Number(file.size ?? 0))} ·{" "}
                      <span className="inline-flex items-center rounded bg-neutral-800 px-1.5 py-0.5 text-[10px] font-medium text-neutral-400">
                        {mimeLabel(file.mimeType)}
                      </span>
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
                  <button
                    onClick={() => downloadFile(file)}
                    disabled={dl?.status === "downloading"}
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
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="flex items-center justify-between text-xs text-neutral-600">
        <span title={clientId}>
          Client ID: {clientId.slice(0, 24)}…
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
