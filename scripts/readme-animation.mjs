#!/usr/bin/env node
// Regenerates the animated README pictures in docs/images/:
//
//   flow-light.svg, flow-dark.svg         select, comment, read the diff, accept
//   confirm-light.svg, confirm-dark.svg   confirm what you have read, compile the PDF
//
//   npm run animation [-- --out <dir>] [--theme light|dark|both] [--only flow,confirm]
//
// The pictures are drawings of the app, not recordings. Each is one SVG file
// per theme, animated with CSS keyframes only (no script), because that is
// what GitHub plays when a README shows an SVG through <img>. The manuscript
// text is the fictional sample paper, the same passage as in the screenshots.
//
// Layout is computed here, not by the viewer's browser: every run of text is
// measured once with the app's own fonts and written with an explicit width
// (textLength). The fonts are embedded so the pictures match the app; if a
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
const SCENES = ["flow", "confirm"];

// ------------------------------------------------------------------ arguments
function readArguments(argv) {
  const options = { out: path.join(appRoot, "docs", "images"), theme: "both", only: SCENES };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = () => {
      index += 1;
      if (argv[index] === undefined) throw new Error(`${flag} needs a value`);
      return argv[index];
    };
    if (flag === "--out") options.out = path.resolve(value());
    else if (flag === "--theme") options.theme = value();
    else if (flag === "--only") options.only = value().split(",").map((name) => name.trim()).filter(Boolean);
    else if (flag === "--help" || flag === "-h") options.help = true;
    else throw new Error(`Unknown flag ${flag}`);
  }
  if (!["light", "dark", "both"].includes(options.theme)) throw new Error("--theme must be light, dark or both");
  for (const name of options.only) if (!SCENES.includes(name)) throw new Error(`--only knows: ${SCENES.join(", ")}`);
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
    floatBg: "#232622", floatInk: "#f4f5f1", floatAccent: "#9fd8c0",
    paper: "#ffffff", paperInk: "#1c1f1b", paperRule: "#cfd1ca",
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
    floatBg: "#333933", floatInk: "#f4f5f1", floatAccent: "#9fd8c0",
    paper: "#ffffff", paperInk: "#1c1f1b", paperRule: "#cfd1ca", // a PDF page is white in both themes
    shadow: "rgba(0,0,0,.5)", cursor: "#f4f5f1", cursorEdge: "#111311", mark: "#f2f2ef",
  },
};

// ----------------------------------------------------------------- the script
// The passage and the proposal are the ones in docs/images/hero-*.png.
const COMMENT = "“The observation is old” has no source behind it. Cut it and go straight to the explanation.";
const RATIONALE = "Claude: Cuts the unsourced aside and joins the two sentences with a colon. No new claims.";
const LEAD = "Anyone who has walked home through a city before sunrise has heard it: a blackbird singing from a lamp post while the sky is still fully dark. ";
const OLD_A = "The observation is old, and the explanation usually offered is simple. Street lights";
const NEW_A = "The explanation usually offered is simple: street lights";
const TAIL = " make the night brighter, so the birds believe that morning has come (";
const CITE = "Hartwell and Osei, 2009";
const NEXT = "That explanation may well be right, but the evidence for it is weaker than its popularity suggests. Bright streets are also loud streets. Traffic noise peaks during the morning rush, and a bird that sings before the rush is heard more clearly than one that sings during it.";

