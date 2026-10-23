import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { loadAppFunctions } from "./helpers.mjs";

const SAMPLE_PATH = "sections/01_introduction.tex";
const OTHER_PATH = "sections/02_related_work.tex";
const SAMPLE_SOURCE = readFileSync(new URL("../examples/sample-paper/sections/01_introduction.tex", import.meta.url), "utf8");
const SAMPLE_PASSAGE = "Bright streets are also loud streets.";
assert.ok(SAMPLE_SOURCE.includes(SAMPLE_PASSAGE));

const FUNCTIONS = [
  "compareCurrentReviewRequests", "currentReviewRequests", "reviewNavigationBlockIndex",
  "commentNavigationRequests", "rememberCommentNavigation", "updateCommentNavigation",
  "commentReadingBlockIndex", "commentNavigationTarget", "navigateReviewComment", "focusReviewLink",
];

function request(id, blockIndex, extra = {}) {
  return { id, path: SAMPLE_PATH, blockIndex, absoluteStart: blockIndex * 100, selectedText: SAMPLE_PASSAGE, status: "pending", createdAt: id, ...extra };
}

function page(requests, { readingBlock = 0, save = async () => true } = {}) {
  const events = [];
  const state = { document: { path: SAMPLE_PATH, source: SAMPLE_SOURCE }, requests, workspaceMode: "text", focusedReviewRequestId: null };
  const control = () => ({ disabled: false, setAttribute(name, value) { this[name] = value; } });
  const scrolling = (kind, id) => ({ scrollIntoView(options) { events.push({ kind, id, options }); } });
  const idFromSelector = (selector) => selector.match(/="([^"]+)"/)?.[1];
  const dom = {
    previousComment: control(), nextComment: control(), commentPosition: control(),
    editorPane: { getBoundingClientRect: () => ({ top: 50, bottom: 500 }) },
    editor: {
      querySelector: (selector) => scrolling("text", idFromSelector(selector)),
      querySelectorAll: () => [
        { dataset: { blockIndex: String(readingBlock - 1) }, getBoundingClientRect: () => ({ top: -20, bottom: 49 }) },
        { dataset: { blockIndex: String(readingBlock) }, getBoundingClientRect: () => ({ top: 49, bottom: 120 }) },
      ],
    },
    requestList: { querySelector: (selector) => scrolling("card", idFromSelector(selector)) },
  };
  const app = loadAppFunctions(FUNCTIONS, {
    state, dom, CSS: { escape: (value) => value },
    linkedChangeForCurrentDocument: (item) => item.path === state.document.path ? { blockIndex: item.blockIndex } : null,
    resolvedRequestBlockIndex: (item) => item.blockIndex,
    resolvedRequestAbsoluteRange: (item) => ({ start: item.absoluteStart }),
    settlePendingEdits: async () => { events.push({ kind: "save" }); return save(state); },
    setWorkspaceMode: async (mode) => { state.workspaceMode = mode; },
    flushPendingRender: () => events.push({ kind: "render" }),
    closeCodexChat: () => events.push({ kind: "comments" }),
    positionCommentCards: () => events.push({ kind: "layout" }),
    requestAnimationFrame: (callback) => callback(),
    paintReviewLinks: (ids) => events.push({ kind: "highlight", id: ids[0] }),
    scrollToBlock: (index) => events.push({ kind: "fallback", index }),
    showToast: (message) => events.push({ kind: "toast", message }),
  });
  return { app, state, dom, events };
}

