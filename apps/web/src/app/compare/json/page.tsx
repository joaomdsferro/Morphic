import { JsonDiffStudio } from "../../components/JsonDiffStudio";

export default function CompareJsonPage() {
  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-5">
        <h1 className="text-2xl font-bold text-neutral-100">
          Compare JSON Files
        </h1>
        <p className="mt-1 text-sm text-neutral-400">
          Run a local diff check between two JSON files and inspect added,
          removed, and changed keys.
        </p>
      </section>
      <JsonDiffStudio />
    </div>
  );
}
