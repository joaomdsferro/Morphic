#!/usr/bin/env python3
from __future__ import annotations

import argparse
import os
import re
import sys
from typing import List, Tuple

import fitz  # type: ignore
from argostranslate import translate as argos_translate  # type: ignore

NLLB_MODEL_ID = "facebook/nllb-200-distilled-600M"


def resolve_languages(direction: str) -> Tuple[str, str]:
    if direction == "en-us:pt-pt":
        return ("en", "pt")
    if direction == "pt-pt:en-us":
        return ("pt", "en")
    raise RuntimeError(f"Unsupported direction: {direction}")


def build_argos_translator(src: str, dst: str):
    langs = argos_translate.get_installed_languages()
    src_lang = next((l for l in langs if l.code == src), None)
    dst_lang = next((l for l in langs if l.code == dst), None)
    if src_lang is None or dst_lang is None:
        raise RuntimeError(
            f"Argos language package not installed for {src}->{dst}. "
            "Run the bootstrap to install language models."
        )
    translation = src_lang.get_translation(dst_lang)
    if translation is None:
        raise RuntimeError(f"No translation model available for {src}->{dst}.")
    return translation.translate


class NllbTranslator:
    def __init__(self) -> None:
        from transformers import AutoModelForSeq2SeqLM, AutoTokenizer  # type: ignore

        self.torch = __import__("torch")  # type: ignore
        self.tokenizer = AutoTokenizer.from_pretrained(
            NLLB_MODEL_ID,
            local_files_only=True,
        )
        self.model = AutoModelForSeq2SeqLM.from_pretrained(
            NLLB_MODEL_ID,
            local_files_only=True,
        )
        self.device = "cpu"
        self.model.to(self.device)

    @staticmethod
    def lang_tag(code: str) -> str:
        if code == "en":
            return "eng_Latn"
        if code == "pt":
            return "por_Latn"
        raise RuntimeError(f"Unsupported NLLB language code: {code}")

    def translate(self, text: str, src: str, dst: str) -> str:
        self.tokenizer.src_lang = self.lang_tag(src)
        encoded = self.tokenizer(text, return_tensors="pt", truncation=True, max_length=512)
        with self.torch.no_grad():
            generated = self.model.generate(
                **encoded.to(self.device),
                forced_bos_token_id=self.tokenizer.convert_tokens_to_ids(
                    self.lang_tag(dst)
                ),
                max_new_tokens=256,
            )
        return self.tokenizer.batch_decode(generated, skip_special_tokens=True)[0]


def build_translator(src: str, dst: str):
    model = os.getenv("MORPHIC_PDF_MODEL", "argos").lower()
    if model == "nllb":
        try:
            nllb = NllbTranslator()
            return lambda text: nllb.translate(text, src, dst)
        except Exception:
            # Fall back to fast local model if optional heavy model is unavailable.
            pass
    return build_argos_translator(src, dst)


def should_translate(text: str) -> bool:
    cleaned = text.strip()
    if not cleaned:
        return False
    return any(ch.isalpha() for ch in cleaned)


def normalize_source_text(text: str) -> str:
    out = text.strip()
    out = re.sub(r"\s+", " ", out)
    # Common broken tokenization in simple PDF samples.
    out = re.sub(r"\bfi\s*le\b", "file", out, flags=re.IGNORECASE)
    out = re.sub(r"\bfi\s*les\b", "files", out, flags=re.IGNORECASE)
    return out


def pick_font_name(flags: int, source_font: str = "") -> str:
    source = source_font.lower()
    if "times" in source:
        return "tiro"
    if "courier" in source:
        return "cour"
    # MuPDF flags: bit 1=italic, bit 4=bold (common mapping in extracted spans).
    is_italic = (flags & 2) != 0
    is_bold = (flags & 16) != 0
    if is_bold and is_italic:
        return "hebi"
    if is_bold:
        return "hebo"
    if is_italic:
        return "heit"
    return "helv"


def inset_rect(rect: fitz.Rect, dx: float = 0.6, dy: float = 0.4) -> fitz.Rect:
    x0 = rect.x0 + dx
    y0 = rect.y0 + dy
    x1 = rect.x1 - dx
    y1 = rect.y1 - dy
    if x1 <= x0:
        x0, x1 = rect.x0, rect.x1
    if y1 <= y0:
        y0, y1 = rect.y0, rect.y1
    return fitz.Rect(x0, y0, x1, y1)


def is_table_like_line(spans: List[dict], line_rect: fitz.Rect) -> bool:
    if len(spans) < 2:
        return False
    span_rects: List[fitz.Rect] = []
    for span in spans:
        x0, y0, x1, y1 = span.get("bbox", [0, 0, 0, 0])
        span_rects.append(fitz.Rect(float(x0), float(y0), float(x1), float(y1)))
    span_rects.sort(key=lambda r: r.x0)

    # Large horizontal gaps usually indicate separate table cells.
    max_gap = 0.0
    for i in range(len(span_rects) - 1):
        gap = span_rects[i + 1].x0 - span_rects[i].x1
        if gap > max_gap:
            max_gap = gap

    return max_gap > max(12.0, line_rect.width * 0.06)


