#!/usr/bin/env node
// Regenerates the README images in docs/images/.
//
//   npm run screenshots [-- --out <dir>] [--only hero,diff] [--theme light|dark|both]
//                       [--no-compile] [--no-optimize] [--keep]
//
// The script is self-contained: it copies examples/sample-paper to a temporary
// folder, runs setup there, starts a server on a free port, takes the pictures
// and removes everything again. No model is called and nothing is written to
// this repository except the images: every agent-dependent state (comments,
// proposals, findings, chat, provider availability, review progress) is put
// into the page by intercepting the app's own API calls in the browser.
//
// The pictures are framed for a README column: one 1240 px overview (hero) and
// close-ups of one part of the window each, all at twice the CSS size, with
// rounded corners and a hairline baked in. The acting agent is Claude Code.
//
// Playwright is deliberately not a dependency of Paper Pal. Install it for one
// run with:   npm install --no-save playwright && npx playwright install chromium
// Environment: PW_CHROME = path of a Chromium/Chrome executable to use instead.
import { spawn, spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { TEMP_PREFIX } from "../names.mjs";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// README columns are 830 to 1012 px wide, so a picture much wider than that
// is scaled down until its text is unreadable. The overview is 1240 px; every
// other picture is a close-up of one part of the window, 320 to 900 px wide.
const VIEWPORT = { width: 1240, height: 820 };
const SCALE = 2;
const AGENT = "claude"; // the provider id that acts in every picture
// Baked into every picture so it sits well on white and on dark pages.
const FRAME = { radius: 10, line: { light: "rgba(27, 31, 36, 0.2)", dark: "rgba(255, 255, 255, 0.2)" } };
const SIZE_TARGET = 450 * 1024;
const PAPER_TITLE = "Earlier Every Year";
const INTRO = "sections/01_introduction.tex";

// ------------------------------------------------------------------ arguments
function readArguments(argv) {
  const options = { out: path.join(appRoot, "docs", "images"), only: null, theme: "both", compile: true, optimize: true, keep: false };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = () => {
      index += 1;
      if (argv[index] === undefined) throw new Error(`${flag} needs a value`);
      return argv[index];
    };
    if (flag === "--out") options.out = path.resolve(value());
    else if (flag === "--only") options.only = new Set(value().split(",").map((name) => name.trim()).filter(Boolean));
    else if (flag === "--theme") options.theme = value();
    else if (flag === "--no-compile") options.compile = false;
    else if (flag === "--no-optimize") options.optimize = false;
    else if (flag === "--keep") options.keep = true;
    else if (flag === "--help" || flag === "-h") {
      console.log("Usage: npm run screenshots [-- --out <dir>] [--only hero,diff,comment,review,chat,backends,structure,social] [--theme light|dark|both] [--no-compile] [--no-optimize] [--keep]");
      process.exit(0);
    } else throw new Error(`Unknown option ${flag}`);
  }
  if (!["light", "dark", "both"].includes(options.theme)) throw new Error("--theme must be light, dark or both");
  return options;
}

async function loadPlaywright() {
  try {
    return await import("playwright");
  } catch {
    try {
      // require() also honours NODE_PATH, for a Playwright installed elsewhere.
      return createRequire(import.meta.url)("playwright");
    } catch {
      console.error("Playwright is not installed (it is not a dependency of Paper Pal). Install it for this run with:");
      console.error("  npm install --no-save playwright && npx playwright install chromium");
      process.exit(1);
    }
  }
}

// ------------------------------------------------------------------ fixtures
// Every passage below exists verbatim in examples/sample-paper; the fixtures
// anchor to them and fail loudly if the sample paper changes.
const TEXT = {
  // In the first paragraph, so that the proposal card and its buttons open the
  // comments pane, level with the inline diff.
  opening: "The observation is old, and the explanation usually offered is simple. Street lights",
  openingRewrite: "The explanation usually offered is simple: street lights",
  weaker: "the evidence for it is weaker than its popularity suggests",
  contrast: "This paper reports a three-year study designed around that contrast.",
  finding: "We find that light explains most of the shift and noise explains very little.",
  most: "light explains most of the shift and noise explains very little",
  exclusive: "Under this account the birds are not fooled by the light at all.",
};

// Two sentences of the abstract, selected from the first words of one to the
// last words of the other.
const COMMENT_TARGET = ["Song onset advanced by 4.1 minutes", "before those in unlit parks."];
// Half typed, on purpose.
const COMMENT_DRAFT = "Lead with the half-hour difference: it is the number readers will remember. Then give the esti";

