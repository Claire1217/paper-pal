import assert from "node:assert/strict";
import { promises as fs, readFileSync } from "node:fs";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { api, apiOk, cleanupAll, loadAppFunctions, makeProject, samplePaper, startServer, trySymlink } from "./helpers.mjs";

const INTRO = "sections/01_introduction.tex";
const SAMPLE = readFileSync(path.join(samplePaper, INTRO), "utf8");
const PASSAGE = "Bright streets are also loud streets.";
const LINE = SAMPLE.slice(0, SAMPLE.indexOf(PASSAGE)).split("\n").length;
assert.ok(SAMPLE.includes(PASSAGE));

class Element {
  constructor(tag) { this.tag = tag; this.children = []; this.style = {}; this.attributes = {}; this.dataset = {}; this.listeners = {}; }
  append(...nodes) { this.children.push(...nodes); }
  setAttribute(name, value) { this.attributes[name] = value; }
  addEventListener(name, listener) { this.listeners[name] = listener; }
  set textContent(value) { this.children = [String(value)]; }
  get textContent() { return this.children.map((child) => typeof child === "string" ? child : child.textContent).join(""); }
}

const FUNCTIONS = ["safeHttpUrl", "chatMarkdownLink", "isChatSourceReference", "chatSourceBlockIndex", "openChatSourceReference", "appendChatLink", "appendInlineMarkdown", "chatTableCells", "chatTableHeader", "appendChatText"];
function renderer(globals = {}) {
  const document = { createElement: (tag) => new Element(tag), createTextNode: (text) => String(text) };
  return loadAppFunctions(FUNCTIONS, { document, URL, ...globals });
}
function descendants(root, tag) {
  return root.children.flatMap((child) => typeof child === "string" ? [] : [ ...(child.tag === tag ? [child] : []), ...descendants(child, tag) ]);
}
function render(text) { const root = new Element("div"); renderer().appendChatText(root, text); return root; }

describe("chat Markdown rendering", () => {
  it("renders tables with alignment, inline formatting, escaped pipes and manuscript links", () => {
    const root = render(`| **Document** | Passage | Source |\n| :--- | :---: | ---: |\n| Introduction | ${PASSAGE} | [Introduction](${INTRO}:${LINE}) |\n| Code | \`light\\|noise\` | [Website](https://example.org/paper_(sample)) |`);
    assert.equal(descendants(root, "table").length, 1);
    assert.equal(descendants(root, "th").length, 3);
    assert.equal(descendants(root, "td").length, 6);
    assert.equal(descendants(root, "strong")[0].textContent, "Document");
    assert.equal(descendants(root, "th")[1].style.textAlign, "center");
    assert.equal(descendants(root, "th")[2].style.textAlign, "right");
    assert.equal(descendants(root, "code")[0].textContent, "light|noise");
    assert.equal(descendants(root, "button")[0].textContent, "Introduction");
    assert.equal(descendants(root, "a")[0].href, "https://example.org/paper_(sample)");
    assert.equal(root.children[0].tabIndex, 0);
    assert.equal(root.children[0].attributes.role, "region");
  });

  it("recognises a table immediately after prose and keeps following prose", () => {
    const root = render(`${PASSAGE}\nDocument | Passage\n--- | ---\nIntroduction | ${PASSAGE}\n\n${PASSAGE}`);
    assert.deepEqual(root.children.map((child) => child.tag), ["p", "div", "p"]);
  });

  it("pads missing cells and keeps an overfull row visible instead of dropping its text", () => {
    const root = render("| Document | Passage |\n|---|---|\n| Introduction |\n| Introduction | Sample | Extra |\n");
    assert.equal(descendants(root, "td").length, 2);
    assert.equal(descendants(root, "td")[1].textContent, "");
    assert.ok(root.textContent.includes("Extra"));
  });

  it("keeps ordinary pipes and invalid table separators as text", () => {
    for (const text of ["light | noise", "Document | Passage\n--- | not-a-separator\nIntroduction | Sample", "| A | B |\n|---|\n| X | Y |"] ) {
      assert.equal(descendants(render(text), "table").length, 0);
    }
  });

  it("does not parse links, HTML or tables inside a code fence", () => {
    const root = render("```md\n| A | B |\n|---|---|\n[Example](https://example.org)\n<script>alert(1)</script>\n```");
    assert.equal(descendants(root, "pre").length, 1);
    for (const tag of ["table", "a", "script"]) assert.equal(descendants(root, tag).length, 0);
    assert.ok(root.textContent.includes("[Example]"));
  });

  it("supports formatted labels, balanced parentheses, angle destinations and optional titles", () => {
    const root = render(`[**Sample**](https://example.org/a_(b) "Title (sample)") [Introduction](<sections/a folder/引言.tex:${LINE}>) [Soft break]\n(${INTRO}#L${LINE}) <https://example.org>`);
    assert.equal(descendants(root, "a").length, 2);
    assert.equal(descendants(root, "a")[0].href, "https://example.org/a_(b)");
    assert.equal(descendants(root, "strong")[0].textContent, "Sample");
    assert.deepEqual(descendants(root, "button").map((node) => node.textContent), ["Introduction", "Soft break"]);
    assert.equal(descendants(root, "a")[0].rel, "noopener noreferrer");
  });

  it("keeps unsafe links, image markup and raw HTML inert", () => {
    const root = render('[A](javascript:alert(1)) [B](data:text/html,test) [C](file:///outside.tex) ![Image](https://example.org/image.png) <img src=x onerror=alert(1)>');
    for (const tag of ["a", "button", "img", "script"]) assert.equal(descendants(root, tag).length, 0);
    assert.ok(root.textContent.includes("javascript:"));
    assert.ok(root.textContent.includes("<img"));
  });

  it("preserves existing headings, lists, quotes, code and nested emphasis", () => {
    const root = render("## Example\n\n- **Strong with `code`**\n- *Emphasis* and ~~removed~~\n\n> Quote\n\nFirst  \nSecond");
    for (const tag of ["h3", "ul", "blockquote", "strong", "code", "em", "del", "br"]) assert.equal(descendants(root, tag).length, 1, tag);
  });
});

