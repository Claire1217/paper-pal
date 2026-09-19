# LaTeX conventions

Paper Pal does not run TeX to show your text. It reads the `.tex` source with
its own small parser, cuts it into blocks, and shows each block as prose. Every
block keeps its exact character range in the file. An edit or an accepted
proposal replaces only that range, so your preamble, macros, comments and
line breaks elsewhere stay as they are.

The parser is pragmatic, not a TeX implementation. This page says what it
understands, what it hides, and where it gives up.

## Files

- The entry point is `defaultDocument` in `.paper-pal.json` (usually
  `main.tex`).
- `\input{file}`, `\include{file}`, `\subfile{file}`, `\import{dir/}{file}` and
  `\subimport{dir/}{file}` (also `\inputfrom`, `\subinputfrom`, `\includefrom`,
  `\subincludefrom`) are followed, with or without the `.tex` extension, into
  any folder inside `sourceRoot`. The outline and the structure view are
  compiled across these files. An include that is commented out, inside
  `\iffalse ... \fi`, or inside a `comment` or verbatim environment is ignored.
  A file that includes itself, directly or in a circle, is read once.
- An include that cannot be followed (the file is missing, or it lies outside
  `sourceRoot`) is shown as a read-only note, "Included file not found", with
  the path as written. Files outside `sourceRoot` are never read.
- The file list shows every `.tex` file under `sourceRoot`, whether it is
  included or not. Hide files with `ui.hiddenDocuments`.
- An `\input` of a file that contains only a table or a figure is shown inline
  as that table or figure.
