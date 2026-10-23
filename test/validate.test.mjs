import { test } from "node:test";
import assert from "node:assert/strict";
import { parseLlms, validateLlms, validateLlmsFull, llmsLinks, looksLikeHtml } from "../dist/index.js";

const base = "https://example.com/llms.txt";
const valid = `# Example

> Example makes widgets for teams.

Some optional notes.

## Docs

- [Quick start](https://example.com/start): install and first steps
- [API](/api)

## Optional

- [Blog](https://example.com/blog)
`;

const ids = (findings) => findings.map((f) => f.id);

test("parses the H1, summary, sections and links", () => {
  const file = parseLlms(valid, base);
  assert.equal(file.h1, "Example");
  assert.equal(file.summary, "Example makes widgets for teams.");
  assert.deepEqual(file.sections.map((s) => s.title), ["Docs", "Optional"]);
  assert.deepEqual(file.sections[0].links[1], { name: "API", url: "https://example.com/api", notes: "" });
  assert.equal(file.sections[0].links[0].notes, "install and first steps");
});

test("a well-formed file is valid", () => {
  const result = validateLlms(valid, { base, contentType: "text/plain; charset=utf-8" });
  assert.equal(result.valid, true);
  assert.deepEqual(ids(result.findings), ["llms.valid"]);
});

test("a missing H1 fails", () => {
  const result = validateLlms("> summary\n\n## Docs\n\n- [A](https://a.example/)\n", { base });
  assert.equal(result.valid, false);
  assert.ok(ids(result.findings).includes("llms.no-h1"));
});

test("content before the H1, extra H1s and a missing summary are flagged", () => {
  const result = validateLlms("Intro\n\n# One\n\n## Docs\n\n- [A](https://a.example/)\n\n# Two\n", { base });
  assert.deepEqual(ids(result.findings).sort(), ["llms.late-h1", "llms.many-h1", "llms.no-summary"].sort());
});

test("list items that aren't links are counted, with an example", () => {
  const result = validateLlms("# X\n\n> s\n\n## Docs\n\n- plain text item\n- [A](https://a.example/)\n", { base });
  const bad = result.findings.find((f) => f.id === "llms.bad-items");
  assert.ok(bad);
  assert.match(bad.message, /plain text item/);
  assert.equal(result.valid, false);
});

test("links inside code fences are ignored", () => {
  const text = "# X\n\n> s\n\n## Docs\n\n```\n- [Not a link](https://nope.example/)\n```\n\n- [A](https://a.example/)\n";
  assert.deepEqual(llmsLinks(text, base), ["https://a.example/"]);
});

test("H3 headings and an unexpected content type are reported as info", () => {
  const result = validateLlms(`${valid}\n### Deeper\n`, { base, contentType: "text/html" });
  assert.ok(ids(result.findings).includes("llms.other-headings"));
  assert.ok(ids(result.findings).includes("llms.type"));
  assert.equal(result.valid, true);
});

test("broken links fail; links that didn't answer are only info", () => {
  const broken = validateLlms(valid, { base, links: [{ url: "https://example.com/start", status: 404 }, { url: "https://example.com/api", status: 200 }] });
  assert.ok(ids(broken.findings).includes("llms.broken"));
  assert.equal(broken.valid, false);
  const silent = validateLlms(valid, { base, links: [{ url: "https://example.com/start", status: 0 }, { url: "https://example.com/api", status: 200 }] });
  assert.ok(ids(silent.findings).includes("llms.silent"));
  assert.ok(ids(silent.findings).includes("llms.links-ok"));
  assert.equal(silent.valid, true);
});

test("an HTML page served as llms.txt is caught", () => {
  assert.equal(looksLikeHtml("<!DOCTYPE html><html>"), true);
  const result = validateLlms("<!doctype html>\n<html><body>Not found</body></html>", { base });
  assert.deepEqual(ids(result.findings), ["llms.html"]);
  assert.equal(result.valid, false);
});

test("llms-full.txt needs to start with an H1", () => {
  assert.equal(validateLlmsFull("# Example\n\nEverything.", base)[0].id, "llms-full.ok");
  assert.equal(validateLlmsFull("Everything without a title.", base)[0].id, "llms-full.no-h1");
});