function requestFactory(document) {
  return (id, needle, extra) => {
    const block = document.blocks.find((candidate) => candidate.raw.includes(needle));
    if (!block) throw new Error(`examples/sample-paper no longer contains: ${needle.slice(0, 60)}…`);
    const start = block.raw.indexOf(needle);
    return {
      id,
      path: document.path,
      blockIndex: block.index,
      blockId: block.id,
      endBlockIndex: block.index,
      endBlockId: block.id,
      start,
      end: start + needle.length,
      absoluteStart: block.start + start,
      absoluteEnd: block.start + start + needle.length,
      selectedText: needle,
      createdAt: "2031-03-04T09:30:00Z",
      provider: AGENT,
      anchorValid: true,
      ...extra,
    };
  };
}

function buildFixtures(intro, structure) {
  const make = requestFactory(intro);
  const proposalComment = "“The observation is old” has no source behind it. Cut it and go straight to the explanation.";
  const proposed = make("req-0001", TEXT.opening, {
    status: "proposed",
    agentStatus: "complete",
    comment: proposalComment,
    proposal: { originalDisplay: TEXT.opening, replacementDisplay: TEXT.openingRewrite, summary: "Cut the unsourced aside and joined the two sentences." },
    conversation: [
      { role: "user", content: proposalComment },
      { role: "assistant", summary: "Cuts the unsourced aside and joins the two sentences with a colon. No new claims." },
    ],
  });
  const drafting = make("req-0002", TEXT.contrast, {
    status: "pending",
    agentStatus: "running",
    comment: "Say where and when the study took place, so the reader has the setting before the contributions.",
  });
  const discussed = make("req-0003", TEXT.finding, {
    status: "discussed",
    agentStatus: "complete",
    responseMode: "discuss",
    comment: "Should we quantify “most” here?",
    discussion: {
      answer: "Yes. Section 4 already has the numbers: song onset advances by 4.1 minutes for each tenfold increase in illuminance, while the noise coefficient is small and its interval spans zero.",
      recommendation: "Give the light estimate here and point to Table 1 for the rest.",
      claimRisk: "Low. Both statements come straight from Table 1.",
      options: [
        { label: "A", wording: "We find that song onset advances by 4.1 minutes for each tenfold increase in light, and that noise has no detectable effect." },
        { label: "B", wording: "We find that light, not noise, explains the shift (Table 1)." },
      ],
    },
    conversation: [
      { role: "user", content: "Should we quantify “most” here?" },
      { role: "assistant", answer: "Yes. The estimates in Section 4 support a specific statement." },
    ],
  });

  // Two findings with short passages: the panel has to fit a README close-up.
  const review = {
    path: INTRO,
    summary: "The introduction sets up the contrast between the two explanations clearly. Two passages would be stronger with specifics the paper already has.",
    warnings: [],
    findings: [
      {
        level: "argument",
        principle: "Claims need evidence",
        selectedText: TEXT.weaker,
        issue: "The evidence is called weak before the reader is told what is missing from it.",
        suggestion: "Name the gap: earlier studies measured light or noise, never both at one site.",
      },
      {
        level: "sentence",
        principle: "Prefer the specific",
        selectedText: TEXT.most,
        issue: "“Most” and “very little” stand in for numbers the paper reports in Section 4.",
        suggestion: "Give the estimate: 4.1 minutes per tenfold increase in illuminance (Table 1).",
      },
    ],
  };

  const chatId = "chat_fixture_1";
  const chat = {
    version: 1,
    id: chatId,
    status: "idle",
    provider: AGENT,
    createdAt: "2031-03-04T09:10:00Z",
    updatedAt: "2031-03-04T09:11:00Z",
    messages: [
      { id: "m1", role: "user", createdAt: "2031-03-04T09:10:00Z", content: `> ${TEXT.exclusive}\n\nIs the introduction fair to the noise hypothesis?` },
      {
        id: "m2",
        role: "assistant",
        provider: AGENT,
        selectionMessageId: "m1",
        createdAt: "2031-03-04T09:11:00Z",
        content: "Mostly. The second paragraph gives the noise account its strongest form.\n\nThe weak spot is the sentence you selected: it treats the two explanations as exclusive, yet the model in Section 3.2 lets light and noise act together.",
      },
    ],
  };
  const chats = [{ id: chatId, title: "Is the introduction fair to the noise hypothesis?", status: "idle", createdAt: chat.createdAt, updatedAt: chat.updatedAt, messageCount: chat.messages.length, isCurrent: true }];

  const sections = (structure?.sections || []).filter((section) => !section.appendix);
  const method = sections.find((section) => section.title === "Method");
  const results = sections.find((section) => section.title === "Results");
  if (!method || !results) throw new Error("examples/sample-paper no longer has Method and Results sections.");
  const structureProposal = {
    createdAt: "2031-03-04T09:20:00Z",
    sections: [
      {
        sectionId: method.id,
        title: "Method",
        reason: "The saturation test is a modelling choice, so it belongs with the model and not at the end of the section.",
        nodes: [
          { title: "Sites and recordings", kind: "subsection", change: "rewrite", reason: "Lead with the design: quiet bright streets and loud dark ones." },
          { title: "Model", kind: "subsection", change: "rewrite", children: [{ title: "Piecewise light term", kind: "paragraph", change: "move", reason: "Moved up from the end of the section." }] },
          { title: "Song-onset detection", kind: "subsection", change: "new", reason: "Split out so that Results can cite the onset criterion." },
        ],
      },
      {
        sectionId: results.id,
        title: "Results",
        reason: "Report the main estimate first, then the saturation result that the Discussion builds on.",
        nodes: [
          { title: "Main estimate", kind: "paragraph", change: "rewrite" },
          { title: "Saturation above 3 lux", kind: "paragraph", change: "split", reason: "Currently shares a paragraph with the AIC comparison." },
          { title: "Restating the model", kind: "paragraph", change: "remove", reason: "Duplicates Section 3.2." },
        ],
      },
    ],
  };
  const structureChat = {
    ...chat,
    id: "chat_fixture_structure",
    messages: [
      { id: "s1", role: "user", createdAt: "2031-03-04T09:19:00Z", content: "Method and Results overlap: the saturation test is described in both." },
      { id: "s2", role: "assistant", provider: AGENT, createdAt: "2031-03-04T09:20:00Z", content: "I propose moving the piecewise term into the Model subsection and removing the restatement from Results.", structureProposal },
    ],
  };

  // The proposal comes first in the file, so its card and its Accept and
  // Reject buttons are the first thing in the comments pane.
  return { hero: [proposed, drafting, discussed], proposalOnly: [proposed], review, chat, chats, structureChat };
}

