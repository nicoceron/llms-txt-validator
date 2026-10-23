#!/usr/bin/env node
// llms-txt-validator <site URL | path to llms.txt> [--json] [--no-links] [--max-links N] [--timeout MS]
import { readFile } from "node:fs/promises";
import { checkSite, validateLlms, type Finding, type Level } from "./index.js";

const HELP = `Usage: llms-txt-validator <site URL or llms.txt file> [options]

Checks llms.txt (and llms-full.txt) against the llmstxt.org format and checks
that every listed link answers.

Options:
  --json           Print the report as JSON
  --no-links       Don't check the listed links
  --max-links N    Check at most N links (default 50)
  --timeout MS     Request timeout in milliseconds (default 10000)
  -h, --help       Show this help

Exit codes: 0 valid, 1 problems found, 2 usage or network error.
Browser version: https://dardo.studio/tools/llms-txt-validator/`;

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const value = (name: string, fallback: number) => {
  const i = args.indexOf(name);
  const n = i >= 0 ? Number(args[i + 1]) : NaN;
  return Number.isFinite(n) && n > 0 ? n : fallback;
};
const target = args.find((a, i) => !a.startsWith("-") && !["--max-links", "--timeout"].includes(args[i - 1] ?? ""));

if (flag("-h") || flag("--help") || !target) {
  console.log(HELP);
  process.exit(target ? 0 : 2);
}

const icon: Record<Level, string> = { fail: "✗", warn: "!", info: "·", pass: "✓" };
const print = (findings: Finding[]) => {
  for (const f of findings) console.log(`${icon[f.level]} ${f.level.padEnd(4)} ${f.file.padEnd(13)} ${f.message}`);
};

try {
  const isUrl = /^https?:\/\//i.test(target) || (!target.includes("/") && target.includes(".") && !target.endsWith(".txt") && !target.endsWith(".md"));
  if (isUrl) {
    const report = await checkSite(target, { checkLinks: !flag("--no-links"), maxLinks: value("--max-links", 50), timeoutMs: value("--timeout", 10000) });
    if (flag("--json")) console.log(JSON.stringify(report, null, 2));
    else {
      console.log(`${report.origin}/llms.txt (HTTP ${report.llms.status || "—"}${report.llms.type ? `, ${report.llms.type}` : ""})`);
      print(report.findings);
    }
    process.exit(report.findings.some((f) => f.level === "fail") || !report.valid ? 1 : 0);
  } else {
    const text = await readFile(target, "utf8");
    const result = validateLlms(text, { base: "https://example.com/" });
    if (flag("--json")) console.log(JSON.stringify({ path: target, ...result }, null, 2));
    else {
      console.log(target);
      print(result.findings);
    }
    process.exit(result.valid ? 0 : 1);
  }
} catch (error) {
  console.error(`llms-txt-validator: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(2);
}
