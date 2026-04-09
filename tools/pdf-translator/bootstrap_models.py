#!/usr/bin/env python3
from __future__ import annotations

from argostranslate import package as argos_package  # type: ignore
from argostranslate import translate as argos_translate  # type: ignore


def has_translation(src: str, dst: str) -> bool:
    languages = argos_translate.get_installed_languages()
    source = next((lang for lang in languages if lang.code == src), None)
    target = next((lang for lang in languages if lang.code == dst), None)
    if source is None or target is None:
        return False
    return source.get_translation(target) is not None


def install_pair(src: str, dst: str) -> None:
    argos_package.update_package_index()
    packages = argos_package.get_available_packages()
    candidates = [p for p in packages if p.from_code == src and p.to_code == dst]
    if not candidates:
        raise RuntimeError(f"No Argos package available for {src}->{dst}")

    # Prefer the latest package if versions are available.
    chosen = sorted(candidates, key=lambda p: str(getattr(p, "version", "")))[-1]
    download_path = chosen.download()
    argos_package.install_from_path(download_path)


def ensure_models() -> None:
    required_pairs = [("en", "pt"), ("pt", "en")]
    for src, dst in required_pairs:
        if not has_translation(src, dst):
            install_pair(src, dst)


if __name__ == "__main__":
    ensure_models()
