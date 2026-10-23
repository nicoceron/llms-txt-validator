// Checks an llms.txt (and llms-full.txt) against the llmstxt.org format: one
// H1 first, a blockquote summary, H2 sections of "- [name](url): notes" file
// lists. Parsing and validation are pure functions; checkSite() fetches a
// site's files and checks that every listed link answers.
//
// Same rules as the browser version at https://dardo.studio/tools/llms-txt-validator/

export type LlmsLink = { name: string; url: string; notes: string };
export type LlmsFile = {
  h1: string | null;
  /** The first content isn't an H1. */
  late: boolean;
  h1s: number;
  summary: string | null;
  sections: { title: string; links: LlmsLink[]; bad: number }[];
  /** Headings the format doesn't use (H3 and deeper). */
  other: number;
  badExample: string | null;
};

const item = /^\s*[-*+]\s+(.*)$/;
const fileLink = /^\[([^\]]+)\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)\s*(?::\s*(.*))?$/;

/** An llms.txt file's parts: its H1, blockquote summary and H2 file lists ("- [name](url): notes"). */
export function parseLlms(text: string, base: string): LlmsFile {
  const out: LlmsFile = { h1: null, late: false, h1s: 0, summary: null, sections: [], other: 0, badExample: null };
  let fenced = false;
  let seen = false;
  // After the first H1: waiting for its blockquote, then reading it.
  let state: "none" | "await" | "quote" = "none";
  const quote: string[] = [];
  for (const raw of text.replace(/^﻿/, "").split(/\r?\n/)) {
    const line = raw.trimEnd();
    if (/^\s*(```|~~~)/.test(line)) {
      fenced = !fenced;
      seen = true;
      state = "none";
      continue;
    }
    if (fenced) continue;
    if (!line.trim()) {
      if (state === "quote") state = "none";
      continue;
    }
    const heading = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (heading) {
      state = "none";
      const level = heading[1].length;
      if (level === 1) {
        out.h1s++;
        if (out.h1 === null) {
          out.h1 = heading[2];
          out.late = seen;
          state = "await";
        }
      } else if (level === 2) out.sections.push({ title: heading[2], links: [], bad: 0 });
      else out.other++;
      seen = true;
      continue;
    }
    seen = true;
    if (state !== "none" && line.startsWith(">")) {
      quote.push(line.replace(/^>\s?/, ""));
      out.summary = quote.join(" ").replace(/\s+/g, " ").trim() || null;
      state = "quote";
      continue;
    }
    state = "none";
    const section = out.sections.at(-1);
    const entry = item.exec(line);
    if (!section || !entry) continue;
    const link = fileLink.exec(entry[1].trim());
    const url = link ? absolute(link[2], base) : null;
    if (link && url) section.links.push({ name: link[1].trim(), url, notes: (link[3] ?? "").trim() });
    else {
      section.bad++;
      out.badExample ??= line.trim().slice(0, 120);
    }
  }
  return out;
}

function absolute(url: string, base: string) {
  try {
    const u = new URL(url, base);
    return /^https?:$/.test(u.protocol) ? u.href : null;
  } catch {
    return null;
  }
}

/** The distinct links of an llms.txt's file lists, in order. */
export const llmsLinks = (text: string, base: string) => [...new Set(parseLlms(text, base).sections.flatMap((s) => s.links.map((l) => l.url)))];

/** Whether a response body is a web page rather than a text file (a catch-all page answering every address). */
export const looksLikeHtml = (text: string) => /^\s*(<!doctype html|<html[\s>]|<head[\s>]|<body[\s>])/i.test(text.slice(0, 2000));

export type Level = "fail" | "warn" | "info" | "pass";
export type Finding = { id: string; file: "llms.txt" | "llms-full.txt"; level: Level; message: string };
export type LinkResult = { url: string; status: number };

const list = (items: string[], max = 6) => (items.length > max ? `${items.slice(0, max).join(", ")}…` : items.join(", "));

/**
 * Checks an llms.txt's text against the llmstxt.org format. `contentType` is
 * the Content-Type it was served with, if known; `links` are link check
 * results from checkLinks(), if run.
 */
export function validateLlms(text: string, options: { base: string; contentType?: string; links?: LinkResult[] }) {
  const findings: Finding[] = [];
  const add = (id: string, level: Level, message: string) => findings.push({ id, file: "llms.txt", level, message });
  if (looksLikeHtml(text)) {
    add("llms.html", "warn", "The file is an HTML page, not Markdown text: a catch-all route may be answering /llms.txt.");
    return { file: null, findings, valid: false };
  }
  const file = parseLlms(text, options.base);
  const linkCount = file.sections.reduce((n, s) => n + s.links.length, 0);
  if (!file.h1) add("llms.no-h1", "fail", "No H1 title (# Name). It is the one section the format requires.");
  else if (file.late) add("llms.late-h1", "warn", `The H1 "${file.h1}" isn't the first thing in the file.`);
  if (file.h1s > 1) add("llms.many-h1", "warn", `${file.h1s} H1 headings; the format has exactly one.`);
  if (file.h1 && !file.summary) add("llms.no-summary", "warn", "No blockquote summary (> …) right after the H1.");
  if (!file.sections.length) add("llms.no-sections", "warn", "No H2 sections with file lists (## Section, then - [name](url): notes).");
  const bad = file.sections.reduce((n, s) => n + s.bad, 0);
  if (bad) add("llms.bad-items", "info", `${bad} list item${bad === 1 ? " isn't" : "s aren't"} a "- [name](url): notes" link, e.g. ${file.badExample ?? ""}`);
  const empty = file.sections.filter((s) => !s.links.length && !s.bad);
  if (empty.length) add("llms.empty-sections", "info", `Sections without links: ${list(empty.map((s) => s.title))}.`);
  if (file.other) add("llms.other-headings", "info", `${file.other} H3 or deeper heading${file.other === 1 ? "" : "s"}; the format only uses H1 and H2.`);
  if (options.contentType !== undefined && !/^text\/(plain|markdown)/i.test(options.contentType)) {
    add("llms.type", "info", `Served as ${options.contentType || "no Content-Type"}; text/plain or text/markdown is expected.`);
  }
  if (options.links) {
    // A link that didn't answer in time is unknown, not broken.
    const broken = options.links.filter((l) => l.status >= 400);
    const silent = options.links.filter((l) => !l.status);
    if (broken.length) add("llms.broken", "fail", `${broken.length} of ${options.links.length} links are broken: ${list(broken.map((l) => `${l.url} (${l.status})`), 5)}`);
    else if (options.links.length > silent.length) add("llms.links-ok", "pass", `All ${options.links.length - silent.length} checked links answer.`);
    if (silent.length) add("llms.silent", "info", `${silent.length} link${silent.length === 1 ? "" : "s"} didn't answer in time: ${list(silent.map((l) => l.url), 3)}`);
  }
  const valid = Boolean(file.h1 && !file.late && file.summary && file.sections.length && !bad && file.h1s === 1);
  if (valid) add("llms.valid", "pass", `Valid llmstxt.org format: "${file.h1}", ${file.sections.length} section${file.sections.length === 1 ? "" : "s"}, ${linkCount} link${linkCount === 1 ? "" : "s"}.`);
  return { file, findings, valid: valid && !findings.some((f) => f.level === "fail") };
}

/** Checks an llms-full.txt: a text file that starts with an H1. */
export function validateLlmsFull(text: string, base: string): Finding[] {
  const add = (id: string, level: Level, message: string): Finding => ({ id, file: "llms-full.txt", level, message });
  if (looksLikeHtml(text)) return [add("llms-full.html", "info", "llms-full.txt is an HTML page, not Markdown text.")];
  const file = parseLlms(text, base);
  if (!file.h1 || file.late) return [add("llms-full.no-h1", "info", "llms-full.txt doesn't start with an H1 title.")];
  return [add("llms-full.ok", "pass", `llms-full.txt starts with "${file.h1}" (${Math.max(1, Math.round(new TextEncoder().encode(text).length / 1024))} KB).`)];
}

const USER_AGENT = "llms-txt-validator (+https://github.com/nicoceron/llms-txt-validator)";

async function fetchText(url: string, timeoutMs: number) {
  const response = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(timeoutMs), headers: { "user-agent": USER_AGENT, accept: "text/plain, text/markdown, */*" } });
  return { status: response.status, url: response.url || url, type: response.headers.get("content-type") ?? "", text: await response.text() };
}

/** Each link's HTTP status (HEAD, then GET when HEAD isn't allowed); 0 when it didn't answer in time. */
export async function checkLinks(urls: string[], options: { concurrency?: number; timeoutMs?: number } = {}): Promise<LinkResult[]> {
  const { concurrency = 6, timeoutMs = 8000 } = options;
  const results: LinkResult[] = new Array(urls.length);
  let next = 0;
  const probe = async (url: string, method: "HEAD" | "GET") => {
    const response = await fetch(url, { method, redirect: "follow", signal: AbortSignal.timeout(timeoutMs), headers: { "user-agent": USER_AGENT } });
    if (method === "GET") await response.body?.cancel();
    return response.status;
  };
  const worker = async () => {
    while (next < urls.length) {
      const i = next++;
      let status = 0;
      try {
        status = await probe(urls[i], "HEAD");
        if (status === 405 || status === 501) status = await probe(urls[i], "GET");
      } catch {
        status = 0;
      }
      results[i] = { url: urls[i], status };
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, urls.length) }, worker));
  return results;
}

