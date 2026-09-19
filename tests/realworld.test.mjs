// Real-world LaTeX: a torture-test manuscript (tests/fixtures/realworld, all
// fictional) that uses what other people's papers contain. For every file the
// blocks must tile the source, an edit must change only the edited span,
// nothing that is source-only may show up as prose, nothing the author wrote
// may vanish, and no input may make the server answer 500.
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import katex from "katex";
import { api, apiOk, appRoot, cleanupAll, getDocument, makeProject, saveBlock, startServer } from "./helpers.mjs";

const fixture = path.join(appRoot, "tests", "fixtures", "realworld");

function visible(document) {
  return document.blocks.filter((block) => !block.hidden && block.display?.trim());
}

function visibleText(document) {
  return visible(document).map((block) => {
    const semantic = block.semantic || {};
    const extra = [
      semantic.caption,
      semantic.text,
      ...(semantic.items || []).map((item) => item.text),
      ...(semantic.rows || []).flat(),
      ...(semantic.panels || []).map((panel) => panel.caption),
    ].filter(Boolean).join("\n");
    return `${block.display}\n${extra}`;
  }).join("\n");
}

function assertTiles(document) {
  let cursor = 0;
  for (const block of document.blocks) {
    assert.ok(block.start >= cursor, `${document.path}: block ${block.index} overlaps the previous one`);
    assert.equal(document.source.slice(cursor, block.start).trim(), "", `${document.path}: text lost before block ${block.index}`);
    assert.equal(document.source.slice(block.start, block.end), block.raw, `${document.path}: block ${block.index} raw/offset mismatch`);
    cursor = block.end;
  }
  assert.equal(document.source.slice(cursor).trim(), "", `${document.path}: text lost after the last block`);
}

// Command names that leaked into the prose view before this suite existed,
// and fragments that only exist in source-only structure.
const JUNK = [
  "footnoteIn", "urlhttps", "textcite", "parencite", "footcite", "citeauthor", "subfilech", "subimportapp", "importappendix", "todoTighten",
  "hlReviewer", "reviewerJO", "termhuddle", "SI98", "SI40", "textttalarm", "pagerefsec", "keywordsthermal", "UTF8gbsn", "UTF8", "iffalse",
  "fancyboxboxed", "verb|", "verb+", "ccsdesc", "received20", "onecolumn", "[language=", "IEEEauthorblock", "icmlauthor", "concept_id",
  "textsc", "texttt", "textbf", "noindent", "hspace", "vspace", "centering", "medskip", "subparagraph", "lstinline", "includegraphics",
  "toprule", "bibitem", "orcid", "\\begin{", "\\end{", "\\item", "\\label", "\\cite", "\\ref",
];

function assertNoJunk(document) {
  const text = visible(document)
    .filter((block) => block.kind !== "code" && block.kind !== "math")
    .map((block) => block.display)
    .join("\n");
  for (const fragment of JUNK) {
    assert.ok(!text.includes(fragment), `${document.path}: ${JSON.stringify(fragment)} leaked into the prose view`);
  }
}

function renderable(latex, macros, displayMode) {
  try {
    katex.renderToString(latex, { displayMode, throwOnError: true, strict: "ignore", trust: false, macros: { ...macros } });
    return true;
  } catch {
    return false;
  }
}

async function documentPaths(server) {
  const bootstrap = await apiOk(server, "/api/bootstrap");
  return bootstrap.documents.map((entry) => entry.path).filter((entry) => entry.endsWith(".tex"));
}

