import { VideoActionStudio } from "../../components/VideoActionStudio";

export default function ConvertVideosPage() {
  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-5">
        <h1 className="text-2xl font-bold text-neutral-100">Convert Videos</h1>
        <p className="mt-1 text-sm text-neutral-400">
          Dedicated video conversion route with upload flow and queue.
        </p>
      </section>
      <VideoActionStudio mode="convert" />
    </div>
  );
}
