import Link from "next/link";

const sources = [
  {
    id: "google-drive",
    label: "Google Drive",
    description: "Download your largest files from Google Drive.",
    href: "/import/google-drive",
    status: "Ready",
  },
  {
    id: "google-photos",
    label: "Google Photos",
    description: "Browse and download photos and videos from Google Photos.",
    href: "/import/google-photos",
    status: "Ready",
  },
];

export default function ImportPage() {
  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-neutral-800 bg-neutral-900/50 p-6 sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-widest text-blue-400">Import</p>
        <h1 className="mt-3 text-3xl font-bold tracking-tight text-neutral-100 sm:text-4xl">
          Import files from the cloud
        </h1>
        <p className="mt-3 max-w-3xl text-sm text-neutral-400 sm:text-base">
          Pull files directly into Morphic from external sources — everything is downloaded
          locally and never leaves your device after that.
        </p>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
        {sources.map((source) => (
          <Link
            key={source.id}
            href={source.href}
            className="flex flex-col gap-2 rounded-xl border border-neutral-800 bg-neutral-900/40 p-4 hover:border-neutral-700 hover:bg-neutral-900/60 hover:cursor-pointer transition-colors"
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-neutral-100">{source.label}</span>
              <span className="rounded-full border border-neutral-600 px-2 py-0.5 text-[10px] uppercase tracking-wide text-neutral-400">
                {source.status}
              </span>
            </div>
            <p className="text-xs text-neutral-500">{source.description}</p>
          </Link>
        ))}
      </section>
    </div>
  );
}
