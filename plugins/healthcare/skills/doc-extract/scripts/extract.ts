import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";

const SKILL_ROOT = dirname(dirname(new URL(import.meta.url).pathname));

export function resolveLit(roots: string[] = []): string | undefined {
  // Prefer the liteparse `lit` bin that `bun install` drops in node_modules
  // (this skill's, then any caller-supplied roots), then PATH.
  const candidates = [
    ...[SKILL_ROOT, ...roots].map((r) => join(r, "node_modules", ".bin", "lit")),
    "lit",
  ];
  return candidates.find((p) => spawnSync(p, ["--version"], { stdio: "ignore" }).status === 0);
}

export type Extracted = { text: string; method: "liteparse" | "pdftotext" };

export function extractWithMethod(
  lit: string | undefined,
  src: string,
  isPdf = /\.pdf$/i.test(src),
): Extracted | null {
  if (lit) {
    // OCR on by default; retry --no-ocr so text-layer extraction still lands if the OCR path fails.
    // --format json, not text: liteparse 2.x emits no page boundaries in text/markdown output,
    // so page anchors can only be rebuilt from the JSON pages array.
    for (const extra of [[], ["--no-ocr"]]) {
      const r = spawnSync(
        lit,
        ["parse", src, "--format", "json", "--max-pages", "2000", ...extra],
        {
          encoding: "utf8",
          maxBuffer: 256 * 1024 * 1024,
        },
      );
      if (r.status !== 0 || !r.stdout.trim()) continue;
      try {
        const pages: { page: number; text: string }[] = JSON.parse(r.stdout).pages ?? [];
        const text = pages.map((p) => `\n\n=== [page ${p.page}] ===\n\n${p.text}`).join("");
        if (text.trim()) return { text, method: "liteparse" };
      } catch {
        // unparseable stdout — try the next variant, then the pdftotext fallback
      }
    }
  }
  // Only PDFs have a no-liteparse fallback.
  if (!isPdf) return null;
  // Fallback: pdftotext -layout, page-anchored via form-feed splits.
  const r = spawnSync("pdftotext", ["-layout", src, "-"], {
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
  });
  if (r.status !== 0) return null;
  return {
    text: r.stdout
      .split("\f")
      .map((page, i) => `\n\n=== [page ${i + 1}] ===\n\n${page}`)
      .join(""),
    method: "pdftotext",
  };
}

export function extract(
  lit: string | undefined,
  src: string,
  isPdf = /\.pdf$/i.test(src),
): string | null {
  return extractWithMethod(lit, src, isPdf)?.text ?? null;
}

const KIND_BY_MIME: Record<string, string> = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
  "application/rtf": "rtf",
  "text/rtf": "rtf",
  "text/plain": "txt",
  "text/markdown": "md",
  "text/html": "html",
};

function die(msg: string): never {
  console.error(JSON.stringify({ error: msg }));
  process.exit(1);
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const ctIdx = args.indexOf("--content-type");
  const contentType = ctIdx >= 0 ? args.splice(ctIdx, 2)[1] : undefined;
  const [input] = args;
  if (!input) die("usage: extract.ts <input-file> [--content-type <mime>]");

  const mimeKind = contentType
    ? KIND_BY_MIME[contentType.split(";")[0]!.trim().toLowerCase()]
    : undefined;
  const extKind = input.match(/\.(pdf|docx|xlsx|pptx|rtf|txt|md|html?)$/i)?.[1]?.toLowerCase();
  const kind = mimeKind ?? (extKind === "htm" ? "html" : extKind);
  if (!kind)
    die(
      `cannot determine format of ${input} — pass --content-type (supported: pdf, docx, xlsx, pptx, rtf, txt, md, html)`,
    );

  if (kind === "rtf") {
    // Lazy import: callers of resolveLit/extract (e.g. contracts) don't need rtf-to-text installed.
    const { stripRtf } = await import("rtf-to-text");
    const text = stripRtf(readFileSync(input, "utf8"));
    console.log(JSON.stringify({ text, method: "rtf-to-text" }));
  } else if (kind === "txt" || kind === "md" || kind === "html") {
    console.log(JSON.stringify({ text: readFileSync(input, "utf8"), method: "passthrough" }));
  } else {
    const lit = resolveLit();
    const r = extractWithMethod(lit, input, kind === "pdf");
    if (r == null)
      die(
        lit
          ? `extraction failed for ${input}`
          : `liteparse not found (run \`bun install\` in the doc-extract skill dir)${kind === "pdf" ? " and pdftotext fallback failed" : ` — required for .${kind}`}`,
      );
    const pages = r.text.match(/^=== \[page \d+\] ===$/gm)?.length;
    console.log(JSON.stringify({ text: r.text, method: r.method, ...(pages ? { pages } : {}) }));
  }
}