def guess_alignment(page: fitz.Page, rect: fitz.Rect) -> int:
    page_center = page.rect.width / 2.0
    line_center = (rect.x0 + rect.x1) / 2.0
    if abs(line_center - page_center) <= page.rect.width * 0.08:
        return fitz.TEXT_ALIGN_CENTER
    return fitz.TEXT_ALIGN_LEFT


def fit_font_size(
    page: fitz.Page,
    rect: fitz.Rect,
    text: str,
    base_size: float,
    font_name: str,
    align: int,
) -> float:
    size = max(6.0, min(base_size, 72.0))
    for _ in range(16):
        rc = page.insert_textbox(
            rect,
            text,
            fontsize=size,
            fontname=font_name,
            color=(0, 0, 0),
            align=align,
            render_mode=3,  # invisible text for measuring fit only
        )
        if rc >= 0:
            return size
        size -= max(0.5, base_size * 0.04)
        if size <= 6.0:
            break
    return max(size, 6.0)


def preserve_list_prefix(original: str, translated: str) -> str:
    stripped = original.lstrip()
    prefix = original[: len(original) - len(stripped)]
    if stripped.startswith("•"):
        bullet = "•"
        rest = stripped[1:].lstrip()
        if translated.lstrip().startswith("•"):
            return translated
        return f"{prefix}{bullet} {translated.lstrip()}" if rest else translated
    if stripped.startswith("- "):
        if translated.lstrip().startswith("- "):
            return translated
        return f"{prefix}- {translated.lstrip()}"
    return translated


def translate_pdf(input_path: str, output_path: str, direction: str) -> None:
    src, dst = resolve_languages(direction)
    translate_fn = build_translator(src, dst)
    cache: dict[str, str] = {}

    doc = fitz.open(input_path)
    try:
        for page in doc:
            text_dict = page.get_text("dict")
            overlays: List[Tuple[fitz.Rect, str, float, int, str]] = []
            for block in text_dict.get("blocks", []):
                if block.get("type") != 0:
                    continue
                for line in block.get("lines", []):
                    spans = line.get("spans", [])
                    if not spans:
                        continue
                    x0, y0, x1, y1 = line.get("bbox", [0, 0, 0, 0])
                    line_rect = fitz.Rect(float(x0), float(y0), float(x1), float(y1))

                    if is_table_like_line(spans, line_rect):
                        # In tables, translate each span/cell independently to preserve columns.
                        for span in spans:
                            original = str(span.get("text", ""))
                            if not should_translate(original):
                                continue
                            source_text = normalize_source_text(original)
                            if source_text in cache:
                                translated = cache[source_text]
                            else:
                                translated = translate_fn(source_text).strip()
                                cache[source_text] = translated
                            if not translated:
                                continue
                            translated = preserve_list_prefix(original, translated)

                            sx0, sy0, sx1, sy1 = span.get("bbox", [0, 0, 0, 0])
                            rect = fitz.Rect(
                                float(sx0),
                                float(sy0),
                                float(sx1),
                                float(sy1),
                            )
                            base_size = float(span.get("size", 10.0))
                            flags = int(span.get("flags", 0))
                            font_name_src = str(span.get("font", ""))
                            overlays.append(
                                (rect, translated, base_size, flags, font_name_src)
                            )
                    else:
                        original = "".join(str(span.get("text", "")) for span in spans)
                        if not should_translate(original):
                            continue

                        source_text = normalize_source_text(original)
                        if source_text in cache:
                            translated = cache[source_text]
                        else:
                            translated = translate_fn(source_text).strip()
                            cache[source_text] = translated
                        if not translated:
                            continue
                        translated = preserve_list_prefix(original, translated)

                        span_sizes = [float(s.get("size", 10.0)) for s in spans]
                        base_size = sum(span_sizes) / max(len(span_sizes), 1)
                        flags = int(spans[0].get("flags", 0))
                        font_name_src = str(spans[0].get("font", ""))
                        overlays.append(
                            (line_rect, translated, base_size, flags, font_name_src)
                        )

            # First redact text regions so old text is removed from selection/copy.
            for rect, _, _, _, _ in overlays:
                page.add_redact_annot(inset_rect(rect), fill=(1, 1, 1))
            if overlays:
                page.apply_redactions(images=fitz.PDF_REDACT_IMAGE_NONE)

            # Then draw translated text in the same regions.
            for rect, translated, base_size, flags, source_font in overlays:
                # Try to preserve weight/style and alignment from the original line.
                # We use the first span as the style anchor for this line.
                font_name = pick_font_name(flags, source_font)
                align = guess_alignment(page, rect)
                size = fit_font_size(
                    page,
                    rect,
                    translated,
                    base_size,
                    font_name=font_name,
                    align=align,
                )
                page.insert_textbox(
                    rect,
                    translated,
                    fontsize=size,
                    fontname=font_name,
                    color=(0, 0, 0),
                    align=align,
                )

        doc.save(output_path, deflate=True, garbage=3)
    finally:
        doc.close()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--direction", required=True)
    args = parser.parse_args()

    try:
        translate_pdf(args.input, args.output, args.direction)
        return 0
    except Exception as exc:
        print(str(exc), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
