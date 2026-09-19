#!/usr/bin/env node
// Regenerates the animated README picture: docs/images/flow-light.svg and
// docs/images/flow-dark.svg.
//
//   npm run animation [-- --out <dir>] [--theme light|dark|both]
//
// The picture is a drawing of the review loop, not a recording: select a
// passage, comment, read the proposal as a diff, accept. It is one SVG file
// per theme, animated with CSS keyframes only (no script), because that is
// what GitHub plays when a README shows an SVG through <img>. The manuscript
// text is the fictional sample paper, the same passage as in the screenshots.
//
// Layout is computed here, not by the viewer's browser: every run of text is
// measured once with the app's own fonts and written with an explicit width
// (textLength). The fonts are embedded so the picture matches the app; if a
// viewer refuses embedded fonts, the fallback face is fitted to the same
// widths and nothing overlaps.
//
// Like scripts/screenshots.mjs this needs Playwright for one run, only to
// measure text:   npm install --no-save playwright && npx playwright install chromium
// Environment: PW_CHROME = path of a Chromium/Chrome executable to use instead.
import { promises as fs } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const W = 1240;
const H = 700;
const LOOP = 15; // seconds; every track shares it, so the scene never drifts

// ------------------------------------------------------------------ arguments
function readArguments(argv) {
  const options = { out: path.join(appRoot, "docs", "images"), theme: "both" };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = () => {
      index += 1;
      if (argv[index] === undefined) throw new Error(`${flag} needs a value`);
      return argv[index];
    };
    if (flag === "--out") options.out = path.resolve(value());
    else if (flag === "--theme") options.theme = value();
    else if (flag === "--help" || flag === "-h") options.help = true;
    else throw new Error(`Unknown flag ${flag}`);
  }
  if (!["light", "dark", "both"].includes(options.theme)) throw new Error("--theme must be light, dark or both");
  return options;
}

// --------------------------------------------------------------------- themes
// The values are the design tokens of public/styles.css. Keep them in step.
const THEMES = {
  light: {
    canvas: "#f0f0ec", chrome: "#fbfbf9", surface: "#ffffff", sunken: "#f6f6f3", well: "#f0f0ec",
    line: "#dcddd7", lineSoft: "#e8e8e3", frame: "rgba(27,31,36,.2)",
    ink: "#1c1f1b", muted: "#5a5f57", quiet: "#636860", draft: "#6a7169", faint: "#a4a79f",
    accent: "#2d6653", accentInk: "#2a6150", accentSoft: "#e5f0ea", accentLine: "#b4d0c3", onAccent: "#ffffff",
    infoInk: "#2c58a8", infoSoft: "#e8effc", infoSolid: "#3b6bc4",
    warnInk: "#855708", warnSoft: "#fcf1d3", warnLine: "#e8d193",
    okInk: "#1e6a45", okSoft: "#e0f2e7", okLine: "#b2d8c1", okSolid: "#2f8a5c",
    delInk: "#9b342b", delBg: "#fbe1dd", delWash: "#fdf6f5", delRule: "rgba(155,52,43,.55)",
    insInk: "#17603c", insBg: "#d9f0e2", insWash: "#f4faf6", insRule: "rgba(23,96,60,.55)",
    citeInk: "#2f5a8c", citeBg: "#edf3fb", selBg: "#d6e4ff", hlBg: "#fdeeb5", hlRule: "#cf9f33",
    shadow: "rgba(28,31,27,.14)", cursor: "#1c1f1b", cursorEdge: "#ffffff", mark: "#151515",
  },
  dark: {
    canvas: "#111311", chrome: "#181b18", surface: "#1d211d", sunken: "#171a17", well: "#121412",
    line: "#30352f", lineSoft: "#282d27", frame: "rgba(255,255,255,.2)",
    ink: "#eceee9", muted: "#b4b9b0", quiet: "#979d93", draft: "#969c92", faint: "#5d635a",
    accent: "#2f7a62", accentInk: "#84d0b2", accentSoft: "#1d2f27", accentLine: "#33574a", onAccent: "#ffffff",
    infoInk: "#9dbcf5", infoSoft: "#1b2539", infoSolid: "#6f9bec",
    warnInk: "#e5bd66", warnSoft: "#30280f", warnLine: "#5b4a1a",
    okInk: "#8fdcb1", okSoft: "#183024", okLine: "#2d5a42", okSolid: "#55b987",
    delInk: "#f5a79c", delBg: "#4a2320", delWash: "#241a18", delRule: "rgba(245,167,156,.6)",
    insInk: "#9be3bb", insBg: "#1c3d2b", insWash: "#17231c", insRule: "rgba(155,227,187,.6)",
    citeInk: "#a3c1f0", citeBg: "#1e2839", selBg: "#2c4473", hlBg: "#453a14", hlRule: "#c99a35",
    shadow: "rgba(0,0,0,.5)", cursor: "#f4f5f1", cursorEdge: "#111311", mark: "#f2f2ef",
  },
};

// ----------------------------------------------------------------- the script
// The passage and the proposal are the ones in docs/images/hero-*.png.
const COMMENT = "“The observation is old” has no source behind it. Cut it and go straight to the explanation.";
const RATIONALE = "Claude: Cuts the unsourced aside and joins the two sentences with a colon. No new claims.";
const LEAD = "Anyone who has walked home through a city before sunrise has heard it: a blackbird singing from a lamp post while the sky is still fully dark. ";
const TAIL = " make the night brighter, so the birds believe that morning has come (";
const CITE = "Hartwell and Osei, 2009";
const NEXT = "That explanation may well be right, but the evidence for it is weaker than its popularity suggests. Bright streets are also loud streets. Traffic noise peaks during the morning rush, and a bird that sings before the rush is heard more clearly than one that sings during it.";