// A typical machine: both command-line agents installed, one API key set and
// Ollama running. The labels, default-model captions and "not ready" reasons
// are the server's own; only availability is overridden. An API provider is
// only ever ready with a model configured, so those show a neutral
// placeholder, not a real id.
function typicalProviders(providers) {
  const ready = new Set(["claude", "codex", "anthropic", "ollama"]);
  return providers.map((provider) => {
    if (!ready.has(provider.id)) {
      return { ...provider, available: false, reason: provider.reason || "Not set up on this machine yet." };
    }
    return { ...provider, available: true, reason: null, models: [], model: provider.kind === "api" ? "configured model" : provider.model };
  });
}

// Review progress shown in the pictures: the abstract and the first two
// paragraphs of the introduction are confirmed, so ink and grey tell the story.
const CONFIRMED = {
  "main.tex": "all",
  [INTRO]: ["\\section{Introduction}", "Anyone who has walked home", "That explanation may well be right"],
};
const OUTLINE_PROGRESS = { "main.tex": 100, [INTRO]: 43 };

// ------------------------------------------------------------------ browser
async function seed(page, problems, { requests = [], review = null, chat = null, chats = null, providers = null } = {}) {
  // Nothing may reach an agent or change the project: every write is refused
  // unless a scene mocks it below (Playwright consults later routes first).
  await page.route("**/api/**", (route) => {
    if (route.request().method() === "GET") return route.fallback();
    problems.push(`unexpected ${route.request().method()} ${new URL(route.request().url()).pathname}`);
    return route.abort();
  });
  await page.route("**/api/requests", (route) => (route.request().method() === "GET" ? route.fulfill({ json: requests }) : route.fallback()));
  await page.route("**/api/git", (route) => route.fulfill({ json: { available: true, clean: true, count: 0, lines: [] } }));
  if (review) await page.route("**/api/document/review", (route) => route.fulfill({ json: review }));
  if (chat) await page.route("**/api/chat", (route) => (route.request().method() === "GET" ? route.fulfill({ json: chat }) : route.fallback()));
  if (chats) await page.route("**/api/chats", (route) => (route.request().method() === "GET" ? route.fulfill({ json: chats }) : route.fallback()));
  await page.route("**/api/bootstrap", async (route) => {
    const response = await route.fetch();
    const payload = await response.json();
    const agent = { ...payload.agent, enabled: true, allowOverride: true, provider: AGENT, providers: (providers || typicalProviders)(payload.agent?.providers || []) };
    const acting = agent.providers.find((provider) => provider.id === AGENT);
    if (!acting) problems.push(`the server no longer lists the provider "${AGENT}"`);
    route.fulfill({ response, json: { ...payload, agent, chat: { ...payload.chat, enabled: true, model: acting?.model || payload.chat?.model } } });
  });
  await page.route("**/api/document?*", async (route) => {
    const response = await route.fetch();
    const payload = await response.json();
    const rule = CONFIRMED[payload.path];
    if (rule) {
      for (const block of payload.blocks) {
        if (rule === "all" || rule.some((needle) => block.raw.includes(needle))) {
          block.status = "accepted";
          block.acceptedRanges = [{ start: 0, end: block.raw.length }];
        }
      }
    }
    route.fulfill({ response, json: payload });
  });
  await page.route("**/api/outline", async (route) => {
    const response = await route.fetch();
    const payload = await response.json();
    let reviewed = 0;
    let total = 0;
    for (const item of payload.items || []) {
      const percent = OUTLINE_PROGRESS[item.path];
      if (percent !== undefined && Number(item.level) === 1) {
        item.reviewedPercent = percent;
        item.reviewedBlocks = Math.round(((item.totalBlocks || 0) * percent) / 100);
      }
      if (Number(item.level) === 1) {
        reviewed += item.reviewedBlocks || 0;
        total += item.totalBlocks || 0;
      }
    }
    if (total) payload.overallProgress = Math.round((reviewed / total) * 100);
    route.fulfill({ response, json: payload });
  });
}

