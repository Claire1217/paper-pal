// Front-end logic from public/app.js, run in node:vm with small stubs in
// place of the DOM (see loadAppFunctions in helpers.mjs). Documents come from
// the real server where block ids and display mappings matter.
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import {
  apiOk, cleanupAll, commentOn, getDocument, loadAppFunctions, makeProject, saveBlock, startServer, stateDirectory, waitFor, waitForRequest,
} from "./helpers.mjs";

// Values made inside the vm context have that context's prototypes, which
// deepStrictEqual rejects; compare their JSON instead.
const plain = (value) => JSON.parse(JSON.stringify(value));
// Work the code schedules with setTimeout or after a promise runs whenever the
// machine gets to it; poll for its result with a deadline instead of waiting
// a fixed time, which is too short on a loaded CI runner.
const until = (check, label) => waitFor(() => check(), { timeoutMs: 10_000, intervalMs: 1, label });

const SAVE_MAPPING = [
  "DIFF_CORE_TOKEN_LIMIT",
  "tokenizeDiffText",
  "compactDiffOperations",
  "diffTextOperations",
  "rawTextForDisplayEdit",
  "endsSourceComment",
  "escapeTypedText",
  "insideLiteralText",
  "displayEditKeepingMarkup",
  "isLockedUnit",
  "TEXT_STYLE_COMMAND",
  "tidyEditedSource",
  "spliceEdited",
  "openGroupsAt",
  "commandBeforeGroup",
  "closingBrace",
  "keepParagraphBreaksOutsideGroups",
  "dropEmptiedFormatting",
  "moveLeadingSpaceOutOfGroups",
];

// A source whose display is its raw text, one character each.
function plainSource(text, extra = {}) {
  return {
    raw: text,
    display: text,
    displayStarts: [...text].map((_, index) => index),
    displayEnds: [...text].map((_, index) => index + 1),
    ...extra,
  };
}

const MAIN = `\\documentclass{article}
\\begin{document}
\\section{Intro}

Alpha paragraph text.

Beta paragraph text.

Gamma paragraph text.

The \\textbf{big} dog sat.

We use \\emph{very \\textbf{bold} words} here.

See this. % a note
Next line here.

Urban \\textbf{songbirds} are widely studied.

Start \\emph{word} end.

A \\textbf{b}\\emph{c} d.

Cost 5\\% \\& more.

We need \\emph{very \\textbf{bold} words} here.

We use \\textbf{bold} here and more.

The \\emph{first half second half} ends.

Code \\verb|a%b| here.

Set \\verb|a b| to it.
\\end{document}
`;
const NOTES = `\\section{First}

Para one of first.

\\subsection{Inner}

Para of inner.

\\section{Second}

Para of second.
`;

