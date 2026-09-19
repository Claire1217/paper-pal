import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { apiOk, cleanupAll, getDocument, makeProject, saveBlock, startServer } from "./helpers.mjs";

const singleFile = String.raw`% A single-file article.
\documentclass[11pt]{article}
\usepackage{amsmath,booktabs,graphicx}
\newcommand{\method}{SparseNet}

\title{Sparse Things: A Study}
\author{A. Author \and B. Author}
\date{}

\begin{document}
\maketitle

\begin{abstract}
We study sparse things and find that they are sparse.
A second abstract sentence follows.
\end{abstract}

\section{Introduction}
\label{sec:intro}
This paragraph follows a label without a blank line.
It has a second line.
\subsection{Motivation}
Motivation text directly under the subsection heading.
% a comment glued to the next paragraph
A paragraph that starts right after a comment line.

We make two contributions:
\begin{itemize}
  \item the first contribution, with \emph{emphasis};
  \item the second contribution.
\end{itemize}
Text right after the list.

\begin{enumerate}
\item Step one.
\item Step two.
\end{enumerate}

\begin{theorem}
Every sparse thing is sparse.
\end{theorem}

\begin{equation}
  a = b + c
  \label{eq:abc}
\end{equation}
where $a$ is the result.

\paragraph{Limitations.} None that we know of.

\bibliographystyle{plain}
\bibliography{refs}

\end{document}
This text is after the end of the document.
`;

function visible(document) {
  return document.blocks.filter((block) => !block.hidden && block.display?.trim());
}

function findBlock(document, needle) {
  const block = document.blocks.find((item) => item.raw.includes(needle));
  assert.ok(block, `no block contains ${JSON.stringify(needle)}`);
  return block;
}

