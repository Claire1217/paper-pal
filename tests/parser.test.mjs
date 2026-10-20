import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { apiOk, cleanupAll, commentOn, getDocument, makeProject, saveBlock, startServer, waitForRequest } from "./helpers.mjs";

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

describe("comments and rule arguments inside floats", () => {
  const floats = String.raw`\documentclass{article}
\usepackage{booktabs,colortbl,graphicx}
\begin{document}
\begin{table}
% \caption{Old table caption}
\caption{Live table caption}
%\label{tab:old}
\label{tab:live}
\begin{tabular}{lll}
\toprule[1.5pt]
\rowcolor{gray!20} Name & Count & Note \\
\midrule[0.8pt]
% Dropped & 0 & row \\
Kept & 1 & \cellcolor{red!10}fine % trailing & comment
\\
\cmidrule(lr){2-3}
\specialrule{.1em}{.05em}{.05em}
Last & 2 & done \\
\bottomrule[1.5pt]
\end{tabular}
\end{table}

\begin{table}
\begin{tabular}{lll}
\arrayrulecolor{gray}\Xhline{1pt}
% \multicolumn{2}{c}{Old span} \\
New & cell & one \\
\hhline{|=|=|=|}
% \multirow{2}{*}{OldRow} & q \\
\multicolumn{2}{c}{Live span} & two \\
\cmidrule{1-2}\morecmidrules\cmidrule{1-2}
\quad Indented & x & three \\
\end{tabular}
\end{table}

\begin{table}
\begin{subtable}{0.45\linewidth}
\caption{Left part}
\begin{tabular}{ll}
a & b \\
\end{tabular}
\end{subtable}
\caption{Whole table}
\end{table}

\begin{figure}
\centering
%\label{fig:old}
% \caption{Old figure caption}
\includegraphics{missing}
\caption{Live figure caption}
\label{fig:live}
\end{figure}

\begin{equation}
% \label{eq:old}
x = 1 \label{eq:live}
\end{equation}

\begin{theorem}
% \label{thm:old}
\label{thm:live}
Every kept row is kept.
\end{theorem}

See Table~\ref{tab:live}, Figure~\ref{fig:live} and Eq.~\eqref{eq:live}.
\end{document}
`;
  const aux = String.raw`\relax
\newlabel{tab:old}{{9}{1}}
\newlabel{tab:live}{{1}{1}}
\newlabel{fig:old}{{8}{1}}
\newlabel{fig:live}{{1}{1}}
\newlabel{eq:old}{{7}{1}}
\newlabel{eq:live}{{1}{1}}
\newlabel{thm:old}{{6}{1}}
\newlabel{thm:live}{{1}{1}}
`;
  let project;
  let server;
  let document;

  before(async () => {
    project = await makeProject({ files: { "main.tex": floats, "main.aux": aux }, fakeAgent: true });
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

  it("splits table rows and cells outside comments and drops rule and colour arguments", () => {
    const table = document.blocks.find((block) => block.kind === "table");
    assert.deepEqual(table.semantic.rows, [
      ["Name", "Count", "Note"],
      ["Kept", "1", "fine"],
      ["Last", "2", "done"],
    ]);
    assert.equal(table.semantic.headerRows, 1);
  });

  it("does not take a span from a commented-out row and drops more rule commands", () => {
    const table = document.blocks.filter((block) => block.kind === "table")[1];
    assert.deepEqual(table.semantic.rows, [
      ["New", "cell", "one"],
      ["Live span", "two"],
      ["Indented", "x", "three"],
    ]);
    assert.deepEqual(table.semantic.formattedRows.map((row) => row.map((cell) => cell.colspan)), [[1, 1, 1], [2, 1], [1, 1, 1]]);
    assert.deepEqual(table.semantic.formattedRows.flat().map((cell) => cell.rowspan), [1, 1, 1, 1, 1, 1, 1, 1]);
  });

  it("takes a table's own caption, not its subtable's", () => {
    const table = document.blocks.filter((block) => block.kind === "table")[2];
    assert.equal(table.semantic.caption, "Whole table");
    assert.equal(document.source.slice(table.semantic.captionSource.absoluteStart, table.semantic.captionSource.absoluteEnd), "Whole table");
  });

  it("uses the live \\caption and \\label, not the commented-out ones", () => {
    const table = document.blocks.find((block) => block.kind === "table");
    assert.equal(table.semantic.caption, "Live table caption");
    assert.equal(table.semantic.label, "tab:live");
    assert.equal(table.semantic.number, "1");
    assert.equal(document.source.slice(table.semantic.captionSource.absoluteStart, table.semantic.captionSource.absoluteEnd), "Live table caption");
    const figure = document.blocks.find((block) => block.kind === "figure");
    assert.equal(figure.semantic.caption, "Live figure caption");
    assert.equal(figure.semantic.label, "fig:live");
    assert.equal(figure.semantic.number, "1");
    const equation = document.blocks.find((block) => block.kind === "math");
    assert.equal(equation.semantic.label, "eq:live");
    assert.equal(equation.semantic.number, "1");
    const theorem = document.blocks.find((block) => block.raw.includes("Every kept row is kept."));
    assert.equal(theorem.environmentLabel, "thm:live");
    // A commented-out label is not a reference target either.
    assert.equal(document.references.labels.find((label) => label.key === "fig:old")?.blockId, undefined);
  });

  it("writes a caption edit into the live \\caption and an edited cell only into its row", async () => {
    const file = path.join(project.root, "main.tex");
    const table = document.blocks.find((block) => block.kind === "table");
    const created = await commentOn(server, "main.tex", table.raw, "Tighten the caption.");
    await apiOk(server, "/api/request/process", { method: "POST", body: { id: created.id } });
    const proposed = await waitForRequest(server, created.id, (request) => request.status === "proposed", "caption proposal");
    assert.equal(proposed.proposal.originalText, "Live table caption");
    await apiOk(server, "/api/request/accept", { method: "POST", body: { id: created.id } });
    let expected = floats.replace("\\caption{Live table caption}", "\\caption{LIVE TABLE CAPTION}");
    assert.equal(await fs.readFile(file, "utf8"), expected);

    const current = await getDocument(server, "main.tex");
    const edited = current.blocks.find((block) => block.kind === "table");
    await saveBlock(server, current, edited, edited.raw.replace("Last & 2", "Last & 3"));
    expected = expected.replace("Last & 2", "Last & 3");
    assert.equal(await fs.readFile(file, "utf8"), expected);
    const reloaded = (await getDocument(server, "main.tex")).blocks.find((block) => block.kind === "table");
    assert.deepEqual(reloaded.semantic.rows.at(-1), ["Last", "3", "done"]);
  });
});

describe("inline images, one-line definitions and escaped line breaks", () => {
  const source = String.raw`\documentclass{article}
\begin{document}
\section{The \texorpdfstring{$\alpha$}{alpha} case}

First line\\$x+1$ is math.

\section{Results\\}
A paragraph below a heading that ends in a line break.

The logo below marks the link in
\includegraphics[height=1em]{icon.png} this hard-wrapped sentence.

\section{Code \verb|\\}| here}

Our code is online \raisebox{-0.2em}{\includegraphics[height=1em]{logo.png}} and more prose here.

\newcommand{\localmacro}{y}
A paragraph right below a one-line definition.

\newcommand{\splitdef}
  {bar baz}
Prose after a split definition.

\begin{minipage}{0.48\linewidth}\centering\scalebox{0.5}{\includegraphics{b.png}}\captionof{figure}{Accuracy of \textbf{\textsc{Ours}} versus $\frac{a}{b^{2}}$.}\end{minipage}

\begin{minipage}{\linewidth}
\begin{tabular}{ll}
a & b \\
\end{tabular}
\footnotesize Note: bold is best.
\end{minipage}

\begin{minipage}{0.3\linewidth}
\includegraphics{panel.png}\quad(a)
\end{minipage}

\begin{minipage}{\linewidth}
\begin{tabular}{ll}
c & d \\
\end{tabular} Source: own data.
\end{minipage}

\begin{figure}
\includegraphics{plot.png}
\caption{A plot.}
\label{fig:plot}
\end{figure}
\end{document}
`;
  let project;
  let server;
  let document;

  before(async () => {
    project = await makeProject({ files: { "main.tex": source } });
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

  it("reads math right after a \\\\ line break", () => {
    const block = findBlock(document, "First line");
    assert.ok(block.annotations.some((annotation) => annotation.type === "math" && annotation.latex === "x+1"));
    assert.doesNotMatch(block.display, /\$/);
  });

  it("shows only the first argument of \\texorpdfstring", () => {
    const heading = findBlock(document, "texorpdfstring");
    assert.equal(heading.kind, "heading");
    assert.equal(heading.display, "The \\alpha case");
  });

  it("ends a heading at a } that follows \\\\", async () => {
    const heading = findBlock(document, "\\section{Results");
    assert.equal(heading.kind, "heading");
    assert.equal(heading.display, "Results");
    assert.ok(!heading.raw.includes("A paragraph below"));
    assert.equal(findBlock(document, "A paragraph below a heading").kind, "paragraph");
    const outline = await apiOk(server, "/api/outline");
    assert.deepEqual(outline.items.map((item) => item.title).slice(1), ["Results", "Code \\\\} here"]);
  });

  it("keeps a sentence with an inline image as prose, and a float as a figure", () => {
    const block = findBlock(document, "Our code is online");
    assert.equal(block.kind, "paragraph");
    assert.equal(block.hidden, false);
    assert.match(block.display, /^Our code is online\s+and more prose here\.$/);
    // Also when the image happens to start a hard-wrapped line of the sentence.
    const wrapped = findBlock(document, "this hard-wrapped sentence");
    assert.equal(wrapped.kind, "paragraph");
    assert.match(wrapped.display, /marks the link in\s+this hard-wrapped sentence\.$/);
    assert.equal(findBlock(document, "\\begin{figure}").kind, "figure");
  });

  it("splits a one-line \\newcommand off the paragraph right below it", () => {
    const definition = findBlock(document, "\\newcommand{\\localmacro}");
    assert.equal(definition.kind, "structure");
    assert.ok(!definition.raw.includes("A paragraph right below"));
    const below = findBlock(document, "A paragraph right below");
    assert.equal(below.kind, "paragraph");
    assert.equal(below.hidden, false);
    // A definition whose body is on the next line is not cut in two.
    const split = findBlock(document, "\\newcommand{\\splitdef}");
    assert.ok(split.raw.includes("{bar baz}"));
    assert.ok(!visible(document).some((block) => block.display.includes("bar baz")));
  });

  it("keeps a picture with a caption, a panel label or a note read-only", () => {
    assert.equal(findBlock(document, "\\scalebox{0.5}").kind, "figure");
    assert.equal(findBlock(document, "Note: bold is best.").kind, "table");
    assert.equal(findBlock(document, "\\quad(a)").kind, "figure");
    assert.equal(findBlock(document, "Source: own data.").kind, "table");
  });

  it("writes an edit back to exactly the edited construct", async () => {
    const edits = [
      ["First line", "is math", "is a formula"],
      ["\\section{Results", "Results", "Findings"],
      ["A paragraph below a heading", "A paragraph below", "Text below"],
      ["Our code is online", "more prose here", "more text here"],
      ["A paragraph right below", "right below", "just below"],
    ];
    let expected = await fs.readFile(path.join(project.root, "main.tex"), "utf8");
    for (const [needle, from, to] of edits) {
      const current = await getDocument(server, "main.tex");
      const block = findBlock(current, needle);
      assert.equal(expected.split(from).length, 2, `${from} must be unique in the fixture`);
      await saveBlock(server, current, block, block.raw.replace(from, to));
      expected = expected.replace(from, to);
      assert.equal(await fs.readFile(path.join(project.root, "main.tex"), "utf8"), expected, `edit of ${JSON.stringify(needle)} changed something else`);
    }
  });
});

describe("user macros that pass an argument to another command", () => {
  const source = String.raw`\documentclass{article}
\newcommand{\figref}[1]{Figure~\ref{#1}}
\newcommand{\secref}[1]{Section~\ref{sec:#1}}
\newcommand{\citeA}[1]{\citet{#1}}
\newcommand{\pcite}[1]{\cite[p.~#1]{doe}}
\newcommand{\link}[2]{\href{#1}{#2}}
\newcommand{\mail}[1]{\href{mailto:#1}{#1}}
\newcommand{\lbl}[2]{\textbf{#2}\label{#1}}
\newcommand{\note}[1]{\textcolor{red}{#1}}
\newcommand{\twoarg}[2]{\textit{#1} and #2}
\newcommand{\paren}[1]{(#1)}
\newcommand{\dbl}[1]{\textbf{\dbl{#1}\dbl{#1}}}
\newcommand{\many}{\many\many\many\many}
\newcommand{\pA}[1]{\pB{#1}x}
\newcommand{\pB}[1]{\pA{#1}x}
\newcommand{\todo}[1]{\textcolor{red}{TODO: #1}}
\providecommand{\hl}[1]{X#1X}
\newcommand{\sq}[1]{[#1]}
\begin{document}
\section{Intro}\label{sec:intro}

See \figref{fig:a} and \secref{intro} here.

As \citeA{smith} says, and \pcite{5} too.

Visit \link{https://example.org}{our site} or write to \mail{a@b.c} now.

A \lbl{l:a}{bold words} and \note{red words} and \twoarg{first}{second} and \paren{term}.

Self \dbl{x} and \many{} and \pA{y} end.

Own \todo{check this} and \hl{marked} here.

Deep \sq{\sq{\sq{\sq{\sq{\sq{\sq{\sq{\sq{\sq{\sq{\sq{y}}}}}}}}}}}} end.

\begin{figure}\caption{A}\label{fig:a}\end{figure}
\end{document}
`;
  const bib = "@article{smith, author={Smith, John}, title={T}, year={2020}}\n@article{doe, author={Doe, Jane}, title={U}, year={2021}}\n";
  let document;

  before(async () => {
    const project = await makeProject({ files: { "main.tex": source, "refs.bib": bib } });
    const server = await startServer(project.root);
    document = await getDocument(server, "main.tex");
  });
  after(cleanupAll);

  // The source text that display character `index` of a block maps to.
  const sourceOf = (block, index) => block.raw.slice(block.displayStarts[index], block.displayEnds[index]);

  it("keeps \\ref and \\cite together with the argument a macro passes them", () => {
    const refs = findBlock(document, "\\figref{fig:a}");
    assert.match(refs.display, /^See Figure \S+ and Section \S+ here\.$/);
    assert.deepEqual(refs.annotations.filter((item) => item.type === "reference").map((item) => item.key), ["fig:a", "sec:intro"]);
    const cites = findBlock(document, "\\citeA{smith}");
    assert.equal(cites.display, "As Smith (2020) says, and (Doe, 2021, p. 5) too.");
    assert.deepEqual(cites.annotations.filter((item) => item.type === "citation").map((item) => item.keys), [["smith"], ["doe"]]);
    // Built from a key, so it maps to the whole call.
    const at = refs.display.indexOf("Figure");
    assert.equal(sourceOf(refs, at), "\\figref{fig:a}");
    assert.equal(sourceOf(refs, at + "Figure ".length), "\\figref{fig:a}");
  });

  it("shows the link text of an \\href macro, editable in place, and hides its address", () => {
    const block = findBlock(document, "\\link{");
    assert.equal(block.display, "Visit our site or write to a@b.c now.");
    for (const word of ["our site", "a@b.c"]) {
      const at = block.display.indexOf(word);
      for (let index = at; index < at + word.length; index += 1) assert.equal(sourceOf(block, index), block.display[index]);
    }
  });

  it("keeps each argument a macro shows mapped to its own source", () => {
    const block = findBlock(document, "\\lbl{");
    assert.equal(block.display, "A bold words and red words and first and second and (term).");
    for (const word of ["bold words", "red words", "first", "second", "term"]) {
      const at = block.display.indexOf(word);
      const sourceAt = block.raw.indexOf(`{${word}}`) + 1;
      for (let index = at; index < at + word.length; index += 1) {
        assert.equal(block.displayStarts[index], sourceAt + index - at, `${word} must map to its argument`);
      }
    }
    // The text the body adds maps to the whole call.
    assert.equal(sourceOf(block, block.display.indexOf(" and second")), "\\twoarg{first}{second}");
    assert.equal(sourceOf(block, block.display.indexOf("(")), "\\paren{term}");
  });

  it("shows a macro that calls itself like an unknown command", () => {
    const block = findBlock(document, "Self ");
    assert.match(block.display, /^Self x and \\many and y/);
    // Two macros that call each other stop at the depth limit.
    assert.ok(block.display.length < 60, block.display);
  });

  it("uses the author's own definition of a command Paper Pal also knows", () => {
    // \providecommand does not replace a package's \hl.
    assert.equal(findBlock(document, "Own ").display, "Own TODO: check this and marked here.");
  });

  it("counts only macro bodies, not arguments, toward the nesting limit", () => {
    assert.equal(findBlock(document, "Deep ").display, `Deep ${"[".repeat(12)}y${"]".repeat(12)} end.`);
  });
});