describe("real-world manuscript", () => {
  let project;
  let server;
  let paths;
  const documents = new Map();

  before(async () => {
    project = await makeProject({ from: fixture });
    server = await startServer(project.root);
    paths = await documentPaths(server);
    for (const relative of paths) documents.set(relative, await getDocument(server, relative));
  });
  after(cleanupAll);

  it("tiles every file and shows no command names or source-only structure as prose", () => {
    assert.ok(paths.length >= 15, `expected the whole fixture, got ${paths.join(", ")}`);
    for (const document of documents.values()) {
      assertTiles(document);
      assertNoJunk(document);
    }
  });

  it("shows what the author wrote: text commands, footnotes, links, accents, quotes and dashes", () => {
    const intro = documents.get("sections/introduction.tex");
    const text = visibleText(intro);
    for (const expected of [
      "depend on it [In the fictional jurisdiction we study, a miscount of more than 3% voids the claim.]",
      "https://example.org/night_count?farm=3&run=7%20b#top",
      "the public data set",
      "errors of 5–10%",
      "“like watching a rug being pulled” — and which ruins the count",
      "The alarm_call of a single ewe",
      "NightCount is designed around it",
      "[TODO: Tighten this paragraph once the results section is final.]",
      "Reviewer 2 asked for a limitations section.",
      "[JO: I think this belongs in the discussion.]",
      "Café-style spellings such as naïve, façade, Ångström, straße, øre, and Łódź",
      "Prices are in $ and €-free; the R&D budget was under #3 of the plan_v2 list… and so on…",
      "on 98 % of nights",
      "Skáli (exposed plateau",
      "Peña Alta",
      "We say huddle for a group",
    ]) assert.ok(text.includes(expected), `missing: ${expected}`);
    const styled = (needle, type) => {
      const block = visible(intro).find((item) => item.display.includes(needle));
      const at = block.display.indexOf(needle);
      return (block.styles || []).some((style) => style.type === type && style.start <= at && style.end >= at + needle.length);
    };
    assert.ok(styled("move", "emph"));
    assert.ok(styled("sleeping", "strong"));
    assert.ok(styled("alarm_call", "code"));
    assert.ok(styled("In the fictional jurisdiction", "footnote"));
    assert.ok(styled("https://example.org/night_count", "url"));
    assert.ok(styled("singleton", "emph"), "a user macro that wraps \\emph keeps the style");
  });

  it("renders every citation and reference command", () => {
    const intro = documents.get("sections/introduction.tex");
    const text = visibleText(intro);
    for (const expected of [
      "(Brannigan, 2017)",
      "Oyelaran (2019) found",
      "Halloran (2021, ch. 2)",
      "(see Vásquez, 2020, p. 14)",
      "(Vásquez, 2020; Brannigan, 2017)",
      "[Tamm, 2018]",
      "As Tamm put it in 2018",
      "(Section ?)",
      "(Theorem ?)",
      "(Algorithm ?)",
      "see page ? and §?",
    ]) assert.ok(text.includes(expected), `missing: ${expected}`);
    const keys = intro.blocks.flatMap((block) => block.annotations || []).filter((item) => item.type === "citation").flatMap((item) => item.keys);
    assert.ok(keys.includes("halloran2021pastoral") && keys.includes("tamm2018thermal"));
    assert.deepEqual(intro.references.unresolved.filter((item) => item.type === "citation"), []);
    const results = visibleText(documents.get("sections/results.tex"));
    assert.ok(results.includes("Figure ? shows a typical night and Table ?, ? summarise accuracy."));
  });

  it("numbers enumerated items, nests lists one level and shows description terms", () => {
    const intro = documents.get("sections/introduction.tex");
    const items = visible(intro).filter((block) => block.role === "list-item");
    const nested = items.filter((block) => block.list === "enumerate");
    assert.deepEqual(nested.map((block) => [block.itemNumber, block.listDepth]), [[1, 2], [2, 2], [3, 2]]);
    const outer = items.filter((block) => block.list === "itemize");
    assert.deepEqual(outer.map((block) => block.itemNumber), [1, 2, 3, 4]);
    const term = items.find((block) => block.list === "description");
    assert.equal(term.display, "• Census A count of every animal in a flock at one moment.");
    assert.ok(term.styles.some((style) => style.type === "strong" && term.display.slice(style.start, style.end) === "Census"));
    assert.ok(visibleText(intro).includes("Lambs under six weeks"));
    const runIn = visible(intro).filter((block) => block.kind === "paragraph-heading").map((block) => block.display);
    assert.deepEqual(runIn, ["Scope.", "A finer point."]);
  });

  it("expands user macros in prose and hands them to KaTeX", () => {
    const main = documents.get("main.tex");
    assert.ok(visibleText(main).includes("We describe NightCount, a census pipeline"), "a macro from an \\input'ed preamble file is expanded");
    assert.equal(main.mathMacros["\\wake"], "\\tau_{\\mathrm{wake}}");
    assert.equal(main.mathMacros["\\norm"], "\\left\\lVert #1 \\right\\rVert");
    assert.equal(main.mathMacros["\\argmin"], "\\operatorname*{arg\\,min}");
    assert.equal(main.mathMacros["\\heat"], "H");
    assert.equal(main.mathMacros["\\pair"], "(#1,\\,#2)");
    assert.ok(!("\\projectname" in main.mathMacros), "\\csname definitions are not read");
    const edge = visibleText(documents.get("sections/edgecases.tex"));
    assert.ok(edge.includes("such as \\projectname and boxed words more words, must not leak"), "unknown macros: arguments shown, a bare one kept as written");
  });

  it("typesets every formula with KaTeX except the one KaTeX cannot, which stays tidy source", () => {
    const method = documents.get("sections/method.tex");
    const displays = method.blocks.filter((block) => block.kind === "math");
    assert.equal(displays.length, 14);
    const failing = displays.filter((block) => !renderable(block.semantic.latex, method.mathMacros, true));
    assert.deepEqual(failing.map((block) => block.semantic.latex), ["\\sideset{_a^b}{'}{\\sum}_{i \\in \\mathcal{H}} w_i \\heat_i"]);
    assert.deepEqual(
      displays.map((block) => block.semantic.environment),
      ["display", "equation", "equation*", "align", "align*", "gather", "multline", "equation", "equation", "equation", "equation", "eqnarray", "equation", "display"],
    );
    for (const block of displays) assert.ok(!/\\label/.test(block.semantic.latex), "labels are not sent to KaTeX");
    assert.ok(displays.some((block) => /\\tag\{MLE\}/.test(block.semantic.latex) && /\\nonumber/.test(block.semantic.latex)));
    for (const document of documents.values()) {
      for (const block of document.blocks) {
        for (const annotation of (block.annotations || []).filter((item) => item.type === "math")) {
          assert.ok(renderable(annotation.latex, document.mathMacros, Boolean(annotation.display)), `${document.path}: ${annotation.latex}`);
        }
      }
    }
    const inline = method.blocks.flatMap((block) => block.annotations || []).filter((item) => item.type === "math").map((item) => item.latex);
    assert.ok(inline.includes("\\heat(\\vec{x})"), "\\( ... \\) is inline math");
    assert.ok(inline.includes("r = \\unit{px}{12}"), "an optional macro argument is made explicit for KaTeX");
  });

  it("labels theorem-like environments and keeps their prose editable", () => {
    const method = documents.get("sections/method.tex");
    const starts = visible(method).filter((block) => block.environmentStart).map((block) => [block.environment, block.environmentTitle || "", block.environmentLabel || ""]);
    assert.deepEqual(starts, [
      ["definition", "Huddle", "def:huddle"],
      ["theorem", "Consistency", "thm:consistency"],
      ["lemma", "", ""],
      ["proof", "", ""],
      ["proposition", "", ""],
      ["remark", "", ""],
      ["quote", "", ""],
      ["quotation", "", ""],
    ]);
    const proof = visible(method).filter((block) => block.environment === "proof");
    assert.deepEqual(proof.map((block) => block.kind), ["paragraph", "math", "paragraph"]);
    const quotation = visible(method).filter((block) => block.environment === "quotation");
    assert.equal(quotation.length, 2);
    // \newtheorem{flockrule} is declared in main.tex, not in this file: the
    // environment gets no label, but its text is still an editable paragraph.
    const rule = visible(method).find((block) => block.display === "Never fly upwind of a sleeping flock.");
    assert.equal(rule.kind, "paragraph");
    assert.equal(rule.environment, undefined);
  });

  it("shows figures, subfigures, tables, code, pseudo-code and drawings as tidy read-only blocks", () => {
    const results = documents.get("sections/results.tex");
    const kinds = visible(results).map((block) => block.kind);
    assert.deepEqual(kinds, ["heading", "paragraph", "figure", "figure", "table", "table", "code", "paragraph", "code", "paragraph", "code", "paragraph", "figure", "paragraph", "paragraph"]);
    const [single, pair, drawing] = results.blocks.filter((block) => block.kind === "figure");
    assert.equal(single.semantic.graphic.path, "figures/flock.png");
    assert.ok(single.semantic.caption.includes("a huddle of three"));
    assert.equal(pair.semantic.caption, "Disturbance is invisible at this scale, which is the point.");
    assert.deepEqual(pair.semantic.panels.map((panel) => panel.caption), ["Before the flight.", "After the flight."]);
    assert.equal(results.source.slice(pair.semantic.captionSource.absoluteStart, pair.semantic.captionSource.absoluteEnd), "Disturbance is invisible at this scale, which is the point.");
    assert.equal(drawing.semantic.fallback, true);
    const [accuracy, bands] = results.blocks.filter((block) => block.kind === "table");
    assert.deepEqual(accuracy.semantic.rows.at(-1), ["Peña Alta", "terraced", "7.9", "2.3 \\pm 0.4"]);
    assert.equal(accuracy.semantic.formattedRows[0][2].colspan, 2);
    assert.deepEqual(bands.semantic.rows[0], ["Height band", "Nights", "Mean score"]);
    const [algorithm, listing, verbatim] = results.blocks.filter((block) => block.kind === "code");
    assert.equal(algorithm.semantic.caption, "Counting warm bodies in one thermal frame");
    assert.equal(algorithm.semantic.lines[0].text, "Require: frame \\heat, threshold \\wake");
    assert.deepEqual(algorithm.semantic.lines.map((line) => line.indent), [0, 0, 0, 0, 0, 1, 2, 1, 2, 1, 0, 0]);
    assert.equal(listing.semantic.language, "Python");
    assert.equal(listing.semantic.caption, "Blob counting: all of the logic");
    assert.ok(listing.semantic.text.includes("def count(frame, tau):\n    # a comment with a % sign and a $ sign, and \\begin{equation}\n    blobs = label(frame > tau)\n\n    return sum("));
    assert.ok(verbatim.semantic.text.includes("\\section{This is not a heading}\n$ unbalanced { braces"));
    const text = visibleText(results);
    assert.ok(text.includes("This sentence follows a vertical space command on the same line and must stay visible."));
    assert.ok(text.includes("Centred text is still prose and must be shown."));
    assert.ok(text.includes("Line one of an address \n line two of an address \n line three."));
  });

  it("treats comments, comment environments, \\iffalse and \\verb the way LaTeX does", () => {
    const edge = documents.get("sections/edgecases.tex");
    const text = visibleText(edge);
    assert.ok(text.includes("It costs 5% more, not 5\nand the paragraph continues on the next line after the comment."));
    assert.ok(text.includes("50% of $x$ is {not} math and a_b^c are shown literally, while x = y % 2 is code."));
    assert.ok(!/must never be shown|switched-off|hidden words|Nor must this heading/.test(text));
    assert.ok(/Text before an inline switch\s+and text after it\./.test(text));
    assert.ok(text.includes("Nested emphasis with bold inside and x^2 math works. A thin space, a tie, an en–dash, an em—dash, à la carte, and underlined code too."));
    assert.ok(text.includes("Boxed text and scoped italics and scoped bold and"));
    assert.ok(text.includes("This paragraph starts with a horizontal space command. A label sits in the middle of it."));
    assert.ok(text.includes("This line starts with a layout switch and is still prose."));
    assert.ok(text.includes("night 159 and the count was 359."), "a very long line is one paragraph");
    assert.ok(!edge.source.endsWith("\n"), "the fixture file has no trailing newline");
    const main = visibleText(documents.get("main.tex"));
    assert.ok(!main.includes("Notes after the end of the document"));
  });

  it("shows CJK prose and hides the CJK environment line", () => {
    const cjk = documents.get("sections/cjk.tex");
    const text = visibleText(cjk);
    assert.ok(text.includes("我们提出NightCount系统：用小型热成像无人机在夜间飞越熟睡的羊群"));
    assert.ok(text.includes("详见第 ? 节与文献 (Oyelaran, 2019)。"));
    assert.equal(visible(cjk)[0].display, "中文摘要 (Chinese Summary)");
  });

  it("follows \\input, \\include, \\subfile, \\subimport and \\import into the outline; letters after \\appendix", async () => {
    const outline = await apiOk(server, "/api/outline");
    assert.deepEqual(outline.items.map((item) => `${item.number}|${item.title}|${item.path}`), [
      "|Abstract|main.tex",
      "1|Introduction|sections/introduction.tex",
      "1.1|A note on terminology|sections/introduction.tex",
      "2|Method|sections/method.tex",
      "2.1|Thermal model|sections/method.tex",
      "2.2|Guarantees|sections/method.tex",
      "3|Results|sections/results.tex",
      "4|Field Notes|chapters/fieldnotes.tex",
      "5|Edge Cases|sections/edgecases.tex",
      "6|中文摘要 (Chinese Summary)|sections/cjk.tex",
      "|Acknowledgements|main.tex",
      "A|Proofs|appendix/proofs.tex",
      "A.1|Proof of the separability lemma|appendix/proofs.tex",
      "B|Flight Protocol|appendix/protocol.tex",
    ]);
    const structure = await apiOk(server, "/api/structure");
    assert.deepEqual(structure.sections.map((section) => `${section.number}:${section.title}`), [
      "1:Introduction", "2:Method", "3:Results", "4:Field Notes", "5:Edge Cases", "6:中文摘要 (Chinese Summary)", ":Acknowledgements", "A:Proofs", "B:Flight Protocol",
    ]);
    const main = documents.get("main.tex");
    assert.equal(main.frontMatter.title.text, "Counting Sheep Without Waking Them: Thermal Drones for Overnight Flock Census on Upland Pastures");
    assert.deepEqual(main.frontMatter.authors.map((author) => author.text), ["Máire Ní Fhaoláin", "Jörg Østergaard", "François Le Berger"]);
    assert.equal(main.frontMatter.date, null, "\\date{\\today} is not shown");
    assert.ok(visibleText(main).includes("Keywords: thermal imaging, livestock census"));
  });

  it("copes with IEEEtran, acmart, llncs, revtex, ICML, NeurIPS and ctex preambles", () => {
    const expectations = {
      "templates/ieee.tex": {
        title: "Low-Disturbance Thermal Census of Sleeping Flocks A fictional conference paper",
        authors: ["Máire Ní Fhaoláin", "Jörg Østergaard"],
        shows: ["This paper follows the IEEE conference template.", "unreliable [1], and earlier drone work flew by day [2, Tamm(2018)]", "thermal imaging, livestock, census, UAV", "The authors thank the sheep."],
      },
      "templates/acm.tex": {
        title: "Counting Sheep Without Waking Them",
        authors: ["Máire Ní Fhaoláin", "François Le Berger"],
        shows: ["Keywords: thermal imaging, livestock census, drones", "the abstract comes before \\maketitle", "To the sheep, for sleeping through it.", "(Brannigan, 2017)"],
      },
      "templates/llncs.tex": {
        title: "Counting Sheep Without Waking Them",
        authors: ["Máire Ní Fhaoláin", "Jörg Østergaard", "François Le Berger"],
        shows: ["Keywords: Thermal imaging · Census · UAV.", "This is a sample theorem.", "Only two levels of headings should be numbered."],
      },
      "templates/revtex.tex": {
        title: "Thermal contrast of resting ungulates at night",
        authors: ["Máire Ní Fhaoláin", "Jörg Østergaard"],
        shows: ["Keywords: thermal contrast; sheep", "We follow Ref. Tamm, 2018", "We thank the flock."],
      },
      "templates/icml.tex": {
        title: "Counting Sheep Without Waking Them",
        authors: ["Máire Ní Fhaoláin", "Jörg Østergaard"],
        shows: ["A one-paragraph abstract", "Results are in Table ?.", "You can have an appendix here."],
      },
      "templates/neurips.tex": {
        title: "Counting Sheep Without Waking Them",
        authors: ["Máire Ní Fhaoláin", "Jörg Østergaard", "François Le Berger"],
        shows: ["In prose, L and P are the author's macros, not a Polish letter and a pilcrow.", "Use unnumbered first level headings", "J. Imaginary Pastoral Sci. 12:41–58."],
      },
      "templates/ctex.tex": {
        title: "夜间热成像无人机羊群清点方法",
        authors: ["倪 梅", "奥斯特 约格"],
        shows: ["本文提出 NightCount 系统", "实验表明，NightCount 的清点误差低于 百分之二"],
      },
    };
    for (const [relative, expected] of Object.entries(expectations)) {
      const document = documents.get(relative);
      assert.equal(document.frontMatter?.title.text, expected.title, relative);
      assert.deepEqual(document.frontMatter.authors.map((author) => author.text), expected.authors, relative);
      const text = visibleText(document);
      for (const fragment of expected.shows) assert.ok(text.includes(fragment), `${relative}: missing ${fragment}`);
    }
    const ieee = documents.get("templates/ieee.tex");
    const bibliography = ieee.blocks.find((block) => block.kind === "bibliography");
    assert.deepEqual(bibliography.semantic.items.map((item) => [item.key, item.label]), [["b1", "1"], ["b2", "2"], ["b3", "Tamm(2018)"]]);
    assert.ok(bibliography.semantic.items[1].text.includes("I. Vásquez and K. Tamm, “Aerial census of grazing animals by day,”"));
    assert.deepEqual(ieee.references.unresolved.filter((item) => item.type === "citation"), []);
    const revtex = documents.get("templates/revtex.tex");
    assert.equal(visible(revtex).find((block) => block.kind === "heading").display, "Introduction", "a \\label inside the heading argument is hidden");
  });
});