// A paragraph is a list of pieces: [text, ink, mark]. ink: "ink" (confirmed)
// or "draft"; mark: null, "sel" (the passage being selected), "del", "ins", "cite".
const PARAGRAPH = {
  before: [
    [LEAD, "ink"],
    ["The observation is old, and the explanation usually offered is simple. Street lights", "draft", "sel"],
    [TAIL, "draft"], [CITE, "draft", "cite"], [").", "draft"],
  ],
  diff: [
    [LEAD, "ink"],
    ["The ", "draft"], ["observation is old, and the ", "draft", "del"],
    ["explanation usually offered is simple", "draft"], [". Street", "draft", "del"], [" ", "draft"],
    [": street", "draft", "ins"], [" lights", "draft"],
    [TAIL, "draft"], [CITE, "draft", "cite"], [").", "draft"],
  ],
  after: [
    [LEAD, "ink"],
    ["The explanation usually offered is simple: street lights", "ink"],
    [TAIL, "draft"], [CITE, "draft", "cite"], [").", "draft"],
  ],
};
const CARD_DEL = [["The ", "quiet"], ["observation is old, and the ", "quiet", "del"], ["explanation usually offered is simple", "quiet"], [". Street", "quiet", "del"], [" lights", "quiet"]];
const CARD_INS = [["The explanation usually offered is simple", "ink"], [": street", "ink", "ins"], [" lights", "ink"]];

// Timeline, in seconds.
const AT = {
  selectStart: 0.9, selectEnd: 2.1,
  composerIn: 2.3, typeStart: 2.9, typeEnd: 5.3,
  toComment: 5.0, clickComment: 5.9,
  draftingIn: 6.1, proposalIn: 7.9,
  toAccept: 9.3, clickAccept: 10.3, acceptedIn: 10.5,
  reset: 14.2,
};

// ------------------------------------------------------------------- measuring
const FONTS = {
  ui: { family: "PP Inter", file: "inter-latin-wght-normal.woff2", weight: "100 900" },
  serif: { family: "PP Serif", file: "source-serif-4-latin-wght-normal.woff2", weight: "200 900" },
};

async function loadPlaywright() {
  try {
    return await import("playwright");
  } catch {
    try {
      return createRequire(import.meta.url)("playwright");
    } catch {
      throw new Error("Playwright is not installed. Run: npm install --no-save playwright && npx playwright install chromium");
    }
  }
}

async function openMeasurer(fontData) {
  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {});
  const page = await browser.newPage();
  await page.setContent("<!doctype html><canvas></canvas>");
  await page.evaluate(async (fonts) => {
    for (const font of fonts) {
      const face = new FontFace(font.family, `url(data:font/woff2;base64,${font.base64})`, { weight: font.weight });
      document.fonts.add(await face.load());
    }
  }, Object.values(fontData));
  const cache = new Map();
  return {
    async widths(font, texts) {
      const missing = [...new Set(texts)].filter((text) => !cache.has(`${font}\n${text}`));
      if (missing.length) {
        const measured = await page.evaluate(({ font: spec, items }) => {
          const context = document.querySelector("canvas").getContext("2d");
          context.font = spec;
          return items.map((item) => context.measureText(item).width);
        }, { font, items: missing });
        missing.forEach((text, index) => cache.set(`${font}\n${text}`, measured[index]));
      }
      return texts.map((text) => cache.get(`${font}\n${text}`));
    },
    close: () => browser.close(),
  };
}

// --------------------------------------------------------------------- layout
const round = (value) => Math.round(value * 10) / 10;
const escapeXml = (text) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// Breaks pieces into lines. A piece boundary without a space does not allow a
// break ("simple" + ". Street"), so marks can start and stop inside a word.
async function layout(measurer, pieces, { font, width }) {
  const atoms = [];
  let open = null;
  for (const [text, ink, mark = null] of pieces) {
    for (const token of text.split(/(\s+)/).filter(Boolean)) {
      if (/^\s+$/.test(token)) {
        if (open) open.parts[open.parts.length - 1].text += " ";
        else if (atoms.length) atoms[atoms.length - 1].parts.at(-1).text += " ";
        open = null;
      } else {
        if (!open) { open = { parts: [] }; atoms.push(open); }
        open.parts.push({ text: token, ink, mark });
      }
    }
  }
  const texts = atoms.flatMap((atom) => atom.parts.flatMap((part) => [part.text, part.text.trimEnd()]));
  const widths = await measurer.widths(font, texts);
  const widthOf = new Map(texts.map((text, index) => [text, widths[index]]));
  const lines = [[]];
  let used = 0;
  for (const atom of atoms) {
    const full = atom.parts.reduce((sum, part) => sum + widthOf.get(part.text), 0);
    const last = atom.parts.at(-1);
    const visible = full - widthOf.get(last.text) + widthOf.get(last.text.trimEnd());
    if (used + visible > width && lines.at(-1).length) { lines.push([]); used = 0; }
    lines.at(-1).push(...atom.parts);
    used += full;
  }
  // Merge neighbours that look the same into runs with a position.
  return lines.map((parts) => {
    const runs = [];
    let x = 0;
    for (const part of parts) {
      const advance = widthOf.get(part.text);
      const previous = runs.at(-1);
      // The space after the last word of a run is part of its advance, not of what is drawn.
      const trailing = advance - widthOf.get(part.text.trimEnd());
      if (previous && previous.ink === part.ink && previous.mark === part.mark) {
        previous.text += part.text;
        previous.advance += advance;
        previous.width = previous.advance - trailing;
      } else runs.push({ text: part.text, ink: part.ink, mark: part.mark, x, advance, width: advance - trailing });
      x += advance;
    }
    return runs;
  });
}