export type SiteReport = {
  origin: string;
  llms: { url: string; status: number; type: string };
  llmsFull: { url: string; status: number };
  links: LinkResult[];
  unchecked: number;
  findings: Finding[];
  valid: boolean;
};

/** Fetches a site's /llms.txt and /llms-full.txt, validates both and checks up to `maxLinks` listed links. */
export async function checkSite(site: string, options: { maxLinks?: number; checkLinks?: boolean; timeoutMs?: number } = {}): Promise<SiteReport> {
  const { maxLinks = 50, timeoutMs = 10000 } = options;
  const origin = new URL(/^https?:\/\//i.test(site) ? site : `https://${site}`).origin;
  const findings: Finding[] = [];
  const llms = await fetchText(`${origin}/llms.txt`, timeoutMs).catch(() => ({ status: 0, url: `${origin}/llms.txt`, type: "", text: "" }));
  let links: LinkResult[] = [];
  let unchecked = 0;
  let valid = false;
  if (llms.status === 404 || llms.status === 410) {
    findings.push({ id: "llms.missing", file: "llms.txt", level: "fail", message: `No llms.txt at ${origin}/llms.txt (HTTP ${llms.status}). The format is at https://llmstxt.org/.` });
  } else if (llms.status < 200 || llms.status >= 300) {
    findings.push({ id: "llms.error", file: "llms.txt", level: "fail", message: `${origin}/llms.txt answered ${llms.status ? `HTTP ${llms.status}` : "nothing (timeout or network error)"}.` });
  } else {
    if (options.checkLinks !== false && !looksLikeHtml(llms.text)) {
      const all = llmsLinks(llms.text, llms.url);
      unchecked = Math.max(0, all.length - maxLinks);
      links = await checkLinks(all.slice(0, maxLinks), { timeoutMs: Math.min(timeoutMs, 8000) });
    }
    const result = validateLlms(llms.text, { base: llms.url, contentType: llms.type, links: options.checkLinks === false ? undefined : links });
    findings.push(...result.findings);
    valid = result.valid;
    if (unchecked) findings.push({ id: "llms.unchecked", file: "llms.txt", level: "info", message: `${unchecked} more links not checked (raise --max-links to check them).` });
  }
  const full = await fetchText(`${origin}/llms-full.txt`, timeoutMs).catch(() => ({ status: 0, url: `${origin}/llms-full.txt`, type: "", text: "" }));
  if (full.status === 404 || full.status === 410) findings.push({ id: "llms-full.missing", file: "llms-full.txt", level: "info", message: "No llms-full.txt (optional)." });
  else if (full.status < 200 || full.status >= 300) findings.push({ id: "llms-full.error", file: "llms-full.txt", level: "info", message: `llms-full.txt answered ${full.status ? `HTTP ${full.status}` : "nothing"}.` });
  else findings.push(...validateLlmsFull(full.text, full.url));
  return { origin, llms: { url: llms.url, status: llms.status, type: llms.type }, llmsFull: { url: full.url, status: full.status }, links, unchecked, findings, valid };
}