describe("real-world manuscript: every editable block round-trips", () => {
  let project;
  let server;

  before(async () => {
    project = await makeProject({ from: fixture });
    server = await startServer(project.root);
  });
  after(cleanupAll);

  it("an edit to any editable block of any file changes exactly that span", async () => {
    let edits = 0;
    for (const relative of await documentPaths(server)) {
      let document = await getDocument(server, relative);
      const count = document.blocks.length;
      for (let index = 0; index < count; index += 1) {
        const block = document.blocks[index];
        if (block.hidden || block.semantic || !["paragraph", "heading", "paragraph-heading"].includes(block.kind) || !block.display?.trim()) continue;
        // The way the editor saves: a display character that is copied from
        // the source maps to one source character; type an "X" before it.
        let at = -1;
        for (let position = Math.floor(block.display.length / 2); position < block.display.length; position += 1) {
          const rawAt = block.displayStarts[position];
          if (block.displayEnds[position] === rawAt + 1 && block.raw[rawAt] === block.display[position] && /[\p{L}]/u.test(block.display[position])
            && !(block.annotations || []).some((item) => item.start <= position && item.end > position)) {
            at = rawAt;
            break;
          }
        }
        if (at < 0) continue;
        const before = document.source;
        const nextRaw = `${block.raw.slice(0, at)}X${block.raw.slice(at)}`;
        document = await saveBlock(server, document, block, nextRaw);
        const expected = `${before.slice(0, block.start + at)}X${before.slice(block.start + at)}`;
        assert.equal(document.source, expected, `${relative}: block ${index} edit changed something else`);
        assert.equal(await fs.readFile(path.join(project.root, relative), "utf8"), expected);
        assert.equal(document.blocks.length, count, `${relative}: block ${index} edit changed the block structure`);
        assert.equal(document.blocks[index].raw, nextRaw);
        assertTiles(document);
        edits += 1;
      }
    }
    assert.ok(edits > 120, `only ${edits} blocks were edited`);
  });
});