// ------------------------------------------------------------------ animation
const EASE_OUT = "cubic-bezier(.2,.8,.2,1)";
const EASE_IO = "cubic-bezier(.45,0,.25,1)";

class Tracks {
  constructor() { this.css = []; this.count = 0; }
  // frames: [time, {property: value}, easingToNext?]. Returns the class name.
  add(frames, name = `k${(this.count += 1)}`) {
    const sorted = [...frames].sort((a, b) => a[0] - b[0]);
    if (sorted[0][0] > 0) sorted.unshift([0, sorted[0][1]]);
    if (sorted.at(-1)[0] < LOOP) sorted.push([LOOP, sorted.at(-1)[1]]);
    const steps = sorted.map(([time, properties, easing]) => {
      const body = Object.entries(properties).map(([key, value]) => `${key}:${value}`).join(";");
      return `${Math.round((time / LOOP) * 1e5) / 1e3}%{${body}${easing ? `;animation-timing-function:${easing}` : ""}}`;
    });
    this.css.push(`@keyframes ${name}{${steps.join("")}}.${name}{animation:${name} ${LOOP}s linear infinite}`);
    return name;
  }
  // Visible between two moments. `rest` is the opacity without animation.
  show(from, to, { fadeIn = 0.3, fadeOut = 0.3, rise = 0 } = {}) {
    const hidden = { opacity: 0, ...(rise ? { transform: `translateY(${rise}px)` } : {}) };
    const shown = { opacity: 1, ...(rise ? { transform: "translateY(0)" } : {}) };
    const frames = [];
    if (from > 0) frames.push([Math.max(from - 0.001, 0), hidden, EASE_OUT]);
    frames.push([from + (from > 0 ? fadeIn : 0), shown]);
    frames.push([to, shown, EASE_IO], [Math.min(to + fadeOut, LOOP), { ...hidden, ...(rise ? { transform: "translateY(0)" } : {}) }]);
    return this.add(frames);
  }
}

