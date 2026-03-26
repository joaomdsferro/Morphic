import Link from "next/link";

const sections = [
  {
    title: "Convert",
    description: "Change file formats quickly while staying local.",
    items: [
      { label: "Images", href: "/convert/images", status: "Ready" },
      { label: "Videos", href: "/convert/videos", status: "Route ready" },
    ],
  },
  {
    title: "Compress",
    description: "Reduce file size for sharing, web, and storage.",
    items: [
      { label: "Images", href: "/compress/images", status: "Ready" },
      { label: "Videos", href: "/compress/videos", status: "Route ready" },
    ],
  },
  {
    title: "Upscale",
    description: "Increase image dimensions for higher-resolution outputs.",
    items: [{ label: "Images", href: "/upscale/images", status: "Ready" }],
  },
  {
    title: "Compare",
    description: "Check what changed between two files with local diff tools.",
    items: [{ label: "JSON", href: "/compare/json", status: "Ready" }],
  },
  {
    title: "Import",
    description: "Pull files from the cloud directly onto your device.",
    items: [
      { label: "Google Drive", href: "/import/google-drive", status: "Ready" },
      {
        label: "Google Photos",
        href: "/import/google-photos",
        status: "Ready",
      },
    ],
  },
];

export default function HomePage() {
  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-neutral-800 bg-neutral-900/50 p-6 sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-widest text-blue-400">
          Local-first media toolkit
        </p>
        <h1 className="mt-3 text-3xl font-bold tracking-tight text-neutral-100 sm:text-4xl">
          Convert, compress, and upscale from dedicated workflows
        </h1>
        <p className="mt-3 max-w-3xl text-sm text-neutral-400 sm:text-base">
          Morphic now separates each action by media type so the intended
          workflow is always clear. Pick an action below to open the matching
          page.
        </p>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {sections.map((section) => (
          <article
            key={section.title}
            className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-4"
          >
            <h2 className="text-lg font-semibold text-neutral-100">
              {section.title}
            </h2>
            <p className="mt-1 text-sm text-neutral-400">
              {section.description}
            </p>
            <ul className="mt-4 space-y-2">
              {section.items.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="flex items-center justify-between rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-200 hover:border-neutral-600 hover:bg-neutral-800"
                  >
                    <span>{item.label}</span>
                    <span className="rounded-full border border-neutral-600 px-2 py-0.5 text-[10px] uppercase tracking-wide text-neutral-400">
                      {item.status}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </article>
        ))}
      </section>
    </div>
  );
}
