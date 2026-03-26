import { ImageActionStudio } from "../../components/ImageActionStudio";

export default function ConvertImagesPage() {
  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-5">
        <h1 className="text-2xl font-bold text-neutral-100">Convert Images</h1>
        <p className="mt-1 text-sm text-neutral-400">
          Convert image files to another format locally on your machine.
        </p>
      </section>
      <ImageActionStudio mode="convert" />
    </div>
  );
}
