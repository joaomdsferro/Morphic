import { promises as fs } from "node:fs";
import { constants as fsConstants } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

function resolveRepoRootFromWebCwd() {
  // In this monorepo, web app cwd is <repo>/apps/web.
  return path.resolve(process.cwd(), "..", "..");
}

async function resolveUvBinary() {
  const candidates = [process.env.UV_BIN, "uv", path.join(os.homedir(), ".local/bin/uv")].filter(
    Boolean,
  ) as string[];
  for (const candidate of candidates) {
    try {
      await fs.access(candidate, fsConstants.X_OK);
      return candidate;
    } catch {
      // Keep searching.
    }
  }
  return "uv";
}

function runLocalTranslate(
  uvBin: string,
  args: string[],
  envOverrides?: Record<string, string>,
) {
  return new Promise<{ code: number | null; stdout: string; stderr: string }>(
    (resolve) => {
      const child = spawn(uvBin, args, {
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env, ...envOverrides },
      });
      let stdout = "";
      let stderr = "";

      child.stdout.on("data", (chunk) => {
        stdout += chunk.toString();
      });
      child.stderr.on("data", (chunk) => {
        stderr += chunk.toString();
      });
      child.on("close", (code) => resolve({ code, stdout, stderr }));
      child.on("error", (error) =>
        resolve({ code: 1, stdout, stderr: `${stderr}\n${String(error)}` }),
      );
    },
  );
}

export async function POST(request: Request) {
  const pythonVersion = process.env.MORPHIC_PDF_PYTHON_VERSION ?? "3.12";
  const formData = await request.formData();
  const file = formData.get("file");
  const direction = String(formData.get("direction") ?? "en-us:pt-pt");
  const quality = String(formData.get("quality") ?? "fast");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing PDF file." }, { status: 400 });
  }
  if (!["en-us:pt-pt", "pt-pt:en-us"].includes(direction)) {
    return NextResponse.json(
      { error: "Unsupported language direction." },
      { status: 400 },
    );
  }
  if (!["fast", "quality"].includes(quality)) {
    return NextResponse.json({ error: "Unsupported quality mode." }, { status: 400 });
  }

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "morphic-pdf-"));
  const inputPath = path.join(tmpDir, "input.pdf");
  const outputPath = path.join(tmpDir, "output.translated.pdf");

  try {
    await fs.writeFile(inputPath, Buffer.from(await file.arrayBuffer()));

    const repoRoot = resolveRepoRootFromWebCwd();
    const projectPath = path.join(repoRoot, "tools", "pdf-translator");
    const scriptPath = path.join(projectPath, "translate.py");
    const uvBin = await resolveUvBinary();
    const result = await runLocalTranslate(
      uvBin,
      [
        "run",
        "--project",
        projectPath,
        "--python",
        pythonVersion,
        "python",
        scriptPath,
        "--input",
        inputPath,
        "--output",
        outputPath,
        "--direction",
        direction,
      ],
      {
        MORPHIC_PDF_MODEL: quality === "quality" ? "nllb" : "argos",
      },
    );

    if (result.code !== 0) {
      return NextResponse.json(
        {
          error:
            result.stderr.trim() ||
            result.stdout.trim() ||
            "Local translation process failed.",
        },
        { status: 500 },
      );
    }

    const outputBuffer = await fs.readFile(outputPath);
    return new Response(outputBuffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${file.name.replace(/\.pdf$/i, "")}.translated.pdf"`,
      },
    });
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}
