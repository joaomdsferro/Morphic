import React from "react";

const FORMAT_COLORS: Record<string, string> = {
  jpeg: "bg-orange-500/20 text-orange-300 border-orange-500/30",
  jpg: "bg-orange-500/20 text-orange-300 border-orange-500/30",
  png: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  webp: "bg-green-500/20 text-green-300 border-green-500/30",
  avif: "bg-purple-500/20 text-purple-300 border-purple-500/30",
  jxl: "bg-pink-500/20 text-pink-300 border-pink-500/30",
  gif: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
  bmp: "bg-neutral-500/20 text-neutral-300 border-neutral-500/30",
  tiff: "bg-cyan-500/20 text-cyan-300 border-cyan-500/30",
};

export interface FormatBadgeProps {
  format: string;
  className?: string;
}

export function FormatBadge({ format, className = "" }: FormatBadgeProps) {
  const colorClass =
    FORMAT_COLORS[format.toLowerCase()] ??
    "bg-neutral-500/20 text-neutral-300 border-neutral-500/30";

  return (
    <span
      className={[
        "inline-flex items-center rounded-md border px-2 py-0.5",
        "text-xs font-semibold uppercase tracking-wider",
        colorClass,
        className,
      ].join(" ")}
    >
      {format.toUpperCase()}
    </span>
  );
}