async function settle(page, extra = 350) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(extra);
}

// `panes` are the widths an author would get by dragging the pane borders; the
// app keeps them in localStorage and clamps them to its own limits.
async function openApp(context, base, theme, seeds, { documentPath = INTRO, panes = null } = {}) {
  const page = await context.newPage();
  const problems = [];
  page.on("console", (message) => { if (message.type() === "error") problems.push(message.text()); });
  page.on("pageerror", (error) => problems.push(`pageerror: ${error.message}`));
  await page.addInitScript(([choice, widths]) => {
    try {
      localStorage.setItem("paper-pal.theme", choice);
      if (widths) localStorage.setItem("paper-pal.side-pane-widths.v1", JSON.stringify(widths));
    } catch { /* no storage */ }
  }, [theme, panes]);
  await seed(page, problems, seeds);
  await page.goto(`${base}/`);
  await page.waitForSelector(".editor-block");
  if (documentPath && (await page.inputValue("#document-select")) !== documentPath) {
    await page.selectOption("#document-select", documentPath);
    await page.waitForFunction((expected) => document.querySelector("#document-meta")?.textContent.startsWith(expected), documentPath);
  }
  await settle(page);
  return { page, problems };
}

async function selectText(page, from, to = from) {
  const found = await page.evaluate(([first, last]) => {
    const walker = document.createTreeWalker(document.querySelector("#editor"), NodeFilter.SHOW_TEXT);
    const range = document.createRange();
    let started = false;
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!started) {
        const at = node.textContent.indexOf(first);
        if (at < 0) continue;
        range.setStart(node, at);
        started = true;
      }
      const end = node.textContent.indexOf(last);
      if (end < 0) continue;
      range.setEnd(node, end + last.length);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      return true;
    }
    return false;
  }, [from, to]);
  if (!found) throw new Error(`Could not select: ${from.slice(0, 50)}…`);
  await page.waitForSelector("#selection-toolbar:not([hidden])");
}

// Scroll the manuscript so that `selector` sits `offset` CSS pixels below the
// top of the editor pane; comment cards follow their passages.
async function scrollEditorTo(page, selector, offset) {
  await page.locator(selector).first().evaluate((element, distance) => {
    const pane = document.querySelector(".editor-pane");
    pane.scrollTo(0, Math.max(0, pane.scrollTop + element.getBoundingClientRect().top - pane.getBoundingClientRect().top - distance));
  }, offset);
  await settle(page, 600);
}

// Close-ups never cut through a line of manuscript. They start where the
// sticky editor header ends, with the space above `selector` scrolled to that
// line, and they end in the space below a later block. GAP is half the
// distance between two blocks.
const GAP = 7;

async function startCloseUpAt(page, selector) {
  const header = await page.locator(".editor-header").boundingBox();
  const pane = await page.locator(".editor-pane").boundingBox();
  await scrollEditorTo(page, selector, header.y + header.height - pane.y + GAP);
  return header.y + header.height;
}

