"use client";

import React, { useCallback, useState } from "react";

export interface DropZoneProps {
  onFiles: (files: File[]) => void;
  accept?: string[];
  className?: string;
}

export function DropZone({ onFiles, accept, className = "" }: DropZoneProps) {
  const [isDragging, setIsDragging] = useState(false);

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragging(false);
      const files = Array.from(e.dataTransfer.files);
      if (files.length > 0) onFiles(files);
    },
    [onFiles],
  );

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => setIsDragging(false);

  const handleClick = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    if (accept) input.accept = accept.map((a) => `.${a}`).join(",");
    input.onchange = (e) => {
      const files = Array.from((e.target as HTMLInputElement).files ?? []);
      if (files.length > 0) onFiles(files);
    };
    input.click();
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={(e) => e.key === "Enter" && handleClick()}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      className={[
        "flex flex-col items-center justify-center gap-3",
        "rounded-2xl border-2 border-dashed p-12 cursor-pointer",
        "transition-colors duration-150 select-none",
        isDragging
          ? "border-blue-500 bg-blue-500/10"
          : "border-neutral-700 bg-neutral-900 hover:border-neutral-500",
        className,
      ].join(" ")}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        className="h-10 w-10 text-neutral-500"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.5}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
        />
      </svg>
      <p className="text-sm font-medium text-neutral-400">
        Drop files here or{" "}
        <span className="text-blue-400 underline underline-offset-2">
          click to browse
        </span>
      </p>
      {accept && (
        <p className="text-xs text-neutral-600">
          Supports: {accept.map((a) => a.toUpperCase()).join(", ")}
        </p>
      )}
    </div>
  );
}
