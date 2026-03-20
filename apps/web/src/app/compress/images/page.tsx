import { ImageActionStudio } from "../../components/ImageActionStudio";

export default function CompressImagesPage() {
  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-5">
        <h1 className="text-2xl font-bold text-neutral-100">Compress Images</h1>
        <p className="mt-1 text-sm text-neutral-400">Reduce image file size while keeping your files fully local.</p>
      </section>
      <ImageActionStudio mode="compress" />
    </div>
  );
}