// The first space between manuscript blocks at or below `y`.
async function gapBelow(page, y) {
  const gaps = await page.evaluate((gap) => [...document.querySelectorAll("#editor > .editor-block")]
    .map((block) => block.getBoundingClientRect())
    .filter((box) => box.height > 0)
    .map((box) => box.bottom + gap), GAP);
  const found = gaps.find((edge) => edge >= y);
  if (found === undefined) throw new Error("The manuscript ends above the bottom of the close-up.");
  return found;
}

async function boxOf(page, selector) {
  const box = await page.locator(selector).first().boundingBox();
  if (!box) throw new Error(`Nothing to crop at ${selector}`);
  return { ...box, right: box.x + box.width, bottom: box.y + box.height };
}

// From just left of the manuscript text to just right of the side-pane element
// `aside`, and from the editor header down to the first space between blocks
// below `through` (a side-pane element, `aside` unless given).
async function closeUp(page, startSelector, aside, { through = aside, pad = 12, margin = 24 } = {}) {
  const top = await startCloseUpAt(page, startSelector);
  const text = await boxOf(page, startSelector);
  const side = await boxOf(page, aside);
  const last = await boxOf(page, through);
  const bottom = await gapBelow(page, last.bottom + pad);
  const floor = Math.min((await boxOf(page, ".comments-footer")).y, (await boxOf(page, ".editor-pane")).bottom);
  if (bottom > floor) throw new Error(`The close-up would end ${Math.round(bottom - floor)} px below the panes; make its window taller.`);
  const x = text.x - margin;
  return { x, y: top, width: side.right + pad - x, height: bottom - top };
}

async function unionClip(page, selectors, pad) {
  const viewport = page.viewportSize();
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (const selector of selectors) {
    const box = await boxOf(page, selector);
    left = Math.min(left, box.x);
    top = Math.min(top, box.y);
    right = Math.max(right, box.right);
    bottom = Math.max(bottom, box.bottom);
  }
  const x = Math.max(0, left - pad);
  const y = Math.max(0, top - pad);
  return { x, y, width: Math.min(viewport.width, right + pad) - x, height: Math.min(viewport.height, bottom + pad) - y };
}

// Crops fall on whole CSS pixels inside the window, so the framed copy is a
// pixel-for-pixel match of the capture.
function wholePixels(clip, viewport) {
  const x = Math.max(0, Math.round(clip.x));
  const y = Math.max(0, Math.round(clip.y));
  return { x, y, width: Math.min(viewport.width, Math.round(clip.x + clip.width)) - x, height: Math.min(viewport.height, Math.round(clip.y + clip.height)) - y };
}

// Rounded corners with transparent pixels outside them and a hairline around
// the edge, so a picture reads as a window on GitHub's white and dark pages.
// The browser does the compositing: no image library is needed.
async function frame(browser, png, { width, height }, theme) {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: SCALE });
  try {
    const page = await context.newPage();
    await page.setContent(`<!doctype html><style>
      html, body { margin: 0; background: transparent; }
      figure { position: relative; margin: 0; width: ${width}px; height: ${height}px; border-radius: ${FRAME.radius}px; overflow: hidden; }
      img { display: block; width: ${width}px; height: ${height}px; }
      figure::after { content: ""; position: absolute; inset: 0; border-radius: ${FRAME.radius}px; box-shadow: inset 0 0 0 1px ${FRAME.line[theme]}; }
    </style><figure><img src="data:image/png;base64,${png.toString("base64")}" alt=""></figure>`);
    await page.locator("img").evaluate((image) => image.decode());
    return await page.screenshot({ omitBackground: true });
  } finally {
    await context.close();
  }
}

// ------------------------------------------------------------------ scenes
// name -> { themes, viewport, run }. `save(page, file, { clip })` writes
// <file>-<theme>.png. A close-up uses a narrower window, as an author with a
// smaller screen would have, so that the crop stays near README width.
const CLOSE_UP = { width: 1044, height: 1000 };
const WIDE_CARDS = { comments: 340 }; // 40 px more than that window's default

