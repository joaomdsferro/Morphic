export type TranslationDirection = "en-us:pt-pt" | "pt-pt:en-us";

const SUPPORTED_DIRECTIONS: TranslationDirection[] = [
  "en-us:pt-pt",
  "pt-pt:en-us",
];

const EN_TO_PT_WORDS: Record<string, string> = {
  hello: "ola",
  world: "mundo",
  file: "ficheiro",
  files: "ficheiros",
  page: "pagina",
  pages: "paginas",
  document: "documento",
  translation: "traducao",
  translated: "traduzido",
  language: "idioma",
  text: "texto",
  image: "imagem",
  images: "imagens",
  quality: "qualidade",
  process: "processo",
  processing: "a processar",
  success: "sucesso",
  error: "erro",
  download: "transferir",
  upload: "carregar",
  scan: "digitalizacao",
  scanned: "digitalizado",
};

const PT_TO_EN_WORDS: Record<string, string> = Object.fromEntries(
  Object.entries(EN_TO_PT_WORDS).map(([en, pt]) => [pt, en]),
);

function tokenize(input: string): string[] {
  return input.split(/(\s+|[.,;:!?()[\]{}"'])/g).filter(Boolean);
}

function mapWord(token: string, direction: TranslationDirection): string {
  const dictionary = direction === "en-us:pt-pt" ? EN_TO_PT_WORDS : PT_TO_EN_WORDS;
  const lower = token.toLowerCase();
  const mapped = dictionary[lower];
  if (!mapped) return token;
  if (token[0] && token[0] === token[0].toUpperCase()) {
    return mapped[0].toUpperCase() + mapped.slice(1);
  }
  return mapped;
}

export function isSupportedDirection(value: string): value is TranslationDirection {
  return SUPPORTED_DIRECTIONS.includes(value as TranslationDirection);
}

export function buildDirection(source: "en-us" | "pt-pt", target: "en-us" | "pt-pt") {
  const key = `${source}:${target}`;
  if (!isSupportedDirection(key)) {
    throw new Error("Unsupported language direction");
  }
  return key;
}

export function estimateTextDensity(text: string) {
  const cleaned = text.replace(/\s+/g, "");
  if (!cleaned.length) return 0;
  const alpha = cleaned.match(/[A-Za-zÀ-ÿ]/g)?.length ?? 0;
  return alpha / cleaned.length;
}

export function shouldUseOcr(text: string) {
  const normalized = text.trim();
  if (!normalized) return true;
  const density = estimateTextDensity(normalized);
  return normalized.length < 40 || density < 0.45;
}

export function chunkSegments(segments: string[], maxChars = 1600): string[][] {
  const chunks: string[][] = [];
  let current: string[] = [];
  let currentSize = 0;

  for (const segment of segments) {
    if (segment.length > maxChars) {
      if (current.length) {
        chunks.push(current);
        current = [];
        currentSize = 0;
      }
      chunks.push([segment]);
      continue;
    }

    if (currentSize + segment.length > maxChars && current.length) {
      chunks.push(current);
      current = [];
      currentSize = 0;
    }

    current.push(segment);
    currentSize += segment.length;
  }

  if (current.length) chunks.push(current);
  return chunks;
}

export function translateSegmentLocally(
  text: string,
  direction: TranslationDirection,
) {
  return tokenize(text)
    .map((token) => mapWord(token, direction))
    .join("");
}

export function normalizePageText(lines: string[]) {
  return lines
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n");
}
