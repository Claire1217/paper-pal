// Front-end logic from public/app.js, run in node:vm with small stubs in
// place of the DOM (see loadAppFunctions in helpers.mjs). Documents come from
// the real server where block ids and display mappings matter.
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { cleanupAll, getDocument, loadAppFunctions, makeProject, saveBlock, startServer } from "./helpers.mjs";

// Values made inside the vm context have that context's prototypes, which
// deepStrictEqual rejects; compare their JSON instead.
const plain = (value) => JSON.parse(JSON.stringify(value));
const tick = () => new Promise((resolve) => setTimeout(resolve, 5));

const SAVE_MAPPING = [
  "DIFF_CORE_TOKEN_LIMIT",
  "tokenizeDiffText",
  "compactDiffOperations",
  "diffTextOperations",
  "rawTextForDisplayEdit",
  "endsSourceComment",
  "displayEditKeepingMarkup",
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

  it("keeps the newest comment list when /api/requests answers arrive out of order", async () => {
    const pending = [];
    const renders = [];
    const app = loadAppFunctions(["refreshRequests"], {
      state: { requests: [], chat: null },
      dom: { codexChat: { hidden: true } },
      api: () => new Promise((resolve) => pending.push(resolve)),
      renderRequestLists: () => renders.push(app.state.requests.map((item) => item.id).join()),
      renderDocumentWhenSafe() {},
      renderChatSession() {},
    });
    const older = app.refreshRequests();
    const newer = app.refreshRequests();
    pending[1]([{ id: "new" }]);
    await newer;
    pending[0]([{ id: "old" }]);
    await older;
    assert.deepEqual(plain(app.state.requests), [{ id: "new" }]);
    assert.deepEqual(renders, ["new"]);
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
    sources[0].onopen();
    await tick();
    assert.deepEqual(calls, []);
    page.hidden = true;
    listeners.visibilitychange();
    assert.equal(sources[0].closed, true);
    page.hidden = false;
    listeners.visibilitychange();
    sources[1].onopen();
    await tick();
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
    const app = loadAppFunctions([...SAVE_MAPPING, "unwrapPastedHeadingCommand", "performSave", "handleBlockInput"], {
      state: { document: { path: "main.tex", etag: "etag-1", blocks: [block] }, editing: { element, blockIndex: 0, blockId: "block-1", block } },
      dom: { editor: { querySelectorAll: () => [element] }, externalChange: {}, externalKeep: {}, externalChangeMessage: {} },
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

  it("saves a proposal-unit edit that was left while another unit was saving", async () => {
    const saved = [];
    let releaseFirst;
    const unitElement = (text) => ({ text, isConnected: false, matches: () => false, classList: { add() {}, remove() {} } });
    const app = loadAppFunctions([...SAVE_MAPPING, "flushProposalUnitSave"], {
      state: { proposalEditing: null, proposalSaving: false, requests: [] },
      api: (url, options) => {
        saved.push(JSON.parse(options.body).unitId);
        return saved.length === 1 ? new Promise((resolve) => { releaseFirst = resolve; }) : Promise.resolve({});
      },
      canonicalEditableText: (target) => target.text,
      refreshRequests: async () => {},
      setSaveState() {},
      showToast() {},
      flushPendingRender() {},
      setTimeout,
    });
    const edit = (id) => ({ element: unitElement(`new ${id}`), request: { id: "r" }, unit: { id, ...plainSource(`old ${id}`) } });
    app.state.proposalEditing = edit("a");
    const first = app.flushProposalUnitSave();
    app.state.proposalEditing = edit("b");
    assert.equal(await app.flushProposalUnitSave(), false);
    releaseFirst({});
    await first;
    await tick();
    assert.deepEqual(saved, ["a", "b"]);
    assert.equal(app.state.proposalEditing, null);
  });
});