const scenes = {
  hero: {
    themes: ["light", "dark"],
    async run({ open, fixtures, save }) {
      const { page, problems } = await open({ requests: fixtures.hero });
      await page.waitForSelector(".request-card .request-diff");
      // Heading, confirmed and draft text, the inline diff and its card in one frame.
      await scrollEditorTo(page, ".editor-block.kind-heading", 84);
      await save(page, "hero");
      return problems;
    },
  },
  diff: {
    themes: ["light", "dark"],
    viewport: { ...CLOSE_UP, width: CLOSE_UP.width + 40 },
    async run({ open, fixtures, save }) {
      const { page, problems } = await open({ requests: fixtures.proposalOnly }, { panes: WIDE_CARDS });
      await page.waitForSelector(".request-card .request-diff");
      await save(page, "diff", { clip: await closeUp(page, ".editor-block.has-proposal", ".request-card.request-proposed") });
      return problems;
    },
  },
  comment: {
    themes: ["light"],
    viewport: { ...CLOSE_UP, height: 620 }, // short, so that the abstract can scroll up to the composer
    async run({ open, save }) {
      // main.tex: the title block and the abstract.
      const { page, problems } = await open({ requests: [] }, { documentPath: "main.tex" });
      await selectText(page, ...COMMENT_TARGET);
      await page.click("#comment-selection");
      await page.locator("#comment-input").pressSequentially(COMMENT_DRAFT, { delay: 0 });
      await settle(page, 300);
      await save(page, "comment", { clip: await closeUp(page, `#editor > .editor-block:has-text("${COMMENT_TARGET[0]}")`, "#comment-composer") });
      return problems;
    },
  },
  review: {
    themes: ["light"],
    viewport: { ...CLOSE_UP, width: CLOSE_UP.width + 40 },
    async run({ open, fixtures, save }) {
      const { page, problems } = await open({ requests: [], review: fixtures.review }, { panes: WIDE_CARDS });
      await page.click("#review-section");
      await page.waitForSelector(".review-finding");
      await settle(page, 300);
      await save(page, "review", { clip: await closeUp(page, ".editor-block.kind-heading", "#review-panel", { margin: 36 }) });
      return problems;
    },
  },
  chat: {
    themes: ["light"],
    viewport: { width: 1240, height: 804 },
    async run({ open, fixtures, save }) {
      const { page, problems } = await open({ requests: [], chat: fixtures.chat, chats: fixtures.chats });
      await page.click("#open-codex-chat");
      await page.waitForSelector(".chat-message");
      await settle(page, 600);
      const hidden = await page.locator("#codex-chat-messages").evaluate((list) => list.scrollHeight - list.clientHeight);
      if (hidden > 0) problems.push(`the chat exchange is ${hidden} px taller than the pane`);
      await save(page, "chat", { clip: await unionClip(page, ["#codex-chat"], 0) });
      return problems;
    },
  },
  backends: {
    themes: ["light"],
    async run({ open, save }) {
      const { page, problems } = await open({ requests: [] });
      await page.click("#agent-provider-button");
      await page.waitForSelector("#agent-provider-menu:not([hidden])");
      // The button and its menu alone: the rest of the window would only show
      // as clipped fragments around them.
      await page.locator("#agent-picker").evaluate((picker) => {
        document.body.style.visibility = "hidden";
        picker.style.visibility = "visible";
      });
      await settle(page, 250);
      await save(page, "backends", { clip: await unionClip(page, ["#agent-provider-button", "#agent-provider-menu"], 12) });
      return problems;
    },
  },
  structure: {
    themes: ["light"],
    // Wide enough for the two trees side by side; only the middle pane is kept.
    viewport: { width: 1540, height: 744 },
    async run({ open, fixtures, save }) {
      const { page, problems } = await open({ requests: [], chat: fixtures.structureChat, chats: fixtures.chats });
      await page.click("#show-structure-workspace");
      await page.waitForSelector("#current-structure-tree .structure-section-card");
      for (const title of ["Method", "Results"]) {
        await page.locator("#current-structure-tree .structure-section-card", { hasText: title }).first().locator("input[type=checkbox]").check();
      }
      // Changing the scope clears any proposal; the chat reply brings it back.
      await page.click("#open-codex-chat");
      await page.click(".structure-chat-actions button");
      await page.waitForSelector("#proposed-structure-tree .proposed-section-card");
      await page.fill("#structure-instruction", "Method and Results overlap: the saturation test is described in both.");
      await page.click("#show-comments-pane");
      // Past the introduction, so that the frame holds the two trees.
      await scrollEditorTo(page, ".structure-columns", 72);
      await save(page, "structure", { clip: await unionClip(page, [".editor-pane"], 0) });
      return problems;
    },
  },
};