describe("front end", () => {
  let server;
  before(async () => {
    const project = await makeProject({ files: { "main.tex": MAIN, "notes.tex": NOTES } });
    server = await startServer(project.root);
  });
  after(cleanupAll);

  describe("saving a block edit", () => {
    const app = loadAppFunctions(SAVE_MAPPING);

    async function editAndSave(needle, from, to) {
      const document = await getDocument(server, "main.tex");
      const block = document.blocks.find((item) => item.raw.includes(needle));
      const typed = block.display.replace(from, to);
      assert.notEqual(typed, block.display);
      const raw = app.rawTextForDisplayEdit(block, typed);
      await saveBlock(server, document, block, raw);
      const saved = await getDocument(server, "main.tex");
      const original = block.raw;
      // Put the paragraph back for the next case.
      await saveBlock(server, saved, saved.blocks[block.index], original);
      return { raw, source: saved.source, display: saved.blocks[block.index].display, typed };
    }

    it("keeps the closing brace when an edit runs past the end of \\textbf", async () => {
      const result = await editAndSave("big", "big dog", "small cat");
      assert.match(result.raw, /^The \\textbf\{small\} cat sat\./);
      assert.match(result.source, /The \\textbf\{small\} cat sat\.\n/);
      assert.match(result.source, /\\end\{document\}\n$/);
      assert.equal(result.display, result.typed);
    });

    it("keeps an opening command when an edit starts before it", async () => {
      const result = await editAndSave("big", "The big", "Small");
      assert.match(result.source, /\n\\textbf\{Small\} dog sat\./);
      assert.equal(result.display, result.typed);
    });

    it("keeps nested groups when several words inside them change", async () => {
      const result = await editAndSave("bold", "very bold words", "quite plain text");
      assert.match(result.source, /We use \\emph\{quite \\textbf\{plain\} text\} here\./);
      assert.equal(result.display, result.typed);
    });

    it("puts new text where the replaced words started, inside their group", async () => {
      // The page showed "birds now" in bold; "now" stays outside because the
      // space before it lines up with the old one.
      const result = await editAndSave("songbirds", "songbirds are w", "birds now");
      assert.match(result.source, /\nUrban \\textbf\{birds\} nowidely studied\./);
      assert.equal(result.display, result.typed);
    });

    it("never leaves an emptied \\textbf{} or \\emph{} behind", async () => {
      // Deleting all of a group's text removes the command.
      const deleted = await editAndSave("big", "big ", "");
      assert.match(deleted.source, /\nThe dog sat\./);
      const joined = await editAndSave("textbf{b}", "bc", "x");
      assert.match(joined.source, /\nA \\textbf\{x\} d\./);
      // New text right next to the emptied command moves into it.
      const retyped = await editAndSave("Start", "Start word end", "big red");
      assert.match(retyped.source, /\n\\emph\{big\} red\./);
      for (const result of [deleted, joined, retyped]) {
        assert.doesNotMatch(result.raw, /\\(?:textbf|emph)\{\}/);
        assert.equal(result.display, result.typed);
      }
      // A command that was empty in the source is not the edit's business.
      const app2 = loadAppFunctions(SAVE_MAPPING);
      const source = { raw: "a \\emph{} b", display: "a  b", displayStarts: [0, 1, 9, 10], displayEnds: [1, 2, 10, 11] };
      assert.equal(app2.rawTextForDisplayEdit(source, "a  c"), "a \\emph{} c");
    });

    it("rewrites whole words when an edit crosses markup", async () => {
      // The final "d" of "bold" matches the end of "need"; it must not stay in
      // \\textbf while "nee" lands outside the groups.
      const result = await editAndSave("We need", "need very bold", "use");
      assert.match(result.source, /\nWe use \\emph\{words\} here\./);
      assert.equal(result.display, result.typed);
      const app2 = loadAppFunctions(SAVE_MAPPING);
      const document = await getDocument(server, "main.tex");
      const block = document.blocks.find((item) => item.raw.startsWith("Start"));
      // "tart wor" over "Start word": the "S" and "d" kept as source would split
      // the new word across \\emph.
      assert.equal(app2.rawTextForDisplayEdit(block, block.display.replace("tart wor", "中文")), "\\emph{S中文d} end.");
    });

    it("never puts a typed paragraph break inside a group", async () => {
      // Enter over the end of a bold word: the break goes after the group.
      const atEnd = await editAndSave("bold} here and", "old ", "\n\n");
      assert.match(atEnd.source, /\nWe use \\textbf\{b\}\n\nhere and more\./);
      // Enter in the middle of a formatted run splits the command in two.
      const inside = await editAndSave("first half", "half second", "half\n\nsecond");
      assert.match(inside.source, /\nThe \\emph\{first half\}\n\n\\emph\{second half\} ends\./);
      // Enter right after the opening of a group: the break goes before it.
      const atStart = await editAndSave("bold} here and", "use b", "use\n\nb");
      assert.match(atStart.source, /\nWe use\n\n\\textbf\{bold\} here and more\./);
      // The same for a command with arguments before its text, except a
      // footnote, whose mark would move to the next paragraph.
      const tidy = (before, after) => app.tidyEditedSource([{ text: before }, { text: "\n\n", typed: true }, { text: after }]);
      assert.equal(tidy("A \\textcolor{red}{", "word} b."), "A \n\n\\textcolor{red}{word} b.");
      assert.equal(tidy("A\\footnote[7]{", "Note.} b."), "A\\footnote[7]{\nNote.} b.");
    });

    it("keeps \\verb text only while the edit leaves all of it standing", async () => {
      const document = await getDocument(server, "main.tex");
      const block = document.blocks.find((item) => item.raw.startsWith("Code"));
      const at = block.display.indexOf("a%b");
      assert.ok(at >= 0);
      // The page shows it but does not let the author type in it.
      assert.ok(app.isLockedUnit(block, at));
      assert.ok(!app.isLockedUnit(block, 0));
      // An edit next to it keeps it.
      const next = await editAndSave("verb|a%b", "here", "there");
      assert.match(next.source, /\nCode \\verb\|a%b\| there\./);
      // New text that reuses some of its letters replaces it: "a%b" did not
      // survive, so it must not come back.
      const reused = await editAndSave("verb|a%b", "a%b", "%e");
      assert.match(reused.source, /\nCode \\%e here\./);
      assert.equal(reused.display, reused.typed);
      // Text typed between its letters replaces it as well.
      const between = await editAndSave("verb|a b", "a b to", "a or b to");
      assert.match(between.source, /\nSet a or b to it\./);
      assert.equal(between.display, between.typed);
    });

    it("escapes a %, & or # the author types", async () => {
      const edited = await editAndSave("Cost", "5% & more", "6% & less #1");
      assert.match(edited.source, /\nCost 6\\% \\& less \\#1\./);
      assert.equal(edited.display, edited.typed);
      const typed = await editAndSave("Alpha", "paragraph", "50% of the");
      assert.match(typed.source, /\nAlpha 50\\% of the text\./);
      // Already escaped, or inside a URL: as typed.
      assert.equal(app.rawTextForDisplayEdit(plainSource("Use it."), "Use 5\\% of it."), "Use 5\\% of it.");
      const url = { raw: "see \\url{a%20b} now", display: "see a%20b now", displayStarts: [0, 1, 2, 3, 9, 10, 11, 12, 13, 15, 16, 17, 18], displayEnds: [1, 2, 3, 4, 10, 11, 12, 13, 14, 16, 17, 18, 19] };
      assert.equal(app.rawTextForDisplayEdit(url, "see a%2%0b now"), "see \\url{a%2%0b} now");
      assert.equal(app.rawTextForDisplayEdit(url, "see a%20b 5% now"), "see \\url{a%20b} 5\\% now");
      // $, _ and ^ stay source: authors type math that way.
      assert.equal(app.rawTextForDisplayEdit(plainSource("Use it."), "Use $x_1^2$ it."), "Use $x_1^2$ it.");
    });

    it("never writes text into a % comment", async () => {
      // Joining two lines deletes the line break that ends the comment; the
      // next words must stay outside it.
      const joined = await editAndSave("a note", "this. \nNext", "this. Next");
      assert.match(joined.source, /See this\. % a note\nNext line here\./);
      // Typing at the end of the commented line goes before the comment.
      const document = await getDocument(server, "main.tex");
      const block = document.blocks.find((item) => item.raw.includes("a note"));
      const at = block.display.indexOf("\n");
      const raw = app.rawTextForDisplayEdit(block, `${block.display.slice(0, at)}More.${block.display.slice(at)}`);
      assert.equal(raw.split("\n")[0], "See this. More.% a note");
    });

    it("rewrites plain text exactly as before", () => {
      const source = plainSource("One two three.");
      assert.equal(app.rawTextForDisplayEdit(source, "One 2 three."), "One 2 three.");
      assert.equal(app.rawTextForDisplayEdit(source, "One two three. Four."), "One two three. Four.");
      assert.equal(app.rawTextForDisplayEdit(source, ""), "");
      // A "%" the page shows (a URL, say) is text, not a comment.
      assert.equal(app.rawTextForDisplayEdit(plainSource("a%20b and\nnext"), "a%20b anXd\nnext"), "a%20b anXd\nnext");
    });
  });

  it("numbers comment cards like the badges in the text when a comment lost its anchor", () => {
    const document = { path: "main.tex", source: "", blocks: [] };
    const request = (id, blockIndex, extra = {}) => ({
      id, path: "main.tex", status: "pending", resolvedBlockIndex: blockIndex, createdAt: id, ...extra,
    });
    const requests = [
      request("c-gamma", 6),
      request("c-beta", null, { anchorValid: false }),
      request("c-alpha", 2),
    ];
    let cardNumbers = null;
    const appendedCards = [];
    const element = () => ({ replaceChildren() {}, append(...items) { appendedCards.push(...items); }, querySelectorAll: () => [], classList: { toggle() {} } });
    const app = loadAppFunctions([
      "normalizedText",
      "resolvedRequestBlockIndex",
      "resolvedRequestAbsoluteRange",
      "linkedChangeForCurrentDocument",
      "compareCurrentReviewRequests",
      "currentReviewRequests",
      "currentReviewNumberMap",
      "renderRequestLists",
    ], {
      state: { document, requests },
      dom: { requestList: element(), requestCount: element(), otherRequestList: element(), otherComments: {}, otherRequestCount: {}, commentComposer: {} },
      commentCardResizeObserver: null,
      captureRequestCardDrafts: () => null,
      restoreRequestCardDrafts() {},
      createCommentsEmptyState: () => "empty",
      createRequestCard: (item) => item.id,
      decorateReviewCards: (numbers) => { cardNumbers = numbers; },
      tickRunningStatuses() {},
      applyCommentMarkers() {},
      positionCommentCards() {},
    });
    app.renderRequestLists();
    assert.deepEqual(plain([...cardNumbers]), plain([...app.currentReviewNumberMap()]));
    assert.deepEqual(plain([...cardNumbers]), [["c-alpha", 1], ["c-gamma", 2]]);
    // The "Anchor changed" card is listed below the others.
    assert.deepEqual(appendedCards, ["c-alpha", "c-gamma", "c-beta"]);
  });

  describe("refreshing the comment list", () => {
    function setup() {
      const pending = [];
      const renders = [];
      const app = loadAppFunctions(["refreshRequests"], {
        state: { requests: [], requestsToken: 0, requestsShownToken: 0, chat: null },
        dom: { codexChat: { hidden: true } },
        api: () => new Promise((resolve, reject) => pending.push({ resolve, reject })),
        renderRequestLists: () => renders.push(app.state.requests.map((item) => item.id).join()),
        renderDocumentWhenSafe() {},
        renderChatSession() {},
      });
      return { app, pending, renders };
    }

    it("keeps the newest list when answers arrive out of order", async () => {
      const { app, pending, renders } = setup();
      const older = app.refreshRequests();
      const newer = app.refreshRequests();
      pending[1].resolve([{ id: "new" }]);
      await newer;
      pending[0].resolve([{ id: "old" }]);
      await older;
      assert.deepEqual(plain(app.state.requests), [{ id: "new" }]);
      assert.deepEqual(renders, ["new"]);
    });

    it("keeps an older good answer when the newer fetch fails", async () => {
      const { app, pending, renders } = setup();
      const older = app.refreshRequests();
      const newer = app.refreshRequests();
      let olderDone = false;
      older.then(() => { olderDone = true; });
      pending[0].resolve([{ id: "old" }]);
      await until(() => olderDone, "the older refresh to finish on its own answer");
      pending[1].reject(new Error("server down"));
      await assert.rejects(newer, /server down/);
      assert.deepEqual(plain(app.state.requests), [{ id: "old" }]);
      assert.deepEqual(renders, ["old"]);
    });

    it("lets a caller wait for its own fetch only", async () => {
      const { app, pending } = setup();
      const older = app.refreshRequests();
      app.refreshRequests();
      app.refreshRequests();
      pending[0].resolve([{ id: "old" }]);
      let done = false;
      older.then(() => { done = true; });
      await until(() => done, "the older refresh to finish without the newer ones");
    });
  });

  it("sends Ask in Chat the blocks a selection was pulled into", async () => {
    // Drag from the very end of Alpha into Gamma: the start moves to Beta.
    const document = await getDocument(server, "main.tex");
    const [alpha, beta, gamma] = ["Alpha", "Beta", "Gamma"].map((word) => document.blocks.find((block) => block.raw.startsWith(word)));
    const elementFor = (block) => ({
      nodeType: 1,
      dataset: { blockIndex: String(block.index), blockId: block.id },
      closest(selector) { return selector === ".editor-block" ? this : null; },
    });
    const startElement = elementFor(alpha);
    const endElement = elementFor(gamma);
    const range = {
      startContainer: startElement,
      startOffset: alpha.display.length,
      endContainer: endElement,
      endOffset: 5,
      toString: () => "\n\nBeta paragraph text.\n\nGamma",
    };
    const elements = document.blocks.filter((block) => block.index >= alpha.index && block.index <= gamma.index).map(elementFor);
    const app = loadAppFunctions(["selectionContext", "commentSelectionForChat"], {
      state: { document },
      window: { getSelection: () => ({ rangeCount: 1, isCollapsed: false, getRangeAt: () => range }) },
      Node: { ELEMENT_NODE: 1 },
      dom: { editor: { querySelectorAll: () => elements } },
      canonicalOffsetAt: (root, container, offset) => offset,
      isRangeAccepted: () => false,
      selectionActionRect: () => ({}),
    });
    const context = app.selectionContext();
    assert.equal(context.blockIndex, beta.index);
    assert.equal(context.blockId, beta.id);
    assert.equal(context.endBlockId, gamma.id);
    const sent = app.commentSelectionForChat({ ...context, path: document.path });
    assert.ok(sent, "the selection must reach the chat");
    assert.equal(sent.blockId, beta.id);
  });

  it("submits a comment for the passage in the composer, not a later selection", async () => {
    const bodies = [];
    const draft = { path: "main.tex", blockIndex: 2, blockId: "a", start: 0, end: 5, endBlockIndex: 2, endBlockId: "a", absoluteStart: 10, absoluteEnd: 15, segments: [], selectedText: "Alpha" };
    const app = loadAppFunctions(["submitComment"], {
      state: {
        commentDraft: draft,
        selection: { ...draft, blockIndex: 4, blockId: "b", absoluteStart: 40, absoluteEnd: 44, selectedText: "Beta" },
        document: { path: "main.tex", etag: "e" },
        requests: [],
        bootstrap: null,
      },
      dom: { commentInput: { value: "Shorter, please." }, submitComment: {}, findLinked: {}, rewriteScope: { value: "selection" }, contextMode: { value: "paper" } },
      api: async (url, options) => { bodies.push({ url, ...JSON.parse(options.body) }); return {}; },
      closeCommentComposer() {},
      refreshRequests: async () => {},
      agentProviderOptions: () => [],
      providerDisplayName: () => "the agent",
      showToast() {},
    });
    await app.submitComment();
    assert.equal(bodies.length, 1);
    assert.equal(bodies[0].url, "/api/rewrite");
    assert.equal(bodies[0].blockId, "a");
    assert.equal(bodies[0].selectedText, "Alpha");
    assert.equal(bodies[0].absoluteStart, 10);
  });

  it("forgets a selection once it is gone, so external changes reload quietly again", () => {
    const app = loadAppFunctions(["showSelectionToolbar"], {
      state: { selection: { blockId: "a" }, editing: null },
      dom: { selectionToolbar: { hidden: false } },
      selectionContext: () => null,
    });
    app.showSelectionToolbar();
    assert.equal(app.state.selection, null);
    assert.equal(app.dom.selectionToolbar.hidden, true);
  });

  it("ends Confirm section at the next heading in a file outside the compiled outline", async () => {
    const document = await getDocument(server, "notes.tex");
    const app = loadAppFunctions(["outlineLevel", "currentSectionOutlineItem", "currentSectionReviewScope"], {
      // The compiled outline covers main.tex only; notes.tex is not \input.
      state: { document, compiledOutline: { items: [{ path: "main.tex", blockIndex: 2, level: 1, title: "Intro" }] }, activeOutline: null },
    });
    const scope = app.currentSectionReviewScope();
    assert.equal(scope.item.title, "First");
    assert.deepEqual(plain(scope.blocks.map((block) => block.display.trim())), ["First", "Para one of first.", "Inner", "Para of inner."]);
  });

  it("leaves Enter alone while an IME composition is open", () => {
    const inserted = [];
    const app = loadAppFunctions(["isImeComposing", "handleBlockKeydown", "handleProposalUnitKeydown"], {
      document: { execCommand: (command, ui, text) => inserted.push(text) },
      flushSave() {},
      flushProposalUnitSave() {},
      showToast: (message) => inserted.push(`toast: ${message}`),
    });
    const keydown = (extra) => {
      const event = { key: "Enter", prevented: false, preventDefault() { this.prevented = true; }, stopPropagation() {}, ...extra };
      return event;
    };
    for (const composing of [{ isComposing: true }, { keyCode: 229 }]) {
      const blockEvent = keydown(composing);
      app.handleBlockKeydown(blockEvent);
      const unitEvent = keydown(composing);
      app.handleProposalUnitKeydown(unitEvent);
      assert.equal(blockEvent.prevented, false);
      assert.equal(unitEvent.prevented, false);
    }
    assert.deepEqual(inserted, []);
    // A plain Enter still makes a paragraph break.
    const enter = keydown({});
    app.handleBlockKeydown(enter);
    assert.equal(enter.prevented, true);
    assert.deepEqual(inserted, ["\n\n"]);
  });

  it("re-reads comments and the file after the stream was closed for a hidden tab", async () => {
    const sources = [];
    class FakeEventSource {
      constructor() {
        this.handlers = {};
        sources.push(this);
      }
      addEventListener(name, handler) { this.handlers[name] = handler; }
      close() { this.closed = true; }
    }
    FakeEventSource.CLOSED = 2;
    const listeners = {};
    const calls = [];
    const page = { hidden: false, addEventListener: (name, handler) => { listeners[name] = handler; } };
    const app = loadAppFunctions(["connectEvents", "followMissedDocumentChange"], {
      EventSource: FakeEventSource,
      document: page,
      window: { addEventListener() {} },
      state: { document: { path: "main.tex", etag: "before" }, savePromise: null },
      dom: { connectionStatus: { classList: { contains: () => false } } },
      setConnectionStatus() {},
      refreshRequests: async () => { calls.push("requests"); },
      refreshUndo: () => calls.push("undo"),
      refreshChat: async () => {},
      api: async (url) => (url.startsWith("/api/document") ? { etag: "after" } : null),
      structurePlanShowsPreview: () => false,
      renderStructurePlanControls() {},
      renderOutline() {},
      hasLocalDocumentState: () => false,
      reloadDocumentQuietly: (path) => calls.push(`reload ${path}`),
      showExternalChangeBanner: () => calls.push("banner"),
      setTimeout,
      clearTimeout,
    });
    app.connectEvents();
    // The first open decides synchronously that there is nothing to catch up.
    sources[0].onopen();
    assert.deepEqual(calls, []);
    page.hidden = true;
    listeners.visibilitychange();
    assert.equal(sources[0].closed, true);
    page.hidden = false;
    listeners.visibilitychange();
    sources[1].onopen();
    await until(() => calls.length >= 3, "the reconnect to re-read comments, undo and the file");
    assert.deepEqual(calls, ["requests", "undo", "reload main.tex"]);
  });

  it("saves typing that continued while the previous save was in flight", async () => {
    const block = plainSource("Alpha text.", { id: "block-1", index: 0, kind: "paragraph" });
    const element = {
      text: "Alpha text, edited.",
      dataset: { blockIndex: "0", blockId: "block-1" },
      reviewBlock: block,
      classList: { add() {}, remove() {} },
      matches: () => true,
    };
    const requests = [];
    const app = loadAppFunctions([...SAVE_MAPPING, "unwrapPastedHeadingCommand", "editedRawText", "saveErrorKind", "performSave", "handleBlockInput"], {
      state: { document: { path: "main.tex", etag: "etag-1", blocks: [block] }, editing: { element, blockIndex: 0, blockId: "block-1", block } },
      dom: { editor: { querySelectorAll: () => [element] }, externalChange: {}, externalKeep: {}, externalCopy: {}, externalChangeMessage: {} },
      api: (url, options) => new Promise((resolve) => requests.push({ body: JSON.parse(options.body), resolve })),
      canonicalEditableText: (target) => target.text,
      refreshCompiledOutline: async () => {},
      refreshRequests: async () => {},
      updateDocumentHeader() {},
      updateProgress() {},
      renderDocument() {},
      setSaveState() {},
      showToast() {},
      refreshGit() {},
      flushSave() {},
      flushPendingRender() {},
      setTimeout: () => 0,
      clearTimeout() {},
    });
    const first = app.performSave();
    // The author keeps typing before the save returns.
    element.text = "Alpha text, edited again.";
    app.handleBlockInput({ target: {}, currentTarget: element });
    const saved = plainSource("Alpha text, edited.", { id: "block-2", index: 0, kind: "paragraph" });
    requests[0].resolve({ path: "main.tex", etag: "etag-2", blocks: [saved] });
    assert.equal(await first, true);
    const second = app.performSave();
    assert.equal(requests.length, 2);
    assert.equal(requests[1].body.etag, "etag-2");
    assert.equal(requests[1].body.blockId, "block-2");
    assert.equal(requests[1].body.baseText, "Alpha text, edited.");
    assert.equal(requests[1].body.text, "Alpha text, edited again.");
    requests[1].resolve({ path: "main.tex", etag: "etag-3", blocks: [plainSource("Alpha text, edited again.", { id: "block-3", index: 0 })] });
    assert.equal(await second, true);
  });

  it("does not re-render the document while a save is on its way", () => {
    const renders = [];
    const app = loadAppFunctions(["flushPendingRender"], {
      state: { renderPending: true, editing: null, savePromise: Promise.resolve(false) },
      documentRenderBlocked: () => false,
      renderDocument: () => renders.push("render"),
    });
    app.flushPendingRender();
    assert.deepEqual(renders, [], "the typed text is still on screen until the save settles");
    app.state.savePromise = null;
    app.flushPendingRender();
    assert.deepEqual(renders, ["render"]);
  });

  describe("a save the server refuses", () => {
    function setup({ error = null, confirmAnswer = true } = {}) {
      const before = plainSource("Before text.", { id: "block-0", index: 0, kind: "paragraph" });
      const block = plainSource("Alpha text.", { id: "block-1", index: 1, kind: "paragraph" });
      const after = plainSource("After text.", { id: "block-2", index: 2, kind: "paragraph" });
      const element = { text: "Alpha text, edited.", dataset: { blockIndex: "1", blockId: "block-1" }, reviewBlock: block, classList: { add() {}, remove() {} }, matches: () => true };
      const requests = [];
      const calls = [];
      const button = () => ({ hidden: true });
      const app = loadAppFunctions([...SAVE_MAPPING, "unwrapPastedHeadingCommand", "performSave", "saveErrorKind", "mayReplaceDocument", "confirmDiscardEdit", "useDiskVersion", "copyEditedText", "editedRawText", "handleBlockBlur"], {
        state: { document: { path: "main.tex", etag: "etag-1", blocks: [before, block, after] }, editing: { element, blockIndex: 1, blockId: "block-1", block } },
        dom: { editor: { querySelectorAll: () => [element] }, externalChange: button(), externalKeep: button(), externalCopy: button(), externalChangeMessage: {} },
        api: (url, options) => {
          requests.push(JSON.parse(options.body));
          return error ? Promise.reject(new Error(error)) : Promise.resolve({ path: "main.tex", etag: "etag-2", blocks: [before, block, after] });
        },
        window: {
          confirm: (message) => {
            calls.push(`confirm: ${message}`);
            return confirmAnswer;
          },
          getSelection: () => ({ selectAllChildren: () => calls.push("select") }),
        },
        navigator: { clipboard: { writeText: async (text) => calls.push(`copy: ${text}`) } },
        loadDocument: async (path, options) => calls.push(`load ${path} ${JSON.stringify(options)}`),
        settlePendingEdits: async () => false,
        canonicalEditableText: (target) => target.text,
        refreshCompiledOutline: async () => {},
        refreshRequests: async () => {},
        updateDocumentHeader() {},
        updateProgress() {},
        renderDocument() {},
        setSaveState() {},
        showToast: (message) => calls.push(`toast: ${message}`),
        refreshGit() {},
        flushSave() {},
        flushPendingRender() {},
        setTimeout: () => 0,
        clearTimeout() {},
      });
      return { app, requests, calls, element };
    }
    const gone = "The paragraph you were editing no longer exists on disk. Copy your text, then reload the document.";
    const ambiguous = "The document changed and more than one paragraph on disk now looks like the one you were editing. Copy your text, then reload the document.";
    const unplaced = "The paragraph you were editing moved and changed on disk, so Keep my edit cannot tell which paragraph to replace. Copy your text, then reload the document.";

    it("sends the neighbouring paragraphs, so the server can tell them from the edited one", async () => {
      const { app, requests } = setup();
      assert.equal(await app.performSave(), true);
      assert.equal(requests[0].previousText, "Before text.");
      assert.equal(requests[0].nextText, "After text.");
    });

    for (const message of [gone, ambiguous, unplaced]) {
      it(`offers to copy the text, not "Keep my edit", when the server says: ${message.split(".")[0]}`, async () => {
        const { app } = setup({ error: message });
        assert.equal(await app.performSave(), false);
        assert.equal(app.state.saveConflict, "gone");
        assert.ok(app.state.editing, "the typed text is still the open edit");
        assert.equal(app.dom.externalChange.hidden, false);
        assert.equal(app.dom.externalKeep.hidden, true);
        assert.equal(app.dom.externalCopy.hidden, false);
        assert.match(app.dom.externalChangeMessage.textContent, /removed, rewritten or moved on disk/);
        assert.match(app.dom.externalChangeMessage.textContent, /Copy my text/);
      });
    }

    it("still offers Keep my edit when the paragraph changed in overlapping text", async () => {
      const { app } = setup({ error: "The paragraph changed in overlapping text. Automatic merge could not safely combine both versions; choose which version to keep." });
      assert.equal(await app.performSave(), false);
      assert.equal(app.state.saveConflict, "conflict");
      assert.equal(app.dom.externalKeep.hidden, false);
      assert.equal(app.dom.externalCopy.hidden, false);
    });

    it("copies the LaTeX the save would have written", async () => {
      const { app, calls } = setup({ error: gone });
      await app.performSave();
      await app.copyEditedText();
      assert.ok(calls.includes("copy: Alpha text, edited."), calls.join("\n"));
    });

    it("lets Reload or another file replace the text only after the author agrees to discard it", async () => {
      const { app, calls } = setup({ error: gone });
      await app.performSave();
      assert.equal(await app.mayReplaceDocument(false), false, "a background load never discards the text");
      assert.equal(calls.filter((call) => call.startsWith("confirm")).length, 0);
      assert.equal(await app.mayReplaceDocument(true), true);
      assert.match(calls.find((call) => call.startsWith("confirm")), /discarded/);
      assert.equal(app.state.editing, null);
    });

    it("keeps the text when the author declines to discard it", async () => {
      const { app } = setup({ error: gone, confirmAnswer: false });
      await app.performSave();
      assert.equal(await app.mayReplaceDocument(true), false);
      assert.ok(app.state.editing);
      app.useDiskVersion();
      assert.ok(app.state.editing);
    });

    it("does not send the refused save again when the author clicks a banner button", async () => {
      const { app, requests, element } = setup({ error: gone });
      await app.performSave();
      const flushes = [];
      app.flushSave = async () => flushes.push("flush");
      app.deactivateBlockEditing = () => {};
      app.flushPendingRender = () => {};
      await app.handleBlockBlur({ currentTarget: element });
      assert.deepEqual(flushes, []);
      assert.equal(requests.length, 1);
    });

    it("copies the text even while a save is still on its way", async () => {
      const { app, calls } = setup({ error: gone });
      const saving = app.performSave();
      app.state.savePromise = saving;
      await app.copyEditedText();
      assert.ok(calls.includes("copy: Alpha text, edited."), calls.join("\n"));
    });

    it("saves typed text, or asks, before Revert structure reloads the document", async () => {
      const { app, calls } = setup({ error: gone, confirmAnswer: false });
      await app.performSave();
      const reverts = [];
      const revert = loadAppFunctions(["revertCurrentStructure"], {
        state: app.state,
        window: app.window,
        dom: { revertStructure: {} },
        activeStructurePlan: () => ({ sections: [{ status: "applied" }] }),
        mayReplaceDocument: app.mayReplaceDocument,
        api: async (url) => reverts.push(url),
        showToast() {},
        renderStructurePlanControls() {},
      });
      await revert.revertCurrentStructure();
      assert.deepEqual(reverts, [], "the author kept the text, so nothing is reverted");
      assert.ok(app.state.editing);
      assert.match(calls.find((call) => call.startsWith("confirm")), /discarded/);
    });

    it("asks before Use disk version drops typed text", async () => {
      const { app, calls } = setup({ error: gone });
      await app.performSave();
      app.useDiskVersion();
      assert.deepEqual(calls.filter((call) => /^(confirm|load)/.test(call)).map((call) => call.split(":")[0].split(" ")[0]), ["confirm", "load"]);
      assert.ok(calls.some((call) => call === 'load main.tex {"discardEditing":true}'), calls.join("\n"));
    });
  });

  describe("saving proposal-unit edits", () => {
    function setup({ connected = false } = {}) {
      const saved = [];
      const first = {};
      const unitElement = (text) => ({ text, isConnected: connected, matches: () => false, classList: { add() {}, remove() {} } });
      const app = loadAppFunctions([...SAVE_MAPPING, "flushProposalUnitSave"], {
        state: { proposalEditing: null, proposalSaving: false, proposalRetries: [], requests: [] },
        api: (url, options) => {
          saved.push(JSON.parse(options.body).unitId);
          if (saved.length > 1) return Promise.resolve({});
          return new Promise((resolve, reject) => Object.assign(first, { resolve, reject }));
        },
        canonicalEditableText: (target) => target.text,
        refreshRequests: async () => {},
        setSaveState() {},
        showToast() {},
        flushPendingRender() {},
        setTimeout,
      });
      const edit = (id, element = unitElement(`new ${id}`)) => ({ element, request: { id: "r" }, unit: { id, ...plainSource(`old ${id}`) } });
      return { app, saved, first, edit };
    }

    it("saves an edit that was left while another unit was saving", async () => {
      const { app, saved, first, edit } = setup();
      app.state.proposalEditing = edit("a");
      const saving = app.flushProposalUnitSave();
      app.state.proposalEditing = edit("b");
      assert.equal(await app.flushProposalUnitSave(), false);
      first.resolve({});
      await saving;
      await until(() => saved.length >= 2 && !app.state.proposalSaving, "the deferred edit to be saved");
      assert.deepEqual(saved, ["a", "b"]);
      assert.equal(app.state.proposalEditing, null);
    });

    it("keeps both edits when the first save fails, and tries the failed one again", async () => {
      const { app, saved, first, edit } = setup();
      app.state.proposalEditing = edit("a");
      const saving = app.flushProposalUnitSave();
      app.state.proposalEditing = edit("b");
      await app.flushProposalUnitSave();
      first.reject(new Error("network"));
      assert.equal(await saving, false);
      await until(() => saved.length >= 3 && !app.state.proposalSaving, "the failed edit to be tried again");
      assert.deepEqual(saved, ["a", "b", "a"]);
      assert.equal(app.state.proposalEditing, null);
      assert.equal(app.state.proposalRetries.length, 0);
    });

    it("keeps every failed edit when saves fail one after another", async () => {
      const saved = [];
      const pending = [];
      const unitElement = (text) => ({ text, isConnected: false, matches: () => false, classList: { add() {}, remove() {} } });
      const app = loadAppFunctions([...SAVE_MAPPING, "flushProposalUnitSave"], {
        state: { proposalEditing: null, proposalSaving: false, proposalRetries: [], requests: [] },
        api: (url, options) => {
          saved.push(JSON.parse(options.body).unitId);
          return new Promise((resolve, reject) => pending.push({ resolve, reject }));
        },
        canonicalEditableText: (target) => target.text,
        refreshRequests: async () => {},
        setSaveState() {},
        showToast() {},
        flushPendingRender() {},
        setTimeout,
      });
      const edit = (id) => ({ element: unitElement(`new ${id}`), request: { id: "r" }, unit: { id, ...plainSource(`old ${id}`) } });
      // A fails while B is pending; B is retried and C is edited meanwhile;
      // then B fails too.
      app.state.proposalEditing = edit("a");
      const first = app.flushProposalUnitSave();
      app.state.proposalEditing = edit("b");
      pending[0].reject(new Error("network"));
      await first;
      await until(() => saved.length >= 2, "B's save");
      app.state.proposalEditing = edit("c");
      pending[1].reject(new Error("network"));
      await until(() => saved.length >= 3, "C's save");
      // C's save succeeds, and the failed edits are tried again in turn.
      pending[2].resolve({});
      await until(() => saved.length >= 4, "A tried again");
      pending[3].resolve({});
      await until(() => saved.length >= 5, "B tried again");
      pending[4].resolve({});
      await until(() => !app.state.proposalSaving && !app.state.proposalEditing, "the queue to drain");
      assert.deepEqual(saved, ["a", "b", "c", "a", "b"]);
      assert.equal(app.state.proposalEditing, null);
      assert.equal(app.state.proposalRetries.length, 0);
    });

    it("continues from the saved unit when typing went on during its save", async () => {
      const { app, first, edit } = setup({ connected: true });
      const typing = edit("a");
      app.state.proposalEditing = typing;
      const saving = app.flushProposalUnitSave();
      // More typing in the same unit, captured against the unit before the save.
      app.state.proposalEditing = { ...edit("a", typing.element) };
      const savedUnit = { id: "a", ...plainSource("new a") };
      app.state.requests = [{ id: "r", proposal: { reviewUnits: [savedUnit] } }];
      first.resolve({});
      await saving;
      assert.equal(app.state.proposalEditing.unit.raw, "new a");
    });
  });
});

// A macro call is edited through the text the page shows for it. Each case
// saves through the real server, in the manuscript and in a proposal unit,
// and checks the source and that the display is what the author typed.
describe("editing macro calls", () => {
  const PREAMBLE = String.raw`\documentclass{article}
\newcommand{\figref}[1]{Figure~\ref{#1}}
\newcommand{\citeA}[1]{\citet{#1}}
\newcommand{\note}[1]{\textcolor{red}{#1}}
\newcommand{\bfit}[1]{\textbf{\textit{#1}}}
\newcommand{\twoarg}[2]{\textit{#1} and #2}
\newcommand{\hili}[1]{\colorbox{yellow}{#1}}
\newcommand{\paren}[1]{(#1)}
\newcommand{\pair}[2]{(#1, #2)}
\newcommand{\fixme}[1]{\textcolor{blue}{TODO: #1}}
\newcommand{\link}[2]{\href{#1}{#2}}
\newcommand{\lbl}[2]{\textbf{#2}\label{#1}}
\newcommand{\term}[1]{\textbf{#1}\index{#1}}
\newcommand{\dbl}[1]{\textbf{\dbl{#1}\dbl{#1}}}
\begin{document}
`;
  const PARAGRAPHS = [
    String.raw`A \note{fix this sentence} here.`,
    String.raw`Bfit \bfit{word here} end.`,
    String.raw`Two \twoarg{first}{second} end.`,
    String.raw`High \hili{marked words} end.`,
    String.raw`See \figref{fig:a} now.`,
    String.raw`Typo F\figref{fig:a} now.`,
    String.raw`As \citeA{smith} says.`,
    String.raw`X \paren{word} end.`,
    String.raw`P \pair{a}{b} end.`,
    String.raw`T \fixme{check the numbers} end.`,
    String.raw`D \link{https://example.org}{our site} now.`,
    String.raw`L \lbl{l:a}{bold words} end.`,
    String.raw`Idx \term{entropy} is.`,
    String.raw`Self \dbl{x} end.`,
    "Plain words for a comment.",
  ];
  const MAIN = `${PREAMBLE}\n${PARAGRAPHS.join("\n\n")}\n\n\\begin{figure}\\caption{A}\\label{fig:a}\\end{figure}\n\\end{document}\n`;
  const BIB = "@article{smith, author={Smith, John}, title={T}, year={2020}}\n";
  const REFUSED = /text that a macro adds around its arguments/;
  // [paragraph, display text to replace, what the author types, source afterwards]
  // Formatting macros: every argument is edited in place, as before.
  const FORMATTING = [
    [0, "this", "that", String.raw`A \note{fix that sentence} here.`],
    [1, "word", "term", String.raw`Bfit \bfit{term here} end.`],
    [2, "first", "1st", String.raw`Two \twoarg{1st}{second} end.`],
    [2, "second", "2nd", String.raw`Two \twoarg{first}{2nd} end.`],
    [3, "marked", "noted", String.raw`High \hili{noted words} end.`],
    // Typed right inside the ")" or after the "(": into the argument.
    [7, "word)", "words)", String.raw`X \paren{words} end.`],
    [7, "(word", "(sword", String.raw`X \paren{sword} end.`],
    [8, "b", "c", String.raw`P \pair{a}{c} end.`],
    [9, "numbers", "values", String.raw`T \fixme{check the values} end.`],
    [13, "x", "y", String.raw`Self \dbl{y} end.`],
  ];
  // Text built from a key is one locked unit; edits next to it keep the call.
  const UNITS = [
    [4, "now", "then", String.raw`See \figref{fig:a} then.`],
    [4, "See Figure", "SeeFigure", String.raw`See\figref{fig:a} now.`],
    [4, "? now", "?s now", String.raw`See \figref{fig:a}s now.`],
    [4, " Figure", " FFigure", String.raw`See F\figref{fig:a} now.`],
    // The stray "F" goes, not the unit's own first letter.
    [5, "FFigure", "Figure", String.raw`Typo \figref{fig:a} now.`],
    [4, " Figure ?", "", "See now."],
    [6, "says", "writes", String.raw`As \citeA{smith} writes.`],
    [7, " (word)", "", "X end."],
  ];
  // \href-style macros: the link text is edited in place, the address stays.
  const LINKS = [
    [10, "site", "page", String.raw`D \link{https://example.org}{our page} now.`],
    [11, "words", "terms", String.raw`L \lbl{l:a}{bold terms} end.`],
    [12, "entropy", "energy", String.raw`Idx \term{energy} is.`],
  ];
  // Removing a macro's own text while its argument stays would delete the argument.
  const REFUSALS = [
    [7, "word)", "word"],
    [7, "(word", "word"],
    [8, "(a, b)", "(a)"],
    [9, "TODO: ", ""],
  ];
  const app = loadAppFunctions(SAVE_MAPPING);
  let project;
  let server;

  before(async () => {
    project = await makeProject({ files: { "main.tex": MAIN, "refs.bib": BIB }, fakeAgent: true });
    server = await startServer(project.root);
  });
  after(cleanupAll);

  describe("in the manuscript", () => {
    async function blockOf(paragraph) {
      const document = await getDocument(server, "main.tex");
      return { document, block: document.blocks.find((item) => item.raw.trim() === PARAGRAPHS[paragraph]) };
    }

    async function editAndSave(paragraph, from, to) {
      const { document, block } = await blockOf(paragraph);
      const typed = block.display.replace(from, to);
      assert.notEqual(typed, block.display);
      const raw = app.rawTextForDisplayEdit(block, typed);
      await saveBlock(server, document, block, raw);
      const saved = await getDocument(server, "main.tex");
      const result = { raw: saved.blocks[block.index].raw.trim(), display: saved.blocks[block.index].display, typed };
      await saveBlock(server, saved, saved.blocks[block.index], block.raw);
      return result;
    }

    for (const [label, cases] of [["formatting", FORMATTING], ["unit", UNITS], ["link", LINKS]]) {
      it(`writes only the edited text of a ${label} macro`, async () => {
        for (const [paragraph, from, to, expected] of cases) {
          const result = await editAndSave(paragraph, from, to);
          assert.equal(result.raw, expected, `${from} -> ${to}`);
          assert.equal(result.display, result.typed);
        }
      });
    }

    it("locks text a macro builds from a key, and leaves shown arguments editable", async () => {
      const lockedText = (block) => [...block.display].filter((_, index) => app.isLockedUnit(block, index)).join("");
      assert.equal(lockedText((await blockOf(4)).block), "Figure ?");
      assert.equal(lockedText((await blockOf(6)).block), "Smith (2020)");
      assert.equal(lockedText((await blockOf(8)).block), ", ");
      assert.equal(lockedText((await blockOf(9)).block), "TODO: ");
      assert.equal(lockedText((await blockOf(2)).block), " and ");
      for (const paragraph of [0, 1, 3, 7, 10, 11, 12, 13]) assert.equal(lockedText((await blockOf(paragraph)).block), "");
    });

    it("refuses an edit that removes a macro's own text but leaves its argument", async () => {
      for (const [paragraph, from, to] of REFUSALS) {
        const { block } = await blockOf(paragraph);
        assert.throws(() => app.rawTextForDisplayEdit(block, block.display.replace(from, to)), REFUSED, `${from} -> ${to}`);
      }
    });
  });

  describe("in a structure proposal", () => {
    let requestFile;
    let request;

    before(async () => {
      const created = await commentOn(server, "main.tex", "Plain words", "Rewrite.");
      await apiOk(server, "/api/request/process", { method: "POST", body: { id: created.id } });
      await waitForRequest(server, created.id, (item) => item.status === "proposed" && item.agentStatus !== "running", "proposal");
      requestFile = path.join(project.root, stateDirectory, "requests", `${created.id}.json`);
      request = created;
    });

    // Turns the proposal into a one-unit structure proposal of `paragraph`
    // and edits that unit the way the page does.
    async function editUnit(paragraph, from, to) {
      const stored = JSON.parse(await fs.readFile(requestFile, "utf8"));
      stored.origin = { type: "structure" };
      stored.proposal.replacementText = PARAGRAPHS[paragraph];
      delete stored.proposalUnitReviews;
      await fs.writeFile(requestFile, `${JSON.stringify(stored, null, 2)}\n`);
      const unitOf = async () => (await apiOk(server, "/api/requests")).find((item) => item.id === request.id).proposal.reviewUnits[0];
      const unit = await unitOf();
      const toasts = [];
      const page = loadAppFunctions([...SAVE_MAPPING, "flushProposalUnitSave"], {
        state: { proposalEditing: null, proposalSaving: false, proposalRetries: [], requests: [] },
        api: (url, options) => apiOk(server, url, { method: options.method, body: JSON.parse(options.body) }),
        canonicalEditableText: (target) => target.text,
        refreshRequests: async () => {},
        setSaveState() {},
        showToast: (message) => toasts.push(message),
        flushPendingRender() {},
        setTimeout,
      });
      const typed = unit.display.replace(from, to);
      assert.notEqual(typed, unit.display);
      const element = { text: typed, isConnected: false, matches: () => false, classList: { add() {}, remove() {} } };
      page.state.proposalEditing = { element, request: { id: request.id }, unit };
      const saved = await page.flushProposalUnitSave();
      const after = JSON.parse(await fs.readFile(requestFile, "utf8"));
      return { saved, toasts, text: after.proposal.replacementText, display: (await unitOf()).display, typed, unit };
    }

    for (const [label, cases] of [["formatting", FORMATTING], ["unit", UNITS], ["link", LINKS]]) {
      it(`saves only the edited text of a ${label} macro`, async () => {
        for (const [paragraph, from, to, expected] of cases) {
          const result = await editUnit(paragraph, from, to);
          assert.equal(result.saved, true, `${from} -> ${to}: ${result.toasts.join(" ")}`);
          assert.equal(result.text, expected, `${from} -> ${to}`);
          assert.equal(result.display, result.typed);
        }
      });
    }

    it("refuses an edit that removes a macro's own text but leaves its argument", async () => {
      for (const [paragraph, from, to] of REFUSALS) {
        const result = await editUnit(paragraph, from, to);
        assert.equal(result.saved, false);
        assert.match(result.toasts.join(" "), REFUSED);
        assert.equal(result.text, PARAGRAPHS[paragraph]);
      }
    });

    it("shows a macro's locked text as not editable in the unit", async () => {
      const unit = (await editUnit(4, "now", "then")).unit;
      const nodes = [];
      const page = loadAppFunctions(["isLockedUnit", "appendProposalUnitText"], {
        document: {
          createElement: () => ({ dataset: {} }),
          createTextNode: (text) => ({ textContent: text }),
        },
      });
      page.appendProposalUnitText({ append: (node) => nodes.push(node) }, unit);
      assert.equal(nodes.map((node) => node.textContent).join(""), unit.display);
      assert.equal(nodes.filter((node) => node.contentEditable === "false").map((node) => node.textContent).join(""), "Figure ?");
      assert.ok(nodes.some((node) => node.contentEditable === undefined && node.textContent.includes("now")));
    });
  });
});
