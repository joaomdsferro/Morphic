import { PdfTranslateStudio } from "../../components/PdfTranslateStudio";

export default function TranslatePdfPage() {
  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-5">
        <h1 className="text-2xl font-bold text-neutral-100">Translate PDF</h1>
        <p className="mt-1 text-sm text-neutral-400">
          Translate PDF files locally between en-us and pt-pt with a text-first
          flow and automatic OCR fallback when pages are scanned.
        </p>
      </section>
      <PdfTranslateStudio />
    </div>
  );
}