// ------------------------------------------------------------------ server
function freePort() {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

async function getJson(base, pathname) {
  const response = await fetch(`${base}${pathname}`);
  if (!response.ok) throw new Error(`${pathname} answered ${response.status}`);
  return response.json();
}

async function startPaperPal() {
  const workspace = await fs.mkdtemp(path.join(tmpdir(), `${TEMP_PREFIX}screenshots-`));
  const project = path.join(workspace, "sample-paper");
  await fs.cp(path.join(appRoot, "examples", "sample-paper"), project, { recursive: true });
  const setup = spawnSync(process.execPath, [path.join(appRoot, "scripts", "setup.mjs"), project, "--no-remember", "--title", PAPER_TITLE], { cwd: appRoot, encoding: "utf8" });
  if (setup.status !== 0) {
    await fs.rm(workspace, { recursive: true, force: true });
    throw new Error(`setup failed:\n${setup.stderr || setup.stdout}`);
  }
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  let log = "";
  const child = spawn(process.execPath, [path.join(appRoot, "server.mjs"), "--repo", project, "--port", String(port)], { cwd: appRoot, stdio: ["ignore", "pipe", "pipe"] });
  child.stdout.on("data", (chunk) => { log += chunk; });
  child.stderr.on("data", (chunk) => { log += chunk; });
  const stop = async () => {
    if (child.exitCode === null && !child.signalCode) {
      const exited = new Promise((resolve) => child.once("exit", resolve));
      child.kill("SIGTERM");
      await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 3000))]);
      if (child.exitCode === null && !child.signalCode) child.kill("SIGKILL");
    }
  };
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (child.exitCode !== null) break;
    try {
      await getJson(base, "/api/bootstrap");
      return { base, workspace, stop };
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 125));
    }
  }
  await stop();
  await fs.rm(workspace, { recursive: true, force: true });
  throw new Error(`The server did not start:\n${log}`);
}

// \ref and \cite numbers come from the compiled .aux; without latexmk the
// pictures still work, but "Section 2" reads "Section ?".
async function compileOnce(base) {
  const bootstrap = await getJson(base, "/api/bootstrap");
  if (bootstrap.latex?.enabled === false || bootstrap.latex?.available === false) {
    console.warn("latexmk was not found: cross-references will show as “?” in the pictures.");
    return;
  }
  const started = await fetch(`${base}/api/compile`, { method: "POST", headers: { "Content-Type": "application/json", "X-Paper-Pal": "1", Origin: base }, body: "{}" });
  if (!started.ok) {
    console.warn(`The compile was refused (${started.status}); continuing without resolved cross-references.`);
    return;
  }
  for (let attempt = 0; attempt < 120; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    const status = (await getJson(base, "/api/bootstrap")).compile?.status;
    if (status !== "running") {
      console.log(`Compiled the temporary copy once (${status}).`);
      return;
    }
  }
  console.warn("The compile did not finish in a minute; continuing.");
}

// ------------------------------------------------------------------ optimise
function onPath(command) {
  const probe = spawnSync(process.platform === "win32" ? "where" : "which", [command], { encoding: "utf8" });
  return probe.status === 0 ? probe.stdout.split(/\r?\n/)[0].trim() : null;
}

// sharp is only needed when pngquant is missing. It is installed into a cache
// folder under the system temp directory, never into this repository.
async function loadSharp() {
  const cache = path.join(tmpdir(), `${TEMP_PREFIX}image-tools`);
  const entry = path.join(cache, "node_modules", "sharp");
  const exists = await fs.stat(entry).then(() => true, () => false);
  if (!exists) {
    await fs.mkdir(cache, { recursive: true });
    await fs.writeFile(path.join(cache, "package.json"), JSON.stringify({ private: true, name: "paper-pal-image-tools" }));
    console.log("Installing sharp into a temporary folder to optimise the PNGs…");
    const install = spawnSync(process.platform === "win32" ? "npm.cmd" : "npm", ["install", "--no-audit", "--no-fund", "--no-save", "sharp"], { cwd: cache, encoding: "utf8" });
    if (install.status !== 0) return null;
  }
  try {
    return createRequire(path.join(cache, "package.json"))("sharp");
  } catch {
    return null;
  }
}