describe("chat source navigation", () => {
  const source = `\\section{Introduction}\r\n\r\n${PASSAGE}\r\n`;
  const payload = { path: INTRO, source, blocks: [{ index: 0, start: 0, end: 24, hidden: true }, { index: 1, start: 24, end: source.length, display: PASSAGE }] };

  it("classifies source references without accepting arbitrary protocols", () => {
    const app = renderer();
    for (const target of [INTRO, `${INTRO}:${LINE}:2`, `${INTRO}#L${LINE}-L20`, "./notes.md:1"]) assert.equal(app.isChatSourceReference(target), true);
    for (const target of ["javascript:main.tex", "file:///main.tex", "data:main.tex", "main.tex:0", "main.tex\n:1", "image.png"]) assert.equal(app.isChatSourceReference(target), false);
  });

  it("locates CRLF lines and skips hidden blocks, without accepting missing lines", () => {
    const app = renderer();
    assert.equal(app.chatSourceBlockIndex(payload, 1), 1);
    assert.equal(app.chatSourceBlockIndex(payload, 3), 1);
    assert.equal(app.chatSourceBlockIndex(payload, 20), null);
  });

  it("saves before resolving, loads the canonical relative path and highlights the passage", async () => {
    const events = [], state = { document: null }, button = {};
    const app = renderer({ state,
      settlePendingEdits: async () => { events.push("save"); return true; },
      api: async (endpoint, options) => { events.push(endpoint); assert.equal(JSON.parse(options.body).target, `${INTRO}:3`); return { path: INTRO, line: 3 }; },
      setWorkspaceMode: async () => {}, loadDocument: async (target) => { assert.equal(target, INTRO); state.document = payload; return true; },
      scrollToBlock: (index) => events.push(`block ${index}`), sourceRelativePath: (value) => value, showToast: () => {},
    });
    assert.equal(await app.openChatSourceReference(`${INTRO}:3`, button), true);
    assert.deepEqual(events, ["save", "/api/chat/resolve-source", "block 1"]);
    assert.equal(button.disabled, false);
  });

  it("preserves an unsaved edit and makes no request when saving fails", async () => {
    const state = { editing: { text: PASSAGE } }, events = [];
    const app = renderer({ state, settlePendingEdits: async () => false, api: () => events.push("request"), showToast: () => {} });
    assert.equal(await app.openChatSourceReference(`${INTRO}:3`, {}), false);
    assert.equal(state.editing.text, PASSAGE);
    assert.deepEqual(events, []);
  });

  it("stops on a rejected reference or a cancelled document load", async () => {
    for (const rejected of [true, false]) {
      const events = [], button = {};
      const app = renderer({ state: {}, settlePendingEdits: async () => true,
        api: async () => { if (rejected) throw new Error("Not available"); return { path: INTRO, line: 3 }; },
        setWorkspaceMode: async () => {}, loadDocument: async () => false,
        scrollToBlock: () => events.push("scroll"), showToast: () => {},
      });
      assert.equal(await app.openChatSourceReference(`${INTRO}:3`, button), false);
      assert.deepEqual(events, []);
      assert.equal(button.disabled, false);
    }
  });
});