describe("real-world manuscript: encodings and broken includes", () => {
  let project;
  let server;
  const read = (relative) => fs.readFile(path.join(fixture, relative), "utf8");

  before(async () => {
    const intro = await read("sections/introduction.tex");
    const main = await read("main.tex");
    project = await makeProject({
      from: fixture,
      files: {
        "main.tex": main.replace("\\section*{Acknowledgements}", "\\input{sections/missing_file}\n\\input{cycle_a}\n\\input{empty}\n\\input{../outside}\n\\subimport{nowhere/}{nothing}\n\n\\section*{Acknowledgements}"),
        "cycle_a.tex": "\\section{Cycle A}\nText in file A.\n\\input{cycle_b}\n",
        "cycle_b.tex": "\\section{Cycle B}\nText in file B.\n\\input{cycle_a}\n",
        "empty.tex": "",
        "crlf.tex": intro.replace(/\n/g, "\r\n"),
        "bom.tex": `\uFEFF${await read("templates/ieee.tex")}`,
        "wrappers.tex": "\\newtheorem{houserule}{House Rule}\n\\section{Wrappers}\n\\begin{approvedcontent}\nApproved text right under the wrapper.\n\\end{approvedcontent}\n\\begin{draftcontent}\nDraft text.\n\\end{draftcontent}\nText after the wrappers.\n\\begin{houserule}[Gates]\nShut every gate.\n\\end{houserule}\n",
      },
    });
    await fs.writeFile(path.join(project.root, "..", "outside.tex"), "\\section{Outside}\nMust never be read.\n", "utf8");
    server = await startServer(project.root);
  });
  after(cleanupAll);

  it("reads CRLF files like LF files and keeps the other line endings on an edit", async () => {
    const crlf = await getDocument(server, "crlf.tex");
    const lf = await getDocument(server, "sections/introduction.tex");
    assertTiles(crlf);
    assert.deepEqual(visible(crlf).map((block) => block.display), visible(lf).map((block) => block.display));
    assert.deepEqual(visible(crlf).map((block) => block.kind), visible(lf).map((block) => block.kind));
    const block = crlf.blocks.find((item) => item.raw.startsWith("Our contributions"));
    const saved = await saveBlock(server, crlf, block, block.raw.replace("contributions", "three contributions"));
    assert.equal(saved.source, crlf.source.replace("Our contributions", "Our three contributions"));
    assert.equal(saved.source.split("\r\n").length, crlf.source.split("\r\n").length);
  });

  it("reads a file that starts with a byte-order mark", async () => {
    const bom = await getDocument(server, "bom.tex");
    assertTiles(bom);
    assert.equal(bom.source.charCodeAt(0), 0xFEFF);
    assert.equal(bom.frontMatter.title.text.startsWith("Low-Disturbance Thermal Census"), true);
    assert.equal(visible(bom)[0].display.startsWith("We count sleeping sheep"), true, "the preamble stays hidden behind the BOM");
    assertNoJunk(bom);
  });

  it("shows a read-only note for an include that cannot be followed, and survives cycles and empty files", async () => {
    const main = await getDocument(server, "main.tex");
    assertTiles(main);
    const notes = main.blocks.filter((block) => block.semantic?.missing).map((block) => block.display);
    assert.deepEqual(notes, ["File not found: sections/missing_file", "File not found: ../outside", "File not found: nowhere/nothing"]);
    const empty = await getDocument(server, "empty.tex");
    assert.deepEqual(empty.blocks, []);
    const outline = await apiOk(server, "/api/outline");
    const titles = outline.items.map((item) => `${item.number} ${item.title}`);
    assert.ok(titles.includes("7 Cycle A") && titles.includes("8 Cycle B"));
    assert.ok(!titles.some((title) => /Outside/.test(title)), "a file outside the source root is never read");
    assert.equal(titles.filter((title) => /Cycle A/.test(title)).length, 1);
    const structure = await apiOk(server, "/api/structure");
    assert.ok(structure.sections.some((section) => section.title === "Cycle B"));
  });

  it("splits \\end{approvedcontent} and \\end{draftcontent} off the paragraph above", async () => {
    const document = await getDocument(server, "wrappers.tex");
    assertTiles(document);
    assert.deepEqual(visible(document).map((block) => block.raw.trim()), [
      "\\section{Wrappers}",
      "Approved text right under the wrapper.",
      "Draft text.",
      "Text after the wrappers.",
      "Shut every gate.",
    ]);
    const paragraph = document.blocks.find((block) => block.raw.trim().startsWith("Approved"));
    const saved = await saveBlock(server, document, paragraph, paragraph.raw.replace("right under the wrapper", "and edited"));
    assert.equal(saved.source, document.source.replace("Approved text right under the wrapper.", "Approved text and edited."));
    // A \newtheorem in the same file makes its environment a labelled wrapper.
    const rule = visible(document).at(-1);
    assert.deepEqual([rule.environment, rule.environmentTitle, rule.environmentStart], ["houserule", "Gates", true]);
  });
});