// -------------------------------------------------------------------- drawing
function drawScene(theme, c, geometry, fontData) {
  const tracks = new Tracks();
  const parts = [];
  const UI = "u";
  const SERIF = "s";
  const text = (x, y, content, { cls = UI, size = 13, weight = 400, fill = c.ink, anchor, width, extra = "" } = {}) =>
    `<text x="${round(x)}" y="${round(y)}" class="${cls}" font-size="${size}" font-weight="${weight}" fill="${fill}"` +
    `${anchor ? ` text-anchor="${anchor}"` : ""}${width ? ` textLength="${round(width)}" lengthAdjust="spacingAndGlyphs"` : ""}${extra}>${escapeXml(content)}</text>`;
  const rect = (x, y, w, h, { rx = 0, fill = "none", stroke, extra = "" } = {}) =>
    `<rect x="${round(x)}" y="${round(y)}" width="${round(w)}" height="${round(h)}"${rx ? ` rx="${rx}"` : ""} fill="${fill}"${stroke ? ` stroke="${stroke}"` : ""}${extra}/>`;

  // Lines of marked-up text. Returns the markup and, for the selection, the
  // rectangle of every line it touches.
  const inkOf = { ink: c.ink, draft: c.draft, quiet: c.quiet, muted: c.muted };
  function drawLines(lines, x0, y0, { size, leading, cls = SERIF, markHeight }) {
    const out = [];
    const selection = [];
    lines.forEach((runs, row) => {
      const baseline = y0 + row * leading;
      const top = baseline - markHeight * 0.74;
      for (const run of runs) {
        const x = x0 + run.x;
        const label = run.text.trimEnd();
        if (!label) continue;
        let fill = inkOf[run.ink];
        let extra = "";
        if (run.mark === "sel") selection.push({ x: x - 2, y: top, width: run.width + 4, height: markHeight, row });
        if (run.mark === "del") {
          out.push(rect(x - 2, top, run.width + 4, markHeight, { rx: 3, fill: c.delBg }));
          fill = c.delInk;
          extra = ' text-decoration="line-through"';
        }
        if (run.mark === "ins") {
          out.push(rect(x - 2, top, run.width + 4, markHeight, { rx: 3, fill: c.insBg }));
          out.push(rect(x - 2, top + markHeight - 1.5, run.width + 4, 1.5, { fill: c.insRule }));
          fill = c.insInk;
        }
        if (run.mark === "cite") {
          out.push(rect(x - 3, top, run.width + 6, markHeight, { rx: 3, fill: c.citeBg }));
          fill = c.citeInk;
        }
        out.push(text(x, baseline, label, { cls, size, fill, width: run.width, extra }));
      }
    });
    return { markup: out.join(""), selection };
  }

  const G = geometry;
  const { top, rail, sheet, body, pane } = G.boxes;

  // ---- window, top bar
  parts.push(rect(0.5, 0.5, W - 1, H - 1, { rx: 10, fill: c.canvas }));
  parts.push(`<path d="M.5 10.5a10 10 0 0 1 10-10h${W - 21}a10 10 0 0 1 10 10V${top}H.5z" fill="${c.chrome}"/>`);
  parts.push(rect(0, top, W, 1, { fill: c.line }));
  parts.push(`<g transform="translate(20 12) scale(.25)" fill="none" stroke="${c.mark}" stroke-width="14.4" stroke-linecap="round" stroke-linejoin="round">` +
    '<g transform="translate(-61.5 -62) scale(.2)" stroke-width="72"><path d="M386 885V575A194 200 0 0 1 580 375H685A185 185 0 0 1 685 745H638"/><path d="M516 885V577A77 77 0 0 1 593 500H680A58.5 58.5 0 0 1 680 617H632"/></g></g>');
  parts.push(text(60, 34, "Paper Pal", { size: 16, weight: 650 }));
  parts.push(rect(rail, 0.5, 1, top, { fill: c.line }));
  parts.push(text(rail + 24, 34, "Earlier Every Year", { size: 15, weight: 600 }));
  parts.push(rect(rail + 176, 14, 232, 30, { rx: 8, fill: c.surface, stroke: c.line }));
  parts.push(text(rail + 190, 34, "sections/01_introduction.tex", { size: 13, fill: c.muted }));
  parts.push(rect(W - 92, 15, 72, 28, { rx: 14, fill: c.okSoft, stroke: c.okLine }));
  parts.push(`<circle cx="${W - 76}" cy="29" r="3.5" fill="${c.okSolid}"/>`);
  parts.push(text(W - 66, 33.5, "Local", { size: 12.5, weight: 600, fill: c.okInk }));
  const saved = (fill) => `<path d="M${W - 186} 29l4 4 8-9" fill="none" stroke="${fill}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>` +
    text(W - 168, 33.5, "Saved", { size: 13, fill });
  parts.push(saved(c.quiet));
  const savedFlash = tracks.add([[AT.acceptedIn, { opacity: 0 }, EASE_OUT], [AT.acceptedIn + 0.3, { opacity: 1 }], [AT.acceptedIn + 1.8, { opacity: 1 }, EASE_IO], [AT.acceptedIn + 2.6, { opacity: 0 }]]);
  parts.push(`<g class="${savedFlash} rest0">${saved(c.accentInk)}</g>`);

  // ---- outline rail with review progress
  parts.push(rect(0.5, top + 1, rail, H - top - 11.5, { fill: c.chrome }));
  parts.push(`<path d="M.5 ${H - 12}h${rail}v11.5H10.5a10 10 0 0 1-10-10z" fill="${c.chrome}"/>`);
  parts.push(rect(rail, top, 1, H - top, { fill: c.line }));
  parts.push(text(20, top + 34, "PAPER REVIEW", { size: 11, weight: 600, fill: c.quiet, extra: ' letter-spacing=".08em"' }));
  const beforeAccept = tracks.show(0, AT.acceptedIn, { fadeOut: 0.4 });
  const afterAccept = tracks.add([[AT.acceptedIn, { opacity: 0 }, EASE_OUT], [AT.acceptedIn + 0.4, { opacity: 1 }], [AT.reset, { opacity: 1 }, EASE_IO], [AT.reset + 0.5, { opacity: 0 }]]);
  parts.push(`<g class="${beforeAccept} rest0">${text(20, top + 70, "14%", { size: 26, weight: 650 })}</g>`);
  parts.push(`<g class="${afterAccept}">${text(20, top + 70, "16%", { size: 26, weight: 650 })}</g>`);
  parts.push(text(rail - 20, top + 68, "8 sections", { size: 12.5, fill: c.muted, anchor: "end" }));
  parts.push(rect(20, top + 82, rail - 40, 4, { rx: 2, fill: c.lineSoft }));
  const grow = (from, to) => tracks.add([[AT.acceptedIn, { transform: `scaleX(${from})` }, EASE_OUT], [AT.acceptedIn + 0.8, { transform: `scaleX(${to})` }], [AT.reset, { transform: `scaleX(${to})` }, EASE_IO], [AT.reset + 0.5, { transform: `scaleX(${from})` }]]);
  parts.push(`<rect class="${grow(0.875, 1)} box" x="20" y="${top + 82}" width="${round((rail - 40) * 0.16)}" height="4" rx="2" fill="${c.accent}" style="transform:scaleX(1)"/>`);
  parts.push(rect(0, top + 102, rail, 1, { fill: c.lineSoft }));
  const sections = [["–", "Abstract", "100%"], ["1", "Introduction", null], ["2", "Related Work"], ["3", "Method"], ["4", "Results"], ["5", "Discussion"]];
  sections.forEach(([number, title, percent], index) => {
    const y = top + 140 + index * 46;
    if (index === 1) {
      parts.push(rect(8, y - 25, rail - 16, 44, { rx: 8, fill: c.surface, stroke: c.line }));
      parts.push(rect(8, y - 17, 3, 28, { rx: 1.5, fill: c.accent }));
    }
    parts.push(text(24, y, number, { size: 12.5, fill: c.quiet }));
    parts.push(text(52, y, title, { size: 14, weight: index < 2 ? 600 : 500, fill: index < 2 ? c.ink : c.muted }));
    if (percent) parts.push(text(rail - 20, y, percent, { size: 12, fill: c.muted, anchor: "end" }));
    if (index < 2) parts.push(rect(52, y + 9, rail - 72, 2.5, { rx: 1.25, fill: index ? c.lineSoft : c.accent }));
  });
  const introY = top + 140 + 46;
  parts.push(`<g class="${beforeAccept} rest0">${text(rail - 20, introY, "43%", { size: 12, weight: 600, fill: c.accentInk, anchor: "end" })}</g>`);
  parts.push(`<g class="${afterAccept}">${text(rail - 20, introY, "57%", { size: 12, weight: 600, fill: c.accentInk, anchor: "end" })}</g>`);
  parts.push(`<rect class="${grow(0.754, 1)} box" x="52" y="${introY + 9}" width="${round((rail - 72) * 0.57)}" height="2.5" rx="1.25" fill="${c.accent}" style="transform:scaleX(1)"/>`);

  // ---- manuscript sheet
  parts.push(rect(sheet.x, sheet.y, sheet.width, H - sheet.y, { fill: c.surface }));
  parts.push(rect(sheet.x, sheet.y, 1, H - sheet.y, { fill: c.lineSoft }) + rect(sheet.x + sheet.width, sheet.y, 1, H - sheet.y, { fill: c.lineSoft }));
  parts.push(text(rail + 24, top + 27, "1 · Introduction", { size: 14.5, weight: 600 }));
  parts.push(text(rail + 24, top + 45, "8 readable blocks", { size: 12, fill: c.muted }));
  parts.push(text(body.x - 30, body.y - 40, "1", { cls: SERIF, size: 17, fill: c.quiet }));
  parts.push(text(body.x, body.y - 40, "Introduction", { cls: SERIF, size: 28, weight: 700 }));

  const lineOptions = { size: G.bodySize, leading: G.bodyLeading, markHeight: 24 };
  const draw = (lines) => drawLines(lines, body.x, body.y, lineOptions);
  const before = draw(G.paragraph.before);
  const nextParagraph = (lines) => drawLines(G.next, body.x, body.y + lines.length * G.bodyLeading + 16, lineOptions).markup;

  // selection: grows line by line while the pointer drags, then becomes the comment's highlight
  const selectionSpan = AT.selectEnd - AT.selectStart;
  const selectionTotal = before.selection.reduce((sum, box) => sum + box.width, 0);
  let cursorTime = AT.selectStart;
  const selectionMarkup = before.selection.map((box) => {
    const duration = selectionSpan * (box.width / selectionTotal);
    const name = tracks.add([
      [cursorTime, { transform: "scaleX(0)", opacity: 1 }], [cursorTime + duration, { transform: "scaleX(1)", opacity: 1 }],
      [AT.draftingIn, { transform: "scaleX(1)", opacity: 1 }, EASE_IO], [AT.draftingIn + 0.4, { transform: "scaleX(1)", opacity: 0 }],
      [LOOP, { transform: "scaleX(0)", opacity: 0 }],
    ]);
    cursorTime += duration;
    return `<rect class="${name} box rest0" x="${round(box.x)}" y="${round(box.y)}" width="${round(box.width)}" height="${box.height}" rx="3" fill="${c.selBg}" style="transform-origin:0 50%"/>`;
  }).join("");
  const highlight = tracks.show(AT.draftingIn, AT.proposalIn, { fadeIn: 0.4 });
  const highlightMarkup = before.selection.map((box) =>
    rect(box.x, box.y, box.width, box.height, { rx: 3, fill: c.hlBg }) + rect(box.x, box.y + box.height - 1.5, box.width, 1.5, { fill: c.hlRule })).join("");
  const badge = tracks.show(AT.draftingIn, AT.acceptedIn, { fadeIn: 0.4 });
  const firstSelected = before.selection[0];
  parts.push(selectionMarkup, `<g class="${highlight} rest0">${highlightMarkup}</g>`);
  parts.push(`<g class="${badge}">${rect(body.x + body.width + 14, firstSelected.y + 1, 30, 22, { rx: 11, fill: c.warnSoft, stroke: c.warnLine })}` +
    `${text(body.x + body.width + 29, firstSelected.y + 16.5, "1", { size: 12, weight: 650, fill: c.warnInk, anchor: "middle" })}</g>`);

  const stateBefore = tracks.show(0, AT.proposalIn, { fadeOut: 0.35 });
  const stateDiff = tracks.show(AT.proposalIn, AT.acceptedIn, { fadeIn: 0.35, fadeOut: 0.35 });
  const stateAfter = tracks.add([[AT.acceptedIn, { opacity: 0 }, EASE_OUT], [AT.acceptedIn + 0.4, { opacity: 1 }], [AT.reset, { opacity: 1 }, EASE_IO], [AT.reset + 0.5, { opacity: 0 }]]);
  parts.push(`<g class="${stateBefore} rest0">${before.markup}${nextParagraph(G.paragraph.before)}</g>`);
  parts.push(`<g class="${stateDiff} rest0">${draw(G.paragraph.diff).markup}${nextParagraph(G.paragraph.diff)}</g>`);
  parts.push(`<g class="${stateAfter}">${draw(G.paragraph.after).markup}${nextParagraph(G.paragraph.after)}</g>`);

  // ---- right pane
  parts.push(rect(pane.x, top + 1, W - pane.x - 0.5, H - top - 1.5, { fill: c.chrome }));
  parts.push(rect(pane.x, top, 1, H - top, { fill: c.line }));
  parts.push(rect(pane.x + 20, top + 12, pane.width - 40, 36, { rx: 9, fill: c.well }));
  parts.push(rect(pane.x + 23, top + 15, (pane.width - 46) / 2, 30, { rx: 7, fill: c.surface, stroke: c.line }));
  parts.push(text(pane.x + 23 + (pane.width - 46) / 4, top + 35, "Comments", { size: 13.5, weight: 600, anchor: "middle" }));
  parts.push(text(pane.x + 23 + (pane.width - 46) * 0.75, top + 35, "Chat", { size: 13.5, weight: 500, fill: c.muted, anchor: "middle" }));

  const card = { x: pane.x + 20, y: top + 66, width: pane.width - 40 };
  const inner = { x: card.x + 18, width: card.width - 36 };
  const cardBox = (height, stroke = c.line) =>
    rect(card.x, card.y, card.width, height, { rx: 12, fill: c.surface, stroke, extra: ' filter="url(#lift)"' });
  const pill = (x, y, label, width, { ink, soft, dot, pulse = "" }) =>
    rect(x, y, width, 24, { rx: 12, fill: soft }) + `<circle class="${pulse}" cx="${x + 12}" cy="${y + 12}" r="3.5" fill="${dot}"/>` +
    text(x + 22, y + 16.5, label, { size: 12.5, weight: 600, fill: ink });
  const plain = (lines, x, y, options) => lines.map((runs, row) => runs.map((run) =>
    text(x + run.x, y + row * options.leading, run.text.trimEnd(), { ...options, width: run.width })).join("")).join("");

  // empty state, before anything is selected
  const hint = tracks.show(0, AT.composerIn - 0.2, { fadeOut: 0.2 });
  parts.push(`<g class="${hint} rest0">${text(pane.x + pane.width / 2, top + 150, "Select text in the manuscript", { size: 13.5, fill: c.quiet, anchor: "middle" })}` +
    `${text(pane.x + pane.width / 2, top + 170, "to leave a comment.", { size: 13.5, fill: c.quiet, anchor: "middle" })}</g>`);

  // composer
  const composer = tracks.show(AT.composerIn, AT.clickComment + 0.1, { rise: 10, fadeOut: 0.2 });
  const quoteY = card.y + 66;
  const boxY = quoteY + 40;
  const boxHeight = 22 + G.comment.typed.length * 22;
  const buttonsY = boxY + boxHeight + 18;
  const composerHeight = buttonsY + 38 + 18 - card.y;
  let typeTime = AT.typeStart;
  const typedTotal = G.comment.typed.reduce((sum, runs) => sum + runs.at(-1).x + runs.at(-1).width, 0);
  const typed = G.comment.typed.map((runs, row) => {
    const lineWidth = runs.at(-1).x + runs.at(-1).width;
    const duration = (AT.typeEnd - AT.typeStart) * (lineWidth / typedTotal);
    const wipe = tracks.add([[typeTime, { transform: "translateX(0)" }], [typeTime + duration, { transform: `translateX(${round(lineWidth + 6)}px)` }],
      [AT.clickComment + 0.4, { transform: `translateX(${round(lineWidth + 6)}px)` }], [AT.clickComment + 0.41, { transform: "translateX(0)" }]]);
    const caret = tracks.add([[typeTime - 0.001, { opacity: 0 }], [typeTime, { opacity: 1 }], [typeTime + duration, { opacity: 1 }],
      [typeTime + duration + (row === G.comment.typed.length - 1 ? 0.6 : 0.001), { opacity: 0 }]]);
    typeTime += duration;
    const y = boxY + 26 + row * 22;
    return plain([runs], inner.x + 12, y, { size: 14.5, leading: 22 }) +
      `<g class="${wipe}">${rect(inner.x + 10, y - 16, inner.width - 14, 22, { fill: c.surface })}` +
      `<g class="${caret} rest0">${rect(inner.x + 12, y - 15, 1.6, 19, { rx: 0.8, fill: c.accent })}</g></g>`;
  }).join("");
  const press = (time) => tracks.add([[time, { opacity: 1 }], [time + 0.08, { opacity: 0.72 }], [time + 0.3, { opacity: 1 }]]);
  parts.push(`<g class="${composer} rest0">${cardBox(composerHeight, c.accentLine)}` +
    pill(inner.x, card.y + 18, "New comment", 118, { ink: c.infoInk, soft: c.infoSoft, dot: c.infoSolid }) +
    rect(inner.x, quoteY - 14, 2, 20, { fill: c.accentLine }) +
    text(inner.x + 12, quoteY, G.comment.quote, { cls: SERIF, size: 15, fill: c.muted }) +
    `<clipPath id="typing"><rect x="${inner.x}" y="${boxY}" width="${inner.width}" height="${boxHeight}"/></clipPath>` +
    rect(inner.x, boxY, inner.width, boxHeight, { rx: 8, fill: c.surface, stroke: c.accent, extra: ' stroke-width="1.5"' }) +
    `<g clip-path="url(#typing)">${typed}</g>` +
    text(inner.x + 4, buttonsY + 24, "Cancel", { size: 13.5, weight: 600, fill: c.accentInk }) +
    `<g class="${press(AT.clickComment)}">${rect(inner.x + inner.width - 118, buttonsY, 118, 38, { rx: 9, fill: c.accent })}` +
    `${text(inner.x + inner.width - 59, buttonsY + 24.5, "Comment", { size: 14, weight: 600, fill: c.onAccent, anchor: "middle" })}</g></g>`);
  const commentButton = { x: inner.x + inner.width - 50, y: buttonsY + 22 };

  // the comment card: drafting, proposal, accepted
  const titleY = card.y + 72;
  const titleEnd = titleY + (G.comment.title.length - 1) * 22;
  const head = (status) => `<circle cx="${inner.x + 12}" cy="${card.y + 30}" r="12" fill="${c.okSoft}" stroke="${c.accentLine}"/>` +
    text(inner.x + 12, card.y + 34.5, "1", { size: 12.5, weight: 650, fill: c.okInk, anchor: "middle" }) + status +
    text(inner.x + inner.width, card.y + 34.5, "Paragraph 1", { size: 12.5, fill: c.muted, anchor: "end" }) +
    plain(G.comment.title, inner.x, titleY, { size: 15, weight: 600, leading: 22 }) +
    rect(inner.x, titleEnd + 14, 2, 20, { fill: c.lineSoft }) +
    text(inner.x + 12, titleEnd + 28, G.comment.quote, { cls: SERIF, size: 15, fill: c.muted });
  const sectionY = titleEnd + 50;

  const drafting = tracks.show(AT.draftingIn, AT.proposalIn, { rise: 10, fadeOut: 0.3 });
  const pulse = "pulse";
  parts.push(`<g class="${drafting} rest0">${cardBox(sectionY + 46 - card.y)}` +
    head(pill(inner.x + 34, card.y + 18, "Claude is drafting…", 156, { ink: c.infoInk, soft: c.infoSoft, dot: c.infoSolid, pulse })) +
    [0, 1, 2].map((index) => `<rect class="shimmer d${index}" x="${inner.x}" y="${sectionY + index * 12}" width="${round(inner.width * [0.92, 0.78, 0.5][index])}" height="6" rx="3" fill="${c.lineSoft}"/>`).join("") + "</g>");

  const rationaleHeight = 20 + G.comment.rationale.length * 20;
  const delHeight = 18 + G.comment.del.length * 24;
  const insHeight = 18 + G.comment.ins.length * 24;
  const diffY = sectionY + rationaleHeight + 14;
  const actionY = diffY + delHeight + insHeight + 16;
  const proposalHeight = actionY + 38 + 18 - card.y;
  const diffLines = (lines, y) => drawLines(lines, inner.x + 34, y, { size: 15, leading: 24, markHeight: 21 }).markup;
  const proposal = tracks.show(AT.proposalIn, AT.acceptedIn, { fadeIn: 0.35, fadeOut: 0.3 });
  parts.push(`<g class="${proposal} rest0">${cardBox(proposalHeight)}` +
    head(pill(inner.x + 34, card.y + 18, "Awaiting approval", 148, { ink: c.okInk, soft: c.okSoft, dot: c.okSolid })) +
    rect(inner.x, sectionY - 6, inner.width, rationaleHeight, { rx: 8, fill: c.accentSoft }) +
    plain(G.comment.rationale, inner.x + 14, sectionY + 16, { size: 13.5, leading: 20, fill: c.accentInk }) +
    `<clipPath id="diffbox"><rect x="${inner.x}" y="${diffY}" width="${inner.width}" height="${delHeight + insHeight}" rx="8"/></clipPath>` +
    `<g clip-path="url(#diffbox)">${rect(inner.x, diffY, inner.width, delHeight, { fill: c.delWash })}${rect(inner.x, diffY + delHeight, inner.width, insHeight, { fill: c.insWash })}</g>` +
    rect(inner.x, diffY, inner.width, delHeight + insHeight, { rx: 8, stroke: c.line }) + rect(inner.x, diffY + delHeight, inner.width, 1, { fill: c.line }) +
    text(inner.x + 14, diffY + 27, "−", { size: 15, weight: 700, fill: c.delInk }) + diffLines(G.comment.del, diffY + 27) +
    text(inner.x + 14, diffY + delHeight + 27, "+", { size: 15, weight: 700, fill: c.insInk }) + diffLines(G.comment.ins, diffY + delHeight + 27) +
    rect(inner.x + inner.width - 190, actionY, 84, 38, { rx: 9, fill: c.surface, stroke: c.line }) +
    text(inner.x + inner.width - 148, actionY + 24.5, "Reject", { size: 14, weight: 600, anchor: "middle" }) +
    `<g class="${press(AT.clickAccept)}">${rect(inner.x + inner.width - 96, actionY, 96, 38, { rx: 9, fill: c.accent })}` +
    `${text(inner.x + inner.width - 48, actionY + 24.5, "Accept", { size: 14, weight: 600, fill: c.onAccent, anchor: "middle" })}</g></g>`);
  const acceptButton = { x: inner.x + inner.width - 40, y: actionY + 22 };

  parts.push(`<g class="${stateAfter}">${cardBox(sectionY + 58 - card.y)}` +
    head(pill(inner.x + 34, card.y + 18, "Accepted", 92, { ink: c.okInk, soft: c.okSoft, dot: c.okSolid })) +
    rect(inner.x, sectionY - 6, inner.width, 40, { rx: 8, fill: c.okSoft }) +
    `<path d="M${inner.x + 14} ${sectionY + 14}l4 4 8-9" fill="none" stroke="${c.okInk}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>` +
    text(inner.x + 34, sectionY + 19, "Written to sections/01_introduction.tex", { size: 13, weight: 500, fill: c.okInk }) + "</g>");

  // ---- pointer
  const selectionEnd = before.selection.at(-1);
  const at = (x, y) => ({ transform: `translate(${round(x)}px,${round(y)}px)` });
  const home = at(body.x + 380, body.y + 300);
  const pointer = tracks.add([
    [0, home, EASE_IO], [AT.selectStart, at(firstSelected.x, firstSelected.y + 14)],
    [AT.selectEnd, at(selectionEnd.x + selectionEnd.width, selectionEnd.y + 14)],
    [AT.toComment, at(selectionEnd.x + selectionEnd.width, selectionEnd.y + 14), EASE_IO],
    [AT.clickComment - 0.15, at(commentButton.x, commentButton.y)],
    [AT.toAccept, at(commentButton.x, commentButton.y), EASE_IO], [AT.clickAccept - 0.2, at(acceptButton.x, acceptButton.y)],
    [AT.reset - 0.4, at(acceptButton.x, acceptButton.y), EASE_IO], [LOOP, home],
  ]);
  const ripple = (time, point) => {
    const name = tracks.add([[time - 0.001, { opacity: 0, transform: "scale(.3)" }, EASE_OUT], [time, { opacity: 0.45, transform: "scale(.3)" }, EASE_OUT], [time + 0.5, { opacity: 0, transform: "scale(1)" }]]);
    return `<circle class="${name} box rest0" cx="${round(point.x)}" cy="${round(point.y)}" r="22" fill="${c.accent}" style="transform-origin:50% 50%"/>`;
  };
  parts.push(ripple(AT.clickComment, commentButton), ripple(AT.clickAccept, acceptButton));
  parts.push(`<g class="${pointer}"><path d="M0 0v18.5l5-4.6 3.3 7.6 2.9-1.2-3.3-7.5H14z" fill="${c.cursor}" stroke="${c.cursorEdge}" stroke-width="1.5" stroke-linejoin="round"/></g>`);

  // ---- frame
  parts.push(rect(0.5, 0.5, W - 1, H - 1, { rx: 10, stroke: c.frame }));

  const fontFaces = Object.values(fontData).map((font) =>
    `@font-face{font-family:"${font.family}";font-weight:${font.weight};src:url(data:font/woff2;base64,${font.base64}) format("woff2")}`).join("");
  const style = `${fontFaces}.u{font-family:"PP Inter","Inter",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif}` +
    '.s{font-family:"PP Serif","Source Serif 4","Iowan Old Style","Palatino Linotype",Palatino,Georgia,serif}' +
    ".box{transform-box:fill-box}.rest0{opacity:0}" + tracks.css.join("") +
    "@keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}.pulse{animation:pulse 1s ease-in-out infinite}" +
    "@keyframes shimmer{0%,100%{opacity:.55}50%{opacity:1}}.shimmer{animation:shimmer 1.2s ease-in-out infinite}.d1{animation-delay:.15s}.d2{animation-delay:.3s}" +
    // Without animation the picture rests on the accepted state.
    "@media (prefers-reduced-motion:reduce){*{animation:none!important}}";
  const label = "Paper Pal, animated: a sentence is selected in the manuscript and a comment is typed. The proposal arrives as a red and green word diff, inline and in the comment card. " +
    "Accept is clicked, the sentence is rewritten, the file is saved and the section's review progress goes up.";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${escapeXml(label)}">\n` +
    `<!-- Generated by scripts/readme-animation.mjs (${theme}). Do not edit by hand. -->\n` +
    `<defs><style>${style}</style><filter id="lift" x="-10%" y="-10%" width="120%" height="130%"><feDropShadow dx="0" dy="6" stdDeviation="9" flood-color="${c.shadow}"/></filter>` +
    `<clipPath id="window"><rect x=".5" y=".5" width="${W - 1}" height="${H - 1}" rx="10"/></clipPath></defs>\n` +
    `<g clip-path="url(#window)">${parts.join("\n")}</g>\n</svg>\n`;
}