describe("block parser on a single-file article", () => {
  let project;
  let server;
  let document;

  before(async () => {
    project = await makeProject({ files: { "main.tex": singleFile, "refs.bib": "" } });
    server = await startServer(project.root);
    document = await getDocument(server, "main.tex");
  });
  after(cleanupAll);

  it("covers the source with non-overlapping blocks at exact offsets", () => {
    let cursor = 0;
    for (const block of document.blocks) {
      assert.ok(block.start >= cursor, "blocks must not overlap");
      assert.equal(document.source.slice(block.start, block.end), block.raw);
      assert.equal(document.source.slice(cursor, block.start).trim(), "", "only whitespace may sit between blocks");
      cursor = block.end;
    }
    assert.equal(document.source.slice(cursor).trim(), "");
  });

  it("treats the preamble, \\maketitle, the bibliography and \\end{document} as structure", () => {
    const shown = visible(document).map((block) => block.display).join("\n");
    for (const hidden of ["documentclass", "usepackage", "amsmath", "Sparse Things", "A. Author", "maketitle", "bibliographystyle", "plain", "refs", "after the end of the document"]) {
      assert.ok(!shown.includes(hidden), `${hidden} must not be shown as prose`);
    }
    for (const block of document.blocks.filter((item) => item.start < document.source.indexOf("\\begin{document}"))) {
      assert.equal(block.kind, "structure");
    }
  });

  it("shows the abstract as editable prose and points the outline at it", async () => {
    const abstract = findBlock(document, "We study sparse things");
    assert.equal(abstract.kind, "paragraph");
    assert.equal(abstract.role, "abstract");
    assert.equal(abstract.hidden, false);
    assert.match(abstract.display, /^We study sparse things[\s\S]*follows\.$/);
    const outline = await apiOk(server, "/api/outline");
    const item = outline.items.find((entry) => entry.title === "Abstract");
    assert.ok(item, "outline has an Abstract entry");
    assert.equal(item.blockIndex, abstract.index);
    assert.equal(item.blockId, abstract.id);
    assert.deepEqual(outline.items.map((entry) => entry.title), ["Abstract", "Introduction", "Motivation"]);
  });

  it("keeps a paragraph that directly follows \\label or a comment line", () => {
    const afterLabel = findBlock(document, "follows a label without a blank line");
    assert.equal(afterLabel.kind, "paragraph");
    assert.equal(afterLabel.hidden, false);
    assert.ok(!afterLabel.raw.includes("\\label"));
    const afterComment = findBlock(document, "starts right after a comment line");
    assert.equal(afterComment.kind, "paragraph");
    assert.equal(afterComment.hidden, false);
    assert.doesNotMatch(afterComment.display, /comment glued/);
  });

  it("splits a heading that starts a line even without a blank line above it", () => {
    const heading = document.blocks.find((block) => block.kind === "heading" && block.display === "Motivation");
    assert.ok(heading, "the subsection is its own heading block");
    const previous = findBlock(document, "It has a second line.");
    assert.ok(!previous.raw.includes("\\subsection"));
    const body = findBlock(document, "Motivation text directly under");
    assert.equal(body.kind, "paragraph");
    const paragraphHeading = document.blocks.find((block) => block.kind === "paragraph-heading");
    assert.equal(paragraphHeading.display, "Limitations.");
  });

  it("renders every list item as its own visible block", () => {
    const items = document.blocks.filter((block) => block.role === "list-item");
    assert.equal(items.length, 4);
    assert.deepEqual(items.map((block) => block.display), [
      "• the first contribution, with emphasis;",
      "• the second contribution.",
      "• Step one.",
      "• Step two.",
    ]);
    for (const item of items) {
      assert.equal(item.kind, "paragraph");
      assert.equal(item.hidden, false);
    }
    assert.equal(findBlock(document, "We make two contributions:").display, "We make two contributions:");
    assert.equal(findBlock(document, "Text right after the list.").display, "Text right after the list.");
  });

  it("shows prose inside an environment it has no special view for", () => {
    const theorem = findBlock(document, "Every sparse thing is sparse.");
    assert.equal(theorem.hidden, false);
    assert.match(theorem.display, /Every sparse thing is sparse\./);
  });

  it("writes an edit back to exactly the edited construct", async () => {
    const edits = [
      ["We study sparse things", "sparse things and find", "SPARSE THINGS and find"],
      ["follows a label without a blank line", "follows a label", "comes after a label"],
      ["Motivation text directly under", "Motivation text", "Motivating text"],
      ["the first contribution", "first contribution", "1st contribution"],
      ["Step two.", "Step two", "Step 2"],
      ["Text right after the list.", "after the list", "below the list"],
      ["Every sparse thing is sparse.", "Every sparse", "Each sparse"],
      ["None that we know of.", "None that", "Nothing that"],
    ];
    let expected = (await fs.readFile(path.join(project.root, "main.tex"), "utf8"));
    for (const [needle, from, to] of edits) {
      const current = await getDocument(server, "main.tex");
      const block = findBlock(current, needle);
      assert.ok(block.raw.includes(from), `${needle}: block does not contain ${from}`);
      await saveBlock(server, current, block, block.raw.replace(from, to));
      assert.equal(expected.split(from).length, 2, `${from} must be unique in the fixture`);
      expected = expected.replace(from, to);
      assert.equal(await fs.readFile(path.join(project.root, "main.tex"), "utf8"), expected, `edit of ${JSON.stringify(needle)} changed something else`);
    }
    const heading = (await getDocument(server, "main.tex")).blocks.find((block) => block.display === "Motivation");
    const current = await getDocument(server, "main.tex");
    await saveBlock(server, current, heading, heading.raw.replace("Motivation", "Why"));
    expected = expected.replace("\\subsection{Motivation}", "\\subsection{Why}");
    assert.equal(await fs.readFile(path.join(project.root, "main.tex"), "utf8"), expected);
  });
});