describe("previous and next comment navigation", () => {
  it("orders all open comment types by source position and creation, leaving out other files and lost anchors", () => {
    const { app } = page([
      request("d", 3, { status: "discussed", responseMode: "link" }),
      request("c", 2, { status: "proposed" }), request("b", 2), request("a", 0),
      request("lost", 0, { anchorValid: false }), request("missing", null),
      request("elsewhere", 1, { path: OTHER_PATH }),
      ...["resolved", "rejected", "deleted"].map((status) => request(status, 1, { status })),
    ]);
    assert.equal(app.commentNavigationRequests().map((item) => item.id).join(","), "a,b,c,d");
  });

  it("starts at the visible reading position and scrolls and highlights both sides", async () => {
    const { app, state, dom, events } = page([request("a", 1), request("b", 5), request("c", 9)], { readingBlock: 5 });
    assert.equal(await app.navigateReviewComment(1), true);
    assert.equal(state.focusedReviewRequestId, "b");
    assert.equal(dom.commentPosition.textContent, "2 / 3");
    assert.equal(events.filter((event) => event.id === "b").map((event) => event.kind).sort().join(","), "card,highlight,text");
    assert.equal(events[0].kind, "save");
  });

  it("moves both ways, including separate comments on one paragraph, and wraps with feedback", async () => {
    const { app, state, events } = page([request("a", 1), request("b", 1), request("c", 9)]);
    app.focusReviewLink("a");
    await app.navigateReviewComment(1);
    assert.equal(state.focusedReviewRequestId, "b");
    await app.navigateReviewComment(1);
    assert.equal(state.focusedReviewRequestId, "c");
    await app.navigateReviewComment(1);
    assert.equal(state.focusedReviewRequestId, "a");
    assert.equal(events.at(-1).message, "Back to the first comment.");
    await app.navigateReviewComment(-1);
    assert.equal(state.focusedReviewRequestId, "c");
    assert.equal(events.at(-1).message, "Back to the last comment.");
    await app.navigateReviewComment(-1);
    assert.equal(state.focusedReviewRequestId, "b");
  });

  it("starts Previous at or above the reading position", async () => {
    const { app, state } = page([request("a", 1), request("b", 5), request("c", 9)], { readingBlock: 6 });
    await app.navigateReviewComment(-1);
    assert.equal(state.focusedReviewRequestId, "b");
  });

  for (const status of ["resolved", "rejected", "deleted"]) {
    it(`continues after the current comment is ${status}, even when later offsets change`, async () => {
      const { app, state } = page([request("a", 1), request("b", 5), request("c", 9)]);
      app.focusReviewLink("b");
      state.requests[1].status = status;
      state.requests[2].blockIndex = 2;
      state.requests[2].absoluteStart = 200;
      state.focusedReviewRequestId = null;
      await app.navigateReviewComment(1);
      assert.equal(state.focusedReviewRequestId, "c");
    });
  }

  it("continues backwards after removal and skips other comments resolved in the meantime", async () => {
    const { app, state } = page([request("a", 1), request("b", 3), request("c", 5), request("d", 7)]);
    app.focusReviewLink("d");
    state.requests[3].status = "resolved";
    state.requests[2].status = "resolved";
    state.focusedReviewRequestId = null;
    await app.navigateReviewComment(-1);
    assert.equal(state.focusedReviewRequestId, "b");
  });

  it("keeps its position when an async proposal arrives and a new comment appears", async () => {
    const { app, state, dom } = page([request("a", 1), request("b", 3)]);
    app.focusReviewLink("a");
    state.requests[0].status = "proposed";
    state.requests.push(request("c", 2));
    app.updateCommentNavigation();
    assert.equal(dom.commentPosition.textContent, "1 / 3");
    await app.navigateReviewComment(1);
    assert.equal(state.focusedReviewRequestId, "c");
  });

  it("disables an empty list, handles a single comment and ignores cursors from another file", async () => {
    const empty = page([]);
    empty.app.updateCommentNavigation();
    assert.equal(empty.dom.previousComment.disabled, true);
    assert.equal(empty.dom.nextComment.disabled, true);
    assert.equal(empty.dom.commentPosition.textContent, "0 / 0");
    assert.equal(await empty.app.navigateReviewComment(1), false);
    const single = page([request("a", 1)]);
    single.state.commentNavigation = { path: OTHER_PATH, id: "x", order: ["x", "a"] };
    await single.app.navigateReviewComment(1);
    await single.app.navigateReviewComment(-1);
    assert.equal(single.dom.commentPosition.textContent, "1 / 1");
    assert.equal(single.events.filter((event) => event.kind === "toast").length, 0);
  });

  it("preserves an unsaved edit and stops when saving fails", async () => {
    const { app, state, dom, events } = page([request("a", 1)], { save: async () => false });
    state.editing = { text: SAMPLE_PASSAGE };
    assert.equal(await app.navigateReviewComment(1), false);
    assert.equal(state.editing.text, SAMPLE_PASSAGE);
    assert.equal(events.some((event) => ["card", "text", "highlight"].includes(event.kind)), false);
    assert.equal(dom.nextComment.disabled, false);
  });

  it("waits for saving, refuses duplicate clicks and cancels if the file changes meanwhile", async () => {
    let finish;
    const saved = new Promise((resolve) => { finish = resolve; });
    const { app, state, dom, events } = page([request("a", 1)], { save: () => saved });
    const pending = app.navigateReviewComment(1);
    assert.equal(dom.nextComment.disabled, true);
    assert.equal(dom.previousComment.disabled, true);
    assert.equal(await app.navigateReviewComment(-1), false);
    state.document = { path: OTHER_PATH };
    finish(true);
    assert.equal(await pending, false);
    assert.equal(state.commentNavigationBusy, false);
    assert.equal(events.some((event) => event.kind === "highlight"), false);
  });

  it("uses a current block as a fallback when the inline badge is not rendered", async () => {
    const { app, dom, events } = page([request("a", 5)]);
    dom.editor.querySelector = () => null;
    await app.navigateReviewComment(1);
    assert.equal(events.find((event) => event.kind === "fallback").index, 5);
  });
});