// ----------------------------------------------------------------------- main
async function main() {
  const options = readArguments(process.argv.slice(2));
  if (options.help) {
    console.log("npm run animation [-- --out <dir>] [--theme light|dark|both]\nRewrites docs/images/flow-light.svg and flow-dark.svg. Needs Playwright for one run.");
    return;
  }
  const fontData = {};
  for (const [key, font] of Object.entries(FONTS)) {
    const bytes = await fs.readFile(path.join(appRoot, "public", "fonts", font.file));
    fontData[key] = { ...font, base64: bytes.toString("base64") };
  }

  const top = 56;
  const rail = 204;
  const pane = { x: 836, width: W - 836 };
  const sheet = { x: rail + 24, y: top + 58, width: pane.x - rail - 48 };
  const body = { x: sheet.x + 48, y: sheet.y + 104, width: sheet.width - 48 - 58 };
  const bodySize = 17;
  const innerWidth = pane.width - 40 - 36;

  const measurer = await openMeasurer(fontData);
  let geometry;
  try {
    const serif = (size) => `400 ${size}px "PP Serif"`;
    const paragraph = {};
    for (const [state, pieces] of Object.entries(PARAGRAPH)) {
      paragraph[state] = await layout(measurer, pieces, { font: serif(bodySize), width: body.width });
    }
    const quoteSource = "“The observation is old, and the explanation usually offered is simple. Street lights”";
    let quote = quoteSource;
    // The app cuts the quote with an ellipsis; here it is cut to the card's width.
    for (let length = quoteSource.length; length > 10; length -= 1) {
      quote = `${quoteSource.slice(0, length).trimEnd()}…`;
      const [width] = await measurer.widths(serif(15), [quote]);
      if (width <= innerWidth - 14) break;
    }
    geometry = {
      boxes: { top, rail, sheet, body, pane },
      bodySize, bodyLeading: 27.5,
      paragraph,
      next: await layout(measurer, [[NEXT, "draft"]], { font: serif(bodySize), width: body.width }),
      comment: {
        quote,
        typed: await layout(measurer, [[COMMENT, "ink"]], { font: '400 14.5px "PP Inter"', width: innerWidth - 26 }),
        title: await layout(measurer, [[COMMENT, "ink"]], { font: '600 15px "PP Inter"', width: innerWidth }),
        rationale: await layout(measurer, [[RATIONALE, "ink"]], { font: '400 13.5px "PP Inter"', width: innerWidth - 28 }),
        del: await layout(measurer, CARD_DEL, { font: serif(15), width: innerWidth - 48 }),
        ins: await layout(measurer, CARD_INS, { font: serif(15), width: innerWidth - 48 }),
      },
    };
  } finally {
    await measurer.close();
  }

  await fs.mkdir(options.out, { recursive: true });
  for (const theme of options.theme === "both" ? ["light", "dark"] : [options.theme]) {
    const file = path.join(options.out, `flow-${theme}.svg`);
    const svg = drawScene(theme, THEMES[theme], geometry, fontData);
    await fs.writeFile(file, svg);
    console.log(`${path.relative(appRoot, file)}  ${Math.round(svg.length / 1024)} KB`);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