describe("bundled sample paper", () => {
  let server;
  before(async () => {
    const project = await makeProject();
    server = await startServer(project.root);
  });
  after(cleanupAll);

  it("shows the abstract, every paragraph, the list, the equation and the table", async () => {
    const main = await getDocument(server, "main.tex");
    assert.deepEqual(visible(main).map((block) => block.role), ["abstract"]);
    assert.match(visible(main)[0].display, /^Urban songbirds are widely reported/);

    const introduction = await getDocument(server, "sections/01_introduction.tex");
    const kinds = visible(introduction).map((block) => block.role || block.kind);
    assert.deepEqual(kinds, ["heading", "paragraph", "paragraph", "paragraph", "list-item", "list-item", "list-item", "paragraph"]);

    const related = await getDocument(server, "sections/02_related_work.tex");
    assert.equal(related.blocks.filter((block) => block.kind === "paragraph-heading").length, 3);

    const method = await getDocument(server, "sections/03_method.tex");
    const equation = method.blocks.find((block) => block.kind === "math");
    assert.match(equation.semantic.latex, /\\beta_L \\log_\{10\} L_i/);
    assert.equal(equation.semantic.label, "eq:model");

    const results = await getDocument(server, "sections/04_results.tex");
    const table = results.blocks.find((block) => block.semantic?.artifactType === "table");
    assert.ok(table, "the \\input table is shown inline");
    assert.equal(table.hidden, false);
    assert.equal(table.semantic.sourcePath, "tables/estimates.tex");
    assert.equal(table.semantic.rows.length, 5);
    assert.deepEqual(table.semantic.rows[0], ["Term", "Estimate", "95% CI", "p"]);

    // Every line of prose in every section file is visible somewhere.
    for (const file of ["01_introduction", "02_related_work", "03_method", "04_results", "05_discussion"]) {
      const document = await getDocument(server, `sections/${file}.tex`);
      const hiddenProse = document.blocks.filter((block) => block.hidden && /[A-Za-z]{4,} [a-z]{3,} [a-z]{3,}/.test(block.raw.replace(/%.*$/gm, "")));
      assert.deepEqual(hiddenProse.map((block) => block.raw), [], `${file} hides prose`);
    }
  });

  it("builds the outline and the structure across \\input files", async () => {
    const outline = await apiOk(server, "/api/outline");
    assert.deepEqual(outline.items.filter((item) => item.level === 1).map((item) => item.title),
      ["Abstract", "Introduction", "Related Work", "Method", "Results", "Discussion"]);
    const structure = await apiOk(server, "/api/structure");
    assert.deepEqual(structure.sections.map((section) => section.title), ["Introduction", "Related Work", "Method", "Results", "Discussion"]);
    for (const section of structure.sections) assert.ok(section.characterCount > 500, `${section.title} has no source text`);
    const results = structure.sections.find((section) => section.title === "Results");
    assert.ok(results.sources.some((source) => source.path === "tables/estimates.tex"));
    const discussion = structure.sections.find((section) => section.title === "Discussion");
    assert.ok(!discussion.sources.some((source) => /bibliography|end\{document\}/.test(source.text)));
  });
});

describe("structure with other layouts", () => {
  after(cleanupAll);

  it("follows \\input into chapters/ (no directory named sections)", async () => {
    const project = await makeProject({
      files: {
        "main.tex": "\\documentclass{article}\n\\begin{document}\n\\section{Introduction}\nIntro text in the main file, long enough to count.\n\n\\input{chapters/method}\n\\include{chapters/results}\n\\end{document}\n",
        "chapters/method.tex": "\\section{Method}\nMethod text lives in the chapters directory.\n\n\\subsection{Details}\nDetail text.\n",
        "chapters/results.tex": "\\section{Results}\nResult text lives there too.\n",
      },
    });
    const server = await startServer(project.root);
    const structure = await apiOk(server, "/api/structure");
    assert.deepEqual(structure.sections.map((section) => section.title), ["Introduction", "Method", "Results"]);
    const method = structure.sections.find((section) => section.title === "Method");
    assert.deepEqual(method.sources.map((source) => source.path), ["chapters/method.tex"]);
    assert.match(method.sources[0].text, /Method text lives in the chapters directory/);
    assert.equal(method.nodes[0].children[0].title, "Details");
    const introduction = structure.sections.find((section) => section.title === "Introduction");
    assert.deepEqual(introduction.sources.map((source) => source.path), ["main.tex"]);
    assert.match(introduction.sources[0].text, /Intro text in the main file/);
  });

  it("gives a single-file paper sections with source text", async () => {
    const project = await makeProject({ files: { "main.tex": singleFile, "refs.bib": "" } });
    const server = await startServer(project.root);
    const structure = await apiOk(server, "/api/structure");
    assert.deepEqual(structure.sections.map((section) => section.title), ["Introduction"]);
    const [introduction] = structure.sections;
    assert.ok(introduction.characterCount > 300);
    const text = introduction.sources.map((source) => source.text).join("");
    assert.match(text, /None that we know of/);
    assert.doesNotMatch(text, /bibliographystyle|after the end of the document/);
  });
});