async function optimise(files) {
  const pngquant = onPath("pngquant");
  const lossless = onPath("oxipng") ? ["oxipng", ["-o", "4", "--strip", "safe", "--quiet"]] : onPath("optipng") ? ["optipng", ["-o2", "-quiet", "-strip", "all"]] : null;
  const sharp = pngquant ? null : await loadSharp();
  if (!pngquant && !sharp && !lossless) {
    console.warn("No PNG optimiser available (pngquant, oxipng, optipng or sharp); the images are left as captured.");
    return;
  }
  for (const file of files) {
    const before = (await fs.stat(file)).size;
    if (pngquant) {
      // Refuses (and keeps the original) when 256 colours cannot reach quality 85.
      spawnSync(pngquant, ["--quality", "85-100", "--speed", "1", "--strip", "--skip-if-larger", "--force", "--ext", ".png", file]);
    } else if (sharp) {
      // Palette PNG through libimagequant: visually lossless for UI pictures.
      const packed = await sharp(await fs.readFile(file)).png({ palette: true, quality: 100, colours: 256, dither: 0.6, effort: 10, compressionLevel: 9 }).toBuffer();
      if (packed.length < before) await fs.writeFile(file, packed);
    }
    if (lossless) spawnSync(lossless[0], [...lossless[1], file]);
    const after = (await fs.stat(file)).size;
    const note = after > SIZE_TARGET ? "  (above the 450 KB target)" : "";
    console.log(`  ${path.relative(appRoot, file)}  ${Math.round(before / 1024)} KB -> ${Math.round(after / 1024)} KB${note}`);
  }
}

// ------------------------------------------------------------------ run
async function main() {
  const options = readArguments(process.argv.slice(2));
  const { chromium } = await loadPlaywright();
  const wanted = (name) => !options.only || options.only.has(name);
  const themeWanted = (theme) => options.theme === "both" || options.theme === theme;
  await fs.mkdir(options.out, { recursive: true });

  const written = [];
  const failures = [];
  let paperPal = null;
  const browser = await chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {});
  try {
    if (Object.keys(scenes).some(wanted)) {
      paperPal = await startPaperPal();
      console.log(`Paper Pal is serving a temporary copy of the sample paper at ${paperPal.base}`);
      if (options.compile) await compileOnce(paperPal.base);
      const intro = await getJson(paperPal.base, `/api/document?path=${encodeURIComponent(INTRO)}`);
      const structure = await getJson(paperPal.base, "/api/structure");
      const fixtures = buildFixtures(intro, structure);
      for (const [name, scene] of Object.entries(scenes)) {
        if (!wanted(name)) continue;
        for (const theme of scene.themes.filter(themeWanted)) {
          const context = await browser.newContext({ viewport: scene.viewport || VIEWPORT, deviceScaleFactor: SCALE, colorScheme: theme, reducedMotion: "reduce", locale: "en-GB", timezoneId: "UTC" });
          const save = async (page, file, { clip = null } = {}) => {
            const target = path.join(options.out, `${file}-${theme}.png`);
            await page.mouse.move(0, 0); // no stray hover state in the picture
            const size = page.viewportSize();
            const area = wholePixels(clip || { x: 0, y: 0, ...size }, size);
            const raw = await page.screenshot({ clip: area });
            await fs.writeFile(target, await frame(browser, raw, area, theme));
            written.push(target);
          };
          try {
            const problems = await scene.run({ open: (seeds, extra) => openApp(context, paperPal.base, theme, seeds, extra), fixtures, save });
            for (const problem of problems || []) failures.push(`[${theme}] ${name}: ${problem}`);
          } catch (error) {
            failures.push(`[${theme}] ${name}: ${error.message}`);
          } finally {
            await context.close();
          }
        }
      }
    }
    if (wanted("social")) {
      // GitHub's social preview: 1280x640, built from a static page.
      const context = await browser.newContext({ viewport: { width: 1280, height: 640 }, deviceScaleFactor: 1, colorScheme: "light" });
      try {
        const page = await context.newPage();
        const problems = [];
        page.on("console", (message) => { if (message.type() === "error") problems.push(message.text()); });
        page.on("pageerror", (error) => problems.push(`pageerror: ${error.message}`));
        await page.goto(pathToFileURL(path.join(appRoot, "docs", "images", "src", "social-preview.html")).href);
        await settle(page, 200);
        const target = path.join(options.out, "social-preview.png");
        await page.screenshot({ path: target });
        written.push(target);
        for (const problem of problems) failures.push(`social: ${problem}`);
      } catch (error) {
        failures.push(`social: ${error.message}`);
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
    if (paperPal) {
      await paperPal.stop();
      if (options.keep) console.log(`Kept the temporary project: ${paperPal.workspace}`);
      else await fs.rm(paperPal.workspace, { recursive: true, force: true }).catch(() => {});
    }
  }

  console.log(`\n${written.length} image(s) captured${options.optimize ? "; optimising" : ""}:`);
  if (options.optimize) await optimise(written);
  else for (const file of written) console.log(`  ${path.relative(appRoot, file)}`);
  if (failures.length) {
    console.error(`\n${failures.length} problem(s):\n${failures.map((line) => `  ${line}`).join("\n")}`);
    process.exitCode = 1;
  } else {
    console.log("\nDone: no console errors, no unexpected writes.");
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
