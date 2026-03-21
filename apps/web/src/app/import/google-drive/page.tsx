import { GoogleDriveImport } from "@/app/components/GoogleDriveImport";

export default function GoogleDrivePage() {
  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-neutral-800 bg-neutral-900/50 p-6 sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-widest text-blue-400">
          Import · Google Drive
        </p>
        <h1 className="mt-3 text-3xl font-bold tracking-tight text-neutral-100 sm:text-4xl">
          Google Drive
        </h1>
        <p className="mt-3 max-w-3xl text-sm text-neutral-400 sm:text-base">
          Sign in with your Google account to browse and download your largest Drive files.
          Your OAuth token stays in the browser — nothing is sent to any Morphic server.
        </p>
      </section>

      <GoogleDriveImport />
    </div>
  );
}