// A paragraph is a list of pieces: [text, ink, marks]. ink: "ink" (confirmed
// by the author) or "draft" (grey, not yet read); marks: any of "sel" (the
// passage being selected), "del", "ins", "cite", joined with "+".
const FLOW = {
  // The author selects the two whole sentences; the proposal changes a few words of them.
  before: [[LEAD, "ink"], [OLD_A, "draft", "sel"], [TAIL, "draft", "sel"], [CITE, "draft", "sel+cite"], [").", "draft", "sel"]],
  diff: [
    [LEAD, "ink"],
    ["The ", "draft"], ["observation is old, and the ", "draft", "del"],
    ["explanation usually offered is simple", "draft"], [". Street", "draft", "del"], [" ", "draft"],
    [": street", "draft", "ins"], [" lights", "draft"],
    [TAIL, "draft"], [CITE, "draft", "cite"], [").", "draft"],
  ],
  after: [[LEAD, "ink"], [NEW_A, "ink"], [TAIL, "ink"], [CITE, "ink", "cite"], [").", "ink"]],
};
const CARD_DEL = [["The ", "quiet"], ["observation is old, and the ", "quiet", "del"], ["explanation usually offered is simple", "quiet"], [". Street", "quiet", "del"], [" lights make the night…", "quiet"]];
const CARD_INS = [["The explanation usually offered is simple", "ink"], [": street", "ink", "ins"], [" lights make the night…", "ink"]];
const SELECTED = `${OLD_A}${TAIL}${CITE}).`;

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
  for (const [text, ink, mark = ""] of pieces) {
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

// Every track of a picture loops with the same length, so the scene never drifts.
class Tracks {
  constructor(loop) { this.loop = loop; this.css = []; this.count = 0; }
  // frames: [time, {property: value}, easingToNext?]. Returns the class name.
  add(frames) {
    const name = `k${(this.count += 1)}`;
    const sorted = [...frames].sort((a, b) => a[0] - b[0]);
    if (sorted[0][0] > 0) sorted.unshift([0, sorted[0][1]]);
    if (sorted.at(-1)[0] < this.loop) sorted.push([this.loop, sorted.at(-1)[1]]);
    const steps = sorted.map(([time, properties, easing]) => {
      const body = Object.entries(properties).map(([key, value]) => `${key}:${value}`).join(";");
      return `${Math.round((time / this.loop) * 1e5) / 1e3}%{${body}${easing ? `;animation-timing-function:${easing}` : ""}}`;
    });
    this.css.push(`@keyframes ${name}{${steps.join("")}}.${name}{animation:${name} ${this.loop}s linear infinite}`);
    return name;
  }
  // Visible between two moments; from 0 means from the first frame, to >= loop means until the last.
  show(from, to, { fadeIn = 0.3, fadeOut = 0.3, rise = 0 } = {}) {
    const hidden = { opacity: 0, ...(rise ? { transform: `translateY(${rise}px)` } : {}) };
    const shown = { opacity: 1, ...(rise ? { transform: "translateY(0)" } : {}) };
    const frames = [];
    if (from > 0) frames.push([from - 0.002, hidden, EASE_OUT]);
    frames.push([from + (from > 0 ? fadeIn : 0), shown], [to, shown, EASE_IO]);
    frames.push([Math.min(to + fadeOut, this.loop), { ...shown, opacity: 0 }]);
    return this.add(frames);
  }
  press(time) { return this.add([[time, { opacity: 1 }], [time + 0.08, { opacity: 0.7 }], [time + 0.3, { opacity: 1 }]]); }
}

// -------------------------------------------------------------------- drawing
// The tools every scene draws with, bound to one theme and one set of tracks.
function makeKit(c, tracks) {
  const UI = "u";
  const SERIF = "s";
  const text = (x, y, content, { cls = UI, size = 13, weight = 400, fill = c.ink, anchor, width, extra = "" } = {}) =>
    `<text x="${round(x)}" y="${round(y)}" class="${cls}" font-size="${size}" font-weight="${weight}" fill="${fill}"` +
    `${anchor ? ` text-anchor="${anchor}"` : ""}${width ? ` textLength="${round(width)}" lengthAdjust="spacingAndGlyphs"` : ""}${extra}>${escapeXml(content)}</text>`;
  const rect = (x, y, w, h, { rx = 0, fill = "none", stroke, extra = "" } = {}) =>
    `<rect x="${round(x)}" y="${round(y)}" width="${round(w)}" height="${round(h)}"${rx ? ` rx="${rx}"` : ""} fill="${fill}"${stroke ? ` stroke="${stroke}"` : ""}${extra}/>`;
  const check = (x, y, stroke, scale = 1) =>
    `<path d="M${round(x)} ${round(y)}l${4 * scale} ${4 * scale} ${8 * scale}-${9 * scale}" fill="none" stroke="${stroke}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>`;
  const inkOf = { ink: c.ink, draft: c.draft, quiet: c.quiet, muted: c.muted };

  // Lines of marked-up text. `backs` go under a selection, `texts` over it;
  // `selection` has one rectangle for every line the selected passage touches.
  function drawLines(lines, x0, y0, { size, leading, cls = SERIF, markHeight, ink }) {
    const backs = [];
    const texts = [];
    const selection = [];
    lines.forEach((runs, row) => {
      const baseline = y0 + row * leading;
      const top = baseline - markHeight * 0.74;
      for (const run of runs) {
        const x = x0 + run.x;
        const label = run.text.trimEnd();
        if (!label) continue;
        const marks = run.mark.split("+");
        let fill = inkOf[ink ?? run.ink];
        let extra = "";
        if (marks.includes("sel")) {
          const box = selection.at(-1);
          if (box && box.row === row) box.width = x + run.width + 2 - box.x;
          else selection.push({ x: x - 2, y: top, width: run.width + 4, height: markHeight, row });
        }
        if (marks.includes("del")) {
          backs.push(rect(x - 2, top, run.width + 4, markHeight, { rx: 3, fill: c.delBg }));
          fill = c.delInk;
          extra = ' text-decoration="line-through"';
        }
        if (marks.includes("ins")) {
          backs.push(rect(x - 2, top, run.width + 4, markHeight, { rx: 3, fill: c.insBg }), rect(x - 2, top + markHeight - 1.5, run.width + 4, 1.5, { fill: c.insRule }));
          fill = c.insInk;
        }
        if (marks.includes("cite")) {
          backs.push(rect(x - 3, top, run.width + 6, markHeight, { rx: 3, fill: c.citeBg }));
          fill = c.citeInk;
        }
        texts.push(text(x, baseline, label, { cls, size, fill, width: run.width, extra }));
      }
    });
    return { backs: backs.join(""), texts: texts.join(""), markup: backs.join("") + texts.join(""), selection };
  }
  const plain = (lines, x, y, options) => lines.map((runs, row) => runs.map((run) =>
    text(x + run.x, y + row * options.leading, run.text.trimEnd(), { ...options, width: run.width })).join("")).join("");
  const pill = (x, y, label, width, { ink, soft, dot, pulse = "" }) =>
    rect(x, y, width, 24, { rx: 12, fill: soft }) + `<circle class="${pulse}" cx="${x + 12}" cy="${y + 12}" r="3.5" fill="${dot}"/>` +
    text(x + 22, y + 16.5, label, { size: 12.5, weight: 600, fill: ink });

  // A selection that grows line by line between two moments. Returns the markup and the pointer's way.
  function growSelection(boxes, from, to, fadeAt) {
    const total = boxes.reduce((sum, box) => sum + box.width, 0);
    let time = from;
    const markup = boxes.map((box) => {
      const duration = (to - from) * (box.width / total);
      const name = tracks.add([
        [time, { transform: "scaleX(0)", opacity: 1 }], [time + duration, { transform: "scaleX(1)", opacity: 1 }],
        [fadeAt, { transform: "scaleX(1)", opacity: 1 }, EASE_IO], [fadeAt + 0.4, { transform: "scaleX(1)", opacity: 0 }],
        [tracks.loop, { transform: "scaleX(0)", opacity: 0 }],
      ]);
      time += duration;
      return `<rect class="${name} box rest0" x="${round(box.x)}" y="${round(box.y)}" width="${round(box.width)}" height="${box.height}" rx="3" fill="${c.selBg}" style="transform-origin:0 50%"/>`;
    }).join("");
    const first = boxes[0];
    const last = boxes.at(-1);
    return { markup, start: { x: first.x, y: first.y + 14 }, end: { x: last.x + last.width, y: last.y + 14 } };
  }

  // The floating toolbar of a selection. Multi-line selections get it under the last line.
  function selectionToolbar(boxes, { from, to, pressConfirm, pressComment }) {
    const last = boxes.at(-1);
    const width = 214;
    const left = Math.min(...boxes.map((box) => box.x));
    const right = Math.max(...boxes.map((box) => box.x + box.width));
    const x = (left + right) / 2 - width / 2; // app.js centres it on the selection's bounding box
    const y = last.y + last.height + 10;
    const name = tracks.show(from, to, { fadeIn: 0.15, fadeOut: 0.15 });
    const confirm = { x: x + 4, width: 98 };
    const comment = { x: x + 104, width: 106 };
    const markup = `<g class="${name} rest0" filter="url(#lift)">` +
      `<rect x="${round(x + width / 2 - 5)}" y="${round(y - 4)}" width="10" height="10" fill="${c.floatBg}" transform="rotate(45 ${round(x + width / 2)} ${round(y + 1)})"/>` +
      rect(x, y, width, 40, { rx: 12, fill: c.floatBg }) +
      `<g class="${pressConfirm ? tracks.press(pressConfirm) : ""}">${rect(confirm.x, y + 4, confirm.width, 32, { rx: 8, fill: c.floatBg })}` +
      check(confirm.x + 12, y + 20, c.floatAccent) + text(confirm.x + 32, y + 24.5, "Confirm", { size: 13, weight: 550, fill: c.floatInk }) + "</g>" +
      `<g class="${pressComment ? tracks.press(pressComment) : ""}">${rect(comment.x, y + 4, comment.width, 32, { rx: 8, fill: c.accent })}` +
      `<path d="M${round(comment.x + 13)} ${y + 20}h8m-4-4v8" fill="none" stroke="${c.onAccent}" stroke-width="1.8" stroke-linecap="round"/>` +
      text(comment.x + 30, y + 24.5, "Comment", { size: 13, weight: 550, fill: c.onAccent }) + "</g></g>";
    return { markup, confirmButton: { x: confirm.x + 56, y: y + 24 }, commentButton: { x: comment.x + 60, y: y + 24 } };
  }

  function ripple(time, point) {
    const name = tracks.add([[time - 0.002, { opacity: 0, transform: "scale(.3)" }], [time, { opacity: 0.45, transform: "scale(.3)" }, EASE_OUT], [time + 0.5, { opacity: 0, transform: "scale(1)" }]]);
    return `<circle class="${name} box rest0" cx="${round(point.x)}" cy="${round(point.y)}" r="22" fill="${c.accent}" style="transform-origin:50% 50%"/>`;
  }
  // The pointer visits [time, point] stops; between two equal stops it rests.
  function pointer(stops) {
    const at = (point) => ({ transform: `translate(${round(point.x)}px,${round(point.y)}px)` });
    const name = tracks.add(stops.map(([time, point, linear]) => [time, at(point), linear ? undefined : EASE_IO]));
    return `<g class="${name}"><path d="M0 0v18.5l5-4.6 3.3 7.6 2.9-1.2-3.3-7.5H14z" fill="${c.cursor}" stroke="${c.cursorEdge}" stroke-width="1.5" stroke-linejoin="round"/></g>`;
  }
  // The app's toast: bottom centre of the window.
  function toast(label, labelWidth, from, to) {
    const width = labelWidth + 54;
    const x = W / 2 - width / 2;
    const name = tracks.show(from, to, { rise: 8 });
    return `<g class="${name} rest0" filter="url(#lift)">${rect(x, H - 72, width, 40, { rx: 12, fill: c.floatBg })}` +
      `<circle cx="${round(x + 19)}" cy="${H - 52}" r="3" fill="${c.floatAccent}"/>${text(x + 32, H - 47.5, label, { size: 13.5, fill: c.floatInk, width: labelWidth })}</g>`;
  }
  return { UI, SERIF, text, rect, check, drawLines, plain, pill, growSelection, selectionToolbar, ripple, pointer, toast };
}

// The window every scene shares: top bar, outline rail with review progress, right pane header
// and footer. `progress` = { at, until, section: [from, to], paper: [from, to] } in percent;
// `compiling` = [from, to], the time the footer says "Compiling…"; `previewAt` = Preview turns on.
function drawChrome(c, kit, tracks, G, { progress, compiling, pressCompile, previewAt, pressPreview, until }) {
  const { text, rect, check } = kit;
  const { top, rail, pane } = G.boxes;
  const parts = [];
  parts.push(rect(0.5, 0.5, W - 1, H - 1, { rx: 10, fill: c.canvas }));
  parts.push(`<path d="M.5 10.5a10 10 0 0 1 10-10h${W - 21}a10 10 0 0 1 10 10V${top}H.5z" fill="${c.chrome}"/>`);
  parts.push(rect(0, top, W, 1, { fill: c.line }));
  parts.push(`<g transform="translate(4.6 -3.5) scale(.05)" fill="none" stroke="${c.mark}" stroke-width="72" stroke-linecap="round" stroke-linejoin="round">` +
    '<path d="M386 885V575A194 200 0 0 1 580 375H685A185 185 0 0 1 685 745H638"/><path d="M516 885V577A77 77 0 0 1 593 500H680A58.5 58.5 0 0 1 680 617H632"/></g>');
  parts.push(text(60, 34, "Paper Pal", { size: 16, weight: 650 }));
  parts.push(rect(rail, 0.5, 1, top, { fill: c.line }));
  parts.push(text(rail + 24, 34, "Earlier Every Year", { size: 15, weight: 600 }));
  parts.push(rect(rail + 176, 14, 226, 30, { rx: 8, fill: c.surface, stroke: c.line }));
  parts.push(text(rail + 190, 34, "sections/01_introduction.tex", { size: 13, fill: c.muted }));
  // the backend that answers comments
  parts.push(rect(rail + 412, 14, 92, 30, { rx: 8, fill: c.surface, stroke: c.line }));
  parts.push(`<path d="M${rail + 430} 22l1.5 4.4 4.4 1.5-4.4 1.5-1.5 4.4-1.5-4.4-4.4-1.5 4.4-1.5z" fill="${c.accentInk}"/>` + text(rail + 443, 34, "Claude", { size: 13.5, weight: 600 }));

  // Saved, Compile, Preview, Local — in the app's order
  const savedX = W - 418;
  parts.push(check(savedX, 29, c.quiet) + text(savedX + 18, 33.5, "Saved", { size: 13, fill: c.quiet }));
  const compileBox = { x: W - 338, y: 13, width: 100, height: 32 };
  const previewBox = { x: W - 228, y: 13, width: 92, height: 32 };
  parts.push(`<g class="${pressCompile ? tracks.press(pressCompile) : ""}">${rect(compileBox.x, compileBox.y, compileBox.width, compileBox.height, { rx: 8, fill: c.surface, stroke: c.line })}` +
    `<path d="M${compileBox.x + 14} 22.5v13l10-6.5z" fill="${c.ink}"/>${text(compileBox.x + 32, 34, "Compile", { size: 13.5, weight: 600 })}</g>`);
  const previewInner = (fill) => `<rect x="${previewBox.x + 12}" y="22" width="15" height="14" rx="2.5" fill="none" stroke="${fill}" stroke-width="1.7"/>` +
    `<path d="M${previewBox.x + 19.5} 22v14" stroke="${fill}" stroke-width="1.7"/>` + text(previewBox.x + 34, 34, "Preview", { size: 13.5, weight: 500, fill });
  parts.push(`<g class="${pressPreview ? tracks.press(pressPreview) : ""}">${previewInner(c.muted)}</g>`);
  if (previewAt) {
    const active = tracks.add([[previewAt, { opacity: 0 }, EASE_OUT], [previewAt + 0.3, { opacity: 1 }], [until, { opacity: 1 }, EASE_IO], [until + 0.4, { opacity: 0 }]]);
    parts.push(`<g class="${active}">${rect(previewBox.x, previewBox.y, previewBox.width, previewBox.height, { rx: 8, fill: c.accentSoft, stroke: c.accentLine })}${previewInner(c.accentInk)}</g>`);
  }
  parts.push(rect(W - 92, 15, 72, 28, { rx: 14, fill: c.okSoft, stroke: c.okLine }));
  parts.push(`<circle cx="${W - 76}" cy="29" r="3.5" fill="${c.okSolid}"/>`);
  parts.push(text(W - 66, 33.5, "Local", { size: 12.5, weight: 600, fill: c.okInk }));

  // outline rail
  parts.push(rect(0.5, top + 1, rail, H - top - 11.5, { fill: c.chrome }));
  parts.push(`<path d="M.5 ${H - 12}h${rail}v11.5H10.5a10 10 0 0 1-10-10z" fill="${c.chrome}"/>`);
  parts.push(rect(rail, top, 1, H - top, { fill: c.line }));
  parts.push(text(20, top + 34, "PAPER REVIEW", { size: 11, weight: 600, fill: c.quiet, extra: ' letter-spacing=".08em"' }));
  const before = tracks.show(0, progress.at, { fadeOut: 0.4 });
  const after = tracks.add([[progress.at, { opacity: 0 }, EASE_OUT], [progress.at + 0.4, { opacity: 1 }], [progress.until, { opacity: 1 }, EASE_IO], [progress.until + 0.5, { opacity: 0 }]]);
  const grow = (from, to) => tracks.add([[progress.at, { transform: `scaleX(${round(from / to * 1000) / 1000})` }, EASE_OUT], [progress.at + 0.8, { transform: "scaleX(1)" }],
    [progress.until, { transform: "scaleX(1)" }, EASE_IO], [progress.until + 0.5, { transform: `scaleX(${round(from / to * 1000) / 1000})` }]]);
  const swap = (x, y, values, options) => `<g class="${before} rest0">${text(x, y, `${values[0]}%`, options)}</g><g class="${after}">${text(x, y, `${values[1]}%`, options)}</g>`;
  parts.push(swap(20, top + 70, progress.paper, { size: 26, weight: 650 }));
  parts.push(text(rail - 20, top + 68, "8 sections", { size: 12.5, fill: c.muted, anchor: "end" }));
  parts.push(rect(20, top + 82, rail - 40, 4, { rx: 2, fill: c.lineSoft }));
  parts.push(`<rect class="${grow(...progress.paper)} box" x="20" y="${top + 82}" width="${round((rail - 40) * progress.paper[1] / 100)}" height="4" rx="2" fill="${c.accent}" style="transform-origin:0 50%"/>`);
  parts.push(rect(0, top + 102, rail, 1, { fill: c.lineSoft }));
  const sections = [["–", "Abstract", "100%"], ["1", "Introduction"], ["2", "Related Work"], ["3", "Method"], ["4", "Results"], ["5", "Discussion"]];
  sections.forEach(([number, title, percent], index) => {
    const y = top + 140 + index * 46;
    if (index === 1) parts.push(rect(8, y - 25, rail - 16, 44, { rx: 8, fill: c.surface, stroke: c.line }), rect(8, y - 17, 3, 28, { rx: 1.5, fill: c.accent }));
    parts.push(text(24, y, number, { size: 12.5, fill: c.quiet }));
    parts.push(text(52, y, title, { size: 14, weight: index < 2 ? 600 : 500, fill: index < 2 ? c.ink : c.muted }));
    if (percent) parts.push(text(rail - 20, y, percent, { size: 12, fill: c.muted, anchor: "end" }));
    if (index < 2) parts.push(rect(52, y + 9, rail - 72, 2.5, { rx: 1.25, fill: index ? c.lineSoft : c.accent }));
  });
  const introY = top + 140 + 46;
  parts.push(swap(rail - 20, introY, progress.section, { size: 12, weight: 600, fill: c.accentInk, anchor: "end" }));
  parts.push(`<rect class="${grow(...progress.section)} box" x="52" y="${introY + 9}" width="${round((rail - 72) * progress.section[1] / 100)}" height="2.5" rx="1.25" fill="${c.accent}" style="transform-origin:0 50%"/>`);
  // the legend: what grey, black and yellow mean
  const legendY = H - 118;
  parts.push(rect(0, legendY - 26, rail, 1, { fill: c.lineSoft }));
  parts.push(text(20, legendY, "Aa", { cls: kit.SERIF, size: 16, fill: c.ink }) + text(52, legendY, "Confirmed by you", { size: 12.5, fill: c.muted }));
  parts.push(text(20, legendY + 26, "Aa", { cls: kit.SERIF, size: 16, fill: c.draft }) + text(52, legendY + 26, "Draft, not yet reviewed", { size: 12.5, fill: c.muted }));
  parts.push(rect(20, legendY + 43, 20, 9, { rx: 3, fill: c.hlBg }) + rect(20, legendY + 51, 20, 1.2, { fill: c.hlRule }) + text(52, legendY + 52, "Has a comment", { size: 12.5, fill: c.muted }));

  // right pane: tabs, and the footer with the PDF status
  parts.push(rect(pane.x, top + 1, W - pane.x - 0.5, H - top - 1.5, { fill: c.chrome }));
  parts.push(rect(pane.x, top, 1, H - top, { fill: c.line }));
  parts.push(rect(pane.x + 20, top + 12, pane.width - 40, 36, { rx: 9, fill: c.well }));
  parts.push(rect(pane.x + 23, top + 15, (pane.width - 46) / 2, 30, { rx: 7, fill: c.surface, stroke: c.line }));
  parts.push(text(pane.x + 23 + (pane.width - 46) / 4, top + 35, "Comments", { size: 13.5, weight: 600, anchor: "middle" }));
  parts.push(text(pane.x + 23 + (pane.width - 46) * 0.75, top + 35, "Chat", { size: 13.5, weight: 500, fill: c.muted, anchor: "middle" }));
  const footer = [rect(pane.x + 1, H - 44, pane.width - 1, 43.5, { fill: c.chrome }), rect(pane.x, H - 44, pane.width, 1, { fill: c.line }),
    text(W - 84, H - 17, "Git · clean", { size: 12.5, fill: c.muted, anchor: "end" }), text(W - 24, H - 17, "Refresh", { size: 12.5, weight: 600, fill: c.ink, anchor: "end" })];
  const page = (fill) => `<path d="M${pane.x + 24} ${H - 29}h6l4 4v10h-10z" fill="none" stroke="${fill}" stroke-width="1.4" stroke-linejoin="round"/>`;
  const updated = page(c.muted) + text(pane.x + 44, H - 17, "PDF updated", { size: 12.5, weight: 500, fill: c.muted });
  if (compiling) {
    const idle = tracks.add([[compiling[0], { opacity: 1 }], [compiling[0] + 0.15, { opacity: 0 }], [compiling[1], { opacity: 0 }], [compiling[1] + 0.2, { opacity: 1 }]]);
    const running = tracks.show(compiling[0] + 0.05, compiling[1], { fadeIn: 0.15, fadeOut: 0.15 });
    footer.push(`<g class="${idle}">${updated}</g>`, `<g class="${running} rest0"><circle class="pulse" cx="${pane.x + 29}" cy="${H - 21.5}" r="4" fill="${c.infoSolid}"/>` +
      `${text(pane.x + 44, H - 17, "Compiling…", { size: 12.5, weight: 500, fill: c.infoInk })}</g>`);
  } else footer.push(updated);
  return {
    markup: parts.join("\n"), footer: footer.join(""),
    compileButton: { x: compileBox.x + 58, y: compileBox.y + 20 }, previewButton: { x: previewBox.x + 56, y: previewBox.y + 20 },
  };
}

// The manuscript column at its usual width.
function drawSheet(c, kit, G) {
  const { text, rect, SERIF } = kit;
  const { top, rail, sheet, body } = G.boxes;
  return rect(sheet.x, sheet.y, sheet.width, H - sheet.y, { fill: c.surface }) +
    rect(sheet.x, sheet.y, 1, H - sheet.y, { fill: c.lineSoft }) + rect(sheet.x + sheet.width, sheet.y, 1, H - sheet.y, { fill: c.lineSoft }) +
    text(rail + 24, top + 27, "1 · Introduction", { size: 14.5, weight: 600 }) + text(rail + 24, top + 45, "8 readable blocks", { size: 12, fill: c.muted }) +
    text(body.x - 30, body.y - 40, "1", { cls: SERIF, size: 17, fill: c.quiet }) + text(body.x, body.y - 40, "Introduction", { cls: SERIF, size: 28, weight: 700 });
}

// The comments pane with no comment in it: the app's own three-step explainer.
function drawEmptyState(c, kit, G) {
  const { text, rect, plain, drawLines } = kit;
  const { top, pane } = G.boxes;
  const E = G.empty;
  const x = pane.x + 32;
  let y = top + 104;
  const out = [text(x, y, "No comments here", { size: 16, weight: 600 }), text(x, y + 22, "Review the draft one passage at a time:", { size: 13, fill: c.muted })];
  y += 58;
  E.steps.forEach((step, index) => {
    const sampleHeight = step.sample ? 14 + step.sample.length * 22 : 0;
    const height = 26 + step.lines.length * 18 + (step.sample ? sampleHeight + 10 : 0) + 8;
    out.push(`<circle cx="${x + 13}" cy="${y - 4}" r="12.5" fill="${c.surface}" stroke="${c.line}"/>` + text(x + 13, y + 0.5, String(index + 1), { size: 12, weight: 600, fill: c.muted, anchor: "middle" }));
    if (index < E.steps.length - 1) out.push(rect(x + 12.5, y + 12, 1, height - 20, { fill: c.line }));
    out.push(text(x + 38, y, step.title, { size: 13, weight: 600 }), plain(step.lines, x + 38, y + 20, { size: 12, leading: 18, fill: c.muted }));
    if (step.sample) {
      const boxY = y + 20 + step.lines.length * 18 - 6;
      out.push(rect(x + 38, boxY, E.width, sampleHeight, { rx: 8, fill: c.surface, stroke: c.lineSoft }), drawLines(step.sample, x + 49, boxY + 23, { size: 13.5, leading: 22, markHeight: 19 }).markup);
    }
    y += height;
  });
  out.push(rect(x, y - 6, pane.width - 64, 1, { fill: c.lineSoft }), text(x, y + 16, "Nothing in your .tex files changes until you accept it.", { size: 12, fill: c.quiet }));
  return out.join("");
}

function finish(theme, c, tracks, fontData, parts, label) {
  const fontFaces = Object.values(fontData).map((font) =>
    `@font-face{font-family:"${font.family}";font-weight:${font.weight};src:url(data:font/woff2;base64,${font.base64}) format("woff2")}`).join("");
  const style = `${fontFaces}.u{font-family:"PP Inter","Inter",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif}` +
    '.s{font-family:"PP Serif","Source Serif 4","Iowan Old Style","Palatino Linotype",Palatino,Georgia,serif}' +
    ".box{transform-box:fill-box}.rest0{opacity:0}" + tracks.css.join("") +
    "@keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}.pulse{animation:pulse 1s ease-in-out infinite}" +
    // Without animation the picture rests on its last state.
    "@media (prefers-reduced-motion:reduce){*{animation:none!important}}";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${escapeXml(label)}">\n` +
    `<!-- Generated by scripts/readme-animation.mjs (${theme}). Do not edit by hand. -->\n` +
    `<defs><style>${style}</style><filter id="lift" x="-10%" y="-10%" width="120%" height="140%"><feDropShadow dx="0" dy="6" stdDeviation="9" flood-color="${c.shadow}"/></filter>` +
    `<clipPath id="window"><rect x=".5" y=".5" width="${W - 1}" height="${H - 1}" rx="10"/></clipPath></defs>\n` +
    `<g clip-path="url(#window)">${parts.join("\n")}<rect x=".5" y=".5" width="${W - 1}" height="${H - 1}" rx="10" fill="none" stroke="${c.frame}"/></g>\n</svg>\n`;
}

// ------------------------------------------------------------ scene 1: flow
// Select, comment, read the diff, accept. What the app does at each step (labels, toasts, the
// card leaving the list after Accept, the recompile) is copied from public/app.js and server.mjs.
function flowScene(theme, c, G, fontData) {
  const LOOP = 16.5;
  const AT = {
    selectStart: 0.9, selectEnd: 2.3, toolbarIn: 2.4, clickToolbar: 3.3,
    composerIn: 3.45, typeStart: 4.0, typeEnd: 6.2, clickComment: 6.9,
    draftingIn: 7.1, proposalIn: 8.8, toAccept: 10.1, clickAccept: 11.1, acceptedIn: 11.3,
    compileStart: 12.2, compileEnd: 13.6, reset: 15.7,
  };
  const tracks = new Tracks(LOOP);
  const kit = makeKit(c, tracks);
  const { text, rect, drawLines, plain, pill, SERIF } = kit;
  const { top, body, pane } = G.boxes;
  const F = G.flow;
  const parts = [];
  const chrome = drawChrome(c, kit, tracks, G, {
    progress: { at: AT.acceptedIn, until: AT.reset, section: [43, 50], paper: [14, 15] },
    compiling: [AT.compileStart, AT.compileEnd], // an accepted change recompiles by itself
  });
  parts.push(chrome.markup, drawSheet(c, kit, G));

  const lineOptions = { size: G.bodySize, leading: G.bodyLeading, markHeight: 24 };
  const draw = (lines) => drawLines(lines, body.x, body.y, lineOptions);
  const nextParagraph = (lines) => drawLines(G.next, body.x, body.y + lines.length * G.bodyLeading + 16, lineOptions).markup;
  const before = draw(F.paragraph.before);
  const boxes = before.selection;

  // Under the text: the passage's own marks, the growing selection, then the comment's highlight.
  const stateBefore = tracks.show(0, AT.proposalIn, { fadeOut: 0.35 });
  const stateDiff = tracks.show(AT.proposalIn, AT.acceptedIn, { fadeIn: 0.35, fadeOut: 0.35 });
  const stateAfter = tracks.add([[AT.acceptedIn, { opacity: 0 }, EASE_OUT], [AT.acceptedIn + 0.4, { opacity: 1 }], [AT.reset, { opacity: 1 }, EASE_IO], [AT.reset + 0.5, { opacity: 0 }]]);
  const selection = kit.growSelection(boxes, AT.selectStart, AT.selectEnd, AT.draftingIn);
  const highlight = tracks.show(AT.draftingIn, AT.proposalIn, { fadeIn: 0.4 });
  const highlightMarkup = boxes.map((box) => rect(box.x, box.y, box.width, box.height, { rx: 3, fill: c.hlBg }) + rect(box.x, box.y + box.height - 1.5, box.width, 1.5, { fill: c.hlRule })).join("");
  const badge = tracks.show(AT.draftingIn, AT.acceptedIn, { fadeIn: 0.4 });
  parts.push(`<g class="${stateBefore} rest0">${before.backs}</g>`, selection.markup, `<g class="${highlight} rest0">${highlightMarkup}</g>`);
  parts.push(`<g class="${badge} rest0">${rect(body.x + body.width + 14, boxes[0].y + 1, 30, 22, { rx: 11, fill: c.warnSoft, stroke: c.warnLine })}` +
    `${text(body.x + body.width + 29, boxes[0].y + 16.5, "1", { size: 12, weight: 650, fill: c.warnInk, anchor: "middle" })}</g>`);
  parts.push(`<g class="${stateBefore} rest0">${before.texts}${nextParagraph(F.paragraph.before)}</g>`);
  parts.push(`<g class="${stateDiff} rest0">${draw(F.paragraph.diff).markup}${nextParagraph(F.paragraph.diff)}</g>`);
  parts.push(`<g class="${stateAfter}">${draw(F.paragraph.after).markup}${nextParagraph(F.paragraph.after)}</g>`);
  const toolbar = kit.selectionToolbar(boxes, { from: AT.toolbarIn, to: AT.clickToolbar + 0.1, pressComment: AT.clickToolbar });
  parts.push(toolbar.markup);

  // right pane: the explainer while there is no comment (before, and again after Accept)
  const card = { x: pane.x + 20, y: top + 66, width: pane.width - 40 };
  const inner = { x: card.x + 18, width: card.width - 36 };
  const cardBox = (height, stroke = c.line) => rect(card.x, card.y, card.width, height, { rx: 12, fill: c.surface, stroke, extra: ' filter="url(#lift)"' });
  const empty = tracks.add([[0, { opacity: 1 }], [AT.composerIn - 0.2, { opacity: 1 }], [AT.composerIn, { opacity: 0 }],
    [AT.acceptedIn, { opacity: 0 }, EASE_OUT], [AT.acceptedIn + 0.5, { opacity: 1 }]]);
  parts.push(`<g class="${empty}">${drawEmptyState(c, kit, G)}</g>`);

  // composer: the quote, the comment, and the app's buttons
  const composer = tracks.show(AT.composerIn, AT.clickComment + 0.1, { rise: 10, fadeOut: 0.2 });
  const quoteY = card.y + 68;
  const boxY = quoteY + (F.quoteLines.length - 1) * 22 + 22;
  const boxHeight = 22 + F.typed.length * 22;
  const optionsY = boxY + boxHeight + 30;
  const buttonsY = optionsY + 50;
  const half = (inner.width - 10) / 2;
  let typeTime = AT.typeStart;
  const typedTotal = F.typed.reduce((sum, runs) => sum + runs.at(-1).x + runs.at(-1).width, 0);
  const typed = F.typed.map((runs, row) => {
    const lineWidth = runs.at(-1).x + runs.at(-1).width;
    const duration = (AT.typeEnd - AT.typeStart) * (lineWidth / typedTotal);
    const wipe = tracks.add([[typeTime, { transform: "translateX(0)" }], [typeTime + duration, { transform: `translateX(${round(lineWidth + 6)}px)` }],
      [AT.clickComment + 0.4, { transform: `translateX(${round(lineWidth + 6)}px)` }], [AT.clickComment + 0.41, { transform: "translateX(0)" }]]);
    const caret = tracks.add([[typeTime - 0.002, { opacity: 0 }], [typeTime, { opacity: 1 }], [typeTime + duration, { opacity: 1 }],
      [typeTime + duration + (row === F.typed.length - 1 ? 0.6 : 0.002), { opacity: 0 }]]);
    typeTime += duration;
    const y = boxY + 26 + row * 22;
    return plain([runs], inner.x + 12, y, { size: 14.5, leading: 22 }) +
      `<g class="${wipe}">${rect(inner.x + 10, y - 16, inner.width - 14, 22, { fill: c.surface })}` +
      `<g class="${caret} rest0">${rect(inner.x + 12, y - 15, 1.6, 19, { rx: 0.8, fill: c.accent })}</g></g>`;
  }).join("");
  const outline = (x, y, width, label) => rect(x, y, width, 38, { rx: 9, fill: c.surface, stroke: c.line }) + text(x + width / 2, y + 24.5, label, { size: 14, weight: 600, anchor: "middle" });
  parts.push(`<g class="${composer} rest0">${cardBox(buttonsY + 38 + 10 + 38 + 18 - card.y, c.accentLine)}` +
    pill(inner.x, card.y + 18, "New comment", 118, { ink: c.infoInk, soft: c.infoSoft, dot: c.infoSolid }) +
    `<path d="M${inner.x + inner.width - 14} ${card.y + 24}l10 10m0-10l-10 10" stroke="${c.muted}" stroke-width="1.6" stroke-linecap="round"/>` +
    rect(inner.x, quoteY - 15, 2, F.quoteLines.length * 22, { fill: c.accentLine }) +
    F.quoteLines.map((line, row) => text(inner.x + 12, quoteY + row * 22, line, { cls: SERIF, size: 15, fill: c.muted, extra: ' font-style="italic"' })).join("") +
    `<clipPath id="typing"><rect x="${inner.x}" y="${boxY}" width="${inner.width}" height="${boxHeight}"/></clipPath>` +
    rect(inner.x, boxY, inner.width, boxHeight, { rx: 8, fill: c.surface, stroke: c.accent, extra: ' stroke-width="1.5"' }) +
    `<g clip-path="url(#typing)">${typed}</g>` +
    `<path d="M${inner.x + 6} ${optionsY - 9}l4 4.5-4 4.5" fill="none" stroke="${c.muted}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>` +
    text(inner.x + 22, optionsY, "Options", { size: 13.5, weight: 600, fill: c.muted }) +
    text(inner.x + inner.width, optionsY, "Selected text · paper context", { size: 12.5, fill: c.quiet, anchor: "end" }) +
    text(inner.x + 4, optionsY + 34, "Cancel", { size: 13.5, weight: 600, fill: c.accentInk }) +
    outline(inner.x, buttonsY, half, "Ask in Chat") + outline(inner.x + half + 10, buttonsY, half, "Find linked") +
    `<g class="${tracks.press(AT.clickComment)}">${rect(inner.x, buttonsY + 48, half, 38, { rx: 9, fill: c.accent })}` +
    `${text(inner.x + half / 2, buttonsY + 72.5, "Comment", { size: 14, weight: 600, fill: c.onAccent, anchor: "middle" })}</g></g>`);
  const commentButton = { x: inner.x + half / 2 + 8, y: buttonsY + 70 };

  // the comment card: while Claude drafts, then the proposal. After Accept the card leaves the list.
  const titleY = card.y + 72;
  const titleEnd = titleY + (F.title.length - 1) * 22;
  const head = (status) => `<circle cx="${inner.x + 12}" cy="${card.y + 30}" r="12" fill="${c.okSoft}" stroke="${c.accentLine}"/>` +
    text(inner.x + 12, card.y + 34.5, "1", { size: 12.5, weight: 650, fill: c.okInk, anchor: "middle" }) + status +
    text(inner.x + inner.width, card.y + 34.5, "Paragraph 3", { size: 12.5, fill: c.muted, anchor: "end" }) +
    plain(F.title, inner.x, titleY, { size: 15, weight: 600, leading: 22 }) +
    rect(inner.x, titleEnd + 14, 2, 20, { fill: c.lineSoft }) + text(inner.x + 12, titleEnd + 28, F.quote, { cls: SERIF, size: 15, fill: c.muted, extra: ' font-style="italic"' });
  const sectionY = titleEnd + 50;
  const drafting = tracks.show(AT.draftingIn, AT.proposalIn, { rise: 10, fadeOut: 0.3 });
  parts.push(`<g class="${drafting} rest0">${cardBox(sectionY - 4 - card.y)}` +
    head(pill(inner.x + 34, card.y + 18, "Claude is drafting…", 156, { ink: c.infoInk, soft: c.infoSoft, dot: c.infoSolid, pulse: "pulse" })) + "</g>");

  const rationaleHeight = 20 + F.rationale.length * 20;
  const delHeight = 18 + F.del.length * 24;
  const insHeight = 18 + F.ins.length * 24;
  const diffY = sectionY + rationaleHeight + 14;
  const actionY = diffY + delHeight + insHeight + 16;
  const diffLines = (lines, y) => drawLines(lines, inner.x + 34, y, { size: 15, leading: 24, markHeight: 21 }).markup;
  const proposal = tracks.show(AT.proposalIn, AT.acceptedIn, { fadeIn: 0.35, fadeOut: 0.3 });
  parts.push(`<g class="${proposal} rest0">${cardBox(actionY + 38 + 18 - card.y)}` +
    head(pill(inner.x + 34, card.y + 18, "Awaiting approval", 148, { ink: c.okInk, soft: c.okSoft, dot: c.okSolid })) +
    rect(inner.x, sectionY - 6, inner.width, rationaleHeight, { rx: 8, fill: c.accentSoft }) +
    plain(F.rationale, inner.x + 14, sectionY + 16, { size: 13.5, leading: 20, fill: c.accentInk }) +
    `<clipPath id="diffbox"><rect x="${inner.x}" y="${diffY}" width="${inner.width}" height="${delHeight + insHeight}" rx="8"/></clipPath>` +
    `<g clip-path="url(#diffbox)">${rect(inner.x, diffY, inner.width, delHeight, { fill: c.delWash })}${rect(inner.x, diffY + delHeight, inner.width, insHeight, { fill: c.insWash })}</g>` +
    rect(inner.x, diffY, inner.width, delHeight + insHeight, { rx: 8, stroke: c.line }) + rect(inner.x, diffY + delHeight, inner.width, 1, { fill: c.line }) +
    text(inner.x + 14, diffY + 27, "−", { size: 15, weight: 700, fill: c.delInk }) + diffLines(F.del, diffY + 27) +
    text(inner.x + 14, diffY + delHeight + 27, "+", { size: 15, weight: 700, fill: c.insInk }) + diffLines(F.ins, diffY + delHeight + 27) +
    // "Generate another version", Reject, Accept
    rect(inner.x, actionY, 38, 38, { rx: 9, fill: c.surface, stroke: c.line }) +
    `<g transform="translate(${inner.x + 10} ${actionY + 10}) scale(.75)" fill="none" stroke="${c.muted}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">` +
    '<path d="M20 11a8 8 0 0 0-14.5-4L3 10"/><path d="M3 4v6h6"/><path d="M4 13a8 8 0 0 0 14.5 4l2.5-3"/><path d="M21 20v-6h-6"/></g>' +
    rect(inner.x + inner.width - 190, actionY, 84, 38, { rx: 9, fill: c.surface, stroke: c.line }) +
    text(inner.x + inner.width - 148, actionY + 24.5, "Reject", { size: 14, weight: 600, anchor: "middle" }) +
    `<g class="${tracks.press(AT.clickAccept)}">${rect(inner.x + inner.width - 96, actionY, 96, 38, { rx: 9, fill: c.accent })}` +
    `${text(inner.x + inner.width - 48, actionY + 24.5, "Accept", { size: 14, weight: 600, fill: c.onAccent, anchor: "middle" })}</g></g>`);
  const acceptButton = { x: inner.x + inner.width - 40, y: actionY + 22 };

  parts.push(chrome.footer, kit.toast("Proposal accepted and saved to LaTeX.", G.toasts.accepted, AT.acceptedIn + 0.1, AT.acceptedIn + 3.4));
  const home = { x: body.x + 380, y: body.y + 330 };
  parts.push(kit.ripple(AT.clickToolbar, toolbar.commentButton), kit.ripple(AT.clickComment, commentButton), kit.ripple(AT.clickAccept, acceptButton));
  parts.push(kit.pointer([
    [0, home], [AT.selectStart, selection.start, true], [AT.selectEnd, selection.end],
    [AT.toolbarIn + 0.1, selection.end], [AT.clickToolbar - 0.2, toolbar.commentButton],
    [AT.typeEnd - 0.3, toolbar.commentButton], [AT.clickComment - 0.2, commentButton],
    [AT.toAccept, commentButton], [AT.clickAccept - 0.2, acceptButton],
    [AT.reset - 0.4, acceptButton], [LOOP, home],
  ]));
  return finish(theme, c, tracks, fontData, parts,
    "Paper Pal, animated. Two sentences are selected in the manuscript, Comment is chosen from the selection toolbar and a comment is typed. " +
    "The card says Claude is drafting, then the proposal arrives as a red and green word diff, inline and in the comment card. Accept is clicked: " +
    "the sentences are rewritten, a toast says the proposal was saved to LaTeX, the text turns from grey to black, the section's review progress goes up and the PDF recompiles.");
}

// --------------------------------------------------- scene 2: confirm, compile
// Confirm a read paragraph; Compile rebuilds the PDF; Preview opens it beside the manuscript.
function confirmScene(theme, c, G, fontData) {
  const LOOP = 15;
  const AT = {
    selectStart: 0.8, selectEnd: 2.1, toolbarIn: 2.2, clickConfirm: 3.2, confirmedIn: 3.35,
    toCompile: 5.0, clickCompile: 6.0, compileEnd: 7.5, toPreview: 7.7, clickPreview: 8.4, previewIn: 8.55, reset: 14.2,
  };
  const tracks = new Tracks(LOOP);
  const kit = makeKit(c, tracks);
  const { text, rect, drawLines, SERIF } = kit;
  const { top, rail, body, pane } = G.boxes;
  const K = G.confirm;
  const parts = [];
  const chrome = drawChrome(c, kit, tracks, G, {
    progress: { at: AT.confirmedIn, until: AT.reset, section: [50, 63], paper: [15, 17] },
    compiling: [AT.clickCompile, AT.compileEnd], pressCompile: AT.clickCompile,
    previewAt: AT.previewIn, pressPreview: AT.clickPreview, until: AT.reset,
  });
  parts.push(chrome.markup);

  // wide manuscript, until the PDF opens beside it
  const wide = tracks.show(0, AT.previewIn, { fadeOut: 0.3 });
  const lineOptions = { size: G.bodySize, leading: G.bodyLeading, markHeight: 24 };
  const first = drawLines(K.wide.first, body.x, body.y, lineOptions);
  const secondY = body.y + K.wide.first.length * G.bodyLeading + 16;
  const draft = drawLines(K.wide.second, body.x, secondY, lineOptions);
  const confirmed = drawLines(K.wide.second, body.x, secondY, { ...lineOptions, ink: "ink" });
  const selection = kit.growSelection(draft.selection, AT.selectStart, AT.selectEnd, AT.confirmedIn);
  const toolbar = kit.selectionToolbar(draft.selection, { from: AT.toolbarIn, to: AT.clickConfirm + 0.1, pressConfirm: AT.clickConfirm });
  const grey = tracks.show(0, AT.confirmedIn, { fadeOut: 0.5 });
  const black = tracks.add([[AT.confirmedIn, { opacity: 0 }, EASE_OUT], [AT.confirmedIn + 0.5, { opacity: 1 }]]);
  parts.push(`<g class="${wide} rest0">${drawSheet(c, kit, G)}${first.markup}${selection.markup}` +
    `<g class="${grey} rest0">${draft.texts}</g><g class="${black}">${confirmed.texts}</g>${toolbar.markup}</g>`);

  // Preview: the manuscript keeps half the width and reflows; the compiled page takes the other half
  const split = tracks.add([[AT.previewIn, { opacity: 0 }, EASE_OUT], [AT.previewIn + 0.4, { opacity: 1 }], [AT.reset, { opacity: 1 }, EASE_IO], [AT.reset + 0.4, { opacity: 0 }]]);
  const middle = rail + (pane.x - rail) / 2;
  const narrow = { x: rail + 14, width: middle - rail - 28 };
  const narrowOptions = { ...lineOptions, ink: "ink" };
  const narrowFirst = drawLines(K.narrow.first, narrow.x + 20, body.y, narrowOptions);
  const narrowSecond = drawLines(K.narrow.second, narrow.x + 20, body.y + K.narrow.first.length * G.bodyLeading + 16, narrowOptions);
  const page = { x: middle + 22, y: top + 80, width: pane.x - middle - 44 };
  page.height = page.width * 1.414;
  const rule = (x, y, width, height = 2.2) => rect(page.x + x, page.y + y, width, height, { rx: 1.1, fill: c.paperRule });
  const column = page.width - 60;
  const pageLines = [];
  let y = 122;
  for (let index = 0; index < 5; index += 1, y += 7) pageLines.push(rule(44, y, index === 4 ? (column - 28) * 0.55 : column - 28));
  y += 18;
  pageLines.push(text(page.x + 30, page.y + y, "1   Introduction", { cls: SERIF, size: 10, weight: 700, fill: c.paperInk }));
  y += 12;
  for (const count of [6, 5, 7]) {
    for (let index = 0; index < count; index += 1, y += 7) pageLines.push(rule(index === 0 ? 40 : 30, y, (index === count - 1 ? column * 0.62 : column) - (index === 0 ? 10 : 0)));
    y += 3;
  }
  parts.push(`<g class="${split}">` +
    rect(narrow.x, G.boxes.sheet.y, narrow.width, H - G.boxes.sheet.y, { fill: c.surface }) +
    rect(narrow.x, G.boxes.sheet.y, 1, H, { fill: c.lineSoft }) + rect(narrow.x + narrow.width, G.boxes.sheet.y, 1, H, { fill: c.lineSoft }) +
    text(rail + 24, top + 27, "1 · Introduction", { size: 14.5, weight: 600 }) + text(rail + 24, top + 45, "8 readable blocks", { size: 12, fill: c.muted }) +
    text(narrow.x + 20, body.y - 40, "Introduction", { cls: SERIF, size: 28, weight: 700 }) + narrowFirst.markup + narrowSecond.markup +
    rect(middle, top + 1, pane.x - middle, H - top, { fill: c.well }) + rect(middle, top, 1, H - top, { fill: c.line }) +
    rect(middle, top + 1, pane.x - middle, 58, { fill: c.chrome }) + rect(middle, top + 59, pane.x - middle, 1, { fill: c.line }) +
    text(middle + 22, top + 25, "LIVE OUTPUT", { size: 10.5, weight: 600, fill: c.quiet, extra: ' letter-spacing=".08em"' }) +
    text(middle + 22, top + 45, "Compiled PDF", { size: 15, weight: 600 }) +
    `<path d="M${pane.x - 34} ${top + 24}l11 11m0-11l-11 11" stroke="${c.muted}" stroke-width="1.6" stroke-linecap="round"/>` +
    rect(page.x, page.y, page.width, page.height, { rx: 2, fill: c.paper, extra: ' filter="url(#lift)"' }) +
    text(page.x + page.width / 2, page.y + 50, "Earlier Every Year", { cls: SERIF, size: 15, weight: 700, fill: c.paperInk, anchor: "middle" }) +
    rule(page.width / 2 - 50, 66, 100) + rule(page.width / 2 - 34, 74, 68) +
    text(page.x + page.width / 2, page.y + 112, "Abstract", { cls: SERIF, size: 8.5, weight: 700, fill: c.paperInk, anchor: "middle" }) +
    pageLines.join("") + "</g>");

  parts.push(drawEmptyState(c, kit, G), chrome.footer);
  parts.push(kit.toast("Confirmed text is now black.", G.toasts.confirmed, AT.confirmedIn + 0.1, AT.confirmedIn + 2.4));

  const home = { x: body.x + 400, y: body.y + 380 };
  parts.push(kit.ripple(AT.clickConfirm, toolbar.confirmButton), kit.ripple(AT.clickCompile, chrome.compileButton), kit.ripple(AT.clickPreview, chrome.previewButton));
  parts.push(kit.pointer([
    [0, home], [AT.selectStart, selection.start, true], [AT.selectEnd, selection.end],
    [AT.toolbarIn + 0.1, selection.end], [AT.clickConfirm - 0.2, toolbar.confirmButton],
    [AT.toCompile, toolbar.confirmButton], [AT.clickCompile - 0.2, chrome.compileButton],
    [AT.toPreview, chrome.compileButton], [AT.clickPreview - 0.15, chrome.previewButton],
    [AT.reset - 0.6, chrome.previewButton], [LOOP, home],
  ]));
  return finish(theme, c, tracks, fontData, parts,
    "Paper Pal, animated. A grey, unread paragraph is selected and Confirm is chosen from the selection toolbar: a toast says confirmed text is now black, the paragraph turns black " +
    "and the section's review progress goes up. Then Compile is clicked and the status shows Compiling, then PDF updated. Preview is clicked and the compiled PDF opens beside the manuscript, which reflows into half the width.");
}

// ----------------------------------------------------------------------- main
async function main() {
  const options = readArguments(process.argv.slice(2));
  if (options.help) {
    console.log("npm run animation [-- --out <dir>] [--theme light|dark|both] [--only flow,confirm]\nRewrites docs/images/flow-*.svg and confirm-*.svg. Needs Playwright for one run.");
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
  const narrowWidth = (pane.x - rail) / 2 - 28 - 40;
  const emptyWidth = pane.width - 64 - 38;

  const measurer = await openMeasurer(fontData);
  let geometry;
  try {
    const serif = (size) => `400 ${size}px "PP Serif"`;
    const ui = (size, weight = 400) => `${weight} ${size}px "PP Inter"`;
    const bodyFont = { font: serif(bodySize), width: body.width };
    const paragraph = {};
    for (const [state, pieces] of Object.entries(FLOW)) paragraph[state] = await layout(measurer, pieces, bodyFont);
    // Cuts a quote to `lines` lines of the card's width and ends it with an ellipsis, as the app does.
    const cutQuote = async (lines) => {
      const all = await layout(measurer, [[`“${SELECTED}`, "ink"]], { font: serif(15), width: innerWidth - 22 });
      const kept = all.slice(0, lines).map((runs) => runs.map((run) => run.text).join("").trimEnd());
      if (all.length > lines) kept[lines - 1] = `${kept[lines - 1].replace(/\s+\S*$/, "")}…`;
      return kept;
    };
    const read = [[LEAD, "ink"], [NEW_A, "ink"], [TAIL, "ink"], [CITE, "ink", "cite"], [").", "ink"]];
    const step = async (title, detail, sample) => ({ title, lines: await layout(measurer, [[detail, "ink"]], { font: ui(12), width: emptyWidth }), sample: sample ? await layout(measurer, sample, { font: serif(13.5), width: emptyWidth - 22 }) : null });
    const [acceptedToast, confirmedToast] = await measurer.widths(ui(13.5), ["Proposal accepted and saved to LaTeX.", "Confirmed text is now black."]);
    geometry = {
      boxes: { top, rail, sheet, body, pane },
      bodySize, bodyLeading: 27.5,
      next: await layout(measurer, [[NEXT, "draft"]], bodyFont),
      toasts: { accepted: acceptedToast, confirmed: confirmedToast },
      empty: {
        width: emptyWidth,
        steps: [
          await step("Select text", "Highlight a phrase or a paragraph in the manuscript. Confirm it as yours, or comment on it."),
          await step("Write a comment", "Say what should change, or ask a question. Claude drafts a reply in the background."),
          await step("Review the diff", "Every proposal arrives here as a before and after. Accept, reject, or ask for another version.",
            [["The evidence ", "muted"], ["is weaker", "muted", "del"], [" ", "muted"], ["rests on less", "muted", "ins"], [" than it seems.", "muted"]]),
        ],
      },
      flow: {
        paragraph, quote: (await cutQuote(1))[0], quoteLines: await cutQuote(2),
        typed: await layout(measurer, [[COMMENT, "ink"]], { font: ui(14.5), width: innerWidth - 26 }),
        title: await layout(measurer, [[COMMENT, "ink"]], { font: ui(15, 600), width: innerWidth }),
        rationale: await layout(measurer, [[RATIONALE, "ink"]], { font: ui(13.5), width: innerWidth - 28 }),
        del: await layout(measurer, CARD_DEL, { font: serif(15), width: innerWidth - 48 }),
        ins: await layout(measurer, CARD_INS, { font: serif(15), width: innerWidth - 48 }),
      },
      confirm: {
        wide: { first: await layout(measurer, read, bodyFont), second: await layout(measurer, [[NEXT, "draft", "sel"]], bodyFont) },
        narrow: {
          first: await layout(measurer, read, { font: serif(bodySize), width: narrowWidth }),
          second: await layout(measurer, [[NEXT, "ink"]], { font: serif(bodySize), width: narrowWidth }),
        },
      },
    };
  } finally {
    await measurer.close();
  }

  await fs.mkdir(options.out, { recursive: true });
  const scenes = { flow: flowScene, confirm: confirmScene };
  for (const name of options.only) {
    for (const theme of options.theme === "both" ? ["light", "dark"] : [options.theme]) {
      const file = path.join(options.out, `${name}-${theme}.svg`);
      const svg = scenes[name](theme, THEMES[theme], geometry, fontData);
      await fs.writeFile(file, svg);
      console.log(`${path.relative(appRoot, file)}  ${Math.round(svg.length / 1024)} KB`);
    }
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