describe("read-only chat source resolution", () => {
  let project, server;
  before(async () => { project = await makeProject(); server = await startServer(project.root); });
  after(cleanupAll);
  const resolve = (target) => api(server, "/api/chat/resolve-source", { method: "POST", body: { target } });

  it("resolves relative, absolute, encoded and line-fragment references to relative paths", async () => {
    for (const target of [`${INTRO}:${LINE}`, `${path.join(project.root, INTRO)}:${LINE}:2`, `./${INTRO}#L${LINE}-L20`, INTRO.replace("01_", "%30%31_")]) {
      const response = await resolve(target);
      assert.equal(response.status, 200);
      assert.deepEqual(response.value, { path: INTRO, line: target.includes("%30") ? 1 : LINE });
    }
  });

  it("does not change the sample source or existing chat records", async () => {
    const chat = await apiOk(server, "/api/chat");
    const before = await fs.readFile(path.join(project.root, ".paper-pal/chat/current.json"));
    assert.ok(chat.id);
    await resolve(`${INTRO}:${LINE}`);
    assert.equal(await fs.readFile(path.join(project.root, INTRO), "utf8"), SAMPLE);
    assert.deepEqual(await fs.readFile(path.join(project.root, ".paper-pal/chat/current.json")), before);
  });

  it("rejects outside paths, unsupported types and nonexistent or out-of-range references without leaking paths", async () => {
    for (const [target, status] of [[`${path.join(samplePaper, INTRO)}:1`, 403], ["../../outside.tex:1", 403], ["refs.bib:1", 400], ["missing.tex:1", 404], [`${INTRO}:999999`, 422], [`${INTRO}:0`, 400], ["javascript:main.tex", 400], ["%00.tex", 400]]) {
      const response = await resolve(target); const body = response.value;
      assert.equal(response.status, status, target);
      assert.ok(!JSON.stringify(body).includes(project.root));
    }
  });

  it("refuses a symlink that leaves the project", async (t) => {
    if (!(await trySymlink(path.join(samplePaper, INTRO), path.join(project.root, "outside-link.tex")))) return t.skip("Symlinks unavailable");
    assert.equal((await resolve("outside-link.tex:1")).status, 403);
  });

  it("handles encoded spaces, parentheses and Unicode in an available filename", async () => {
    const name = "sample note (例).md";
    await fs.writeFile(path.join(project.root, name), PASSAGE + "\n");
    assert.deepEqual((await resolve(`${encodeURIComponent(name)}:1`)).value, { path: name, line: 1 });
  });

  it("resolves source-relative paths but refuses hidden documents", async () => {
    const nested = await makeProject({ config: { sourceRoot: "sections", defaultDocument: INTRO, ui: { hiddenDocuments: ["sections/02_related_work.tex"] } } });
    const local = await startServer(nested.root);
    assert.deepEqual(await apiOk(local, "/api/chat/resolve-source", { method: "POST", body: { target: `01_introduction.tex:${LINE}` } }), { path: INTRO, line: LINE });
    assert.equal((await api(local, "/api/chat/resolve-source", { method: "POST", body: { target: "02_related_work.tex:1" } })).status, 404);
    await fs.mkdir(path.join(nested.root, "sections/sections"));
    await fs.writeFile(path.join(nested.root, "sections", INTRO), SAMPLE);
    assert.equal((await api(local, "/api/chat/resolve-source", { method: "POST", body: { target: INTRO } })).status, 409);
  });
});
