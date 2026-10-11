#!/usr/bin/env node
// Assembles the GitHub Pages site into <out-dir>: site/*, llms.txt, and the
// images and fonts that site/index.html references, at the paths it uses
// (docs/images/..., fonts/...). There is nothing to compile; the page is copied
// as is, except that the version from package.json replaces the one written in
// it, so a release never leaves the page stale. The build fails when the page
// points at a file that does not exist, when its JSON-LD does not parse, or when
// its FAQ no longer says what the README's FAQ says.
//
//   node scripts/pages.mjs _site && python3 -m http.server -d _site 8000
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Where a path the page references lives in the repository.
const sources = [
  [/^docs\/images\//, (reference) => reference],
  [/^fonts\//, (reference) => path.join("public", reference)],
  [/^llms[.]txt$/, (reference) => reference],
];

// Reduces README markdown or page HTML to the words a reader sees.
export function plainText(markup) {
  return markup
    .replace(/<[^>]+>/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*\s][^*]*)\*/g, "$1")
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

export function readmeFaq(readme) {
  const section = readme.split(/^## FAQ[ \t]*$/m)[1]?.split(/^## /m)[0] ?? "";
  return [...section.matchAll(/<details[^>]*>\s*<summary>([\s\S]*?)<\/summary>([\s\S]*?)<\/details>/g)]
    .map(([, question, answer]) => ({ question: plainText(question), answer: plainText(answer) }));
}

export function pageFaq(html) {
  const section = html.match(/<section[^>]*id="faq"[\s\S]*?<\/section>/)?.[0] ?? "";
  return [...section.matchAll(/<div class="qa"[^>]*>\s*<h3>([\s\S]*?)<\/h3>([\s\S]*?)<\/div>/g)]
    .map(([, question, answer]) => ({ question: plainText(question), answer: plainText(answer) }));
}

export function jsonLd(html) {
  return [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(([, body]) => JSON.parse(body));
}

export function structuredFaq(html) {
  const faq = jsonLd(html).find((item) => item["@type"] === "FAQPage");
  return (faq?.mainEntity ?? []).map((entry) => ({ question: entry.name, answer: entry.acceptedAnswer?.text }));
}

// Every way the page's FAQ differs from the README's, as sentences.
export function faqProblems(html, readme) {
  const expected = readmeFaq(readme);
  if (!expected.length) return ["README.md has no FAQ entries under \"## FAQ\"."];
  const problems = [];
  for (const [label, actual] of [["the visible FAQ", pageFaq(html)], ["the FAQPage JSON-LD", structuredFaq(html)]]) {
    if (actual.length !== expected.length) problems.push(`${label} has ${actual.length} entries, README.md has ${expected.length}.`);
    expected.forEach((entry, index) => {
      const found = actual[index];
      if (!found || found.question !== entry.question) problems.push(`${label}, entry ${index + 1}: the question should be "${entry.question}".`);
      else if (found.answer !== entry.answer) problems.push(`${label}, "${entry.question}": the answer should be "${entry.answer}".`);
    });
  }
  return problems;
}

// Paths the page needs from this site: relative src, srcset and href values,
// and absolute URLs under the canonical address (og:image, JSON-LD screenshots).
export function localReferences(html) {
  const found = new Set();
  for (const [, attribute, value] of html.matchAll(/\s(src|srcset|href)="([^"]*)"/g)) {
    const candidates = attribute === "srcset" ? value.split(",").map((part) => part.trim().split(/\s+/)[0]) : [value];
    for (const candidate of candidates) {
      if (!candidate || /^(#|[a-z][a-z0-9+.-]*:|\/\/)/i.test(candidate) || candidate === "./") continue;
      found.add(candidate.split("#")[0]);
    }
  }
  const base = html.match(/<link rel="canonical" href="([^"]+)"/)?.[1];
  if (base) {
    const escaped = base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    for (const [, relative] of html.matchAll(new RegExp(`${escaped}([^"#\\s]+)`, "g"))) found.add(relative);
  }
  return [...found].sort();
}

export function withVersion(html, version) {
  let replaced = 0;
  const result = html
    .replace(/("softwareVersion":\s*")[^"]*(")/g, (match, open, close) => { replaced += 1; return `${open}${version}${close}`; })
    .replace(/(<span class="version">)[^<]*(<\/span>)/g, (match, open, close) => { replaced += 1; return `${open}${version}${close}`; });
  if (!replaced) throw new Error("site/index.html has no softwareVersion or version span to update.");
  return result;
}

export function buildSite(outDir, root = appRoot) {
  const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
  const page = readFileSync(path.join(root, "site", "index.html"), "utf8");
  const problems = faqProblems(page, readFileSync(path.join(root, "README.md"), "utf8"));
  if (problems.length) throw new Error(`site/index.html and README.md disagree; change the page to match:\n- ${problems.join("\n- ")}`);

  // The output folder is emptied first, so it has to be new, empty, or an earlier build.
  if (existsSync(outDir) && readdirSync(outDir).length) {
    const earlierBuild = existsSync(path.join(outDir, "sitemap.xml")) && !existsSync(path.join(outDir, "package.json"));
    if (!earlierBuild) throw new Error(`${outDir} is not empty and is not an earlier build of the site; choose another folder.`);
  }
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  for (const name of readdirSync(path.join(root, "site"))) cpSync(path.join(root, "site", name), path.join(outDir, name), { recursive: true });
  const html = withVersion(page, pkg.version);
  try {
    jsonLd(html);
  } catch (error) {
    throw new Error(`A JSON-LD block in site/index.html does not parse: ${error.message}`);
  }
  writeFileSync(path.join(outDir, "index.html"), html);

  const missing = [];
  const copy = (reference) => {
    const rule = sources.find(([pattern]) => pattern.test(reference));
    const from = rule && path.join(root, rule[1](reference));
    if (!from || !existsSync(from)) return missing.push(reference);
    mkdirSync(path.dirname(path.join(outDir, reference)), { recursive: true });
    cpSync(from, path.join(outDir, reference));
  };
  const references = [...new Set([...localReferences(html), "llms.txt"])].filter((reference) => !existsSync(path.join(outDir, reference)));
  references.forEach(copy);
  // The OFL asks for the licence to travel with the fonts.
  if (references.some((reference) => reference.startsWith("fonts/"))) {
    for (const name of readdirSync(path.join(root, "public", "fonts")).filter((entry) => entry.startsWith("LICENSE-"))) copy(`fonts/${name}`);
  }
  if (missing.length) throw new Error(`site/index.html references files that do not exist: ${missing.join(", ")}`);
  return { version: pkg.version, files: references };
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  const outDir = process.argv[2];
  if (!outDir || outDir.startsWith("-")) {
    console.error("Usage: node scripts/pages.mjs <out-dir>");
    process.exit(2);
  }
  try {
    const result = buildSite(path.resolve(outDir));
    console.log(`Site for Paper Pal ${result.version} in ${outDir}: site/ plus ${result.files.length} files it references.`);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
