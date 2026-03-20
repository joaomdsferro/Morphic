import Image from "next/image";
import morphicLogo from "../morphic-logo.svg";

export function Footer() {
  return (
    <footer className="mt-7 py-2 text-sm text-neutral-400">
      <div className="flex items-center justify-center gap-2">
        <Image src={morphicLogo} alt="Morphic logo" className="h-18 w-18 morphic-logo" />
        <span className="italic">A powerful local file manipulation tool</span>
      </div>
    </footer>
  );
}