describe("real-world manuscript: fuzzing never produces a 500", () => {
  let project;
  let server;

  before(async () => {
    project = await makeProject({ from: fixture });
    server = await startServer(project.root);
  });
  after(cleanupAll);

  it("answers 200 or a clean 4xx for truncated and mutated sources", async () => {
    // mulberry32: the same mutations on every run.
    let seed = 0x5EED1E57;
    const random = () => {
      seed = (seed + 0x6D2B79F5) | 0;
      let value = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
      return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
    const pick = (list) => list[Math.floor(random() * list.length)];
    const tokens = [
      "{", "}", "}}}}", "{{{{", "$", "$$", "\\[", "\\]", "\\(", "%", "\\%", "\\", "\\\\", "[", "]", "\r\n", "\n\n", "\u0000", "\uFEFF", "&", "#1", "~",
      "\\begin{equation}", "\\end{equation}", "\\begin{itemize}", "\\end{itemize}", "\\end{document}", "\\begin{document}", "\\begin{verbatim}",
      "\\end{verbatim}", "\\begin{figure}", "\\begin{tabular}{ll}", "\\begin{thebibliography}{9}", "\\bibitem{", "\\begin{comment}", "\\iffalse", "\\fi",
      "\\verb|", "\\item[", "\\section{", "\\section*[", "\\footnote{", "\\cite[", "\\citep{a,,b}", "\\ref{}", "\\input{", "\\input{main}", "\\input{../../etc/passwd}",
      "\\subimport{a/}{b}", "\\newcommand{\\loop}{\\loop\\loop\\loop\\loop}", "\\loop", "\\newcommand{\\x}[9][", "\\def\\y#1#2{#2#1\\y}", "\\y{a}{b}",
      "\\DeclareMathOperator{\\op}{", "\\emph{".repeat(300), "\\'", "\\c", "\\textcolor{red}", "\\href{", "\\url{%", "\\includegraphics{", "\\caption{",
      "\\multicolumn{2}{c}{", "\\begin{algorithmic}\\If{", "\\begin{lstlisting}[language=", "\\twocolumn[{", "\\appendix", "\\title{", "\\author{\\and\\and",
    ];
    const targets = ["main.tex", "sections/introduction.tex", "sections/method.tex", "sections/results.tex", "sections/edgecases.tex", "templates/ieee.tex", "templates/acm.tex", "macros.tex"];
    const originals = new Map();
    for (const relative of targets) originals.set(relative, await fs.readFile(path.join(fixture, relative), "utf8"));
    const failures = [];
    for (let round = 0; round < 70; round += 1) {
      const relative = pick(targets);
      let text = originals.get(relative);
      const mode = round % 3;
      if (mode === 0) text = text.slice(0, Math.floor(random() * text.length));
      else if (mode === 1) {
        const from = Math.floor(random() * text.length);
        text = `${text.slice(0, from)}${text.slice(from + Math.floor(random() * 400))}`;
      }
      for (let insertion = 0; insertion < 1 + Math.floor(random() * 6); insertion += 1) {
        const at = Math.floor(random() * (text.length + 1));
        text = `${text.slice(0, at)}${pick(tokens)}${text.slice(at)}`;
      }
      await fs.writeFile(path.join(project.root, relative), text, "utf8");
      for (const endpoint of [`/api/document?path=${encodeURIComponent(relative)}`, "/api/outline", "/api/structure"]) {
        const response = await api(server, endpoint);
        if (response.status >= 500 || (response.status !== 200 && response.status >= 300 && response.status < 400)) {
          failures.push(`round ${round} ${relative} ${endpoint} -> ${response.status}\n${server.output().split("\n").slice(-8).join("\n")}`);
        }
        if (response.status === 200 && endpoint.startsWith("/api/document")) assertTiles(response.value);
      }
      await fs.writeFile(path.join(project.root, relative), originals.get(relative), "utf8");
    }
    for (const endpoint of ["/api/document?path=does/not/exist.tex", "/api/document?path=..%2Foutside.tex", "/api/document", "/api/document?path=figures/flock.png"]) {
      const response = await api(server, endpoint);
      assert.ok(response.status >= 400 && response.status < 500, `${endpoint} -> ${response.status}`);
    }
    assert.deepEqual(failures, []);
    assert.ok(server.alive(), "the server is still running");
  });
});