describe("headings with an optional short title", () => {
  after(cleanupAll);
  const source = String.raw`\documentclass{article}
\begin{document}
\section[Short intro]{A Rather Long Introduction Title}
First paragraph.
\subsection*[Bg]{Background and \emph{Context}}
Second paragraph.
\section [Spaced] {Methods}
Third paragraph.
\paragraph[Tiny]{Run-in heading} Text after the run-in heading.
\end{document}
`;

  it("classifies, displays, outlines and edits \\section[short]{long}", async () => {
    const project = await makeProject({ files: { "main.tex": source } });
    const server = await startServer(project.root);
    const document = await getDocument(server, "main.tex");
    const headings = document.blocks.filter((block) => block.kind === "heading");
    assert.deepEqual(headings.map((block) => block.display), ["A Rather Long Introduction Title", "Background and Context", "Methods"]);
    assert.deepEqual(headings.map((block) => block.raw.trim()), [
      "\\section[Short intro]{A Rather Long Introduction Title}",
      "\\subsection*[Bg]{Background and \\emph{Context}}",
      "\\section [Spaced] {Methods}",
    ], "the heading is split from the paragraph below it");
    const runIn = document.blocks.find((block) => block.kind === "paragraph-heading");
    assert.equal(runIn.display, "Run-in heading");
    for (const text of ["First paragraph.", "Second paragraph.", "Third paragraph."]) {
      assert.ok(document.blocks.some((block) => block.kind === "paragraph" && block.display.trim() === text), text);
    }

    const outline = await apiOk(server, "/api/outline");
    assert.deepEqual(outline.items.map((item) => [item.level, item.number, item.title]), [
      [1, "1", "A Rather Long Introduction Title"],
      [2, "", "Background and Context"],
      [1, "2", "Methods"],
    ]);
    const structure = await apiOk(server, "/api/structure");
    assert.deepEqual(structure.sections.map((section) => section.title), ["A Rather Long Introduction Title", "Methods"]);

    // Editing the visible title leaves the short title alone.
    await saveBlock(server, document, headings[0], headings[0].raw.replace("A Rather Long Introduction Title", "Introduction"));
    assert.equal(await fs.readFile(path.join(project.root, "main.tex"), "utf8"), source.replace("A Rather Long Introduction Title", "Introduction"));
  });
});

describe("front matter (\\title, \\author, \\date)", () => {
  after(cleanupAll);

  it("exposes title, authors and date at exact source offsets without changing the blocks", async () => {
    const source = String.raw`\documentclass{article}
% \title{An Old Title That Was Commented Out}
\title[Short]{Sparse \emph{Things}:\\ A Study\thanks{Funded by nobody.}}
\author{A.~Author\thanks{Corresponding.} \\ University of Somewhere \and B. Coauthor \and
  C. Third}
\date{March 2031}
\begin{document}
\maketitle
\section{Introduction}
Body text.
\end{document}
`;
    const project = await makeProject({ files: { "main.tex": source } });
    const server = await startServer(project.root);
    const document = await getDocument(server, "main.tex");
    const front = document.frontMatter;
    assert.ok(front, "a file with \\title has front matter");
    assert.equal(front.title.text, "Sparse Things: A Study");
    assert.equal(document.source.slice(front.title.start, front.title.end), String.raw`Sparse \emph{Things}:\\ A Study\thanks{Funded by nobody.}`);
    assert.deepEqual(front.authors.map((author) => author.text), ["A. Author", "B. Coauthor", "C. Third"]);
    assert.deepEqual(front.authors.map((author) => document.source.slice(author.start, author.end)), [
      String.raw`A.~Author\thanks{Corresponding.} \\ University of Somewhere`,
      "B. Coauthor",
      "C. Third",
    ]);
    assert.equal(front.date.text, "March 2031");
    assert.equal(document.source.slice(front.date.start, front.date.end), "March 2031");

    // The title block is presentation only: the preamble stays hidden structure
    // and the blocks still tile the source exactly.
    const shown = visible(document).map((block) => block.display).join("\n");
    assert.ok(!shown.includes("Sparse") && !shown.includes("Coauthor"));
    for (const block of document.blocks) assert.equal(document.source.slice(block.start, block.end), block.raw);
  });

  it("omits an empty \\date and \\today, and is null for a file without \\title", async () => {
    const project = await makeProject({
      files: {
        "main.tex": String.raw`\documentclass{article}
\title{Only a Title}
\date{}
\begin{document}
\maketitle
\input{sections/intro}
\end{document}
`,
        "sections/intro.tex": "\\section{Intro}\nText about \\\\title{not a title} in prose.\n",
      },
    });
    const server = await startServer(project.root);
    const main = await getDocument(server, "main.tex");
    assert.equal(main.frontMatter.title.text, "Only a Title");
    assert.deepEqual(main.frontMatter.authors, []);
    assert.equal(main.frontMatter.date, null);
    const today = await makeProject({ files: { "main.tex": "\\documentclass{article}\n\\title{T}\n\\date{\\today}\n\\begin{document}\nHi.\n\\end{document}\n" } });
    const todayServer = await startServer(today.root);
    assert.equal((await getDocument(todayServer, "main.tex")).frontMatter.date, null);
    const section = await getDocument(server, "sections/intro.tex");
    assert.equal(section.frontMatter ?? null, null);
  });
});
