export type JsonPrimitive = string | number | boolean | null;
export type JsonValue =
  | JsonPrimitive
  | JsonValue[]
  | { [key: string]: JsonValue };

export type DiffKind = "added" | "removed" | "changed";

export interface JsonDiffItem {
  path: string;
  kind: DiffKind;
  before?: JsonValue;
  after?: JsonValue;
}

export interface JsonDiffResult {
  isEqual: boolean;
  differences: JsonDiffItem[];
}

function isObject(value: JsonValue): value is { [key: string]: JsonValue } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function buildPath(basePath: string, key: string | number): string {
  if (typeof key === "number") {
    return `${basePath}[${key}]`;
  }

  return basePath ? `${basePath}.${key}` : key;
}

function compareJsonValues(
  left: JsonValue,
  right: JsonValue,
  path: string,
  differences: JsonDiffItem[],
): void {
  if (Object.is(left, right)) {
    return;
  }

  if (Array.isArray(left) && Array.isArray(right)) {
    const maxLength = Math.max(left.length, right.length);

    for (let index = 0; index < maxLength; index += 1) {
      const itemPath = buildPath(path, index);

      if (index >= left.length) {
        differences.push({
          path: itemPath,
          kind: "added",
          after: right[index],
        });
        continue;
      }

      if (index >= right.length) {
        differences.push({
          path: itemPath,
          kind: "removed",
          before: left[index],
        });
        continue;
      }

      const leftItem = left[index];
      const rightItem = right[index];

      if (leftItem === undefined || rightItem === undefined) {
        continue;
      }

      compareJsonValues(leftItem, rightItem, itemPath, differences);
    }

    return;
  }

  if (isObject(left) && isObject(right)) {
    const keys = new Set([...Object.keys(left), ...Object.keys(right)]);

    for (const key of keys) {
      const hasLeft = key in left;
      const hasRight = key in right;
      const keyPath = buildPath(path, key);

      if (!hasLeft && hasRight) {
        differences.push({
          path: keyPath,
          kind: "added",
          after: right[key],
        });
        continue;
      }

      if (hasLeft && !hasRight) {
        differences.push({
          path: keyPath,
          kind: "removed",
          before: left[key],
        });
        continue;
      }

      const leftValue = left[key];
      const rightValue = right[key];

      if (leftValue === undefined || rightValue === undefined) {
        continue;
      }

      compareJsonValues(leftValue, rightValue, keyPath, differences);
    }

    return;
  }

  differences.push({
    path,
    kind: "changed",
    before: left,
    after: right,
  });
}

export async function compareFiles(
  fileA: File,
  fileB: File,
): Promise<JsonDiffResult> {
  const [textA, textB] = await Promise.all([fileA.text(), fileB.text()]);

  let left: JsonValue;
  let right: JsonValue;

  try {
    left = JSON.parse(textA) as JsonValue;
  } catch {
    throw new Error(`Invalid JSON in ${fileA.name}`);
  }

  try {
    right = JSON.parse(textB) as JsonValue;
  } catch {
    throw new Error(`Invalid JSON in ${fileB.name}`);
  }

  const differences: JsonDiffItem[] = [];
  compareJsonValues(left, right, "$", differences);

  return {
    isEqual: differences.length === 0,
    differences,
  };
}