- Symbolic links that point outside `sourceRoot` are not followed.
- Files changed by another program (your editor, git, a co-author's sync) are
  picked up within about two seconds.
- Files are read and written as UTF-8. A byte-order mark, CRLF line endings, a
  missing final newline and very long lines are fine; an edit leaves the line
  endings of the rest of the file as they were: only the bytes of the edited
  passage change (no Unicode normalisation, no tab or newline clean-up). CJK
  text is ordinary prose (`ctex`, `xeCJK` and `CJK` preambles and environments
  are hidden).
- A file that is not valid UTF-8 (Latin-1, Windows-1252) is opened read-only.
  It is shown with `�` marks in place of the bytes that could not be read,
  a notice names the line, and Paper Pal never writes it: edits, comments,
  Accept, linked change sets, Undo and structure reverts are refused for it.
  The other files of the project work as usual. Convert the file to edit it:
  `iconv -f latin1 -t utf-8 file.tex > file.utf8.tex`, then replace the
  original and change `\usepackage[latin1]{inputenc}` to `[utf8]`.

## What becomes a block

Blocks are separated by blank lines. A new block also starts at any line that
begins with a heading command, `\item`, `\begin` or `\end` of a wrapper
environment (see below) or of `document`, or one of `\input`, `\include`,
`\subfile`, `\import`, `\subimport`, `\maketitle`, `\tableofcontents`,
`\bibliography`, `\bibliographystyle`, `\printbibliography`, `\appendix`.

| Source | Shown as | Editable in the page |
|---|---|---|
| `\section`, `\subsection`, `\subsubsection`, with `*`, with an optional short title `\section[Short]{Long}` | Heading. Only the long title is shown and edited; the short title stays untouched. A `\label` inside the title is hidden. | Yes (title text) |
| `\paragraph{...}`, `\subparagraph{...}` | Run-in heading | Yes |
| Ordinary text between blank lines | Paragraph | Yes |
| `\begin{abstract} ... \end{abstract}` | Abstract paragraphs; the outline gets an "Abstract" entry. | Yes |
| `\item ...` inside `itemize`, `enumerate`, `description` | One block per item. Enumerated items are numbered, a nested list is indented, `\item[Term]` shows the term in bold. | Yes |
| `theorem`, `lemma`, `proposition`, `corollary`, `definition`, `proof`, `remark`, `example`, `claim`, `conjecture`, `assumption` and similar names (also `thm`, `lem`, `prop`, `cor`, `defn`, `rem`), and every environment declared with `\newtheorem` in the same file | The prose inside, parsed as usual (paragraphs, math, lists), with a small label such as "Theorem 2 (Name)" in front. The number comes from the `.aux` file when the environment has a `\label`. | Yes |
| `quote`, `quotation`, `verse`, `center` | Indented or centred prose | Yes |
| `\keywords{...}`, `\begin{keywords}`, `\begin{IEEEkeywords}` | A "Keywords" line | Yes |
| `acks`, `acknowledgments` (and spellings of it) | Labelled prose | Yes |
| `equation`, `align`, `alignat`, `flalign`, `gather`, `multline`, `eqnarray` (and starred forms), `displaymath`, `\[ ... \]`; `split`, `cases`, matrices and `\tag`, `\nonumber` inside them; equations inside `subequations` | Display math rendered with KaTeX. `\label` is removed before rendering; `multline` is set like `gather`, `eqnarray` as a three-column array. | Read-only |
| `$...$`, `\(...\)`, `$$...$$`, `\ensuremath{...}` inside text | Math rendered with KaTeX | As part of the paragraph source |
| `table`, `table*`, `longtable`, or a bare `tabular`, `tabular*`, `tabularx` | Table with its caption (`booktabs` rules, `\hline`, `\multicolumn`, `\multirow`) | Read-only; the caption can be commented on |
| `figure`, `figure*`, `teaserfigure`, `wrapfigure`, or a bare `\includegraphics` | Figure with its caption. Several `\includegraphics` (subfigures) are shown side by side, each with its own caption. `png jpg jpeg gif webp svg` are shown directly; a `.pdf` figure needs `pdftoppm` (poppler) or macOS `sips` for the inline preview and opens on click either way. | Read-only |
| `tikzpicture`, `pgfpicture`, or a figure without an image file | A note that the figure is rendered by LaTeX, with a link to the compiled PDF | Read-only |
| `verbatim`, `Verbatim`, `lstlisting`, `minted` | Code block, exactly as written (language and `caption=` are shown). Nothing inside is read as LaTeX. | Read-only |
| `algorithm`, `algorithmic` (`algpseudocode`, `algorithmic`, `algorithm2e` names) | Pseudo-code: indented lines, bold keywords, typeset math, the caption as title | Read-only |
| `thebibliography` with `\bibitem` | Reference list. `\cite` of such an entry shows its number, `[3]`. | Read-only |
| Other environments that contain prose (`tcolorbox`, `minipage`, a theorem-like environment declared in another file, ...) | Paragraph, without a label. A `[key=value]` option list after `\begin{...}` is hidden. | Yes |
| `\title`, `\author` (split at `\and`, or one `\author` per person), `\date` | Read-only title block above the text. `\thanks`, footnotes, `\inst`, `\orcidID`, affiliations and e-mail addresses are left out; `\date{\today}` is not shown. | No |

Inside a paragraph:

- `\emph`, `\textit`, `\textsl` are italic, `\textbf` bold, `\texttt` and
  `\verb|...|`, `\lstinline` monospace, `\textsc` small capitals, `\underline`
  underlined, `\textsuperscript` and `\textsubscript` raised and lowered;
  `{\itshape ...}`, `{\bfseries ...}`, `{\em ...}` style their group. Styles
  nest. `\textrm`, `\textsf`, `\mbox`, `\text`, `\textcolor{c}{...}`,
  `\colorbox`, `\fbox`, `\makebox`, `\parbox`, `\raisebox`, `\scalebox`,
  `\resizebox` show their text.
- `\footnote{...}`, `\footnotetext`, `\marginpar`, `\thanks` are shown in
  place, smaller, in square brackets. The text stays editable.
- `\url{...}` shows the address as written (`%`, `#`, `_`, `~` included);
  `\href{url}{text}` shows the text.
- `\todo{...}` is shown as `[TODO: ...]`, `\hl{...}` highlighted.
- `~` becomes a space, `\\` and `\newline` a line break, `--` and `---` an en
  and an em dash, ` `` ` and `''` curly quotes, `\,` `\;` `\ ` a space, `\%`,
  `\&`, `\_`, `\#`, `\$`, `\{`, `\}` the character, `\ldots` and `\dots` an
  ellipsis, `\S`, `\P`, `\dag`, `\copyright`, `\pounds`, `\texteuro`,
  `\LaTeX`, `\TeX` their symbol.
- Accents and letters: `\'e`, `` \`a ``, `\^o`, `\"u`, `\~n`, `\=a`, `\.z`,
  `\c{c}`, `\v{s}`, `\u{g}`, `\H{o}`, `\r{a}`, `\k{a}`, `\d{t}`, `\b{b}`, with
  or without braces, and `\ss`, `\o`, `\O`, `\ae`, `\AE`, `\oe`, `\OE`, `\aa`,
  `\AA`, `\l`, `\L`, `\i`, `\j`.
- `\cite`, `\citep`, `\citet`, `\citealp`, `\citealt`, `\citeauthor`,
  `\citeyear`, `\citeyearpar`, `\textcite`, `\parencite`, `\autocite`,
  `\footcite`, `\supercite`, `\fullcite`, `\onlinecite` (capitalised and
  starred forms too, several keys, optional notes as in
  `\citep[see][p.~5]{key}`) are shown as author and year when known, otherwise
  as the key. A click shows title, authors, venue, abstract and link from the
  `.bib` entry. Every `.bib` file next to the main file or under `sourceRoot`
  is read. Author and year labels come from the `.aux` file, so they appear
  after the first compile with a natbib-style bibliography. Only `http(s)`
  URLs are passed to the page.
- `\ref`, `\eqref`, `\autoref`, `\cref`, `\Cref`, `\vref`, `\pageref`,
  `\nameref`, `\subref` (several keys allowed) show the number, or the page,
  from the `.aux` file (including the `.aux` files of `\include`d chapters),
  or `?` before the first compile. The kind of target is guessed from the
  label prefix: `fig:`, `tab:`, `eq:`, `sec:`, `app:`, `thm:`, `lem:`, `prop:`,
  `cor:`, `def:`, `alg:`, `lst:`.
- `\label`, size and font switches, `\vspace`, `\hspace`, `\vskip`,
  `\noindent`, `\centering`, `\medskip`, `\newpage`, `\clearpage`, `\hfill`
  and similar layout commands are hidden, wherever they stand. The text that
  follows them on the same line is shown.
- **Your macros.** Definitions are collected from the main file and from every
  file it includes (a `macros.tex`, a local `.sty` or `.cls` named by
  `\usepackage` or `\documentclass`), plus the file being shown:
  `\newcommand`, `\renewcommand`, `\providecommand`, `\DeclareRobustCommand`
  (with `[n]` and an optional default), `\def\name#1#2{...}`,
  `\DeclareMathOperator`, and `\NewDocumentCommand` with `m`, `o`, `O{...}`
  arguments. In prose a macro is expanded **for display only**: the source is
  never rewritten. The text of an argument stays editable in place; a macro
  without arguments, and one whose body contains math, is one read-only unit.
  In math the definitions are handed to KaTeX, so `$\norm{x}$` renders.
- A command the parser does not know: with arguments, the text of the
  arguments is shown and the name is not; without arguments, the command is
  shown as it is written, in grey monospace (`\projectname`). It is never
  shown as a bare word.
- `% comments` are hidden (`\%` is a per cent sign). A comment line in the
  middle of a paragraph does not split the paragraph. Braces inside a comment
  are ignored. `\iffalse ... \fi` and `\begin{comment} ... \end{comment}` are
  hidden, including any headings and `\input` lines inside them.

## What is hidden

These stay in the file, untouched, and are not shown as text:

- everything before `\begin{document}` and after `\end{document}`;
- `\maketitle`, `\tableofcontents`, `\appendix`, `\clearpage`, `\newpage`;
- `\bibliography`, `\bibliographystyle`, `\printbibliography`,
  `\addbibresource`;
- `\input`, `\include`, `\subfile`, `\import`, `\subimport` lines that could
  be followed;
- lines that hold only a comment, a `\label`, or layout commands;
- the `\begin` and `\end` lines of wrapper environments;
- `comment`, `filecontents` and `CCSXML` environments, `\iffalse ... \fi`;
- front-matter commands that stand in the body in some classes: `\title`,
  `\author`, `\affiliation`, `\email`, `\institute`, `\orcid`, `\ccsdesc`,
  `\received`, `\pacs`, `\IEEEauthorblockA`, `\icmltitle`, `\icmlauthor`,
  `\icmlaffiliation`, `\acmConference` and the like;
- definitions in the body: `\newcommand`, `\def`, `\newtheorem`,
  `\setlength`, `\setcounter`, `\hypersetup`, ...

`\appendix` (or `\begin{appendices}`) switches the section numbers of the
outline to letters. `\section*` has no number.

## Document classes

Typical preambles and title blocks of `article`, `IEEEtran`, `acmart`,
`llncs`, `revtex4-2`, the ICML and NeurIPS style files, and `ctexart` /
`xeCJK` are covered by tests: nothing of them shows up as prose. The title
block is built from `\title` and `\author`; for the ICML style from
`\icmltitle` and `\icmlauthor`. A class with other commands simply has no
title block. `beamer` is out of scope: frames are shown as plain paragraphs.
`report`, `book` and thesis classes work, but `\chapter` and `\part` are shown
as plain text and do not enter the outline.

## Known limitations

- KaTeX covers most of amsmath but not everything (`\sideset`, `\intertext`,
  some packages' symbols). A formula it cannot render is shown as tidy
  monospace LaTeX source; the compiled PDF shows it typeset.
- Macros are collected with a simple reader. `\let`, `\csname`, `xparse`
  signatures beyond `m`, `o`, `O{}`, conditionals inside a macro body and
  macros that a package or a class outside the project defines are not
  expanded; they fall under "a command the parser does not know". A macro
  with an optional argument used in math is rewritten to a plain two-argument
  form for KaTeX.
- A theorem-like environment is labelled when its name is one of the usual
  ones or is declared with `\newtheorem` **in the same file**. One that is
  declared only in another file (say, in `main.tex`, and used in
  `sections/method.tex`) is still shown and editable, without its label.
  This keeps the blocks of a file independent of the rest of the project.
- Reference numbers, theorem numbers and author-year labels need a compiled
  `.aux` file in `latex.cwd`. Without a compile they show as `?` and as
  citation keys. Footnotes are not numbered.
- Tables are rendered from `tabular` in a simplified way. Nested tables,
  column-spec tricks, `\multirow` with negative spans and `longtable` page
  headers may look different from the PDF. Tables, figures, code, pseudo-code
  and a `thebibliography` are read-only in the page. You can still comment on
  them, and edit them in your own editor.
- Conditionals other than `\iffalse` (`\ifdefined`, `\ifthenelse`, `\if...`
  flags) are not evaluated: both branches are shown. Catcode changes are not
  interpreted. `\lstinputlisting` and `\inputminted` show nothing.
- Block boundaries follow blank lines. Two paragraphs separated only by
  `\par` are one block. A `$$ ... $$` or an environment not listed above that
  contains a blank line is split at it.
- `\\` and `\newline` are line breaks in a paragraph but not in a heading or
  a caption.
- One main document per project. `standalone` and multi-document repositories
  are not modelled; a `subfiles` child is read as part of the main document.
- Source files are read and written as UTF-8. A file in another encoding
  (`latin1`) shows `�` for its non-ASCII characters and is read-only; see
  "Files".

If the parser hides prose that should be visible, shows source as prose, or an
edit changes more than the edited construct, that is a bug. Please report it
with a minimal `.tex` snippet that does not contain your unpublished text.
`tests/fixtures/realworld/` is the manuscript these rules are tested against.

## Optional macros Paper Pal recognises

Nothing here is required. Paper Pal never adds these macros to your files.

### Tracked changes: `\chadd` and `\chdel`

If your source contains `\chadd{new text}` and `\chdel{old text}`, for example
from a co-author who marks edits by hand, Paper Pal shows additions in green
and deletions in red struck through. Adjacent macros separated only by white
space form one change group with an Accept and a Reject button:

| Button | `\chadd{X}` becomes | `\chdel{Y}` becomes |
|---|---|---|
| Accept | `X` | nothing |
| Reject | nothing | `Y` |

Resolving a group rewrites only that part of the paragraph, tidies the
surrounding spaces, and can be undone. Arguments may contain nested braces.

Your document must define the two macros, or it will not compile. Add this to
the preamble. It needs only `xcolor`:

```latex
\usepackage{xcolor}
\providecommand{\chadd}[1]{\textcolor{green!45!black}{#1}}
\providecommand{\chdel}[1]{\textcolor{red!70!black}{#1}}
```

For the final version, make additions plain and deletions vanish:

```latex
\providecommand{\chadd}[1]{#1}
\providecommand{\chdel}[1]{}
```

If you have the `ulem` package, `\usepackage[normalem]{ulem}` and
`\textcolor{red!70!black}{\sout{#1}}` give struck-through deletions in the PDF.
(That variant was not test-compiled for this page; the two above were, with
`latexmk -pdf` and TeX Live.)

Paper Pal's own proposals do not use these macros. A proposal lives in
`.paper-pal/` until you accept it, and then the accepted text replaces the old
text directly.

### Wrapper environments: `approvedcontent` and `draftcontent`

Some authors wrap finished and unfinished parts of a manuscript in marker
environments. Paper Pal treats `approvedcontent` and `draftcontent` as
transparent wrappers: the `\begin{...}` and `\end{...}` lines are hidden and
the text inside is parsed as normal paragraphs, headings and lists.

They have **no effect on review status** in Paper Pal. Which text counts as
confirmed is stored in `.paper-pal/state.json` when you confirm a passage in
the page, or set per file with `approvedDocuments` in `.paper-pal.json`.

Definitions that change nothing in the PDF:

```latex
\newenvironment{approvedcontent}{}{}
\newenvironment{draftcontent}{}{}
```

Put `\begin{...}` and `\end{...}` on lines of their own. A blank line around them
is not needed.
