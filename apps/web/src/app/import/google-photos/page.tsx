import { GooglePhotosImport } from "@/app/components/GooglePhotosImport";

export default function GooglePhotosPage() {
  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-neutral-800 bg-neutral-900/50 p-6 sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-widest text-blue-400">
          Import · Google Photos
        </p>
        <h1 className="mt-3 text-3xl font-bold tracking-tight text-neutral-100 sm:text-4xl">
          Google Photos
        </h1>
        <p className="mt-3 max-w-3xl text-sm text-neutral-400 sm:text-base">
          Browse and download your photos and videos directly from Google
          Photos. Videos are shown first — they&apos;re usually the biggest
          storage consumers.
        </p>
      </section>

      <GooglePhotosImport />
    </div>
  );
}
