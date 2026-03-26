"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "./ThemeToggle";

type NavItem = {
  href: string;
  label: string;
  isNew?: boolean;
};

const navItems: NavItem[] = [
  { href: "/convert/images", label: "Convert Images" },
  { href: "/convert/videos", label: "Convert Videos" },
  { href: "/compress/images", label: "Compress Images" },
  { href: "/compress/videos", label: "Compress Videos" },
  { href: "/upscale/images", label: "Upscale Images" },
  { href: "/compare/json", label: "Compare JSON", isNew: true },
  { href: "/import", label: "Import", isNew: true },
];

function isActivePath(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function MainNav() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-wrap items-center gap-2 text-xs font-medium text-neutral-300">
      {navItems.map((item) => {
        const active = isActivePath(pathname, item.href);

        return (
          <Link
            key={item.href}
            href={item.href}
            className={`rounded-md border px-2.5 py-1 hover:cursor-pointer ${
              active
                ? "border-blue-600 bg-blue-600 text-white hover:bg-blue-500"
                : "border-neutral-700 hover:bg-neutral-800"
            }`}
          >
            <span>
              {item.label}
              {item.isNew && (
                <sup
                  className={`ml-1 text-[9px] font-semibold uppercase tracking-wide ${
                    active ? "text-white/80" : "text-blue-400"
                  }`}
                >
                  New
                </sup>
              )}
            </span>
          </Link>
        );
      })}
      <ThemeToggle />
    </nav>
  );
}
