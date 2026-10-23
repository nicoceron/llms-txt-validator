# llms-txt-validator

Validate a site's `llms.txt` and `llms-full.txt` against the [llmstxt.org](https://llmstxt.org/) format, and check that every link it lists actually answers. A CLI and a small library with no dependencies.

**Prefer a browser?** The same checks run at [dardo.studio/tools/llms-txt-validator](https://dardo.studio/tools/llms-txt-validator/), together with which AI crawlers your robots.txt lets in.

```sh
npx llms-txt-validator llmstxt.org
```

```
https://llmstxt.org/llms.txt (HTTP 200, text/plain; charset=utf-8)
✓ pass llms.txt      All 3 checked links answer.
✓ pass llms.txt      Valid llmstxt.org format: "llms.txt", 1 section, 3 links.
· info llms-full.txt No llms-full.txt (optional).
```

## What it checks

| Check | Level |
|---|---|
| `/llms.txt` exists and answers 200 | fail |
| It's Markdown text, not an HTML page from a catch-all route | warn |
| One H1 title, and it comes first (the only required section) | fail / warn |
| A blockquote summary (`> …`) right after the H1 | warn |
| H2 sections holding file lists | warn |
| Every list item is a `- [name](url): notes` link | info |
| Sections without links, H3 or deeper headings | info |
| Served as `text/plain` or `text/markdown` | info |
| Every listed link answers (HEAD, then GET); timeouts are reported, not counted as broken | fail / info |
| `/llms-full.txt`, if present, is text and starts with an H1 | info |

Links inside code fences are ignored, relative links are resolved against the file's URL, and a byte-order mark is allowed.

## CLI

```sh
llms-txt-validator <site URL or path to llms.txt> [options]

  --json           Print the report as JSON
  --no-links       Don't check the listed links
  --max-links N    Check at most N links (default 50)
  --timeout MS     Request timeout in milliseconds (default 10000)
```

Exit codes: `0` valid, `1` problems found, `2` usage or network error, so it works as a CI step:

```yaml
- run: npx llms-txt-validator https://www.example.com --max-links 200
```

A local file is checked for format only: `npx llms-txt-validator ./public/llms.txt`.

## Library

```js
import { checkSite, validateLlms, parseLlms } from "llms-txt-validator";

const report = await checkSite("https://www.example.com", { maxLinks: 100 });
console.log(report.valid, report.findings);

const { valid, findings } = validateLlms(text, { base: "https://www.example.com/llms.txt" });
const file = parseLlms(text, "https://www.example.com/llms.txt"); // { h1, summary, sections: [{ title, links }] }
```

Each finding is `{ id, file, level: "fail" | "warn" | "info" | "pass", message }`.

## About

Built and maintained by [Dardo](https://dardo.studio), a web design and development studio in Bogotá that works with teams in the US and Latin America. We wrote it for our own sites and our [AI visibility checker](https://dardo.studio/tools/ai-visibility-checker/), and opened it up so anyone can put llms.txt checks in their build.

MIT licensed. Issues and pull requests are welcome.
