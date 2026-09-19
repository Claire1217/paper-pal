
const dom = {
  productTitle: document.querySelector("#product-title"),
  projectLabel: document.querySelector("#project-label"),
  documentSelect: document.querySelector("#document-select"),
  documentTitle: document.querySelector("#document-title"),
  documentMeta: document.querySelector("#document-meta"),
  showTextWorkspace: document.querySelector("#show-text-workspace"),
  showStructureWorkspace: document.querySelector("#show-structure-workspace"),
  sectionState: document.querySelector(".section-state"),
  editorPane: document.querySelector(".editor-pane"),
  editor: document.querySelector("#editor"),
  structureWorkspace: document.querySelector("#structure-workspace"),
  structureScopeCount: document.querySelector("#structure-scope-count"),
  currentStructureTree: document.querySelector("#current-structure-tree"),
  proposedStructureTree: document.querySelector("#proposed-structure-tree"),
  structureProposalStatus: document.querySelector("#structure-proposal-status"),
  confirmStructure: document.querySelector("#confirm-structure"),
  revertStructure: document.querySelector("#revert-structure"),
  selectMainSections: document.querySelector("#select-main-sections"),
  structureInstruction: document.querySelector("#structure-instruction"),
  structureStatus: document.querySelector("#structure-status"),
  discussStructure: document.querySelector("#discuss-structure"),
  generateStructure: document.querySelector("#generate-structure"),
  outlineList: document.querySelector("#outline-list"),
  outlineCount: document.querySelector("#outline-count"),
  outlineModeToggle: document.querySelector("#outline-mode-toggle"),
  undoButton: document.querySelector("#undo-button"),
  reloadButton: document.querySelector("#reload-button"),
  saveButton: document.querySelector("#save-button"),
  progressRing: document.querySelector("#progress-ring"),
  progressValue: document.querySelector("#progress-value"),
  sectionProgressFill: document.querySelector("#section-progress-fill"),
  sectionProgressValue: document.querySelector("#section-progress-value"),
  toggleSectionReview: document.querySelector("#toggle-section-review"),
  referenceManager: document.querySelector("#reference-manager"),
  referenceSummary: document.querySelector("#reference-summary"),
  referenceSearch: document.querySelector("#reference-search"),
  referenceList: document.querySelector("#reference-list"),
  compiledSourceStatus: document.querySelector("#compiled-source-status"),
  requestList: document.querySelector("#request-list"),
  requestCount: document.querySelector("#request-count"),
  commentsTrack: document.querySelector("#comments-track"),
  commentsView: document.querySelector("#comments-view"),
  showCommentsPane: document.querySelector("#show-comments-pane"),
  reviewPane: document.querySelector(".comments-pane"),
  reviewPaneResizer: document.querySelector("#review-pane-resizer"),
  outlineRail: document.querySelector(".outline-rail"),
  outlinePaneResizer: document.querySelector("#outline-pane-resizer"),
  otherComments: document.querySelector("#other-comments"),
  otherRequestList: document.querySelector("#other-request-list"),
  otherRequestCount: document.querySelector("#other-request-count"),
  paperPreview: document.querySelector("#paper-preview"),
  paperSwitcher: document.querySelector("#paper-switcher"),
  paperPreviewContent: document.querySelector("#paper-preview-content"),
  paperPreviewEyebrow: document.querySelector("#paper-preview-eyebrow"),
  paperPreviewTitle: document.querySelector("#paper-preview-title"),
  closePaperPreview: document.querySelector("#close-paper-preview"),
  paperPreviewSizeToggle: document.querySelector("#paper-preview-size-toggle"),
  gitIndicator: document.querySelector("#git-indicator"),
  refreshGit: document.querySelector("#refresh-git"),
  compileButton: document.querySelector("#compile-button"),
  compileStatus: document.querySelector("#compile-status"),
  compileLog: document.querySelector("#compile-log"),
  compileDetails: document.querySelector("#compile-details"),
  previewButton: document.querySelector("#preview-button"),
  selectionToolbar: document.querySelector("#selection-toolbar"),
  confirmSelection: document.querySelector("#confirm-selection"),
  commentSelection: document.querySelector("#comment-selection"),
  commentComposer: document.querySelector("#comment-composer"),
  commentComposerStatus: document.querySelector("#comment-composer .composer-status"),
  commentComposerOptions: document.querySelector("#comment-composer .composer-options"),
  selectedQuote: document.querySelector("#selected-quote"),
  commentInput: document.querySelector("#comment-input"),
  rewriteScope: document.querySelector("#rewrite-scope"),
  contextMode: document.querySelector("#context-mode"),
  closeComment: document.querySelector("#close-comment"),
  cancelComment: document.querySelector("#cancel-comment"),
  askCommentInChat: document.querySelector("#ask-comment-in-chat"),
  submitComment: document.querySelector("#submit-comment"),
  findLinked: document.querySelector("#find-linked"),
  openCodexChat: document.querySelector("#open-codex-chat"),
  codexChat: document.querySelector("#codex-chat"),
  codexChatModel: document.querySelector("#codex-chat-model"),
  agentProvider: document.querySelector("#agent-provider"),
  agentModelPicker: document.querySelector("#agent-model-picker"),
  scopeHint: document.querySelector("#scope-hint"),
  reviewSection: document.querySelector("#review-section"),
  sectionReviewActions: document.querySelector(".section-review-actions"),
  connectionStatus: document.querySelector("#connection-status"),
  gitCard: document.querySelector(".git-card"),
  reviewPanel: document.querySelector("#review-panel"),
  reviewPanelClose: document.querySelector("#review-panel-close"),
  reviewSummary: document.querySelector("#review-summary"),
  reviewFindings: document.querySelector("#review-findings"),
  agentModel: document.querySelector("#agent-model"),
  agentPicker: document.querySelector("#agent-picker"),
  agentProviderButton: document.querySelector("#agent-provider-button"),
  agentProviderCurrent: document.querySelector("#agent-provider-current"),
  agentProviderMenu: document.querySelector("#agent-provider-menu"),
  agentNotice: document.querySelector("#agent-notice"),
  agentNoticeTitle: document.querySelector("#agent-notice-title"),
  agentNoticeDetail: document.querySelector("#agent-notice-detail"),
  themeToggle: document.querySelector("#theme-toggle"),
  themeMenu: document.querySelector("#theme-menu"),
  codexChatDocument: document.querySelector("#codex-chat-document"),
  codexChatMessages: document.querySelector("#codex-chat-messages"),
  codexChatInput: document.querySelector("#codex-chat-input"),
  codexChatStatus: document.querySelector("#codex-chat-status"),
  toggleChatList: document.querySelector("#toggle-chat-list"),
  chatListCount: document.querySelector("#chat-list-count"),
  codexChatList: document.querySelector("#codex-chat-list"),
  codexChatSessions: document.querySelector("#codex-chat-sessions"),
  sendCodexChat: document.querySelector("#send-codex-chat"),
  stopCodexChat: document.querySelector("#stop-codex-chat"),
  newCodexChat: document.querySelector("#new-codex-chat"),
  closeCodexChat: document.querySelector("#close-codex-chat"),
  externalChange: document.querySelector("#external-change"),
  externalChangeMessage: document.querySelector("#external-change-message"),
  externalKeep: document.querySelector("#external-keep"),
  externalReload: document.querySelector("#external-reload"),
  toast: document.querySelector("#toast"),
};

const state = {
  bootstrap: null,
  agentProvider: null,
  agentModel: null,
  document: null,
  selection: null,
  commentDraft: null,
  editing: null,
  proposalEditing: null,
  proposalSaving: false,
  saveTimer: null,
  saving: false,
  toastTimer: null,
  externalChange: false,
  saveConflict: false,
  requests: [],
  compiledOutline: null,
  outlineScrollTimer: null,
  outlineSelectionLockUntil: 0,
  commentPositionFrame: null,
  commentResizeFrame: null,
  paperPreviewFocus: null,
  paperPreviewExpanded: false,
  paperPreviewMode: null,
  compiledPdfUrl: "/api/pdf",
  chat: null,
  chats: [],
  chatComposing: false,
  chatCompositionEndedAt: 0,
  sidePaneWidths: { comments: null, chat: null },
  sidePaneResize: null,
  outlinePaneWidth: null,
  outlinePaneResize: null,
  undo: null,
  workspaceMode: "text",
  structure: null,
  structureSelected: new Set(),
  structureProposal: null,
  structurePlan: null,
  outlinePreview: true,
  activeOutline: null,
  sectionReviewBusy: false,
  focusedReviewRequestId: null,
  savePromise: null,
  renderPending: false,
  suppressRender: false,
  lastPointerInEditorPane: false,
  mathUnavailableNotified: false,
  chatRenderSignature: null,
  review: null,
};

const commentCardResizeObserver = typeof ResizeObserver === "function"
  ? new ResizeObserver(() => {
      cancelAnimationFrame(state.commentResizeFrame);
      state.commentResizeFrame = requestAnimationFrame(() => positionCommentCards());
    })
  : null;

const SIDE_PANE_WIDTHS_KEY = "paper-pal.side-pane-widths.v1";
const STORAGE_PREFIX = "paper-pal.";
const LEGACY_STORAGE_PREFIX = "draft-review.";

// One-time move of UI preferences saved under the project's previous name.
// A key that already exists under the new prefix always wins.
function migrateLegacyStorage() {
  try {
    const legacyKeys = [];
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (key?.startsWith(LEGACY_STORAGE_PREFIX)) legacyKeys.push(key);
    }
    for (const key of legacyKeys) {
      const nextKey = `${STORAGE_PREFIX}${key.slice(LEGACY_STORAGE_PREFIX.length)}`;
      if (localStorage.getItem(nextKey) === null) localStorage.setItem(nextKey, localStorage.getItem(key));
      localStorage.removeItem(key);
    }
  } catch {
    // Browser storage is optional; preferences simply start fresh.
  }
}

// Bibliography files and model replies are untrusted. Only plain web links may
// ever reach an href or an iframe src.
function safeHttpUrl(value) {
  try {
    const url = new URL(String(value ?? "").trim());
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

function tokenizeDiffText(value) {
  return String(value ?? "").match(/\s+|[A-Za-z0-9]+(?:[-’'][A-Za-z0-9]+)*|./gu) || [];
}

function compactDiffOperations(operations) {
  const compacted = [];
  for (const operation of operations) {
    if (!operation.text) continue;
    const previous = compacted.at(-1);
    if (previous?.type === operation.type) previous.text += operation.text;
    else compacted.push({ ...operation });
  }
  return compacted;
}

// Token budget for the quadratic table, applied after shared head and tail
// tokens are trimmed. Only a near-total rewrite of a long block reaches it.
const DIFF_CORE_TOKEN_LIMIT = 1200;

function diffTextOperations(beforeValue, afterValue) {
  const before = String(beforeValue ?? "");
  const after = String(afterValue ?? "");
  if (before === after) return [{ type: "equal", text: before }];
  const beforeTokens = tokenizeDiffText(before);
  const afterTokens = tokenizeDiffText(after);

  // Edited prose usually keeps its opening and closing intact. Trimming those
  // runs first keeps the table small enough to stay word-level on long blocks.
  const sharedLength = Math.min(beforeTokens.length, afterTokens.length);
  let head = 0;
  while (head < sharedLength && beforeTokens[head] === afterTokens[head]) head += 1;
  let tail = 0;
  while (
    tail < sharedLength - head
    && beforeTokens[beforeTokens.length - 1 - tail] === afterTokens[afterTokens.length - 1 - tail]
  ) tail += 1;

  const beforeCore = beforeTokens.slice(head, beforeTokens.length - tail);
  const afterCore = afterTokens.slice(head, afterTokens.length - tail);
  const headText = beforeTokens.slice(0, head).join("");
  const tailText = tail ? beforeTokens.slice(beforeTokens.length - tail).join("") : "";

  if (beforeCore.length > DIFF_CORE_TOKEN_LIMIT || afterCore.length > DIFF_CORE_TOKEN_LIMIT) {
    return compactDiffOperations([
      { type: "equal", text: headText },
      { type: "delete", text: beforeCore.join("") },
      { type: "insert", text: afterCore.join("") },
      { type: "equal", text: tailText },
    ]);
  }

  const table = Array.from(
    { length: beforeCore.length + 1 },
    () => new Uint16Array(afterCore.length + 1),
  );
  for (let beforeIndex = beforeCore.length - 1; beforeIndex >= 0; beforeIndex -= 1) {
    for (let afterIndex = afterCore.length - 1; afterIndex >= 0; afterIndex -= 1) {
      table[beforeIndex][afterIndex] = beforeCore[beforeIndex] === afterCore[afterIndex]
        ? table[beforeIndex + 1][afterIndex + 1] + 1
        : Math.max(table[beforeIndex + 1][afterIndex], table[beforeIndex][afterIndex + 1]);
    }
  }

  const operations = [{ type: "equal", text: headText }];
  let beforeIndex = 0;
  let afterIndex = 0;
  while (beforeIndex < beforeCore.length && afterIndex < afterCore.length) {
    if (beforeCore[beforeIndex] === afterCore[afterIndex]) {
      operations.push({ type: "equal", text: beforeCore[beforeIndex] });
      beforeIndex += 1;
      afterIndex += 1;
    } else if (table[beforeIndex + 1][afterIndex] >= table[beforeIndex][afterIndex + 1]) {
      operations.push({ type: "delete", text: beforeCore[beforeIndex] });
      beforeIndex += 1;
    } else {
      operations.push({ type: "insert", text: afterCore[afterIndex] });
      afterIndex += 1;
    }
  }
  while (beforeIndex < beforeCore.length) {
    operations.push({ type: "delete", text: beforeCore[beforeIndex] });
    beforeIndex += 1;
  }
  while (afterIndex < afterCore.length) {
    operations.push({ type: "insert", text: afterCore[afterIndex] });
    afterIndex += 1;
  }
  operations.push({ type: "equal", text: tailText });
  return compactDiffOperations(operations);
}

// A word-level diff of edited prose alternates one-word deletions and
// insertions ("~which~so ~makes~a …"), which nobody can read. Fold every run of
// changes that is separated only by whitespace or a very short unchanged token
// into a single phrase: one deletion followed by one insertion.
const DIFF_BRIDGE_MAX_CHARS = 3;

function isBridgeableDiffGap(text) {
  return !text.includes("\n") && text.trim().length <= DIFF_BRIDGE_MAX_CHARS;
}

function mergeDiffPhrases(operations) {
  const merged = [];
  let index = 0;
  while (index < operations.length) {
    if (operations[index].type === "equal") {
      merged.push({ ...operations[index] });
      index += 1;
      continue;
    }
    const regionStart = index;
    let removed = "";
    let added = "";
    while (index < operations.length) {
      const operation = operations[index];
      if (operation.type === "delete") removed += operation.text;
      else if (operation.type === "insert") added += operation.text;
      else {
        const next = operations[index + 1];
        if (!next || next.type === "equal" || !isBridgeableDiffGap(operation.text)) break;
        removed += operation.text;
        added += operation.text;
      }
      index += 1;
    }
    if (removed.trim() && added.trim()) {
      merged.push({ type: "delete", text: removed }, { type: "insert", text: added });
    } else {
      // A pure insertion or pure deletion gains nothing from bridging; keep
      // the original pieces, whose unchanged gaps already separate them.
      for (const operation of operations.slice(regionStart, index)) merged.push({ ...operation });
    }
  }
  return compactDiffOperations(merged);
}

function phraseDiffOperations(beforeValue, afterValue) {
  return mergeDiffPhrases(diffTextOperations(beforeValue, afterValue));
}

// True when two adjacent rendered pieces would read as one word.
function diffPiecesRunTogether(previousText, nextText) {
  return Boolean(previousText) && Boolean(nextText) && !/\s$/u.test(previousText) && !/^\s/u.test(nextText);
}

// Below this share of retained text a proposal is a rewrite rather than an
// edit, and a word-level diff reads as noise. Only then is the whole block
// shown as one deletion followed by one addition.
const INLINE_DIFF_SIMILARITY_MIN = 0.2;

function diffRetainedShare(operations) {
  let equal = 0;
  let before = 0;
  let after = 0;
  for (const operation of operations) {
    const length = operation.text.length;
    if (operation.type === "equal") {
      equal += length;
      before += length;
      after += length;
    } else if (operation.type === "delete") before += length;
    else after += length;
  }
  const span = Math.max(before, after);
  return span ? equal / span : 1;
}

function appendTextDiff(container, beforeValue, afterValue, { emptyLabel = "Delete selected text" } = {}) {
  const before = String(beforeValue ?? "");
  const after = String(afterValue ?? "");
  const operations = phraseDiffOperations(before, after);
  const removedLine = document.createElement("div");
  removedLine.className = "request-diff-line request-diff-before";
  const addedLine = document.createElement("div");
  addedLine.className = "request-diff-line request-diff-after";

  for (const operation of operations) {
    if (operation.type !== "insert") {
      if (operation.type === "delete") {
        const removed = document.createElement("del");
        removed.textContent = operation.text;
        removedLine.append(removed);
      } else {
        removedLine.append(document.createTextNode(operation.text));
      }
    }
    if (operation.type !== "delete") {
      if (operation.type === "insert") {
        const added = document.createElement("ins");
        added.textContent = operation.text;
        addedLine.append(added);
      } else {
        addedLine.append(document.createTextNode(operation.text));
      }
    }
  }

  if (!after) {
    addedLine.classList.add("proposal-empty");
    addedLine.textContent = emptyLabel;
  }
  container.append(removedLine, addedLine);
}

function currentSidePaneMode() {
  return dom.codexChat.hidden ? "comments" : "chat";
}

function editorMinimumWidth(mode = currentSidePaneMode()) {
  if (window.innerWidth <= 900) return 490;
  if (window.innerWidth <= 1120) return mode === "chat" ? 400 : 480;
  if (window.innerWidth <= 1300) return mode === "chat" ? 450 : 500;
  return mode === "chat" ? 500 : 520;
}

function sidePaneWidthBounds(mode = currentSidePaneMode()) {
  const minimum = mode === "chat" ? 320 : 260;
  const outlineWidth = dom.outlineRail?.getBoundingClientRect().width || 220;
  const editorMinimum = editorMinimumWidth(mode);
  const available = window.innerWidth - outlineWidth - editorMinimum;
  return { minimum, maximum: Math.max(minimum, Math.min(720, available)) };
}

function updateSidePaneResizeAria() {
  const mode = currentSidePaneMode();
  const bounds = sidePaneWidthBounds(mode);
  const width = Math.round(dom.reviewPane.getBoundingClientRect().width);
  dom.reviewPaneResizer.setAttribute("aria-valuemin", String(Math.round(bounds.minimum)));
  dom.reviewPaneResizer.setAttribute("aria-valuemax", String(Math.round(bounds.maximum)));
  dom.reviewPaneResizer.setAttribute("aria-valuenow", String(width));
  dom.reviewPaneResizer.setAttribute("aria-valuetext", `${mode === "chat" ? "Chat" : "Comments"} width ${width} pixels`);
}

function saveSidePaneWidths() {
  try {
    localStorage.setItem(SIDE_PANE_WIDTHS_KEY, JSON.stringify({
      ...state.sidePaneWidths,
      outline: state.outlinePaneWidth,
    }));
  } catch {
    // Resizing still works when browser storage is unavailable.
  }
}

function loadSidePaneWidths() {
  try {
    const saved = JSON.parse(localStorage.getItem(SIDE_PANE_WIDTHS_KEY) || "{}");
    for (const mode of ["comments", "chat"]) {
      if (Number.isFinite(saved?.[mode])) state.sidePaneWidths[mode] = saved[mode];
    }
    if (Number.isFinite(saved?.outline)) state.outlinePaneWidth = saved.outline;
  } catch {
    state.sidePaneWidths = { comments: null, chat: null };
    state.outlinePaneWidth = null;
  }
}

function outlinePaneWidthBounds() {
  const minimum = 170;
  const reviewWidth = dom.reviewPane?.getBoundingClientRect().width || 0;
  const editorMinimum = editorMinimumWidth();
  const available = window.innerWidth - reviewWidth - editorMinimum;
  return { minimum, maximum: Math.max(minimum, Math.min(420, available)) };
}

function updateOutlinePaneResizeAria() {
  const bounds = outlinePaneWidthBounds();
  const width = Math.round(dom.outlineRail.getBoundingClientRect().width);
  dom.outlinePaneResizer.setAttribute("aria-valuemin", String(Math.round(bounds.minimum)));
  dom.outlinePaneResizer.setAttribute("aria-valuemax", String(Math.round(bounds.maximum)));
  dom.outlinePaneResizer.setAttribute("aria-valuenow", String(width));
  dom.outlinePaneResizer.setAttribute("aria-valuetext", `Document outline width ${width} pixels`);
}

function applyOutlinePaneWidth() {
  if (Number.isFinite(state.outlinePaneWidth)) {
    const bounds = outlinePaneWidthBounds();
    const width = Math.min(bounds.maximum, Math.max(bounds.minimum, state.outlinePaneWidth));
    document.body.style.setProperty("--outline-pane-width", `${Math.round(width)}px`);
  } else {
    document.body.style.removeProperty("--outline-pane-width");
  }
  requestAnimationFrame(() => {
    updateOutlinePaneResizeAria();
    positionCommentCards();
  });
}

function setOutlinePaneWidth(width, { persist = false } = {}) {
  const bounds = outlinePaneWidthBounds();
  const next = Math.round(Math.min(bounds.maximum, Math.max(bounds.minimum, width)));
  state.outlinePaneWidth = next;
  document.body.style.setProperty("--outline-pane-width", `${next}px`);
  updateOutlinePaneResizeAria();
  requestAnimationFrame(positionCommentCards);
  if (persist) saveSidePaneWidths();
}

function resetOutlinePaneWidth() {
  state.outlinePaneWidth = null;
  saveSidePaneWidths();
  applyOutlinePaneWidth();
}

function beginOutlinePaneResize(event) {
  if (event.button !== 0) return;
  event.preventDefault();
  finishSidePaneResize();
  state.outlinePaneResize = { pointerId: event.pointerId };
  document.body.classList.add("outline-pane-resizing");
  try {
    dom.outlinePaneResizer.setPointerCapture(event.pointerId);
  } catch {
    // Window-level listeners and the drag shield keep the gesture alive.
  }
  setOutlinePaneWidth(event.clientX);
}

function moveOutlinePaneResize(event) {
  if (state.outlinePaneResize?.pointerId !== event.pointerId) return;
  event.preventDefault();
  setOutlinePaneWidth(event.clientX);
}

function finishOutlinePaneResize(event = null) {
  if (!state.outlinePaneResize) return;
  if (event?.pointerId != null && state.outlinePaneResize.pointerId !== event.pointerId) return;
  const pointerId = state.outlinePaneResize.pointerId;
  state.outlinePaneResize = null;
  document.body.classList.remove("outline-pane-resizing");
  try {
    if (dom.outlinePaneResizer.hasPointerCapture(pointerId)) {
      dom.outlinePaneResizer.releasePointerCapture(pointerId);
    }
  } catch {
    // The pointer may already have been released by the browser.
  }
  saveSidePaneWidths();
  updateOutlinePaneResizeAria();
}

function handleOutlinePaneResizeKey(event) {
  if (!["ArrowLeft", "ArrowRight", "Home"].includes(event.key)) return;
  event.preventDefault();
  if (event.key === "Home") {
    resetOutlinePaneWidth();
    return;
  }
  const step = event.shiftKey ? 32 : 12;
  const current = dom.outlineRail.getBoundingClientRect().width;
  setOutlinePaneWidth(current + (event.key === "ArrowRight" ? step : -step), { persist: true });
}

function applySidePaneWidth(mode = currentSidePaneMode()) {
  const saved = state.sidePaneWidths[mode];
  if (Number.isFinite(saved)) {
    const bounds = sidePaneWidthBounds(mode);
    const width = Math.min(bounds.maximum, Math.max(bounds.minimum, saved));
    document.body.style.setProperty("--review-pane-width", `${Math.round(width)}px`);
  } else {
    document.body.style.removeProperty("--review-pane-width");
  }
  requestAnimationFrame(() => {
    updateSidePaneResizeAria();
    positionCommentCards();
  });
}

function setSidePaneWidth(width, { persist = false } = {}) {
  const mode = currentSidePaneMode();
  const bounds = sidePaneWidthBounds(mode);
  const next = Math.round(Math.min(bounds.maximum, Math.max(bounds.minimum, width)));
  state.sidePaneWidths[mode] = next;
  document.body.style.setProperty("--review-pane-width", `${next}px`);
  updateSidePaneResizeAria();
  requestAnimationFrame(positionCommentCards);
  if (persist) saveSidePaneWidths();
}

function resetSidePaneWidth() {
  state.sidePaneWidths[currentSidePaneMode()] = null;
  saveSidePaneWidths();
  applySidePaneWidth();
}

function beginSidePaneResize(event) {
  if (event.button !== 0) return;
  event.preventDefault();
  finishOutlinePaneResize();
  state.sidePaneResize = { pointerId: event.pointerId };
  document.body.classList.add("side-pane-resizing");
  try {
    dom.reviewPaneResizer.setPointerCapture(event.pointerId);
  } catch {
    // Window-level listeners and the drag shield keep the gesture alive.
  }
  setSidePaneWidth(window.innerWidth - event.clientX);
}

function moveSidePaneResize(event) {
  if (state.sidePaneResize?.pointerId !== event.pointerId) return;
  event.preventDefault();
  setSidePaneWidth(window.innerWidth - event.clientX);
}

function finishSidePaneResize(event = null) {
  if (!state.sidePaneResize) return;
  if (event?.pointerId != null && state.sidePaneResize.pointerId !== event.pointerId) return;
  const pointerId = state.sidePaneResize.pointerId;
  state.sidePaneResize = null;
  document.body.classList.remove("side-pane-resizing");
  try {
    if (dom.reviewPaneResizer.hasPointerCapture(pointerId)) {
      dom.reviewPaneResizer.releasePointerCapture(pointerId);
    }
  } catch {
    // The pointer may already have been released by the browser.
  }
  saveSidePaneWidths();
  updateSidePaneResizeAria();
}

function handleSidePaneResizeKey(event) {
  if (!["ArrowLeft", "ArrowRight", "Home"].includes(event.key)) return;
  event.preventDefault();
  if (event.key === "Home") {
    resetSidePaneWidth();
    return;
  }
  const step = event.shiftKey ? 32 : 12;
  const current = dom.reviewPane.getBoundingClientRect().width;
  setSidePaneWidth(current + (event.key === "ArrowLeft" ? step : -step), { persist: true });
}

// Endpoints that start agent work. The chosen provider rides along on every
// one of them so no individual call site has to remember to send it.
const AGENT_ENDPOINTS = new Set([
  "/api/rewrite",
  "/api/chat/message",
  "/api/request/process",
  "/api/request/generate-proposal",
  "/api/request/regenerate",
  "/api/request/followup",
  "/api/structure/section-rewrite",
  "/api/document/review",
  "/api/document/review/accept",
]);

function withAgentProvider(url, options) {
  const provider = state.agentProvider;
  if (!provider || options.method !== "POST" || !AGENT_ENDPOINTS.has(url)) return options;
  let body;
  try {
    body = JSON.parse(options.body || "{}");
  } catch {
    return options;
  }
  const model = state.agentModel;
  return { ...options, body: JSON.stringify({ ...body, provider, ...(model ? { model } : {}) }) };
}

// Every request goes through here. Anything that is not a plain read carries
// the JSON content type and the X-Paper-Pal marker header; a cross-site form
// or no-cors request cannot set either, so the server can refuse those.
async function api(url, options = {}) {
  options = withAgentProvider(url, options);
  const method = String(options.method || "GET").toUpperCase();
  const mutating = method !== "GET" && method !== "HEAD";
  const headers = {
    ...(mutating ? { "Content-Type": "application/json", "X-Paper-Pal": "1" } : {}),
    ...(options.headers || {}),
  };
  const response = await fetch(url, {
    ...options,
    method,
    ...(mutating && options.body == null ? { body: "{}" } : {}),
    headers,
  });
  const value = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(value.error || `Request failed (${response.status})`);
  return value;
}

function showToast(message, duration = 2600) {
  clearTimeout(state.toastTimer);
  dom.toast.textContent = message;
  dom.toast.hidden = false;
  state.toastTimer = setTimeout(() => { dom.toast.hidden = true; }, duration);
}

function applyUndoStatus(value) {
  state.undo = value || { available: false };
  dom.undoButton.disabled = !state.undo.available;
  dom.undoButton.title = state.undo.available ? `Undo: ${state.undo.label}` : "Nothing to undo";
}

async function refreshUndo() {
  try {
    applyUndoStatus(await api("/api/undo"));
  } catch {
    applyUndoStatus({ available: false });
  }
}

async function undoLastAction() {
  if (!(await settlePendingEdits())) return;
  dom.undoButton.disabled = true;
  try {
    const result = await api("/api/undo", { method: "POST", body: "{}" });
    applyUndoStatus(result.undo);
    await Promise.all([refreshRequests(), refreshCompiledOutline({ render: false })]);
    if (result.undone.path === state.document?.path) {
      await loadDocument(result.undone.path, { quiet: true, discardEditing: true });
    } else {
      renderOutline();
    }
    refreshGit();
    showToast(`Undid: ${result.undone.label}`, 4200);
  } catch (error) {
    showToast(error.message, 5200);
    await refreshUndo();
  }
}

function renderStructureNodeList(nodes, { proposed = false } = {}) {
  const list = document.createElement("ul");
  list.className = "structure-node-list";
  for (const node of nodes || []) {
    const item = document.createElement("li");
    item.className = `structure-node${proposed ? ` change-${node.change || "rewrite"}` : ""}`;
    const title = document.createElement("span");
    title.textContent = node.title;
    const kind = document.createElement("small");
    kind.textContent = proposed ? `${node.kind || "paragraph"} · ${node.change || "rewrite"}` : node.kind || "paragraph";
    item.append(title, kind);
    if (proposed && node.reason) {
      const reason = document.createElement("small");
      reason.className = "structure-node-reason";
      reason.textContent = node.reason;
      item.append(reason);
    }
    if (node.children?.length) item.append(renderStructureNodeList(node.children, { proposed }));
    list.append(item);
  }
  return list;
}

function updateStructureControls() {
  const selected = state.structureSelected.size;
  dom.structureScopeCount.textContent = `${selected} selected`;
  dom.structureScopeCount.classList.toggle("has-selection", selected > 0);
  const ready = selected > 0;
  dom.discussStructure.disabled = !ready;
  dom.generateStructure.disabled = !ready;
  dom.structureStatus.textContent = ready
    ? `${selected} logical section${selected === 1 ? "" : "s"} selected. One ${providerDisplayName()} chat will see the complete scope.`
    : "Choose at least one section.";
}

function renderCurrentStructure() {
  dom.currentStructureTree.replaceChildren();
  const sections = state.structure?.sections || [];
  if (!sections.length) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "No compiled paper sections were found.";
    dom.currentStructureTree.append(empty);
    return;
  }
  for (const section of sections) {
    const card = document.createElement("article");
    card.className = `structure-section-card${section.appendix ? " is-appendix" : ""}${state.structureSelected.has(section.id) ? " is-selected" : ""}`;
    const label = document.createElement("label");
    label.className = "structure-section-select";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = state.structureSelected.has(section.id);
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) state.structureSelected.add(section.id);
      else state.structureSelected.delete(section.id);
      state.structureProposal = null;
      renderCurrentStructure();
      renderProposedStructure();
      updateStructureControls();
    });
    const number = document.createElement("span");
    number.className = "structure-section-number";
    number.textContent = section.number;
    const copy = document.createElement("span");
    copy.className = "structure-section-copy";
    const title = document.createElement("strong");
    title.textContent = section.title;
    const meta = document.createElement("small");
    const paths = [...new Set((section.sources || []).map((source) => source.path.split("/").pop()))];
    meta.textContent = `${section.characterCount.toLocaleString()} chars · ${paths.join(" + ")}`;
    copy.append(title, meta);
    label.append(checkbox, number, copy);
    card.append(label);
    const root = section.nodes?.find((node) => node.level === 1);
    const children = root?.children || section.nodes || [];
    if (children.length) card.append(renderStructureNodeList(children));
    dom.currentStructureTree.append(card);
  }
  const main = sections.filter((section) => !section.appendix);
  dom.selectMainSections.textContent = main.length && main.every((section) => state.structureSelected.has(section.id))
    ? "Clear main paper"
    : "Select main paper";
}

function activeStructurePlan() {
  return state.structurePlan && !["reverted", "paused"].includes(state.structurePlan.status) ? state.structurePlan : null;
}

function structurePlanShowsPreview(plan) {
  return Boolean(plan?.proposal) && !["applied", "paused", "reverted"].includes(plan.status);
}

function structurePlanSection(sectionId) {
  return activeStructurePlan()?.sections?.find((section) => section.sectionId === sectionId) || null;
}

function renderStructurePlanControls() {
  const proposal = state.structureProposal;
  const plan = activeStructurePlan();
  const sameProposal = Boolean(plan && proposal && plan.proposal?.createdAt === proposal.createdAt);
  dom.confirmStructure.disabled = !proposal?.sections?.length || sameProposal;
  dom.confirmStructure.textContent = sameProposal ? "Structure plan approved" : "Approve structure plan";
  dom.revertStructure.hidden = !plan;
  if (plan) {
    const applied = plan.sections?.filter((section) => section.status === "applied").length || 0;
    dom.structureProposalStatus.textContent = `Plan approved · ${applied}/${plan.sections.length} writing edits applied`;
    dom.revertStructure.textContent = applied ? "Revert applied restructuring" : "Discard approved plan";
  }
  dom.outlineModeToggle.hidden = !proposal?.sections?.length;
  if (proposal?.sections?.length) dom.outlineModeToggle.textContent = state.outlinePreview ? "Showing proposed" : "Show proposed";
}

async function confirmCurrentStructure() {
  if (!state.structureProposal) return;
  dom.confirmStructure.disabled = true;
  dom.confirmStructure.textContent = "Confirming…";
  try {
    state.structurePlan = await api("/api/structure/confirm", {
      method: "POST",
      body: JSON.stringify({ proposal: state.structureProposal, sessionId: state.chat?.id || null }),
    });
    state.outlinePreview = true;
    renderProposedStructure();
    renderOutline();
    showToast("Structure plan approved. No LaTeX changed; generate writing proposals section by section when ready.", 5200);
  } catch (error) {
    showToast(error.message, 6000);
  } finally {
    renderStructurePlanControls();
  }
}

async function revertCurrentStructure() {
  if (!activeStructurePlan()) return;
  const applied = activeStructurePlan().sections?.some((section) => section.status === "applied");
  const confirmed = window.confirm(applied
    ? "Restore every source file in this restructuring plan to its pre-structure snapshot?"
    : "Discard this approved structure plan? The proposed structure will remain available for revision.");
  if (!confirmed) return;
  dom.revertStructure.disabled = true;
  try {
    state.structurePlan = await api("/api/structure/revert", { method: "POST", body: "{}" });
    state.outlinePreview = false;
    await Promise.all([refreshCompiledOutline({ render: false }), loadStructure({ force: true })]);
    if (state.document?.path) await loadDocument(state.document.path, { quiet: true, discardEditing: true });
    renderOutline();
    showToast(applied ? "The applied restructuring was reverted." : "The approved plan was discarded. No source text changed.", 4800);
  } catch (error) {
    showToast(error.message, 6000);
  } finally {
    dom.revertStructure.disabled = false;
    renderStructurePlanControls();
  }
}

async function prepareStructureSection(sectionId, button) {
  button.disabled = true;
  button.textContent = "Preparing…";
  try {
    const result = await api("/api/structure/section-rewrite", {
      method: "POST",
      body: JSON.stringify({ sectionId }),
    });
    state.structurePlan = result.plan;
    await refreshRequests();
    renderProposedStructure();
    renderOutline();
    closeCodexChat();
    showToast(`${result.requests.length} reviewable source proposal${result.requests.length === 1 ? "" : "s"} started.`, 4200);
  } catch (error) {
    showToast(error.message, 6000);
  } finally {
    renderProposedStructure();
  }
}

function renderProposedStructure() {
  dom.proposedStructureTree.replaceChildren();
  const proposal = state.structureProposal;
  if (!proposal?.sections?.length) {
    dom.structureProposalStatus.textContent = "No proposal yet";
    const empty = document.createElement("div");
    empty.className = "structure-empty";
    const title = document.createElement("strong");
    title.textContent = `Select a scope and ask ${providerDisplayName()}.`;
    const detail = document.createElement("p");
    detail.textContent = "The proposed tree will appear here; no LaTeX is changed.";
    empty.append(title, detail);
    dom.proposedStructureTree.append(empty);
    renderStructurePlanControls();
    return;
  }
  dom.structureProposalStatus.textContent = `Proposed ${new Date(proposal.createdAt || Date.now()).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  for (const proposedSection of proposal.sections) {
    const current = state.structure?.sections?.find((section) => section.id === proposedSection.sectionId);
    const planSection = structurePlanSection(proposedSection.sectionId);
    const card = document.createElement("article");
    card.className = `structure-section-card proposed-section-card${planSection ? ` plan-${planSection.status}` : ""}`;
    const header = document.createElement("div");
    header.className = "structure-section-select";
    const marker = document.createElement("span");
    marker.className = "structure-section-marker";
    marker.setAttribute("aria-hidden", "true");
    const number = document.createElement("span");
    number.className = "structure-section-number";
    number.textContent = current?.number || "–";
    const copy = document.createElement("span");
    copy.className = "structure-section-copy";
    const title = document.createElement("strong");
    title.textContent = proposedSection.title || current?.title || "Proposed section";
    const meta = document.createElement("small");
    meta.textContent = planSection
      ? `${proposedSection.nodes.length} roles · ${planSection.status}`
      : `${proposedSection.nodes.length} top-level roles`;
    copy.append(title, meta);
    header.append(marker, number, copy);
    card.append(header, renderStructureNodeList(proposedSection.nodes, { proposed: true }));
    if (proposedSection.reason) {
      const reason = document.createElement("p");
      reason.className = "proposed-section-summary";
      reason.textContent = proposedSection.reason;
      card.append(reason);
    }
    if (planSection) {
      const footer = document.createElement("footer");
      footer.className = "structure-section-actions";
      const status = document.createElement("span");
      status.className = `structure-plan-badge status-${planSection.status}`;
      status.textContent = planSection.status;
      const prepare = document.createElement("button");
      prepare.type = "button";
      prepare.className = "button button-ghost button-small";
      prepare.textContent = planSection.status === "reviewing" ? "Writing proposal in review" : planSection.status === "applied" ? "Applied" : "Generate writing proposal";
      prepare.disabled = ["reviewing", "applied"].includes(planSection.status);
      prepare.addEventListener("click", () => prepareStructureSection(proposedSection.sectionId, prepare));
      footer.append(status, prepare);
      card.append(footer);
    }
    dom.proposedStructureTree.append(card);
  }
  renderStructurePlanControls();
}

async function loadStructure({ force = false } = {}) {
  if (state.structure && !force) return state.structure;
  dom.currentStructureTree.innerHTML = '<p class="empty-state">Loading the paper structure…</p>';
  state.structure = await api("/api/structure");
  const validIds = new Set(state.structure.sections.map((section) => section.id));
  state.structureSelected = new Set([...state.structureSelected].filter((id) => validIds.has(id)));
  renderCurrentStructure();
  renderProposedStructure();
  updateStructureControls();
  return state.structure;
}

async function setWorkspaceMode(mode) {
  if (mode === state.workspaceMode) return;
  if (mode === "structure" && !(await settlePendingEdits())) return;
  applyWorkspaceMode(mode);
  if (mode !== "structure") {
    flushPendingRender();
    requestAnimationFrame(() => positionCommentCards());
    return;
  }
  dom.selectionToolbar.hidden = true;
  if (!dom.commentComposer.hidden) closeCommentComposer();
  try {
    await loadStructure({ force: true });
  } catch (error) {
    // Without this the pane would say "Loading…" forever.
    state.structure = null;
    applyWorkspaceMode("text");
    showToast(`The paper structure could not be loaded: ${error.message}`, 5200);
  }
}

// Text-only controls act on the (hidden) editor, so they leave with it.
function applyWorkspaceMode(mode) {
  state.workspaceMode = mode;
  const structure = mode === "structure";
  dom.structureWorkspace.hidden = !structure;
  dom.editor.hidden = structure;
  dom.showTextWorkspace.classList.toggle("is-active", !structure);
  dom.showStructureWorkspace.classList.toggle("is-active", structure);
  dom.showTextWorkspace.setAttribute("aria-pressed", String(!structure));
  dom.showStructureWorkspace.setAttribute("aria-pressed", String(structure));
  dom.referenceManager.hidden = structure;
  if (structure) dom.referenceManager.open = false;
  dom.sectionState.hidden = structure;
  if (dom.sectionReviewActions) dom.sectionReviewActions.hidden = structure;
}

function latestStructureProposal(session = state.chat) {
  return [...(session?.messages || [])].reverse().find((message) => message.structureProposal)?.structureProposal || null;
}

function showStructureProposal(proposal) {
  if (!proposal) return;
  state.structureProposal = proposal;
  state.outlinePreview = true;
  setWorkspaceMode("structure").catch((error) => showToast(error.message, 5200));
  renderProposedStructure();
  renderOutline();
}

async function sendStructurePrompt(mode) {
  const sections = (state.structure?.sections || []).filter((section) => state.structureSelected.has(section.id));
  if (!sections.length) {
    showToast("Choose at least one section first.");
    return;
  }
  const instruction = dom.structureInstruction.value.trim() || "Diagnose the current organization and propose a clearer reader-first structure without changing scientific claims.";
  const selectedNames = sections.map((section) => `${section.number} ${section.title}`).join("; ");
  const message = [
    mode === "discuss"
      ? "I want to discuss and explore the organization of these paper sections before rewriting prose."
      : "Propose a concrete new structure for these paper sections before rewriting prose.",
    "",
    `Selected logical sections: ${selectedNames}`,
    "",
    "My structural concern:",
    instruction,
    "",
    "First diagnose paragraph and subsection roles, duplication, missing logical bridges, and ordering problems. Then propose a reviewable structure tree. Preserve the paper's current claims, evidence scope, formulas, citations, labels, and experiment roles; flag any scientific decision that the structure cannot settle.",
  ].join("\n");
  dom.discussStructure.disabled = true;
  dom.generateStructure.disabled = true;
  dom.structureStatus.textContent = "Opening one Structure Chat…";
  try {
    state.chat = await api("/api/chat/new", { method: "POST", body: "{}" });
    state.chat = await api("/api/chat/message", {
      method: "POST",
      body: JSON.stringify({
        message,
        activePath: sections[0].path,
        structureContext: { sectionIds: sections.map((section) => section.id), snapshotHash: state.structure.snapshotHash },
        sessionId: state.chat.id,
      }),
    });
    state.structureProposal = null;
    renderProposedStructure();
    await refreshChatList();
    await openCodexChat();
    dom.structureStatus.textContent = `${providerDisplayNameStart()} is analyzing the selected structure. Continue in Chat while it works.`;
    showToast("Selected sections sent to one Structure Chat.", 3800);
  } catch (error) {
    showToast(error.message, 5200);
    dom.structureStatus.textContent = error.message;
  } finally {
    updateStructureControls();
  }
}

function setSaveState(label, disabled = false) {
  dom.saveButton.textContent = label;
  dom.saveButton.disabled = disabled;
  dom.saveButton.classList.toggle("is-saved", label === "Saved");
  dom.saveButton.classList.toggle("is-busy", label === "Saving…");
  dom.saveButton.classList.toggle("is-error", /retry|resolve|not saved/i.test(label));
}

// Paths are repository-relative; show them relative to the configured source
// root, the way the source picker labels them.
function sourceRelativePath(value) {
  const full = String(value ?? "");
  const known = state.bootstrap?.documents?.find((item) => item.path === full);
  if (known?.label) return known.label;
  const root = String(state.bootstrap?.sourceRoot ?? "").replace(/^[.][/]?/, "").replace(/[/]+$/, "");
  return root && full.startsWith(`${root}/`) ? full.slice(root.length + 1) : full;
}

function labelForPath(value) {
  return value.split("/").pop()?.replace(/[.]tex$/i, "") || value;
}

function mergeRanges(ranges, length) {
  const sorted = ranges
    .map((range) => ({ start: Math.max(0, range.start), end: Math.min(length, range.end) }))
    .filter((range) => range.end > range.start)
    .sort((a, b) => a.start - b.start);
  const merged = [];
  for (const range of sorted) {
    const last = merged.at(-1);
    if (last && range.start <= last.end) last.end = Math.max(last.end, range.end);
    else merged.push({ ...range });
  }
  return merged;
}

function isRangeAccepted(block, start, end) {
  const ranges = mergeRanges(block.acceptedRanges || [], block.raw.length);
  let cursor = start;
  for (const range of ranges) {
    if (range.end <= cursor) continue;
    if (range.start > cursor) return false;
    cursor = Math.max(cursor, range.end);
    if (cursor >= end) return true;
  }
  return false;
}

function displayRangeForRaw(block, rawStart, rawEnd) {
  let start = block.displayEnds.findIndex((value) => value > rawStart);
  if (start < 0) start = block.display.length;
  let end = start;
  while (end < block.display.length && block.displayStarts[end] < rawEnd) end += 1;
  return { start, end };
}

function normalizedText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function resolvedRequestBlockIndex(request) {
  if (request.anchorValid === false) return null;
  if (Number.isInteger(request.resolvedBlockIndex)) return request.resolvedBlockIndex;
  if (!state.document || request.path !== state.document.path) return request.blockIndex;
  const blocks = state.document.blocks || [];
  const direct = blocks[request.blockIndex];
  if (direct?.id === request.blockId) return direct.index;
  const selected = normalizedText(request.selectedText);
  if (!selected) return direct ? direct.index : null;
  if (direct && [direct.raw, direct.display].some((value) => normalizedText(value).includes(selected))) return direct.index;
  const matches = blocks.filter((block) =>
    [block.raw, block.display].some((value) => normalizedText(value).includes(selected))
  );
  return matches.length === 1 ? matches[0].index : null;
}

function resolvedRequestRange(request, block) {
  if (Number.isInteger(request.resolvedStart) && Number.isInteger(request.resolvedEnd)) {
    return { start: request.resolvedStart, end: request.resolvedEnd };
  }
  if (block.id === request.blockId) return { start: request.start, end: request.end };
  const rawMatch = block.raw.indexOf(request.selectedText || "");
  if (rawMatch >= 0 && request.selectedText) {
    return { start: rawMatch, end: rawMatch + request.selectedText.length };
  }
  const displayMatch = block.display.indexOf(request.selectedText || "");
  if (displayMatch >= 0 && request.selectedText) {
    return {
      start: block.displayStarts[displayMatch],
      end: block.displayEnds[displayMatch + request.selectedText.length - 1],
    };
  }
  return { start: request.start, end: request.end };
}

function resolvedRequestAbsoluteRange(request) {
  if (!state.document || request.path !== state.document.path || request.anchorValid === false) return null;
  if (Number.isInteger(request.resolvedAbsoluteStart) && Number.isInteger(request.resolvedAbsoluteEnd)) {
    return { start: request.resolvedAbsoluteStart, end: request.resolvedAbsoluteEnd };
  }
  if (Number.isInteger(request.absoluteStart) && Number.isInteger(request.absoluteEnd) &&
      state.document.source.slice(request.absoluteStart, request.absoluteEnd) === request.selectedText) {
    return { start: request.absoluteStart, end: request.absoluteEnd };
  }
  const matches = [];
  let cursor = 0;
  while (request.selectedText && cursor <= state.document.source.length) {
    const start = state.document.source.indexOf(request.selectedText, cursor);
    if (start < 0) break;
    matches.push({ start, end: start + request.selectedText.length });
    cursor = start + Math.max(1, request.selectedText.length);
  }
  return matches.length === 1 ? matches[0] : null;
}

function requestRangeForBlock(request, block) {
  const absolute = resolvedRequestAbsoluteRange(request);
  if (!absolute) return null;
  const start = Math.max(absolute.start, block.start);
  const end = Math.min(absolute.end, block.end);
  return end > start ? { start: start - block.start, end: end - block.start } : null;
}

function compareCurrentReviewRequests(left, right) {
  const leftLink = linkedChangeForCurrentDocument(left);
  const rightLink = linkedChangeForCurrentDocument(right);
  const leftBlock = Number(leftLink?.resolvedBlockIndex ?? leftLink?.blockIndex ?? resolvedRequestBlockIndex(left));
  const rightBlock = Number(rightLink?.resolvedBlockIndex ?? rightLink?.blockIndex ?? resolvedRequestBlockIndex(right));
  if (Number.isFinite(leftBlock) && Number.isFinite(rightBlock) && leftBlock !== rightBlock) return leftBlock - rightBlock;
  const leftRange = left.path === state.document?.path ? resolvedRequestAbsoluteRange(left) : null;
  const rightRange = right.path === state.document?.path ? resolvedRequestAbsoluteRange(right) : null;
  const leftStart = Number(leftRange?.start ?? left.absoluteStart ?? 0);
  const rightStart = Number(rightRange?.start ?? right.absoluteStart ?? 0);
  if (leftStart !== rightStart) return leftStart - rightStart;
  return String(left.createdAt || left.id).localeCompare(String(right.createdAt || right.id));
}

function currentReviewRequests() {
  return state.requests
    .filter((request) =>
      ["pending", "proposed", "discussed"].includes(request.status)
      && request.anchorValid !== false
      && Boolean(linkedChangeForCurrentDocument(request))
    )
    .sort(compareCurrentReviewRequests);
}

function currentReviewNumberMap() {
  return new Map(currentReviewRequests().map((request, index) => [request.id, index + 1]));
}

function reviewElementsForRequest(requestId) {
  return [...document.querySelectorAll("[data-request-id], [data-review-request-id], [data-review-request-ids]")]
    .filter((element) =>
      element.dataset.requestId === requestId
      || element.dataset.reviewRequestId === requestId
      || String(element.dataset.reviewRequestIds || "").split(" ").includes(requestId)
    );
}

function paintReviewLinks(requestIds = []) {
  for (const element of document.querySelectorAll(".review-link-active")) element.classList.remove("review-link-active");
  for (const requestId of requestIds) {
    for (const element of reviewElementsForRequest(requestId)) element.classList.add("review-link-active");
  }
}

function restoreFocusedReviewLink() {
  paintReviewLinks(state.focusedReviewRequestId ? [state.focusedReviewRequestId] : []);
}

function focusReviewLink(requestId, { scrollCard = false, scrollText = false } = {}) {
  state.focusedReviewRequestId = requestId;
  paintReviewLinks([requestId]);
  const selectorValue = CSS.escape(String(requestId));
  if (scrollCard) {
    dom.requestList.querySelector(`.request-card[data-request-id="${selectorValue}"]`)
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  }
  if (scrollText) {
    const target = dom.editor.querySelector(`[data-review-request-id="${selectorValue}"]`)
      || dom.editor.querySelector(`[data-review-request-ids~="${selectorValue}"]`);
    target?.scrollIntoView({ behavior: "smooth", block: "center" });
  }
}

function bindReviewLink(element, requestIds, { clickable = false } = {}) {
  const ids = [...new Set(requestIds.filter(Boolean))];
  if (!ids.length) return;
  element.classList.add("review-anchor-range");
  element.dataset.reviewRequestIds = ids.join(" ");
  element.addEventListener("mouseenter", () => paintReviewLinks(ids));
  element.addEventListener("mouseleave", restoreFocusedReviewLink);
  if (clickable && ids.length === 1) {
    element.addEventListener("click", (event) => {
      event.stopPropagation();
      focusReviewLink(ids[0], { scrollCard: true });
    });
  }
}

function createInlineReviewNumber(request, number) {
  const badge = document.createElement("span");
  badge.className = `review-number review-number-${request.status}`;
  badge.dataset.reviewRequestId = request.id;
  badge.textContent = String(number);
  badge.contentEditable = "false";
  badge.tabIndex = 0;
  badge.setAttribute("role", "button");
  badge.setAttribute("aria-label", `Open comment ${number}`);
  badge.title = `Comment ${number}: ${request.comment}`;
  badge.addEventListener("mouseenter", () => paintReviewLinks([request.id]));
  badge.addEventListener("mouseleave", restoreFocusedReviewLink);
  badge.addEventListener("pointerdown", (event) => event.stopPropagation());
  badge.addEventListener("click", (event) => {
    event.stopPropagation();
    focusReviewLink(request.id, { scrollCard: true });
  });
  badge.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    event.stopPropagation();
    focusReviewLink(request.id, { scrollCard: true });
  });
  return badge;
}

function decorateReviewCards(numberMap) {
  for (const card of dom.requestList.querySelectorAll(".request-card[data-request-id]")) {
    const requestId = card.dataset.requestId;
    const number = numberMap.get(requestId);
    if (!number) continue;
    const meta = card.querySelector(":scope > .request-meta");
    if (meta && !meta.querySelector(":scope > .review-number")) {
      meta.classList.add("has-review-number");
      const badge = document.createElement("span");
      badge.className = "review-number review-number-card";
      badge.dataset.reviewRequestId = requestId;
      badge.textContent = String(number);
      badge.title = `Comment ${number}`;
      meta.prepend(badge);
    }
    card.addEventListener("mouseenter", () => paintReviewLinks([requestId]));
    card.addEventListener("mouseleave", restoreFocusedReviewLink);
    card.addEventListener("focusin", () => paintReviewLinks([requestId]));
    card.addEventListener("focusout", restoreFocusedReviewLink);
    card.addEventListener("click", () => focusReviewLink(requestId));
  }
  if (state.focusedReviewRequestId && !numberMap.has(state.focusedReviewRequestId)) {
    state.focusedReviewRequestId = null;
  }
  restoreFocusedReviewLink();
}

function resolvedRequestEndBlockIndex(request) {
  if (Number.isInteger(request.resolvedEndBlockIndex)) return request.resolvedEndBlockIndex;
  if (Number.isInteger(request.endBlockIndex)) return request.endBlockIndex;
  return resolvedRequestBlockIndex(request);
}

function appendProposalUnitText(container, unit) {
  const annotations = Array.isArray(unit.annotations) ? unit.annotations : [];
  let cursor = 0;
  for (const annotation of annotations) {
    const start = Math.max(cursor, Number(annotation.start) || 0);
    const end = Math.max(start, Number(annotation.end) || start);
    if (start > cursor) container.append(document.createTextNode(unit.display.slice(cursor, start)));
    const span = document.createElement("span");
    span.className = `latex-${annotation.type || "source"}`;
    span.textContent = annotation.type === "math" ? annotation.latex : unit.display.slice(start, end);
    span.contentEditable = "false";
    if (annotation.type === "math") {
      span.dataset.latex = annotation.latex || "";
      span.dataset.mathDisplay = annotation.display ? "true" : "false";
    }
    container.append(span);
    cursor = end;
  }
  if (cursor < unit.display.length) container.append(document.createTextNode(unit.display.slice(cursor)));
}

function createProposalAddition(request) {
  const units = Array.isArray(request.proposal?.reviewUnits) ? request.proposal.reviewUnits : [];
  const proposalIsRevising = Boolean(request.pendingUnitRevision)
    && ["queued", "running", "validating"].includes(request.agentStatus);
  if (!units.length) {
    if (request.origin?.type === "structure") {
      const unavailable = document.createElement("div");
      unavailable.className = "proposal-add proposal-add-unavailable";
      unavailable.textContent = "Preparing paragraph-level structure preview…";
      return unavailable;
    }
    const addition = document.createElement("span");
    addition.className = "proposal-add";
    addition.textContent = request.proposal.replacementDisplay;
    return addition;
  }
  const addition = document.createElement("div");
  addition.className = "proposal-add proposal-add-blocks";
  for (const unit of units) {
    const block = document.createElement("div");
    block.className = `proposal-review-block kind-${unit.kind}${unit.level ? ` heading-level-${unit.level}` : ""}${unit.status === "confirmed" ? " unit-confirmed" : ""}`;
    block.dataset.proposalUnitId = unit.id;
    block.dataset.proposalRequestId = request.id;
    const unitIsEditable = unit.editable && !proposalIsRevising;
    block.title = unitIsEditable
      ? ""
      : proposalIsRevising
        ? `${providerDisplayNameStart(request.provider)} is revising one unit; this proposal remains visible and is temporarily read-only`
      : unit.status === "confirmed"
        ? "Confirmed review unit — grouped rewrite not yet applied"
        : "Revise this structured unit from Comments";
    block.proposalUnit = unit;
    block.proposalRequest = request;
    appendProposalUnitText(block, unit);
    if (unitIsEditable) {
      block.contentEditable = "true";
      block.spellcheck = true;
      block.setAttribute("role", "textbox");
      block.setAttribute("aria-label", `Edit proposed ${proposalUnitLabel(unit, unit.index).toLowerCase()}`);
      block.addEventListener("focus", () => prepareEditableMath(block));
      block.addEventListener("input", handleProposalUnitInput);
      block.addEventListener("blur", flushProposalUnitSave);
      block.addEventListener("keydown", handleProposalUnitKeydown);
    } else {
      block.contentEditable = "false";
    }
    addition.append(block);
  }
  return addition;
}

function handleProposalUnitKeydown(event) {
  event.stopPropagation();
  if (event.key === "Enter") {
    event.preventDefault();
    showToast("Keep this as one review unit. Use the structure proposal to add another paragraph.", 3600);
    return;
  }
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
    event.preventDefault();
    flushProposalUnitSave();
  }
}

function handleProposalUnitInput(event) {
  event.stopPropagation();
  const element = event.currentTarget;
  if (state.proposalEditing && state.proposalEditing.element !== element) flushProposalUnitSave();
  element.classList.add("unit-human-edited");
  element.classList.remove("unit-confirmed");
  state.proposalEditing = {
    element,
    request: element.proposalRequest,
    unit: element.proposalUnit,
  };
  setSaveState("Proposal edited", true);
}

async function flushProposalUnitSave() {
  if (!state.proposalEditing || state.proposalSaving) return false;
  const editing = state.proposalEditing;
  state.proposalEditing = null;
  state.proposalSaving = true;
  try {
    const oldDisplay = editing.unit.display;
    const nextDisplay = canonicalEditableText(editing.element);
    if (nextDisplay === oldDisplay) {
      setSaveState("Saved", false);
      return true;
    }
    let prefix = 0;
    while (prefix < oldDisplay.length && prefix < nextDisplay.length && oldDisplay[prefix] === nextDisplay[prefix]) prefix += 1;
    let suffix = 0;
    while (
      suffix < oldDisplay.length - prefix &&
      suffix < nextDisplay.length - prefix &&
      oldDisplay[oldDisplay.length - 1 - suffix] === nextDisplay[nextDisplay.length - 1 - suffix]
    ) suffix += 1;
    const oldEnd = oldDisplay.length - suffix;
    const rawStart = prefix < oldDisplay.length
      ? editing.unit.displayStarts[prefix]
      : (editing.unit.displayEnds.at(-1) ?? editing.unit.raw.length);
    const rawEnd = oldEnd > prefix ? editing.unit.displayEnds[oldEnd - 1] : rawStart;
    const replacement = nextDisplay.slice(prefix, nextDisplay.length - suffix);
    const nextRaw = `${editing.unit.raw.slice(0, rawStart)}${replacement}${editing.unit.raw.slice(rawEnd)}`;
    await api("/api/request/edit-unit", {
      method: "POST",
      body: JSON.stringify({
        id: editing.request.id,
        unitId: editing.unit.id,
        baseText: editing.unit.raw,
        text: nextRaw,
      }),
    });
    await refreshRequests();
    if (editing.element.isConnected) {
      // Focus stayed in the unit (Cmd/Ctrl+S), so the editor was not rebuilt.
      // Point the element at the saved unit or the next save would be sent
      // against a stale base text.
      const savedRequest = state.requests.find((item) => item.id === editing.request.id);
      const savedUnit = savedRequest?.proposal?.reviewUnits?.find((item) => item.id === editing.unit.id);
      if (savedRequest && savedUnit) {
        editing.element.proposalRequest = savedRequest;
        editing.element.proposalUnit = savedUnit;
      }
    }
    setSaveState("Saved", false);
    showToast("Your edit was saved to the proposal and this unit was confirmed. LaTeX is still unchanged.", 4400);
    return true;
  } catch (error) {
    state.proposalEditing = editing;
    editing.element.classList.add("save-conflict");
    setSaveState("Proposal edit not saved", false);
    showToast(error.message, 5200);
    return false;
  } finally {
    state.proposalSaving = false;
    setTimeout(flushPendingRender, 0);
  }
}

function createTrackedChangeControl(block, groupIndex) {
  const wrap = document.createElement("span");
  wrap.className = "tracked-change-actions";
  wrap.contentEditable = "false";
  const accept = document.createElement("button");
  accept.type = "button";
  accept.className = "tracked-change-button tracked-change-accept";
  accept.textContent = "✓";
  accept.title = "Accept: keep the green text, drop the red";
  accept.setAttribute("aria-label", "Accept tracked change");
  const reject = document.createElement("button");
  reject.type = "button";
  reject.className = "tracked-change-button tracked-change-reject";
  reject.textContent = "✕";
  reject.title = "Reject: restore the red text, drop the green";
  reject.setAttribute("aria-label", "Reject tracked change");
  for (const [button, action] of [[accept, "accept"], [reject, "reject"]]) {
    if (block.editable === false) button.disabled = true;
    button.addEventListener("mousedown", (event) => { event.preventDefault(); event.stopPropagation(); });
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      resolveTrackedChangeGroup(block, groupIndex, action);
    });
  }
  wrap.append(accept, reject);
  return wrap;
}

async function resolveTrackedChangeGroup(block, groupIndex, action) {
  try {
    const nextDocument = await api("/api/tracked-change/resolve", {
      method: "POST",
      body: JSON.stringify({
        path: state.document.path,
        blockIndex: block.index,
        blockId: block.id,
        groupIndex,
        action,
      }),
    });
    state.document = nextDocument;
    renderDocument();
    await refreshCompiledOutline({ render: false });
    showToast(action === "accept" ? "Change accepted into the source." : "Change rejected; original text restored.", 3200);
  } catch (error) {
    showToast(error.message, 5200);
  }
}

function renderReviewText(container, block, { showProposals = true } = {}) {
  const classes = Array(block.display.length).fill("");
  const requestIdsAt = Array.from({ length: block.display.length }, () => []);
  const reviewMarkersAt = new Map();
  const numberMap = currentReviewNumberMap();
  const listMarkerAt = Array(block.display.length).fill(false);
  for (const match of block.display.matchAll(/\n• /g)) {
    for (let index = match.index; index < match.index + match[0].length; index += 1) {
      listMarkerAt[index] = true;
    }
  }
  // The bullet that opens an \item block, so an enumerated list can number it.
  if (block.role === "list-item" && block.display.startsWith("• ")) listMarkerAt[0] = listMarkerAt[1] = true;
  for (let index = 0; index < block.display.length; index += 1) {
    const rawStart = block.displayStarts[index];
    const rawEnd = block.displayEnds[index];
    if ((block.humanRanges || []).some((range) => rawStart >= range.start && rawEnd <= range.end)) {
      classes[index] = "human-range";
    } else if ((block.acceptedRanges || []).some((range) => rawStart >= range.start && rawEnd <= range.end)) {
      classes[index] = "accepted-range";
    }
  }

  const additions = new Map();
  const additionsBefore = new Map();
  const inlineAdditions = new Map();
  const blockRequests = state.requests.filter((request) =>
    request.path === state.document?.path && requestRangeForBlock(request, block) && ["pending", "proposed", "discussed"].includes(request.status)
  );
  const visibleBlockRequests = blockRequests
    .filter((request) => request.status !== "proposed" || showProposals)
    .sort(compareCurrentReviewRequests);
  for (const request of visibleBlockRequests) {
    const rawRange = requestRangeForBlock(request, block);
    const range = displayRangeForRaw(block, rawRange.start, rawRange.end);
    for (let index = range.start; index < range.end; index += 1) requestIdsAt[index].push(request.id);
    if (block.index === resolvedRequestBlockIndex(request) && numberMap.has(request.id)) {
      const markers = reviewMarkersAt.get(range.start) || [];
      markers.push(request);
      reviewMarkersAt.set(range.start, markers);
    }
  }
  for (const request of blockRequests.filter((item) => ["pending", "discussed"].includes(item.status))) {
    const rawRange = requestRangeForBlock(request, block);
    const range = displayRangeForRaw(block, rawRange.start, rawRange.end);
    for (let index = range.start; index < range.end; index += 1) classes[index] = "pending-comment-range";
  }
  for (const request of blockRequests.filter((item) => showProposals && item.status === "proposed" && item.proposal)) {
    const rawRange = requestRangeForBlock(request, block);
    const range = displayRangeForRaw(block, rawRange.start, rawRange.end);
    if (request.origin?.type === "structure" && block.index === resolvedRequestBlockIndex(request)) {
      for (let index = range.start; index < range.end; index += 1) classes[index] = "proposal-delete";
      additionsBefore.set(range.start, request);
      continue;
    }

    const isSingleBlockProposal = request.origin?.type !== "structure"
      && resolvedRequestBlockIndex(request) === resolvedRequestEndBlockIndex(request)
      && block.index === resolvedRequestBlockIndex(request);
    const selectedDisplay = block.display.slice(range.start, range.end);
    // Diff against the text as it currently reads, not against the copy stored
    // when the proposal was made. The stored copy renders citations and
    // references without document context, so requiring equality sent every
    // proposal down the whole-block path.
    const wordOperations = isSingleBlockProposal
      ? diffTextOperations(selectedDisplay, request.proposal.replacementDisplay)
      : null;
    const canRenderInlineDiff = wordOperations
      && diffRetainedShare(wordOperations) >= INLINE_DIFF_SIMILARITY_MIN;
    if (canRenderInlineDiff) {
      let oldCursor = range.start;
      for (const operation of mergeDiffPhrases(wordOperations)) {
        if (operation.type === "delete") {
          const deletionEnd = oldCursor + operation.text.length;
          for (let index = oldCursor; index < deletionEnd; index += 1) classes[index] = "proposal-delete";
          oldCursor = deletionEnd;
        } else if (operation.type === "insert") {
          const insertions = inlineAdditions.get(oldCursor) || [];
          insertions.push({ request, text: operation.text });
          inlineAdditions.set(oldCursor, insertions);
        } else {
          oldCursor += operation.text.length;
        }
      }
      continue;
    }

    for (let index = range.start; index < range.end; index += 1) classes[index] = "proposal-delete";
    if (request.origin?.type !== "structure" && block.index === resolvedRequestEndBlockIndex(request)) {
      additions.set(range.end, request);
    }
  }
  const draftSegment = state.commentDraft?.path === state.document?.path
    ? (state.commentDraft.segments || []).find((segment) => segment.blockIndex === block.index)
    : null;
  if (draftSegment) {
    const range = displayRangeForRaw(block, draftSegment.start, draftSegment.end);
    for (let index = range.start; index < range.end; index += 1) classes[index] = "active-comment-selection";
  }

  const annotationAt = Array(block.display.length).fill(null);
  for (const [annotationIndex, annotation] of (block.annotations || []).entries()) {
    for (let index = annotation.start; index < annotation.end; index += 1) annotationAt[index] = annotationIndex;
  }
  // Presentation only (italic, bold, code, footnote...): ranges may nest, so
  // every character collects the classes of all the styles that cover it.
  const styleAt = Array(block.display.length).fill("");
  for (const style of block.styles || []) {
    if (!/^[a-z]+$/.test(style.type || "")) continue;
    const name = `latex-style-${style.type}`;
    for (let index = Math.max(0, style.start); index < Math.min(block.display.length, style.end); index += 1) {
      if (!styleAt[index].includes(name)) styleAt[index] = styleAt[index] ? `${styleAt[index]} ${name}` : name;
    }
  }

  // Tracked changes (\chadd/\chdel): adjacent annotations separated only by
  // whitespace form one group; a ✓/✕ control renders after each group. Group
  // order matches the server's raw-source scan.
  const trackedGroupEnds = new Map();
  {
    let groupIndex = -1;
    let lastEnd = null;
    for (const annotation of block.annotations || []) {
      if (annotation.type !== "chadd" && annotation.type !== "chdel") continue;
      if (lastEnd !== null && /^\s*$/.test(block.display.slice(lastEnd, annotation.start))) {
        trackedGroupEnds.delete(lastEnd);
      } else {
        groupIndex += 1;
      }
      lastEnd = annotation.end;
      trackedGroupEnds.set(lastEnd, groupIndex);
    }
  }

  // A replacement renders as <deleted><inserted> with nothing between them.
  // Mark the insertion so CSS opens a gap and the two never read as one word.
  const appendInlineAddition = (insertion) => {
    const addition = document.createElement("span");
    addition.className = "proposal-add proposal-add-inline";
    addition.textContent = insertion.text;
    addition.title = `${providerDisplayNameStart(insertion.request.provider)} proposal — Accept or Reject in Comments`;
    addition.contentEditable = "false";
    const previous = container.lastChild;
    const previousIsChange = previous instanceof Element
      && (previous.classList.contains("proposal-delete") || previous.classList.contains("proposal-add-inline"));
    if (previousIsChange && diffPiecesRunTogether(previous.textContent, insertion.text)) {
      addition.classList.add("proposal-add-spaced");
    }
    bindReviewLink(addition, [insertion.request.id]);
    container.append(addition);
  };

  let cursor = 0;
  while (cursor < block.display.length) {
    if (additionsBefore.has(cursor)) {
      const request = additionsBefore.get(cursor);
      const addition = createProposalAddition(request);
      addition.contentEditable = "false";
      bindReviewLink(addition, [request.id]);
      container.append(addition);
    }
    for (const request of reviewMarkersAt.get(cursor) || []) {
      container.append(createInlineReviewNumber(request, numberMap.get(request.id)));
    }
    for (const insertion of inlineAdditions.get(cursor) || []) appendInlineAddition(insertion);
    const className = classes[cursor];
    const requestIds = requestIdsAt[cursor];
    const requestIdKey = requestIds.join(" ");
    const annotationIndex = annotationAt[cursor];
    const listMarker = listMarkerAt[cursor];
    let end = cursor + 1;
    while (
      end < block.display.length &&
      classes[end] === className &&
      requestIdsAt[end].join(" ") === requestIdKey &&
      annotationAt[end] === annotationIndex &&
      styleAt[end] === styleAt[cursor] &&
      listMarkerAt[end] === listMarker &&
      !inlineAdditions.has(end) &&
      !additions.has(end)
    ) end += 1;
    const value = block.display.slice(cursor, end);
    const annotation = annotationIndex === null ? null : block.annotations[annotationIndex];
    if (!className && !annotation && !listMarker && !styleAt[cursor]) container.append(document.createTextNode(value));
    else {
      const span = document.createElement("span");
      span.className = [
        className,
        annotation ? `latex-${annotation.type}` : "",
        styleAt[cursor],
        listMarker ? "latex-list-marker" : "",
      ].filter(Boolean).join(" ");
      span.textContent = annotation?.type === "math" ? annotation.latex : value;
      // "1." for an enumerated item; the bullet stays in the text underneath.
      if (listMarker && block.list === "enumerate" && block.itemNumber) span.dataset.marker = `${block.itemNumber}.`;
      if (className === "pending-comment-range") span.title = "Comment pending — open its card in Comments to run or follow up";
      if (annotation?.type === "citation") {
        span.contentEditable = "false";
        span.dataset.citationKeys = annotation.keys.join(",");
        span.title = "Open citation details";
        span.addEventListener("click", () => openReferenceAnnotation(annotation));
      }
      if (annotation?.type === "reference") {
        span.contentEditable = "false";
        span.dataset.referenceKey = annotation.key;
        span.title = `Go to ${annotation.key}`;
        span.addEventListener("click", () => openReferenceAnnotation(annotation));
      }
      if (annotation?.type === "math") {
        span.contentEditable = "false";
        span.dataset.latex = annotation.latex;
        span.dataset.mathDisplay = annotation.display ? "true" : "false";
      }
      bindReviewLink(span, requestIds);
      container.append(span);
    }
    cursor = end;
    if (trackedGroupEnds.has(cursor)) {
      container.append(createTrackedChangeControl(block, trackedGroupEnds.get(cursor)));
    }
    if (additions.has(cursor)) {
      const request = additions.get(cursor);
      const addition = createProposalAddition(request);
      if (!addition.classList.contains("proposal-add-blocks")) {
        addition.title = `${providerDisplayNameStart(request.provider)} proposal — Accept or Reject in Comments`;
      }
      addition.contentEditable = "false";
      bindReviewLink(addition, [request.id]);
      container.append(addition);
    }
  }
  for (const insertion of inlineAdditions.get(block.display.length) || []) appendInlineAddition(insertion);
}

function renderMath(root = dom.editor) {
  if (!window.katex?.render) {
    if (!state.mathUnavailableNotified && root.querySelector("[data-latex]")) {
      state.mathUnavailableNotified = true;
      showToast("Formula renderer is unavailable; formulas are shown as LaTeX source. The compiled PDF shows them typeset.", 5200);
    }
    return;
  }
  for (const element of root.querySelectorAll("[data-latex]")) {
    if (element.closest("[contenteditable='true'], .is-editing")) continue;
    const latex = element.dataset.latex || "";
    try {
      window.katex.render(latex, element, {
        displayMode: element.dataset.mathDisplay === "true",
        // A formula KaTeX cannot typeset is shown as tidy source below, not
        // as KaTeX's red error text.
        throwOnError: true,
        strict: "ignore",
        trust: false,
        output: "htmlAndMathml",
        // The author's own macros (\newcommand, \DeclareMathOperator...). A
        // fresh copy each time: KaTeX writes \gdef results into this object.
        macros: { ...(state.document?.mathMacros || {}) },
      });
      element.classList.remove("math-render-error");
      element.removeAttribute("title");
    } catch {
      element.replaceChildren(document.createTextNode(latex));
      element.classList.add("math-render-error");
      element.title = "Shown as LaTeX source: the page cannot typeset this formula. The compiled PDF can.";
    }
  }
}

function setWholeBlockSelection(block, section) {
  state.selection = {
    blockIndex: block.index,
    blockId: block.id,
    start: 0,
    end: block.raw.length,
    quote: block.semantic?.caption || block.display || block.raw.slice(0, 160),
    isAccepted: isRangeAccepted(block, 0, block.raw.length),
    rect: section.getBoundingClientRect(),
  };
}

function structureActions(section, block) {
  const actions = document.createElement("div");
  actions.className = "structure-actions";
  const confirm = document.createElement("button");
  confirm.type = "button";
  const accepted = isRangeAccepted(block, 0, block.raw.length);
  confirm.textContent = accepted ? "Unconfirm" : "Confirm";
  confirm.addEventListener("click", () => {
    setWholeBlockSelection(block, section);
    confirmCurrentSelection();
  });
  const comment = document.createElement("button");
  comment.type = "button";
  comment.textContent = "Comment";
  comment.addEventListener("click", () => {
    setWholeBlockSelection(block, section);
    openCommentComposer();
  });
  actions.append(confirm, comment);
  return actions;
}

function appendStructureCaption(section, block, noun) {
  const semantic = block.semantic || {};
  if (!semantic.caption && !semantic.label) return;
  const caption = document.createElement("figcaption");
  const prefix = document.createElement("strong");
  prefix.textContent = `${noun}${semantic.number ? ` ${semantic.number}` : ""}.`;
  caption.append(prefix);
  if (semantic.caption) {
    caption.append(document.createTextNode(" "));
    const text = document.createElement("span");
    text.className = "structure-caption-text";
    text.textContent = semantic.captionDisplay || semantic.caption;
    text.captionSource = semantic.captionSource || null;
    if (semantic.captionSource?.path) text.dataset.captionSourcePath = semantic.captionSource.path;
    caption.append(text);
  }
  if (semantic.label) {
    const label = document.createElement("code");
    label.textContent = semantic.label;
    caption.append(label);
  }
  section.append(caption);
}

// Read-only LaTeX text (a table cell, a pseudo-code line, a bibliography
// entry): formulas are typeset and \textbf, \emph and friends are styled.
function renderTableCell(cell, formatted, fallback) {
  const value = formatted?.text ?? fallback ?? "";
  const annotations = (formatted?.annotations || []).filter((annotation) => annotation.type === "math");
  const styles = (formatted?.styles || []).filter((style) => /^[a-z]+$/.test(style.type || ""));
  if (!annotations.length && !styles.length) {
    cell.textContent = value;
    return;
  }
  const styleAt = Array(value.length).fill("");
  for (const style of styles) {
    for (let index = Math.max(0, style.start); index < Math.min(value.length, style.end); index += 1) {
      styleAt[index] = `${styleAt[index]} latex-style-${style.type}`.trim();
    }
  }
  const appendText = (from, to) => {
    let cursor = from;
    while (cursor < to) {
      let end = cursor + 1;
      while (end < to && styleAt[end] === styleAt[cursor]) end += 1;
      if (styleAt[cursor]) {
        const span = document.createElement("span");
        span.className = styleAt[cursor];
        span.textContent = value.slice(cursor, end);
        cell.append(span);
      } else cell.append(document.createTextNode(value.slice(cursor, end)));
      cursor = end;
    }
  };
  let cursor = 0;
  for (const annotation of annotations) {
    if (annotation.start < cursor) continue;
    appendText(cursor, annotation.start);
    const math = document.createElement("span");
    math.className = "latex-math";
    math.contentEditable = "false";
    math.dataset.latex = annotation.latex;
    math.dataset.mathDisplay = "false";
    math.textContent = annotation.latex;
    cell.append(math);
    cursor = annotation.end;
  }
  appendText(cursor, value.length);
}

function compiledFallback(block, noun) {
  const semantic = block.semantic || {};
  const fallback = document.createElement("div");
  fallback.className = "compiled-fallback";
  const copy = document.createElement("div");
  const title = document.createElement("strong");
  title.textContent = `${noun} rendered by LaTeX`;
  const detail = document.createElement("span");
  detail.textContent = semantic.input ? semantic.input : "Complex macros are preserved in the compiled output.";
  copy.append(title, detail);
  const link = document.createElement("a");
  link.href = `/api/pdf${semantic.page ? `#page=${semantic.page}` : ""}`;
  link.target = "_blank";
  link.rel = "noreferrer";
  link.textContent = semantic.page ? `Open page ${semantic.page}` : "Open compiled PDF";
  fallback.append(copy, link);
  return fallback;
}

function renderStructure(section, block) {
  const semantic = block.semantic;
  if (!semantic) return false;
  const artifactKind = block.kind === "structure" ? semantic.artifactType : block.kind;
  section.contentEditable = "false";
  section.spellcheck = false;
  section.setAttribute("role", "group");
  section.setAttribute("aria-label", `${block.kind} review block ${block.index + 1}`);
  section.append(structureActions(section, block));

  if (block.kind === "math") {
    const formula = document.createElement("div");
    formula.className = "display-formula";
    formula.textContent = semantic.latex;
    formula.dataset.latex = semantic.latex;
    formula.dataset.mathDisplay = "true";
    section.append(formula);
    if (semantic.number || semantic.label) {
      const meta = document.createElement("div");
      meta.className = "structure-meta";
      meta.textContent = [semantic.number ? `Equation ${semantic.number}` : "Equation", semantic.label].filter(Boolean).join(" · ");
      section.append(meta);
    }
    return true;
  }

  if (block.kind === "code") {
    // Program text, pseudo-code, verbatim: read-only and never parsed as prose.
    section.classList.add("kind-code");
    const figure = document.createElement("figure");
    figure.className = "latex-code";
    if (semantic.caption || semantic.pseudo || semantic.language) {
      const caption = document.createElement("figcaption");
      const prefix = document.createElement("strong");
      prefix.textContent = semantic.pseudo ? `Algorithm${semantic.number && semantic.number !== "?" ? ` ${semantic.number}` : ""}` : "Listing";
      caption.append(prefix);
      if (semantic.caption) caption.append(document.createTextNode(` ${semantic.caption}`));
      if (semantic.language) {
        const language = document.createElement("code");
        language.textContent = semantic.language;
        caption.append(language);
      }
      figure.append(caption);
    }
    if (semantic.lines?.length) {
      const listing = document.createElement("div");
      listing.className = "latex-pseudocode";
      for (const line of semantic.lines) {
        const row = document.createElement("div");
        row.style.paddingLeft = `${Math.min(12, Number(line.indent) || 0) * 1.5}em`;
        renderTableCell(row, line);
        listing.append(row);
      }
      figure.append(listing);
    } else {
      const pre = document.createElement("pre");
      pre.textContent = semantic.text || "";
      figure.append(pre);
    }
    section.append(figure);
    return true;
  }

  if (block.kind === "bibliography") {
    section.classList.add("kind-bibliography");
    const heading = document.createElement("div");
    heading.className = "environment-label";
    heading.textContent = "References";
    const list = document.createElement("ol");
    list.className = "latex-bibliography";
    for (const item of semantic.items || []) {
      const entry = document.createElement("li");
      const marker = document.createElement("span");
      marker.className = "latex-bibliography-label";
      marker.textContent = `[${item.label}]`;
      const text = document.createElement("span");
      renderTableCell(text, item);
      entry.append(marker, text);
      list.append(entry);
    }
    section.append(heading, list);
    return true;
  }

  if (block.kind === "structure" && semantic.artifactType === "include") {
    // \input of a file that is missing or outside the source root.
    section.classList.add("kind-compiled");
    const note = document.createElement("div");
    note.className = "compiled-fallback";
    const copy = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = "Included file not found in the project";
    const detail = document.createElement("span");
    detail.textContent = semantic.input || "";
    copy.append(title, detail);
    note.append(copy);
    section.append(note);
    return true;
  }

  if (artifactKind === "table") {
    section.classList.add("kind-table");
    if (semantic.rows?.length) {
      const scroller = document.createElement("div");
      scroller.className = "latex-table-wrap";
      const table = document.createElement("table");
      const activeRowSpans = [];
      for (const [rowIndex, row] of semantic.rows.entries()) {
        const tr = document.createElement("tr");
        const carriedSpans = activeRowSpans.map((remaining) => remaining > 0);
        let columnIndex = 0;
        for (const [cellIndex, value] of row.entries()) {
          const formatted = semantic.formattedRows?.[rowIndex]?.[cellIndex];
          const isEmpty = !(formatted?.text ?? value ?? "").trim();
          while (activeRowSpans[columnIndex] > 0) {
            columnIndex += 1;
            if (isEmpty) break;
          }
          if (isEmpty && carriedSpans[columnIndex - 1]) continue;
          const cell = document.createElement(rowIndex < (semantic.headerRows || 1) ? "th" : "td");
          const colspan = formatted?.colspan || 1;
          const rowspan = formatted?.rowspan || 1;
          if (colspan > 1) cell.colSpan = colspan;
          if (rowspan > 1) cell.rowSpan = rowspan;
          renderTableCell(cell, formatted, value);
          tr.append(cell);
          if (rowspan > 1) {
            for (let offset = 0; offset < colspan; offset += 1) activeRowSpans[columnIndex + offset] = rowspan - 1;
          }
          columnIndex += colspan;
        }
        for (let index = 0; index < activeRowSpans.length; index += 1) {
          if (carriedSpans[index]) activeRowSpans[index] -= 1;
        }
        table.append(tr);
      }
      scroller.append(table);
      section.append(scroller);
    } else section.append(compiledFallback(block, "Table"));
    appendStructureCaption(section, block, "Table");
    return true;
  }

  if (artifactKind === "figure" && semantic.panels?.some((panel) => panel.graphic)) {
    // Subfigures side by side, each with its own caption.
    section.classList.add("kind-figure");
    const row = document.createElement("div");
    row.className = "latex-figure-panels";
    for (const panel of semantic.panels) {
      const cell = document.createElement("figure");
      if (panel.graphic) {
        const image = document.createElement("img");
        image.className = "latex-figure-image";
        image.src = panel.graphic.type === "pdf"
          ? `/api/asset-preview?path=${encodeURIComponent(panel.graphic.path)}`
          : `/api/asset?path=${encodeURIComponent(panel.graphic.path)}`;
        image.alt = panel.caption || "LaTeX subfigure";
        image.loading = "lazy";
        cell.append(image);
      } else cell.append(compiledFallback(block, "Figure"));
      if (panel.caption) {
        const caption = document.createElement("figcaption");
        caption.textContent = panel.caption;
        cell.append(caption);
      }
      row.append(cell);
    }
    section.append(row);
    appendStructureCaption(section, block, "Figure");
    return true;
  }

  if (artifactKind === "figure") {
    section.classList.add("kind-figure");
    if (semantic.graphic) {
      const asset = `/api/asset?path=${encodeURIComponent(semantic.graphic.path)}`;
      const image = document.createElement("img");
      image.className = "latex-figure-image";
      image.src = semantic.graphic.type === "pdf"
        ? `/api/asset-preview?path=${encodeURIComponent(semantic.graphic.path)}`
        : asset;
      image.alt = semantic.caption || semantic.label || "LaTeX figure";
      image.loading = "lazy";
      let visual = image;
      if (semantic.graphic.type === "pdf") {
        const link = document.createElement("a");
        link.className = "latex-figure-link";
        link.href = asset;
        link.target = "_blank";
        link.rel = "noreferrer";
        link.title = "Open source figure PDF";
        link.append(image);
        visual = link;
      }
      image.addEventListener("error", () => visual.replaceWith(compiledFallback(block, "Figure")), { once: true });
      section.append(visual);
    } else section.append(compiledFallback(block, "Figure"));
    appendStructureCaption(section, block, "Figure");
    return true;
  }

  if (block.kind === "structure" && semantic.fallback) {
    section.classList.add("kind-compiled");
    section.append(compiledFallback(block, semantic.artifactType === "table" ? "Table" : "Figure"));
    return true;
  }
  return false;
}

async function goToLabel(reference) {
  if (reference?.path) {
    if (reference.path !== state.document?.path) await loadDocument(reference.path);
    requestAnimationFrame(() => scrollToBlock(reference.blockIndex, { smooth: true }));
    return;
  }
  if (reference?.page) window.open(`/api/pdf#page=${reference.page}`, "_blank", "noopener,noreferrer");
  else showToast(`Label ${reference?.key || ""} has not been compiled yet.`, 4200);
}

function openReferenceAnnotation(annotation) {
  const references = state.document?.references;
  if (!references) return;
  if (annotation.type === "reference") {
    const reference = references.labels.find((item) => item.key === annotation.key);
    goToLabel(reference);
    return;
  }
  const entries = annotation.keys
    .map((key) => references.citations.find((item) => item.key === key))
    .filter(Boolean);
  if (!entries.length) {
    showToast(`Unresolved citation: ${annotation.keys.join(", ")}`, 4400);
    return;
  }
  openPaperPreview(entries, entries[0].key);
}

function paperLink(label, href, primary = false) {
  const safeHref = safeHttpUrl(href);
  if (!safeHref) return null;
  const link = document.createElement("a");
  link.className = primary ? "button button-dark" : "button button-ghost";
  link.href = safeHref;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.textContent = label;
  return link;
}

// Only two kinds of address may be framed: this server's own /api/ PDF
// endpoints and plain http(s) links.
function frameablePdfUrl(url) {
  const value = String(url || "");
  if (/^[/]api[/][a-z-]+(?:[?#].*)?$/i.test(value)) return value;
  return safeHttpUrl(value);
}

function paperViewerUrl(url, expanded = state.paperPreviewExpanded) {
  const cleanUrl = (frameablePdfUrl(url) || "about:blank").split("#", 1)[0];
  if (cleanUrl === "about:blank") return cleanUrl;
  return `${cleanUrl}#${expanded ? "zoom=100" : "view=FitH"}`;
}

function updatePaperPreviewScale() {
  const frame = dom.paperPreviewContent.querySelector(".paper-preview-frame");
  if (!frame?.dataset.pdfUrl) return;
  const nextUrl = paperViewerUrl(frame.dataset.pdfUrl);
  if (frame.getAttribute("src") !== nextUrl) frame.src = nextUrl;
}

function renderPaperPreview(entries, selectedKey) {
  const selected = entries.find((entry) => entry.key === selectedKey) || entries[0];
  if (!selected) return;
  dom.paperSwitcher.replaceChildren();
  dom.paperSwitcher.hidden = entries.length < 2;
  for (const entry of entries) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = entry.key === selected.key ? "active" : "";
    button.textContent = `${entry.author || entry.key} · ${entry.year || "n.d."}`;
    button.title = entry.title || entry.key;
    button.addEventListener("click", () => renderPaperPreview(entries, entry.key));
    dom.paperSwitcher.append(button);
  }

  dom.paperPreviewContent.replaceChildren();
  const paper = document.createElement("article");
  paper.className = "paper-preview-card";
  const meta = document.createElement("p");
  meta.className = "paper-preview-meta";
  meta.textContent = [selected.venue, selected.year].filter(Boolean).join(" · ") || "Bibliography entry";
  const title = document.createElement("h2");
  title.textContent = selected.title || selected.key;
  const authors = document.createElement("p");
  authors.className = "paper-preview-authors";
  authors.textContent = selected.authors || selected.author || "Author metadata unavailable";
  const key = document.createElement("code");
  key.textContent = selected.key;
  paper.append(meta, title, authors, key);
  if (selected.abstract) {
    const abstract = document.createElement("p");
    abstract.className = "paper-preview-abstract";
    abstract.textContent = selected.abstract;
    paper.append(abstract);
  }
  const actions = document.createElement("div");
  actions.className = "paper-preview-actions";
  // Bibliography URLs are untrusted input: anything that is not http(s) is dropped.
  const pdfUrl = safeHttpUrl(selected.pdfUrl);
  const pageUrl = safeHttpUrl(selected.url);
  const doiUrl = selected.doi ? safeHttpUrl(`https://doi.org/${encodeURI(String(selected.doi).trim())}`) : null;
  for (const link of [
    pdfUrl ? paperLink("Open PDF", pdfUrl, true) : null,
    pageUrl && pageUrl !== pdfUrl ? paperLink("Paper page", pageUrl) : null,
    doiUrl ? paperLink("DOI", doiUrl) : null,
  ]) if (link) actions.append(link);
  if (actions.childElementCount) paper.append(actions);
  dom.paperPreviewContent.append(paper);

  const fallback = document.createElement("div");
  fallback.className = "paper-preview-fallback";
  if (pdfUrl) {
    // Local-first: nothing is fetched from the publisher until the author asks.
    const host = new URL(pdfUrl).host;
    const note = document.createElement("p");
    note.textContent = `The PDF is hosted at ${host}. Loading the preview contacts that site from your browser.`;
    const load = document.createElement("button");
    load.type = "button";
    load.className = "button button-ghost";
    load.textContent = "Load PDF preview";
    load.addEventListener("click", () => {
      const frame = document.createElement("iframe");
      frame.className = "paper-preview-frame";
      frame.dataset.pdfUrl = pdfUrl;
      frame.referrerPolicy = "no-referrer";
      frame.title = `${selected.title || selected.key} PDF`;
      frame.src = paperViewerUrl(pdfUrl);
      fallback.replaceWith(frame);
    });
    fallback.append(note, load);
  } else {
    fallback.textContent = pageUrl
      ? "This publisher does not expose a direct embeddable PDF. Open the paper page above."
      : selected.url || selected.pdfUrl
        ? "The link recorded for this entry is not a web (http/https) address, so it was not opened."
        : "No paper URL is recorded in the bibliography yet.";
  }
  dom.paperPreviewContent.append(fallback);
}

function renderCompiledPdfPreview(pdfUrl = state.compiledPdfUrl) {
  dom.paperSwitcher.hidden = true;
  dom.paperSwitcher.replaceChildren();
  dom.paperPreviewContent.replaceChildren();
  const frame = document.createElement("iframe");
  frame.className = "paper-preview-frame";
  frame.dataset.pdfUrl = pdfUrl;
  frame.src = paperViewerUrl(pdfUrl);
  frame.title = "Compiled paper PDF";
  dom.paperPreviewContent.append(frame);
}

function setPaperPreviewExpanded(expanded) {
  state.paperPreviewExpanded = Boolean(expanded);
  dom.paperPreview.classList.toggle("is-expanded", state.paperPreviewExpanded);
  // A side panel without a focus trap is never modal, expanded or not.
  dom.paperPreview.setAttribute("aria-modal", "false");
  dom.paperPreviewSizeToggle.textContent = state.paperPreviewExpanded ? "›" : "‹";
  dom.paperPreviewSizeToggle.setAttribute("aria-pressed", String(state.paperPreviewExpanded));
  dom.paperPreviewSizeToggle.setAttribute(
    "aria-label",
    state.paperPreviewExpanded ? "Collapse the paper reader to the right" : "Expand the paper over the draft",
  );
  dom.paperPreviewSizeToggle.title = state.paperPreviewExpanded ? "Collapse paper reader" : "Expand paper reader";
  updatePaperPreviewScale();
}

function openPaperPreview(entries, selectedKey) {
  dom.referenceManager.open = false;
  state.paperPreviewFocus = document.activeElement;
  state.paperPreviewMode = "reference";
  dom.previewButton.classList.remove("is-active");
  dom.previewButton.setAttribute("aria-pressed", "false");
  document.body.classList.remove("compiled-preview-open");
  document.body.classList.add("paper-preview-open");
  dom.paperPreview.classList.remove("is-compiled");
  dom.paperPreviewEyebrow.textContent = "Reference";
  dom.paperPreviewTitle.textContent = "Paper preview";
  dom.paperPreview.hidden = false;
  setPaperPreviewExpanded(state.paperPreviewExpanded);
  renderPaperPreview(entries, selectedKey);
  requestAnimationFrame(() => dom.closePaperPreview.focus({ preventScroll: true }));
}

function openCompiledPdfPreview() {
  dom.referenceManager.open = false;
  state.paperPreviewFocus = document.activeElement;
  state.paperPreviewMode = "compiled";
  document.body.classList.add("paper-preview-open");
  document.body.classList.add("compiled-preview-open");
  dom.paperPreview.classList.add("is-compiled");
  dom.paperPreviewEyebrow.textContent = "Live output";
  dom.paperPreviewTitle.textContent = "Compiled PDF";
  dom.paperPreview.hidden = false;
  setPaperPreviewExpanded(false);
  renderCompiledPdfPreview();
  requestAnimationFrame(() => dom.closePaperPreview.focus({ preventScroll: true }));
}

function closePaperPreview() {
  document.body.classList.remove("paper-preview-open");
  document.body.classList.remove("compiled-preview-open");
  dom.paperPreview.hidden = true;
  dom.paperSwitcher.replaceChildren();
  dom.paperPreviewContent.replaceChildren();
  dom.paperPreview.classList.remove("is-compiled");
  dom.previewButton.classList.remove("is-active");
  dom.previewButton.setAttribute("aria-pressed", "false");
  if (state.paperPreviewFocus instanceof HTMLElement) state.paperPreviewFocus.focus({ preventScroll: true });
  state.paperPreviewFocus = null;
  state.paperPreviewMode = null;
}

function renderReferenceList(query = "") {
  const references = state.document?.references;
  if (!references) return;
  const normalized = query.trim().toLowerCase();
  const usedCitations = new Set(references.usedCitationKeys || []);
  const usedLabels = new Set(references.usedLabelKeys || []);
  const citations = references.citations.filter((item) => usedCitations.has(item.key));
  const labels = references.labels.filter((item) => usedLabels.has(item.key));
  const entries = [
    ...labels.map((item) => ({ ...item, entryType: "label", search: `${item.key} ${item.type} ${item.number}` })),
    ...citations.map((item) => ({ ...item, entryType: "citation", search: `${item.key} ${item.author} ${item.year} ${item.title}` })),
  ].filter((item) => !normalized || item.search.toLowerCase().includes(normalized));
  dom.referenceList.replaceChildren();
  if (!entries.length) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = normalized ? "No matching citation or label." : "No references in this source.";
    dom.referenceList.append(empty);
    return;
  }
  for (const entry of entries) {
    const item = document.createElement("button");
    item.className = `reference-item reference-${entry.entryType}`;
    item.type = "button";
    if (entry.entryType === "label") {
      item.addEventListener("click", () => goToLabel(entry));
    } else item.addEventListener("click", () => openPaperPreview([entry], entry.key));
    const meta = document.createElement("span");
    meta.textContent = entry.entryType === "label"
      ? `${entry.type} ${entry.number || "?"}${entry.page ? ` · p.${entry.page}` : ""}`
      : `${entry.author || entry.key} · ${entry.year || "n.d."}`;
    const title = document.createElement("strong");
    title.textContent = entry.entryType === "label" ? entry.key : entry.title || entry.key;
    const key = document.createElement("code");
    key.textContent = entry.key;
    item.append(meta, title, key);
    dom.referenceList.append(item);
  }
}

function renderReferenceManager() {
  const references = state.document?.references;
  if (!references) return;
  const total = new Set([...(references.usedCitationKeys || []), ...(references.usedLabelKeys || [])]).size;
  const unresolved = references.unresolved?.length || 0;
  // Word and count are separate so a narrow header can keep just the count.
  const referenceWord = document.createElement("span");
  referenceWord.className = "reference-word";
  referenceWord.textContent = "References · ";
  dom.referenceSummary.replaceChildren(referenceWord, `${total}${unresolved ? ` · ${unresolved} unresolved` : ""}`);
  dom.referenceSummary.parentElement.title = `References · ${total}${unresolved ? ` · ${unresolved} unresolved` : ""}`;
  dom.referenceManager.classList.toggle("has-unresolved", unresolved > 0);
  renderReferenceList(dom.referenceSearch.value);
}

// A full render replaces every editor node, which collapses a live selection,
// hides the selection toolbar mid-gesture and throws away text typed into a
// proposal unit. Server events therefore ask for a render through
// renderDocumentWhenSafe(), and the render is replayed once the gesture ends.
function documentRenderBlocked() {
  if (state.proposalEditing || state.proposalSaving) return true;
  const active = document.activeElement;
  if (active instanceof Element && dom.editor.contains(active)
    && active.closest(".editor-block.is-editing, .proposal-review-block[contenteditable='true']")) return true;
  const selection = window.getSelection();
  if (selection && selection.rangeCount && !selection.isCollapsed) {
    const range = selection.getRangeAt(0);
    if (dom.editor.contains(range.startContainer) || dom.editor.contains(range.endContainer)) return true;
  }
  return false;
}

function renderDocumentWhenSafe() {
  if (!state.document) return;
  if (state.editing || documentRenderBlocked()) {
    state.renderPending = true;
    return;
  }
  renderDocument();
}

function flushPendingRender() {
  if (!state.renderPending || state.editing || state.suppressRender || documentRenderBlocked()) return;
  renderDocument();
}

function renderDocument() {
  const payload = state.document;
  if (!payload) return;
  if (state.suppressRender) {
    state.renderPending = true;
    return;
  }
  state.renderPending = false;
  updateEncodingNotice();
  dom.editor.replaceChildren();
  const frontMatter = createFrontMatterBlock(payload.frontMatter);
  if (frontMatter) dom.editor.append(frontMatter);
  // Presentation only: paragraphs between \begin{abstract} and \end{abstract}
  // are set as an abstract (labelled, narrower). Nothing here touches the source.
  let inAbstract = false;
  let lastAbstractBlock = null;
  for (const block of payload.blocks) {
    const raw = String(block.raw || "");
    const opensAbstract = /\\begin\{abstract\}/.test(raw);
    const closesAbstract = /\\end\{abstract\}/.test(raw);
    if (opensAbstract) inAbstract = true;
    if (block.hidden || !block.display?.trim()) {
      if (closesAbstract) inAbstract = false;
      continue;
    }
    const section = document.createElement("section");
    section.className = `editor-block status-${block.status} kind-${block.kind}`;
    if (inAbstract) {
      section.classList.add("in-abstract");
      if (!lastAbstractBlock) {
        const label = document.createElement("div");
        label.className = "abstract-label";
        label.setAttribute("aria-hidden", "true");
        label.textContent = "Abstract";
        dom.editor.append(label);
      }
      lastAbstractBlock = section;
    }
    if (closesAbstract) inAbstract = false;
    // An \item that arrives as its own block gets a hanging indent.
    if (block.kind === "paragraph" && /^\s*• /.test(block.display)) section.classList.add("is-list-item");
    if (block.role === "list-item") {
      section.classList.add(`list-${block.list}`);
      if (block.listDepth > 1) section.classList.add("list-nested");
      // A second paragraph of the same item lines up with the item text.
      if (!/^\s*• /.test(block.display)) section.classList.add("is-list-continuation");
    }
    // Theorems, proofs, quotations, keywords...: a small label in front of
    // the first block and a class on every block. Presentation only.
    if (block.environment) {
      const name = String(block.environment).replace(/[^A-Za-z]/g, "").toLowerCase();
      section.classList.add("in-environment", `environment-${name}`);
      const labelText = environmentLabelText(block);
      if (block.environmentStart && labelText) {
        const label = document.createElement("div");
        label.className = "environment-label";
        label.setAttribute("aria-hidden", "true");
        label.textContent = labelText;
        dom.editor.append(label);
      }
    }
    const hasProposal = state.requests.some((request) =>
      request.path === payload.path && request.status === "proposed" && requestRangeForBlock(request, block)
    );
    section.contentEditable = "false";
    section.dataset.reviewLocked = hasProposal ? "true" : "false";
    if (hasProposal) section.classList.add("has-proposal");
    section.spellcheck = true;
    section.dataset.blockIndex = String(block.index);
    section.dataset.blockId = block.id;
    section.dataset.label = `P${block.index + 1}`;
    section.id = `block-${block.index}`;
    if (block.semantic?.label) section.dataset.latexLabel = block.semantic.label;
    if (block.semantic && isRangeAccepted(block, 0, block.raw.length)) section.classList.add("structure-confirmed");
    if (block.kind === "heading") {
      const outlineEntry = state.compiledOutline?.items?.find((item) => item.path === payload.path && item.blockIndex === block.index);
      const level = outlineEntry?.level || outlineLevel(block.raw);
      section.classList.add(`heading-level-${level}`);
      section.dataset.sectionNumber = outlineEntry?.number || "";
    }
    section.reviewBlock = block;
    if (!renderStructure(section, block)) {
      section.setAttribute("role", "textbox");
      section.setAttribute("aria-multiline", "true");
      section.setAttribute("aria-label", `Editable paper paragraph ${block.index + 1}`);
      if (block.editable === false) {
        section.setAttribute("aria-readonly", "true");
        section.setAttribute("aria-label", `Read-only paper paragraph ${block.index + 1}`);
      }
      renderReviewText(section, block);
      section.addEventListener("input", handleBlockInput);
      section.addEventListener("keydown", handleBlockKeydown);
      section.addEventListener("pointerup", handleBlockPointerUp);
      section.addEventListener("blur", async () => {
        if (state.editing?.element === section) await flushSave();
        else deactivateBlockEditing(section);
        flushPendingRender();
      });
    }
    dom.editor.append(section);
  }
  if (lastAbstractBlock) {
    lastAbstractBlock.classList.add("abstract-end");
    if (lastAbstractBlock.nextElementSibling) {
      const rule = document.createElement("hr");
      rule.className = "abstract-rule";
      rule.setAttribute("aria-hidden", "true");
      lastAbstractBlock.after(rule);
    }
  }
  updateDocumentHeader();
  updateProgress();
  renderOutline();
  applyCommentMarkers();
  renderReferenceManager();
  requestAnimationFrame(() => {
    positionCommentCards();
    renderMath();
  });
}

const ENVIRONMENT_NAMES = {
  thm: "Theorem", lem: "Lemma", prop: "Proposition", cor: "Corollary", defn: "Definition", rem: "Remark",
  ieeekeywords: "Index Terms", keywords: "Keywords", keyword: "Keywords", ack: "Acknowledgments", acks: "Acknowledgements", acknowledgments: "Acknowledgments",
  acknowledgements: "Acknowledgements", acknowledgement: "Acknowledgement", acknowledgment: "Acknowledgment",
};
// Set apart by layout alone; a label would only be noise.
const UNLABELLED_ENVIRONMENTS = new Set(["quote", "quotation", "verse", "center", "credits"]);

function environmentLabelText(block) {
  const key = String(block.environment || "").replace(/[^A-Za-z]/g, "").toLowerCase();
  if (!key || UNLABELLED_ENVIRONMENTS.has(key)) return "";
  const name = ENVIRONMENT_NAMES[key] || `${key[0].toUpperCase()}${key.slice(1)}`;
  const number = block.environmentNumber ? ` ${block.environmentNumber}` : "";
  const title = block.environmentTitle ? ` (${block.environmentTitle})` : "";
  return `${name}${number}${title}`;
}

// \title, \author and \date as the reader sees them on the first page. Read
// only: the commands live in the preamble, which Paper Pal never rewrites.
function createFrontMatterBlock(frontMatter) {
  const titleText = String(frontMatter?.title?.text || "").trim();
  if (!titleText) return null;
  const header = document.createElement("header");
  header.className = "paper-front";
  header.title = "From \\title and \\author in the preamble. Edit them in the .tex source.";
  const title = document.createElement("h1");
  title.className = "paper-title";
  title.textContent = titleText;
  header.append(title);
  const authors = (frontMatter.authors || []).map((author) => String(author?.text || "").trim()).filter(Boolean);
  if (authors.length) {
    const list = document.createElement("p");
    list.className = "paper-authors";
    for (const [index, name] of authors.entries()) {
      const item = document.createElement("span");
      item.textContent = name;
      list.append(item);
      if (index < authors.length - 1) list.append(document.createTextNode(index === authors.length - 2 && authors.length > 1 ? (authors.length > 2 ? ", and " : " and ") : ", "));
    }
    header.append(list);
  }
  const dateText = String(frontMatter.date?.text || "").trim();
  if (dateText) {
    const date = document.createElement("p");
    date.className = "paper-date";
    date.textContent = dateText;
    header.append(date);
  }
  return header;
}

function outlineLevel(raw) {
  const command = raw.trim().match(/^\\(section|subsection|subsubsection|paragraph|subparagraph)\*?\s*(?:\[[^\]\n]*\]\s*)?\{/i)?.[1]?.toLowerCase();
  return { section: 1, subsection: 2, subsubsection: 3, paragraph: 3, subparagraph: 3 }[command] || 1;
}

function setActiveOutline(blockIndex, documentPath = state.document?.path) {
  state.activeOutline = { path: documentPath, blockIndex: Number(blockIndex) };
  for (const item of dom.outlineList.querySelectorAll(".outline-item")) {
    item.classList.toggle(
      "active",
      Number(item.dataset.blockIndex) === Number(blockIndex) && item.dataset.path === documentPath,
    );
  }
  updateDocumentHeader();
}

function scrollToBlock(blockIndex, { smooth = true } = {}) {
  const target = dom.editor.querySelector(`#block-${CSS.escape(String(blockIndex))}`);
  if (!target) return;
  state.outlineSelectionLockUntil = Date.now() + (smooth ? 900 : 120);
  target.scrollIntoView({ behavior: smooth ? "smooth" : "auto", block: "start" });
  target.classList.remove("outline-target");
  requestAnimationFrame(() => target.classList.add("outline-target"));
  setActiveOutline(blockIndex);
}

function currentStructureNodeMap() {
  const map = new Map();
  const visit = (node) => {
    if (!node) return;
    map.set(node.id, node);
    for (const child of node.children || []) visit(child);
  };
  for (const section of state.structure?.sections || []) {
    for (const node of section.nodes || []) visit(node);
  }
  return map;
}

function proposedOutlineItems() {
  const plan = activeStructurePlan();
  const proposal = plan?.proposal || state.structureProposal;
  if (!proposal?.sections?.length || !state.outlinePreview) return null;
  const sourceNodes = currentStructureNodeMap();
  const currentSections = new Map((state.structure?.sections || []).map((section) => [section.id, section]));
  const planSections = new Map((plan?.sections || []).map((section) => [section.sectionId, section]));
  const items = [];
  for (const proposedSection of proposal.sections || []) {
    const current = currentSections.get(proposedSection.sectionId);
    const planSection = planSections.get(proposedSection.sectionId);
    const sectionNumber = planSection?.number || current?.number || "–";
    const fallbackPath = planSection?.paths?.[0] || current?.path || "";
    items.push({
      path: fallbackPath,
      blockIndex: current?.blockIndex ?? 0,
      title: proposedSection.title,
      level: 1,
      number: sectionNumber,
      proposed: true,
      planStatus: planSection?.status || "pending",
    });
    let subsection = 0;
    const appendNodes = (nodes, depth = 0) => {
      for (const node of nodes || []) {
        if (node.kind === "subsection") subsection += 1;
        const source = (node.sourceNodeIds || []).map((id) => sourceNodes.get(id)).find(Boolean);
        items.push({
          path: source?.path || fallbackPath,
          blockIndex: source?.blockIndex ?? current?.blockIndex ?? 0,
          title: node.title,
          level: Math.min(3, node.kind === "subsection" ? 2 : 3 + depth),
          number: node.kind === "subsection" ? `${sectionNumber}.${subsection}` : "·",
          proposed: true,
          planStatus: planSection?.status || "pending",
          change: node.change || "rewrite",
        });
        appendNodes(node.children, depth + 1);
      }
    };
    appendNodes(proposedSection.nodes);
  }
  return items;
}

function renderOutline() {
  const localHeadings = (state.document?.blocks || [])
    .filter((block) => block.kind === "heading" && !block.hidden && block.display?.trim())
    .map((block, index) => ({
      path: state.document.path,
      fileLabel: state.document.path.split("/").pop(),
      blockIndex: block.index,
      title: block.display,
      level: outlineLevel(block.raw),
      number: String(index + 1),
    }));
  const proposedHeadings = proposedOutlineItems();
  const headings = proposedHeadings?.length
    ? proposedHeadings
    : state.compiledOutline?.items?.length ? state.compiledOutline.items : localHeadings;
  const previewing = Boolean(proposedHeadings?.length);
  dom.outlineList.replaceChildren();
  const overallProgress = Number(state.compiledOutline?.overallProgress || 0);
  dom.outlineCount.textContent = previewing ? `${headings.length} proposed items` : `${headings.length} sections`;
  dom.progressValue.textContent = `${overallProgress}%`;
  dom.progressRing.style.setProperty("--progress", String(overallProgress));
  const sourceCount = new Set(headings.map((heading) => heading.path)).size;
  const outlineRoot = state.compiledOutline?.root?.split("/").pop() || "main.tex";
  dom.compiledSourceStatus.textContent = previewing
    ? `Proposed outline · ${activeStructurePlan() ? "plan approved" : "not yet approved"}`
    : `${outlineRoot} · ${sourceCount} source${sourceCount === 1 ? "" : "s"}`;
  if (!headings.length) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "No section headings in this source file.";
    dom.outlineList.append(empty);
    return;
  }
  const fallbackActiveIndex = headings.findIndex((value) => value.path === state.document?.path);
  const rememberedActiveIndex = state.activeOutline?.path === state.document?.path
    ? headings.findIndex((value) =>
      value.path === state.activeOutline.path &&
      Number(value.blockIndex) === Number(state.activeOutline.blockIndex)
    )
    : -1;
  const activeIndex = rememberedActiveIndex >= 0 ? rememberedActiveIndex : fallbackActiveIndex;
  for (const [index, heading] of headings.entries()) {
    const item = document.createElement("button");
    item.type = "button";
    item.className = `outline-item level-${heading.level}${heading.proposed ? " is-proposed" : ""}`;
    item.dataset.blockIndex = String(heading.blockIndex);
    item.dataset.path = heading.path;
    const number = document.createElement("span");
    number.className = "outline-number";
    number.textContent = heading.number || "–";
    const title = document.createElement("span");
    title.className = "outline-title";
    title.textContent = heading.title;
    const copy = document.createElement("span");
    copy.className = "outline-item-copy";
    if (heading.proposed) {
      const status = document.createElement("span");
      status.className = `outline-plan-state status-${heading.planStatus}`;
      status.textContent = heading.planStatus;
      copy.append(title, status);
    } else {
      const review = document.createElement("span");
      review.className = "outline-review";
      const track = document.createElement("span");
      track.className = "outline-review-track";
      const fill = document.createElement("i");
      const reviewedPercent = Number(heading.reviewedPercent || 0);
      fill.style.width = `${reviewedPercent}%`;
      track.append(fill);
      const percent = document.createElement("span");
      percent.className = "outline-review-value";
      percent.textContent = `${reviewedPercent}%`;
      review.append(track, percent);
      copy.append(title, review);
    }
    item.append(number, copy);
    const sourceName = heading.path.split("/").pop() || heading.path;
    item.title = `${heading.number ? `${heading.number} ` : ""}${heading.title}\n${sourceName}`;
    if (!heading.proposed && index === activeIndex) item.classList.add("active");
    item.addEventListener("click", async () => {
      if (heading.proposed) await setWorkspaceMode("text");
      if (heading.path !== state.document?.path) await loadDocument(heading.path);
      requestAnimationFrame(() => scrollToBlock(heading.blockIndex));
    });
    dom.outlineList.append(item);
  }
}

async function refreshCompiledOutline({ render = true } = {}) {
  state.compiledOutline = await api("/api/outline");
  if (render) renderOutline();
}

function syncOutlineFromScroll() {
  clearTimeout(state.outlineScrollTimer);
  state.outlineScrollTimer = setTimeout(() => {
    if (Date.now() < state.outlineSelectionLockUntil) return;
    const headings = [...dom.editor.querySelectorAll(".editor-block.kind-heading")];
    if (!headings.length) return;
    const threshold = dom.editorPane.getBoundingClientRect().top + 125;
    let current = headings[0];
    for (const heading of headings) {
      if (heading.getBoundingClientRect().top <= threshold) current = heading;
      else break;
    }
    setActiveOutline(Number(current.dataset.blockIndex), state.document?.path);
  }, 60);
}

function applyCommentMarkers() {
  for (const element of dom.editor.querySelectorAll(".editor-block.has-comment")) {
    element.classList.remove("has-comment");
    delete element.dataset.commentCount;
  }
  const grouped = new Map();
  const numberMap = currentReviewNumberMap();
  for (const request of state.requests.filter((item) => ["pending", "proposed", "discussed"].includes(item.status))) {
    const linked = linkedChangeForCurrentDocument(request);
    if (!linked) continue;
    const blockIndex = linked.id === "primary"
      ? resolvedRequestBlockIndex(request)
      : Number(linked.resolvedBlockIndex ?? linked.blockIndex);
    if (!Number.isInteger(blockIndex)) continue;
    const number = numberMap.get(request.id);
    if (!number) continue;
    const numbers = grouped.get(blockIndex) || [];
    if (!numbers.includes(number)) numbers.push(number);
    grouped.set(blockIndex, numbers);
  }
  for (const [blockIndex, numbers] of grouped) {
    const element = dom.editor.querySelector(`#block-${blockIndex}`);
    if (!element) continue;
    element.classList.add("has-comment");
    element.dataset.commentCount = numbers.join(",");
  }
}

function positionCommentCards({ restoreScrollTop = null } = {}) {
  cancelAnimationFrame(state.commentPositionFrame);
  state.commentPositionFrame = requestAnimationFrame(() => {
    if (!dom.commentsTrack || !state.document) return;
    const trackRect = dom.requestList.getBoundingClientRect();
    const editorRect = dom.editorPane.getBoundingClientRect();
    const positioned = [...dom.requestList.querySelectorAll(".request-card[data-block-index]")]
      .map((card) => ({
        card,
        target: card.dataset.proposalUnitId
          ? dom.editor.querySelector(`[data-proposal-unit-id="${CSS.escape(card.dataset.proposalUnitId)}"]`)
          : dom.editor.querySelector(`[data-review-request-id="${CSS.escape(card.dataset.requestId || "")}"]`)
            || dom.editor.querySelector(`#block-${card.dataset.blockIndex}`),
      }))
      .filter((item) => item.target);
    const cards = positioned
      .filter((item) => item.target)
      .map((item) => ({ ...item, targetRect: item.target.getBoundingClientRect() }))
      .sort((a, b) => a.targetRect.top - b.targetRect.top);
    let nextTop = 8;
    for (const { card, targetRect } of cards) {
      const visible = targetRect.bottom >= editorRect.top + 58 && targetRect.top <= editorRect.bottom;
      card.hidden = !visible;
      if (!visible) continue;
      const desiredTop = Math.max(8, targetRect.top - trackRect.top);
      const top = Math.max(desiredTop, nextTop);
      card.style.top = `${top}px`;
      nextTop = top + card.offsetHeight + 9;
    }
    for (const card of dom.requestList.querySelectorAll(".request-card.anchor-missing")) {
      card.hidden = false;
      card.style.top = `${nextTop}px`;
      nextTop += card.offsetHeight + 9;
    }
    if (Number.isFinite(restoreScrollTop)) dom.requestList.scrollTop = restoreScrollTop;
  });
}

function updateDocumentHeader() {
  const payload = state.document;
  const currentHeading = currentSectionOutlineItem();
  dom.documentTitle.textContent = currentHeading
    ? `${currentHeading.number ? `${currentHeading.number} · ` : ""}${currentHeading.title}`
    : labelForPath(payload.path);
  const visibleBlocks = payload.blocks.filter((block) => !block.hidden && block.display?.trim()).length;
  // Two spans so narrow layouts can drop the path (the Source picker shows it);
  // textContent stays "path · N readable blocks".
  const metaPath = document.createElement("span");
  metaPath.className = "meta-path";
  metaPath.textContent = `${payload.path} · `;
  const metaCount = document.createElement("span");
  const blockCount = `${visibleBlocks} readable ${visibleBlocks === 1 ? "block" : "blocks"}`;
  metaCount.textContent = blockCount;
  dom.documentMeta.replaceChildren(metaPath, metaCount);
  dom.documentMeta.title = `${payload.path} · ${blockCount}`;
  updateSectionReviewActions();
}

function currentSectionOutlineItem() {
  const payload = state.document;
  if (!payload) return null;
  const compiled = (state.compiledOutline?.items || [])
    .filter((item) => item.path === payload.path && Number.isInteger(Number(item.blockIndex)))
    .sort((left, right) => Number(left.blockIndex) - Number(right.blockIndex));
  if (compiled.length) {
    const active = state.activeOutline?.path === payload.path
      ? compiled.find((item) => Number(item.blockIndex) === Number(state.activeOutline.blockIndex))
      : null;
    return active || compiled[0];
  }
  const headings = payload.blocks
    .filter((block) => block.kind === "heading" && !block.hidden && block.display?.trim())
    .map((block, index) => ({
      path: payload.path,
      blockIndex: block.index,
      title: block.display,
      level: outlineLevel(block.raw),
      number: String(index + 1),
    }));
  const active = state.activeOutline?.path === payload.path
    ? headings.find((item) => Number(item.blockIndex) === Number(state.activeOutline.blockIndex))
    : null;
  return active || headings[0] || null;
}

function currentSectionReviewScope() {
  const payload = state.document;
  const item = currentSectionOutlineItem();
  if (!payload || !item) return null;
  const start = Number(item.blockIndex);
  const level = Number(item.level || 1);
  const next = (state.compiledOutline?.items || [])
    .filter((candidate) =>
      candidate.path === payload.path &&
      Number(candidate.blockIndex) > start &&
      Number(candidate.level || 1) <= level
    )
    .sort((left, right) => Number(left.blockIndex) - Number(right.blockIndex))[0];
  const end = next ? Number(next.blockIndex) : payload.blocks.length;
  const blocks = payload.blocks.filter((block) =>
    block.index >= start &&
    block.index < end &&
    block.kind !== "structure" &&
    !block.hidden &&
    block.display?.trim() &&
    block.raw.length
  );
  return { item, start, end, blocks };
}

function sectionScopeHasProposal(scope) {
  return scope.blocks.some((block) => state.requests.some((request) =>
    request.path === state.document?.path &&
    request.status === "proposed" &&
    requestRangeForBlock(request, block)
  ));
}

function updateSectionReviewActions() {
  const scope = currentSectionReviewScope();
  const available = Boolean(scope?.blocks.length);
  dom.toggleSectionReview.hidden = !available;
  if (!available) return;
  const fullyConfirmed = scope.blocks.every((block) => isRangeAccepted(block, 0, block.raw.length));
  const locked = sectionScopeHasProposal(scope);
  const disabled = state.sectionReviewBusy || locked;
  const nextStatus = fullyConfirmed ? "pending" : "confirmed";
  dom.toggleSectionReview.dataset.status = nextStatus;
  dom.toggleSectionReview.textContent = fullyConfirmed ? "Unconfirm section" : "Confirm section";
  dom.toggleSectionReview.disabled = disabled;
  const sectionLabel = `${scope.item.number ? `${scope.item.number} ` : ""}${scope.item.title}`.trim();
  dom.toggleSectionReview.title = locked
    ? "Resolve the active proposal in this section before confirming its source text."
    : fullyConfirmed
      ? `Remove explicit confirmations from ${sectionLabel}`
      : `Confirm every reviewable block in ${sectionLabel}`;
}

async function setCurrentSectionReviewStatus(status) {
  if (state.sectionReviewBusy) return;
  if (!(await settlePendingEdits())) return;
  const scope = currentSectionReviewScope();
  if (!scope?.blocks.length) {
    showToast("No reviewable text was found in this section.");
    return;
  }
  if (sectionScopeHasProposal(scope)) {
    showToast("Resolve the active proposal in this section before changing its review state.", 4600);
    return;
  }
  const segments = scope.blocks.map((block) => ({
    blockIndex: block.index,
    blockId: block.id,
    start: 0,
    end: block.raw.length,
  }));
  state.sectionReviewBusy = true;
  updateSectionReviewActions();
  try {
    const result = await api(status === "confirmed" ? "/api/confirm" : "/api/unconfirm", {
      method: "POST",
      body: JSON.stringify({
        path: state.document.path,
        etag: state.document.etag,
        segments,
      }),
    });
    for (const [blockIndex, ranges] of Object.entries(result.acceptedRangesByBlock || {})) {
      if (state.document.blocks[Number(blockIndex)]) state.document.blocks[Number(blockIndex)].acceptedRanges = ranges;
    }
    await refreshCompiledOutline({ render: false });
    renderDocument();
    const label = scope.item.number ? `Section ${scope.item.number}` : "This section";
    showToast(status === "confirmed"
      ? `${label} is confirmed.`
      : `${label} confirmations were removed.`);
  } catch (error) {
    showToast(error.message, 5000);
  } finally {
    state.sectionReviewBusy = false;
    updateSectionReviewActions();
  }
}

function updateProgress() {
  const blocks = state.document?.blocks || [];
  const reviewable = blocks.filter((block) => block.kind !== "structure");
  const points = reviewable.reduce((sum, block) => {
    if (["accepted", "human"].includes(block.status)) return sum + 1;
    const reviewed = mergeRanges([...(block.acceptedRanges || []), ...(block.humanRanges || [])], block.raw.length)
      .reduce((n, range) => n + range.end - range.start, 0);
    return sum + Math.min(1, reviewed / Math.max(1, block.raw.length));
  }, 0);
  const progress = reviewable.length ? Math.round((points / reviewable.length) * 100) : 0;
  dom.sectionProgressFill.style.width = `${progress}%`;
  dom.sectionProgressValue.textContent = `${progress}%`;
}

async function loadDocument(relativePath, { quiet = false, discardEditing = false } = {}) {
  if (!discardEditing && !(await settlePendingEdits())) {
    dom.documentSelect.value = state.document?.path || relativePath;
    return false;
  }
  if (discardEditing) {
    clearTimeout(state.saveTimer);
    state.editing = null;
  }
  dom.selectionToolbar.hidden = true;
  dom.commentComposer.hidden = true;
  state.selection = null;
  state.commentDraft = null;
  if (!quiet) dom.editor.innerHTML = '<div class="loading-card">Opening the LaTeX source…</div>';
  const previousPath = state.document?.path ?? null;
  // Only the most recent request may paint: a slow earlier response (for
  // example the initial document) must not overwrite a later Source choice.
  // A background refresh of the file being left must not cancel a navigation
  // that is still in flight.
  if (quiet && state.documentNavigation && state.documentNavigation !== relativePath) return false;
  const loadToken = (state.documentLoadToken = (state.documentLoadToken || 0) + 1);
  if (!quiet) state.documentNavigation = relativePath;
  try {
    const loaded = await api(`/api/document?path=${encodeURIComponent(relativePath)}`);
    if (loadToken !== state.documentLoadToken) return false;
    state.document = loaded;
    if (state.activeOutline?.path !== relativePath) state.activeOutline = null;
    if (previousPath !== relativePath) {
      // A different file: findings and scroll position belong to the old one.
      dom.editorPane.scrollTop = 0;
      if (dom.reviewPanel) dom.reviewPanel.hidden = true;
      state.review = null;
    }
    dom.documentSelect.value = relativePath;
    state.externalChange = false;
    state.saveConflict = false;
    dom.externalChange.hidden = true;
    dom.externalKeep.hidden = true;
    dom.externalChangeMessage.textContent = "The source changed outside this editor.";
    renderDocument();
    renderRequestLists();
    setSaveState("Saved", false);
    return true;
  } catch (error) {
    if (loadToken !== state.documentLoadToken) return false;
    dom.editor.innerHTML = `<div class="loading-card">${escapeHtml(error.message)}</div>`;
    showToast(error.message, 4200);
    return false;
  } finally {
    if (loadToken === state.documentLoadToken) state.documentNavigation = null;
  }
}

function handleBlockKeydown(event) {
  if (event.key === "Enter" && !event.metaKey && !event.ctrlKey) {
    event.preventDefault();
    document.execCommand("insertText", false, "\n\n");
  }
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
    event.preventDefault();
    flushSave();
  }
}

// Nodes the renderer adds on top of the source text: comment number badges,
// proposed insertions and tracked-change buttons. They never count towards a
// source offset and are never saved back.
const NON_SOURCE_NODE_SELECTOR = ".review-number, .proposal-add, .tracked-change-actions";

function canonicalNodeText(node) {
  if (node instanceof Element && node.matches(NON_SOURCE_NODE_SELECTOR)) return "";
  if (node instanceof Element && node.matches("[data-latex]")) return node.dataset.latex || "";
  return node.textContent || "";
}

function canonicalEditableText(root) {
  return [...root.childNodes].map((node) => canonicalNodeText(node)).join("");
}

// Offset of a DOM point inside a rendered block, measured in block.display
// characters. Range.toString() cannot be used for this: it also counts badge
// digits, proposed insertions and typeset formulas, which shifted every
// selection made after one of them.
function canonicalOffsetAt(root, container, offset, edge = "start") {
  if (container === root) {
    return [...root.childNodes].slice(0, offset).reduce((sum, child) => sum + canonicalNodeText(child).length, 0);
  }
  let total = 0;
  for (const child of root.childNodes) {
    if (child === container) {
      return total + (child.nodeType === Node.TEXT_NODE ? Math.min(offset, child.textContent.length) : 0);
    }
    if (child instanceof Element && child.contains(container)) {
      if (child.matches(NON_SOURCE_NODE_SELECTOR)) return total;
      // A formula is atomic: a point inside it snaps outwards.
      if (child.matches("[data-latex]")) return total + (edge === "end" ? canonicalNodeText(child).length : 0);
      const prefix = document.createRange();
      prefix.selectNodeContents(child);
      try {
        prefix.setEnd(container, offset);
        return total + prefix.toString().length;
      } catch {
        return total + (edge === "end" ? canonicalNodeText(child).length : 0);
      }
    }
    total += canonicalNodeText(child).length;
  }
  return total;
}

function unwrapPastedHeadingCommand(value, block) {
  if (!["heading", "paragraph-heading"].includes(block?.kind)) return value;
  const trimmed = String(value || "").trim();
  const match = trimmed.match(/^\\(section|subsection|subsubsection|paragraph|subparagraph)\*?\s*(?:\[[^\]\n]*\]\s*)?\{/i);
  if (!match) return value;
  const open = match[0].lastIndexOf("{");
  let depth = 0;
  for (let index = open; index < trimmed.length; index += 1) {
    if (trimmed[index] === "{" && trimmed[index - 1] !== "\\") depth += 1;
    if (trimmed[index] === "}" && trimmed[index - 1] !== "\\") {
      depth -= 1;
      if (depth === 0) {
        if (trimmed.slice(index + 1).trim()) return value;
        return trimmed.slice(open + 1, index);
      }
    }
  }
  return value;
}

function canonicalCaretOffset(root, { ignoreProposalAdditions = false } = {}) {
  const selection = window.getSelection();
  if (!selection?.rangeCount || !selection.isCollapsed) return null;
  const range = selection.getRangeAt(0);
  if (!root.contains(range.startContainer) && range.startContainer !== root) return null;
  let offset = 0;
  for (const child of root.childNodes) {
    const isProposalAddition = ignoreProposalAdditions
      && child instanceof Element
      && child.matches(".proposal-add, .proposal-add-blocks");
    if (isProposalAddition) {
      if (child === range.startContainer || child.contains(range.startContainer)) return offset;
      continue;
    }
    if (child === range.startContainer) {
      if (child.nodeType === Node.TEXT_NODE) return offset + Math.min(range.startOffset, child.textContent?.length || 0);
      return offset;
    }
    if (child instanceof Element && child.contains(range.startContainer)) {
      if (child.matches("[data-latex]")) return offset + canonicalNodeText(child).length;
      const prefix = document.createRange();
      prefix.selectNodeContents(child);
      try {
        prefix.setEnd(range.startContainer, range.startOffset);
        return offset + prefix.toString().length;
      } catch {
        return offset + canonicalNodeText(child).length;
      }
    }
    offset += canonicalNodeText(child).length;
  }
  if (range.startContainer === root) {
    return [...root.childNodes]
      .slice(0, Math.min(range.startOffset, root.childNodes.length))
      .reduce((sum, child) => {
        if (
          ignoreProposalAdditions
          && child instanceof Element
          && child.matches(".proposal-add, .proposal-add-blocks")
        ) return sum;
        return sum + canonicalNodeText(child).length;
      }, 0);
  }
  return offset;
}

function restoreEditableCaret(root, requestedOffset) {
  if (!Number.isInteger(requestedOffset)) return;
  const selection = window.getSelection();
  if (!selection) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => node.parentElement?.closest(".review-number")
      ? NodeFilter.FILTER_REJECT
      : NodeFilter.FILTER_ACCEPT,
  });
  let offset = Math.max(0, requestedOffset);
  let node = walker.nextNode();
  let last = null;
  while (node) {
    last = node;
    const length = node.textContent?.length || 0;
    if (offset <= length) {
      const range = document.createRange();
      range.setStart(node, offset);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
      return;
    }
    offset -= length;
    node = walker.nextNode();
  }
  const range = document.createRange();
  range.selectNodeContents(root);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
}

function prepareEditableMath(root) {
  const caretOffset = canonicalCaretOffset(root);
  let changed = false;
  for (const math of root.querySelectorAll("[data-latex]")) {
    const latex = math.dataset.latex || "";
    if (math.childNodes.length !== 1 || math.textContent !== latex) {
      math.replaceChildren(document.createTextNode(latex));
      changed = true;
    }
  }
  if (changed) restoreEditableCaret(root, caretOffset);
}

// A file that is not UTF-8 is shown but never written (the server refuses too).
function isReadOnlyPath(path) {
  return Boolean(state.document?.readOnly && state.document.path === path);
}

function updateEncodingNotice() {
  let notice = document.querySelector("#encoding-notice");
  if (!notice) {
    notice = document.createElement("div");
    notice.id = "encoding-notice";
    notice.className = "change-banner encoding-notice";
    notice.setAttribute("role", "status");
    dom.externalChange.after(notice);
  }
  const encoding = state.document?.encoding;
  notice.hidden = !state.document?.readOnly;
  notice.textContent = notice.hidden ? "" : encoding?.message || "This file is not UTF-8, so Paper Pal will not modify it.";
  notice.title = notice.hidden ? "" : encoding?.reason || "";
}

function activateBlockEditing(element) {
  if (!element || element.reviewBlock?.semantic || element.reviewBlock?.editable === false) return;
  const hasProposalPreview = element.dataset.reviewLocked === "true";
  const caretOffset = canonicalCaretOffset(element, { ignoreProposalAdditions: hasProposalPreview });
  if (hasProposalPreview) {
    element.replaceChildren();
    renderReviewText(element, element.reviewBlock, { showProposals: false });
    element.dataset.reviewLocked = "false";
    element.dataset.reviewPreviewHidden = "true";
  } else {
    prepareEditableMath(element);
  }
  element.contentEditable = "true";
  element.classList.add("is-editing");
  element.focus({ preventScroll: true });
  restoreEditableCaret(element, caretOffset);
}

function deactivateBlockEditing(element) {
  if (!element) return;
  element.contentEditable = "false";
  element.classList.remove("is-editing");
  if (element.dataset.reviewPreviewHidden === "true") {
    element.replaceChildren();
    renderReviewText(element, element.reviewBlock);
    element.dataset.reviewLocked = "true";
    delete element.dataset.reviewPreviewHidden;
    requestAnimationFrame(renderMath);
  }
}

function handleBlockPointerUp(event) {
  // A click inside an editable proposal unit edits that unit; it must not flip
  // the host paragraph into source editing, which removes the proposal preview.
  if (event.button !== 0 || event.target.closest("[data-citation-keys], [data-reference-key], [data-review-request-id], button, .proposal-review-block")) return;
  const element = event.currentTarget;
  requestAnimationFrame(() => {
    const selection = window.getSelection();
    if (!selection || !selection.isCollapsed) return;
    activateBlockEditing(element);
  });
}

function handleBlockInput(event) {
  if (event.target.closest?.(".proposal-add")) return;
  const element = event.currentTarget;
  if (state.editing && state.editing.element !== element) flushSave();
  element.classList.remove("status-draft", "status-accepted");
  element.classList.add("status-human");
  if (!state.editing || state.editing.element !== element) {
    state.editing = {
      element,
      blockIndex: Number(element.dataset.blockIndex),
      blockId: element.dataset.blockId,
      block: element.reviewBlock,
    };
  }
  setSaveState("Saving…", true);
  clearTimeout(state.saveTimer);
  state.saveTimer = setTimeout(flushSave, 850);
}

// Callers use "did everything reach disk?" to decide whether it is safe to
// swap the document. While a save is in flight they must wait for it rather
// than be told "nothing to save", or the late response would overwrite
// state.document with the file the user has just left.
async function flushSave(options = {}) {
  clearTimeout(state.saveTimer);
  if (state.savePromise) {
    const saved = await state.savePromise;
    if (!saved) return false;
    if (!state.editing) return true;
    return flushSave(options);
  }
  if (!state.editing) return false;
  const pending = performSave(options).finally(() => {
    if (state.savePromise === pending) state.savePromise = null;
  });
  state.savePromise = pending;
  return pending;
}

// True when it is safe to replace the open document: nothing is being typed
// and no save is still on its way to the server.
async function settlePendingEdits() {
  if (!state.editing && !state.savePromise) return true;
  const saved = await flushSave();
  return saved || !state.editing;
}

async function performSave({ force = false } = {}) {
  const editing = state.editing;
  const documentAtStart = state.document;
  const pathAtStart = state.document.path;
  state.editing = null;
  state.saving = true;
  let failed = false;
  setSaveState("Saving…", true);
  try {
    const oldDisplay = editing.block.display;
    const nextDisplay = unwrapPastedHeadingCommand(
      canonicalEditableText(editing.element),
      editing.block,
    );
    let prefix = 0;
    while (prefix < oldDisplay.length && prefix < nextDisplay.length && oldDisplay[prefix] === nextDisplay[prefix]) prefix += 1;
    let suffix = 0;
    while (
      suffix < oldDisplay.length - prefix &&
      suffix < nextDisplay.length - prefix &&
      oldDisplay[oldDisplay.length - 1 - suffix] === nextDisplay[nextDisplay.length - 1 - suffix]
    ) suffix += 1;
    const oldEnd = oldDisplay.length - suffix;
    const rawStart = prefix < oldDisplay.length
      ? editing.block.displayStarts[prefix]
      : (editing.block.displayEnds.at(-1) ?? editing.block.raw.length);
    const rawEnd = oldEnd > prefix ? editing.block.displayEnds[oldEnd - 1] : rawStart;
    const replacement = nextDisplay.slice(prefix, nextDisplay.length - suffix);
    const nextRaw = `${editing.block.raw.slice(0, rawStart)}${replacement}${editing.block.raw.slice(rawEnd)}`;
    const nextDocument = await api("/api/save", {
      method: "POST",
      body: JSON.stringify({
        path: pathAtStart,
        etag: state.document.etag,
        blockIndex: editing.blockIndex,
        blockId: editing.blockId,
        blockKind: editing.block.kind,
        baseText: editing.block.raw,
        text: nextRaw,
        force,
      }),
    });
    if (state.document !== documentAtStart) {
      // The edit is on disk, but the open document was replaced meanwhile
      // (another file, or a forced reload). Never paint this response over it.
      refreshGit();
      if (state.document?.path === pathAtStart && !state.editing) {
        loadDocument(pathAtStart, { quiet: true }).catch(() => {});
      }
      return true;
    }
    const sameShape = nextDocument.blocks.length === state.document.blocks.length;
    const reviewPreviewWasHidden = editing.element.dataset.reviewPreviewHidden === "true";
    state.document = nextDocument;
    await refreshCompiledOutline({ render: false });
    if (reviewPreviewWasHidden) {
      await refreshRequests();
    } else if (sameShape && editing.element.matches(":focus")) {
      for (const element of dom.editor.querySelectorAll(".editor-block")) {
        const block = nextDocument.blocks[Number(element.dataset.blockIndex)];
        if (block) {
          element.dataset.blockId = block.id;
          element.reviewBlock = block;
        }
      }
      updateDocumentHeader();
      updateProgress();
    } else {
      renderDocument();
    }
    state.saveConflict = false;
    state.externalChange = false;
    dom.externalChange.hidden = true;
    dom.externalKeep.hidden = true;
    setSaveState("Saved", false);
    if (nextDocument.merge?.applied) showToast("Merged your edit with the newer disk version.", 4200);
    refreshGit();
    return true;
  } catch (error) {
    failed = true;
    if (!state.editing) state.editing = editing;
    const conflict = /\b(?:file|paragraph|source) changed\b/i.test(error.message);
    state.saveConflict = conflict;
    if (conflict) {
      state.externalChange = true;
      dom.externalChangeMessage.textContent = "The source changed while you were editing. Your text is still preserved here.";
      dom.externalKeep.hidden = false;
      dom.externalChange.hidden = false;
      setSaveState("Resolve save", false);
    } else {
      setSaveState("Retry save", false);
    }
    showToast(error.message, 5000);
    return false;
  } finally {
    state.saving = false;
    if (state.editing && !failed) {
      clearTimeout(state.saveTimer);
      state.saveTimer = setTimeout(flushSave, 850);
    }
    if (!state.editing) setTimeout(flushPendingRender, 0);
  }
}

function selectionContext() {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return null;
  const range = selection.getRangeAt(0);
  const startElement = range.startContainer.nodeType === Node.ELEMENT_NODE ? range.startContainer : range.startContainer.parentElement;
  const endElement = range.endContainer.nodeType === Node.ELEMENT_NODE ? range.endContainer : range.endContainer.parentElement;
  const startProposalUnit = startElement?.closest?.(".proposal-review-block[data-proposal-unit-id]");
  const endProposalUnit = endElement?.closest?.(".proposal-review-block[data-proposal-unit-id]");
  if (startProposalUnit || endProposalUnit) {
    if (!startProposalUnit || startProposalUnit !== endProposalUnit) return null;
    const quote = range.toString();
    if (!quote.trim()) return null;
    const editorBlock = startProposalUnit.closest(".editor-block");
    const blockIndex = Number(editorBlock?.dataset.blockIndex);
    if (!Number.isInteger(blockIndex)) return null;
    return {
      proposalSelection: true,
      proposalRequestId: startProposalUnit.dataset.proposalRequestId,
      proposalUnitId: startProposalUnit.dataset.proposalUnitId,
      blockIndex,
      blockId: editorBlock.dataset.blockId,
      endBlockIndex: blockIndex,
      endBlockId: editorBlock.dataset.blockId,
      path: state.document?.path,
      selectedText: quote,
      quote,
      isAccepted: false,
      rect: selectionActionRect(range),
    };
  }
  const startCaption = startElement?.closest?.(".structure-caption-text");
  const endCaption = endElement?.closest?.(".structure-caption-text");
  if (startCaption || endCaption) {
    if (!startCaption || startCaption !== endCaption) return null;
    const hostBlock = startCaption.closest(".editor-block");
    const hostBlockIndex = Number(hostBlock?.dataset.blockIndex);
    const source = startCaption.captionSource
      || (Number.isInteger(hostBlockIndex) ? state.document?.blocks?.[hostBlockIndex]?.semantic?.captionSource : null);
    if (!source) return null;
    const display = String(source.display || startCaption.textContent || "");
    if (!display || !source.displayStarts?.length || !source.displayEnds?.length) return null;
    const beforeStart = range.cloneRange();
    beforeStart.selectNodeContents(startCaption);
    beforeStart.setEnd(range.startContainer, range.startOffset);
    const displayStart = beforeStart.toString().length;
    const beforeEnd = range.cloneRange();
    beforeEnd.selectNodeContents(startCaption);
    beforeEnd.setEnd(range.endContainer, range.endOffset);
    const displayEnd = beforeEnd.toString().length;
    const quote = range.toString();
    if (!quote.trim() || displayStart >= display.length || displayEnd <= displayStart) return null;
    const firstDisplayIndex = Math.min(displayStart, source.displayStarts.length - 1);
    const lastDisplayIndex = Math.min(displayEnd, source.displayEnds.length) - 1;
    if (lastDisplayIndex < firstDisplayIndex) return null;
    const captionRawStart = source.displayStarts[firstDisplayIndex];
    const captionRawEnd = source.displayEnds[lastDisplayIndex];
    const start = source.start + captionRawStart;
    const end = source.start + captionRawEnd;
    return {
      captionSelection: true,
      path: source.path,
      etag: source.etag,
      blockIndex: source.blockIndex,
      blockId: source.blockId,
      start,
      end,
      endBlockIndex: source.blockIndex,
      endBlockId: source.blockId,
      absoluteStart: source.absoluteStart + captionRawStart,
      absoluteEnd: source.absoluteStart + captionRawEnd,
      segments: [{ blockIndex: source.blockIndex, blockId: source.blockId, start, end }],
      selectedText: String(source.raw || "").slice(captionRawStart, captionRawEnd),
      quote,
      prefix: String(source.raw || "").slice(Math.max(0, captionRawStart - 120), captionRawStart),
      suffix: String(source.raw || "").slice(captionRawEnd, Math.min(String(source.raw || "").length, captionRawEnd + 120)),
      hasReviewLock: true,
      isAccepted: false,
      origin: Number.isInteger(hostBlockIndex) ? {
        type: "caption-selection",
        hostPath: state.document?.path,
        hostBlockIndex,
        hostBlockId: hostBlock?.dataset.blockId || null,
      } : null,
      rect: selectionActionRect(range),
    };
  }
  const startBlock = startElement?.closest?.(".editor-block");
  const endBlock = endElement?.closest?.(".editor-block");
  if (!startBlock || !endBlock) return null;
  let startBlockIndex = Number(startBlock.dataset.blockIndex);
  let endBlockIndex = Number(endBlock.dataset.blockIndex);
  if (!Number.isInteger(startBlockIndex) || !Number.isInteger(endBlockIndex) || startBlockIndex > endBlockIndex) return null;
  const selectedElements = [...dom.editor.querySelectorAll(".editor-block")].filter((element) => {
    const index = Number(element.dataset.blockIndex);
    return index >= startBlockIndex && index <= endBlockIndex;
  });
  if (!selectedElements.length) return null;
  const hasReviewLock = selectedElements.some((element) => element.dataset.reviewLocked === "true");
  let selectedBlocks = state.document?.blocks?.slice(startBlockIndex, endBlockIndex + 1) || [];
  if (!selectedBlocks.length) return null;

  let displayStart = canonicalOffsetAt(startBlock, range.startContainer, range.startOffset, "start");
  let displayEnd = canonicalOffsetAt(endBlock, range.endContainer, range.endOffset, "end");
  let quote = range.toString();
  if (!quote.trim()) return null;
  let firstBlock = state.document.blocks[startBlockIndex];
  let lastBlock = state.document.blocks[endBlockIndex];
  if (!firstBlock || !lastBlock) return null;
  // Semantic blocks such as tables and figures have their own review controls,
  // so their rendered chrome is not a reliable source-position endpoint.
  // They may still sit between two selected prose blocks in a section-wide
  // comment, in which case their complete source is preserved in the range.
  //
  // A cross-block drag very often starts or ends on one of those blocks, or
  // lands exactly on a block boundary. Dropping the whole selection there is
  // invisible to the author and reads as the comment button randomly failing,
  // so pull the endpoints inward to the nearest prose block instead.
  const isProseEndpoint = (block) => Boolean(block && !block.semantic && !block.hidden && block.display?.length);
  while (startBlockIndex < endBlockIndex && (!isProseEndpoint(firstBlock) || displayStart >= firstBlock.display.length)) {
    startBlockIndex += 1;
    firstBlock = state.document.blocks[startBlockIndex];
    displayStart = 0;
  }
  while (endBlockIndex > startBlockIndex && (!isProseEndpoint(lastBlock) || displayEnd <= 0)) {
    endBlockIndex -= 1;
    lastBlock = state.document.blocks[endBlockIndex];
    displayEnd = lastBlock?.display?.length || 0;
  }
  if (!isProseEndpoint(firstBlock) || !isProseEndpoint(lastBlock)) return null;
  if (displayStart >= firstBlock.display.length || displayEnd <= 0) return null;
  selectedBlocks = state.document.blocks.slice(startBlockIndex, endBlockIndex + 1);
  const spansMultipleBlocks = startBlockIndex !== endBlockIndex;
  const structuralKinds = new Set(["heading", "paragraph-heading"]);
  let start = firstBlock.displayStarts[Math.min(displayStart, firstBlock.display.length - 1)];
  let end = lastBlock.displayEnds[Math.min(displayEnd, lastBlock.display.length) - 1];
  // A cross-block selection must never cut through a LaTeX heading command.
  // Snap a touched endpoint to the complete heading so the rewrite worker
  // receives valid contiguous source such as \paragraph{...}, not "amily...}".
  if (spansMultipleBlocks && structuralKinds.has(firstBlock.kind) && start > 0) {
    quote = `${firstBlock.display.slice(0, displayStart)}${quote}`;
    start = 0;
  }
  if (spansMultipleBlocks && structuralKinds.has(lastBlock.kind) && end < lastBlock.raw.length) {
    quote = `${quote}${lastBlock.display.slice(displayEnd)}`;
    end = lastBlock.raw.length;
  }
  const absoluteStart = firstBlock.start + start;
  const absoluteEnd = lastBlock.start + end;
  const segments = selectedBlocks
    .filter((block) => !block.hidden && block.display?.length)
    .map((block) => ({
      blockIndex: block.index,
      blockId: block.id,
      start: block.index === startBlockIndex ? start : 0,
      end: block.index === endBlockIndex ? end : block.raw.length,
    }))
    .filter((segment) => segment.end > segment.start);
  if (!segments.length || absoluteEnd <= absoluteStart) return null;
  return {
    blockIndex: startBlockIndex,
    blockId: startBlock.dataset.blockId,
    start,
    end,
    endBlockIndex,
    endBlockId: endBlock.dataset.blockId,
    absoluteStart,
    absoluteEnd,
    segments,
    selectedText: state.document.source?.slice(absoluteStart, absoluteEnd) || quote,
    quote,
    hasReviewLock,
    isAccepted: segments.every((segment) => {
      const block = state.document.blocks[segment.blockIndex];
      return block && isRangeAccepted(block, segment.start, segment.end);
    }),
    rect: selectionActionRect(range),
  };
}

function selectionActionRect(range) {
  const rects = [...range.getClientRects()].filter((rect) => rect.width > 0 || rect.height > 0);
  const visible = rects.filter((rect) => rect.bottom >= 48 && rect.top <= window.innerHeight - 8);
  const rect = visible.at(-1) || rects.at(-1) || range.getBoundingClientRect();
  const first = visible[0] || rects[0] || rect;
  return {
    left: rect.left,
    right: rect.right,
    top: rect.top,
    bottom: rect.bottom,
    width: rect.width,
    height: rect.height,
    // More than one line: a toolbar above the last line would sit on top of
    // the selected text, so it goes underneath instead.
    multiline: rect.top - first.top > Math.max(4, first.height / 2),
  };
}

function showSelectionToolbar() {
  const context = selectionContext();
  if (!context || state.editing) {
    dom.selectionToolbar.hidden = true;
    return;
  }
  state.selection = context;
  dom.confirmSelection.hidden = Boolean(context.proposalSelection || context.captionSelection || context.hasReviewLock);
  dom.confirmSelection.innerHTML = context.isAccepted
    ? '<span aria-hidden="true">↶</span> Unconfirm'
    : '<span aria-hidden="true">✓</span> Confirm';
  dom.confirmSelection.classList.toggle("is-unconfirm", context.isAccepted);
  dom.commentSelection.innerHTML = context.proposalSelection
    ? '<span aria-hidden="true">＋</span> Comment on proposal'
    : '<span aria-hidden="true">＋</span> Comment';
  const toolbarHalfWidth = context.proposalSelection || context.hasReviewLock ? 72 : 118;
  const center = context.rect.left + context.rect.width / 2;
  dom.selectionToolbar.style.left = `${Math.min(window.innerWidth - toolbarHalfWidth, Math.max(toolbarHalfWidth, center))}px`;
  const roomBelow = window.innerHeight - context.rect.bottom > 56;
  const below = Boolean(context.rect.multiline && roomBelow);
  dom.selectionToolbar.classList.toggle("is-below", below);
  dom.selectionToolbar.style.top = below
    ? `${Math.max(48, context.rect.bottom)}px`
    : `${Math.min(window.innerHeight - 10, Math.max(86, context.rect.top))}px`;
  dom.selectionToolbar.hidden = false;
}

async function confirmCurrentSelection() {
  const selection = state.selection;
  if (!selection) return;
  dom.selectionToolbar.hidden = true;
  try {
    if (selection.isAccepted) {
      const result = await api("/api/unconfirm", {
        method: "POST",
        body: JSON.stringify({
          path: state.document.path,
          etag: state.document.etag,
          blockIndex: selection.blockIndex,
          blockId: selection.blockId,
          start: selection.start,
          end: selection.end,
          segments: selection.segments,
        }),
      });
      for (const [blockIndex, ranges] of Object.entries(result.acceptedRangesByBlock || {})) {
        if (state.document.blocks[Number(blockIndex)]) state.document.blocks[Number(blockIndex)].acceptedRanges = ranges;
      }
      await refreshCompiledOutline({ render: false });
      renderDocument();
      showToast("Confirmation removed; the selected text is gray again.");
      return;
    }
    const accepted = await api("/api/confirm", {
      method: "POST",
      body: JSON.stringify({
        path: state.document.path,
        etag: state.document.etag,
        blockIndex: selection.blockIndex,
        blockId: selection.blockId,
        start: selection.start,
        end: selection.end,
        segments: selection.segments,
      }),
    });
    for (const [blockIndex, ranges] of Object.entries(accepted.acceptedRangesByBlock || {})) {
      if (state.document.blocks[Number(blockIndex)]) state.document.blocks[Number(blockIndex)].acceptedRanges = ranges;
    }
    await refreshCompiledOutline({ render: false });
    renderDocument();
    showToast("Confirmed text is now black.");
  } catch (error) {
    showToast(error.message, 4200);
  }
}

function openCommentComposer() {
  if (!state.selection) return;
  if (!dom.codexChat.hidden) closeCodexChat();
  dom.selectionToolbar.hidden = true;
  state.commentDraft = { ...state.selection, path: state.selection.path || state.document.path };
  dom.commentComposerStatus.textContent = state.selection.proposalSelection ? "Comment on proposal" : "New comment";
  dom.selectedQuote.textContent = state.selection.quote;
  dom.commentInput.value = "";
  const isMultiBlock = state.selection.endBlockIndex !== state.selection.blockIndex;
  dom.rewriteScope.value = "selection";
  dom.rewriteScope.disabled = isMultiBlock || Boolean(state.selection.proposalSelection || state.selection.captionSelection);
  dom.rewriteScope.title = state.selection.proposalSelection
    ? "This comment revises only the selected proposal unit."
    : state.selection.captionSelection
      ? "Figure and table caption comments revise only the exact selected caption text."
    : isMultiBlock
      ? "Cross-paragraph selections use the exact selected range."
      : "";
  dom.commentComposerOptions.hidden = Boolean(state.selection.proposalSelection);
  dom.commentComposerOptions.open = false;
  dom.submitComment.textContent = state.selection.proposalSelection ? "Continue chat" : "Comment";
  dom.commentComposer.hidden = false;
  updateScopeHint();
  renderDocument();
  requestAnimationFrame(positionCommentCards);
  setTimeout(() => dom.commentInput.focus(), 0);
}

function closeCommentComposer() {
  dom.commentComposer.hidden = true;
  if (dom.scopeHint) dom.scopeHint.hidden = true;
  state.commentDraft = null;
  dom.commentComposerStatus.textContent = "New comment";
  dom.commentComposerOptions.hidden = false;
  dom.submitComment.textContent = "Comment";
  dom.rewriteScope.disabled = false;
  dom.rewriteScope.title = "";
  if (state.document && !state.editing) renderDocument();
}

// A one-sentence selection leaves nothing to restructure, so a comment about
// how the passage reads comes back as a word swap. Say so before it happens.
const SHORT_SELECTION_CHARS = 200;

function updateScopeHint() {
  if (!dom.scopeHint) return;
  const selected = state.selection?.selectedText || "";
  const short = selected.length > 0 && selected.length < SHORT_SELECTION_CHARS;
  const bySelection = dom.rewriteScope?.value !== "paragraph";
  if (!short || !bySelection) {
    dom.scopeHint.hidden = true;
    return;
  }
  dom.scopeHint.hidden = false;
  dom.scopeHint.textContent = `${selected.length} characters selected. A comment about how this reads has little room here \u2014 switch Change to “Whole paragraph” under Options for a real rewrite.`;
}

// Whole-file review: a list of findings the author triages. Taking one
// creates an ordinary comment at that passage; nothing is rewritten here.
async function runSectionReview() {
  if (!state.document?.path) return;
  const reviewedPath = state.document.path;
  dom.reviewSection.disabled = true;
  dom.reviewSection.textContent = "Reviewing…";
  try {
    const review = await api("/api/document/review", {
      method: "POST",
      body: JSON.stringify({ path: reviewedPath }),
    });
    if (state.document?.path !== reviewedPath) {
      showToast(`The review of ${sourceRelativePath(reviewedPath)} finished, but another file is open now. Run it again from that file.`, 5200);
      return;
    }
    renderSectionReview(review);
  } catch (error) {
    showToast(error.message, 6000);
  } finally {
    dom.reviewSection.disabled = false;
    dom.reviewSection.textContent = "Review file";
  }
}

function renderSectionReview(review) {
  review = review && typeof review === "object" ? review : {};
  const findings = (Array.isArray(review.findings) ? review.findings : [])
    .filter((finding) => finding && typeof finding === "object");
  state.review = review;
  if (!dom.codexChat.hidden) closeCodexChat();
  dom.reviewPanel.hidden = false;
  dom.reviewPanel.scrollTop = 0;
  dom.reviewSummary.textContent = review.summary || "";
  if (!findings.length) {
    dom.reviewFindings.replaceChildren(Object.assign(document.createElement("p"), {
      className: "review-summary",
      textContent: "No findings. The reviewer had nothing to raise on this file.",
    }));
    return;
  }
  dom.reviewFindings.replaceChildren(...findings.map((finding) => {
    const selectedText = String(finding.selectedText ?? "");
    const levelName = String(finding.level ?? "note");
    const card = document.createElement("article");
    card.className = "review-finding";

    const head = document.createElement("div");
    head.className = "review-finding-head";
    const level = document.createElement("span");
    level.className = `review-level level-${levelName.replace(/[^a-z0-9-]/gi, "")}`;
    level.textContent = levelName;
    const principle = document.createElement("span");
    principle.className = "review-principle";
    principle.textContent = String(finding.principle ?? "");
    head.append(level, principle);

    const quote = document.createElement("blockquote");
    quote.className = "review-quote";
    quote.textContent = selectedText.length > 160 ? `${selectedText.slice(0, 160)}…` : selectedText;

    const issue = document.createElement("p");
    issue.className = "review-issue";
    issue.textContent = String(finding.issue ?? "");
    const suggestion = document.createElement("p");
    suggestion.className = "review-suggestion";
    suggestion.textContent = String(finding.suggestion ?? "");

    const actions = document.createElement("div");
    actions.className = "review-finding-actions";
    const dismiss = document.createElement("button");
    dismiss.type = "button";
    dismiss.className = "text-button";
    dismiss.textContent = "Dismiss";
    dismiss.addEventListener("click", () => card.remove());
    const take = document.createElement("button");
    take.type = "button";
    take.className = "button button-dark button-small";
    take.textContent = "Take as comment";
    take.addEventListener("click", async () => {
      take.disabled = true;
      try {
        await api("/api/document/review/accept", {
          method: "POST",
          body: JSON.stringify({
            path: review.path || state.document?.path,
            selectedText,
            comment: finding.suggestion,
            level: finding.level,
            principle: finding.principle,
          }),
        });
        await refreshRequests();
        card.classList.add("is-taken");
        take.textContent = "Added";
      } catch (error) {
        showToast(error.message, 5200);
        take.disabled = false;
      }
    });
    actions.append(dismiss, take);

    card.append(head, quote, issue, suggestion, actions);
    return card;
  }));
  for (const warning of review.warnings || []) console.warn("[review]", warning);
}

function commentQuestionForChat(draft, question) {
  const selectedPassage = draft.selectedText || draft.quote;
  const location = draft.captionSelection
    ? "Figure or table caption"
    : draft.proposalSelection
    ? `Proposed unit ${draft.proposalUnitId}`
    : draft.endBlockIndex !== draft.blockIndex
    ? `P${draft.blockIndex + 1}–P${draft.endBlockIndex + 1}`
    : `P${draft.blockIndex + 1}`;
  return [
    "I want to discuss this passage rather than request an inline edit.",
    "",
    `Source: ${draft.path}`,
    `Location: ${location}`,
    "",
    "<selected_passage>",
    String(selectedPassage || draft.quote || "").trim(),
    "</selected_passage>",
    "",
    "My question:",
    question,
    "",
    "Please answer the question using the paper and project context. Do not edit the manuscript unless I later ask for a reviewable proposal.",
  ].join("\n");
}

function commentSelectionForChat(draft) {
  if (draft.proposalSelection) return null;
  if (draft.captionSelection) {
    return {
      path: draft.path,
      etag: draft.etag,
      blockId: draft.blockId,
      blockIndex: draft.blockIndex,
      start: draft.start,
      end: draft.end,
      endBlockId: draft.endBlockId,
      endBlockIndex: draft.endBlockIndex,
      absoluteStart: draft.absoluteStart,
      absoluteEnd: draft.absoluteEnd,
      segments: draft.segments,
      selectedText: draft.selectedText,
      prefix: draft.prefix,
      suffix: draft.suffix,
    };
  }
  const block = state.document?.blocks?.[draft.blockIndex];
  const endBlock = state.document?.blocks?.[draft.endBlockIndex];
  if (!block || block.id !== draft.blockId || !endBlock || endBlock.id !== draft.endBlockId) return null;
  return {
    path: draft.path,
    etag: state.document.etag,
    blockId: block.id,
    blockIndex: block.index,
    start: draft.start,
    end: draft.end,
    endBlockId: endBlock.id,
    endBlockIndex: endBlock.index,
    absoluteStart: draft.absoluteStart,
    absoluteEnd: draft.absoluteEnd,
    segments: draft.segments,
    selectedText: draft.selectedText,
    prefix: state.document.source.slice(Math.max(0, draft.absoluteStart - 120), draft.absoluteStart),
    suffix: state.document.source.slice(draft.absoluteEnd, Math.min(state.document.source.length, draft.absoluteEnd + 120)),
  };
}

async function askCommentQuestionInChat() {
  const draft = state.commentDraft;
  const question = dom.commentInput.value.trim();
  if (!draft || !question) {
    showToast("Write a question first.");
    return;
  }
  dom.askCommentInChat.disabled = true;
  dom.submitComment.disabled = true;
  try {
    state.chat = await api("/api/chat/message", {
      method: "POST",
      body: JSON.stringify({
        message: commentQuestionForChat(draft, question),
        activePath: draft.path,
        selectionContext: commentSelectionForChat(draft),
        sessionId: state.chat?.id || null,
        newSessionIfBusy: true,
        newSessionForNewSelection: true,
      }),
    });
    closeCommentComposer();
    await openCodexChat();
    showToast("Selection and question sent to Project Chat.", 3600);
  } catch (error) {
    showToast(error.message, 5000);
  } finally {
    dom.askCommentInChat.disabled = false;
    dom.submitComment.disabled = false;
  }
}

async function submitComment({ responseMode = "rewrite" } = {}) {
  const selection = state.selection;
  const comment = dom.commentInput.value.trim();
  if (!selection || !comment) {
    showToast("Write a rewrite instruction first.");
    return;
  }
  dom.submitComment.disabled = true;
  dom.findLinked.disabled = true;
  try {
    if (selection.proposalSelection) {
      const request = state.requests.find((item) => item.id === selection.proposalRequestId);
      const unit = request?.proposal?.reviewUnits?.find((item) => item.id === selection.proposalUnitId);
      if (!request || !unit) throw new Error("This proposal unit changed. Refresh and select it again.");
      const message = [
        `Revise only this ${proposalUnitLabel(unit, unit.index).toLowerCase()} in the current structure proposal.`,
        "Keep every other proposal unit byte-for-byte unchanged and return the complete coherent replacement.",
        `<proposal_unit>${unit.display}</proposal_unit>`,
        `<selected_text>${selection.selectedText}</selected_text>`,
        `User feedback: ${comment}`,
      ].join("\n\n");
      await api("/api/request/followup", {
        method: "POST",
        body: JSON.stringify({ id: request.id, unitId: unit.id, message }),
      });
      closeCommentComposer();
      await refreshRequests();
      showToast(`Comment sent. ${providerDisplayNameStart()} will revise only this proposal unit; other confirmations are preserved.`, 4600);
      return;
    }
    const request = await api("/api/rewrite", {
      method: "POST",
      body: JSON.stringify({
        path: selection.path || state.document.path,
        etag: selection.etag || state.document.etag,
        blockIndex: selection.blockIndex,
        blockId: selection.blockId,
        start: selection.start,
        end: selection.end,
        endBlockId: selection.endBlockId,
        endBlockIndex: selection.endBlockIndex,
        absoluteStart: selection.absoluteStart,
        absoluteEnd: selection.absoluteEnd,
        segments: selection.segments,
        selectedText: selection.selectedText,
        comment,
        rewriteScope: dom.rewriteScope.value,
        contextMode: dom.contextMode.value,
        responseMode,
        origin: selection.origin || null,
        autoProcess: true,
      }),
    });
    closeCommentComposer();
    await refreshRequests();
    showToast(
      responseMode === "link"
        ? "Looking for the other locations this comment reaches. Each one will get its own linked comment; nothing is rewritten."
        : `Comment sent to ${providerDisplayName()}. A red/green proposal will appear here.`,
      responseMode === "link" ? 5200 : 4200,
    );
  } catch (error) {
    showToast(error.message, 5000);
  } finally {
    dom.submitComment.disabled = false;
    dom.findLinked.disabled = false;
  }
}

// Open the file a linked comment lives in, then focus it. focusReviewLink only
// searches the loaded document, so the load has to finish first.
async function focusLinkedComment(path, requestId) {
  try {
    if (state.document?.path !== path) await loadDocument(path);
    focusReviewLink(requestId, { scrollCard: true, scrollText: true });
  } catch (error) {
    showToast(error.message, 5000);
  }
}

function appendLinkedComments(container, request) {
  const ids = Array.isArray(request.links) ? request.links : [];
  if (!ids.length && !request.linkSearch) return;
  const section = document.createElement("section");
  section.className = "request-links";
  if (request.linkSearch?.summary) {
    const summary = document.createElement("p");
    summary.className = "request-links-summary";
    summary.textContent = request.linkSearch.summary;
    section.append(summary);
  }
  for (const id of ids) {
    const linked = state.requests.find((item) => item.id === id);
    if (!linked) continue;
    const row = document.createElement("button");
    row.type = "button";
    row.className = `request-link-row request-link-${linked.status}`;
    const where = document.createElement("span");
    where.className = "request-link-where";
    where.textContent = linked.path.split("/").slice(-1)[0];
    const what = document.createElement("span");
    what.className = "request-link-what";
    what.textContent = linked.comment;
    const status = document.createElement("span");
    status.className = "request-link-status";
    status.textContent = linked.status;
    row.append(where, what, status);
    row.title = linked.origin?.reason || linked.comment;
    row.addEventListener("click", () => focusLinkedComment(linked.path, linked.id));
    section.append(row);
  }
  for (const warning of request.linkSearch?.warnings || []) {
    const note = document.createElement("p");
    note.className = "request-links-warning";
    note.textContent = warning;
    section.append(note);
  }
  container.append(section);
}

function createRequestCard(request, { compact = false } = {}) {
  const card = document.createElement("article");
  card.className = `request-card request-${request.status}${compact ? " request-compact" : ""}`;
  if (Number(request.endBlockIndex) !== Number(request.blockIndex)) card.classList.add("request-multiblock");
  card.dataset.requestId = request.id;
  const displayAnchor = linkedChangeForCurrentDocument(request);
  const captionOrigin = displayAnchor?.id === "caption-origin" ? displayAnchor : null;
  const resolvedBlockIndex = captionOrigin
    ? Number(captionOrigin.blockIndex)
    : request.path === state.document?.path ? resolvedRequestBlockIndex(request) : request.blockIndex;
  const anchorMissing = captionOrigin
    ? !Number.isInteger(resolvedBlockIndex)
    : request.path === state.document?.path && resolvedBlockIndex === null;
  if (anchorMissing) card.classList.add("anchor-missing");
  else card.dataset.blockIndex = String(resolvedBlockIndex);
  const meta = document.createElement("div");
  meta.className = "request-meta";
  const title = document.createElement("strong");
  title.textContent = String(request.comment ?? "");
  const detail = document.createElement("p");
  const quoted = String(request.selectedText ?? "");
  const quoteLimit = compact ? 46 : 72;
  detail.textContent = `“${quoted.slice(0, quoteLimit)}${quoted.length > quoteLimit ? "…" : ""}”`;
  const status = document.createElement("span");
  status.className = "request-status";
  if (request.agentStatus) status.classList.add(`agent-${request.agentStatus}`);
  status.textContent = anchorMissing
    ? "Anchor changed"
    : request.status === "proposed"
      ? "Awaiting approval"
      : request.status === "discussed"
        ? "Discuss before editing"
      : request.agentStatus === "running"
        ? request.responseMode === "discuss"
          ? `${providerDisplayNameStart(request.provider)} is thinking…`
          : `${providerDisplayNameStart(request.provider)} is drafting…`
        : request.agentStatus === "validating"
          ? "Validating proposal…"
        : request.agentStatus === "queued"
          ? `Queued for ${providerDisplayName(request.provider)}`
          : request.agentStatus === "failed"
            ? `${providerDisplayNameStart(request.provider)} needs attention`
            : request.rejectedAt
              ? "Ready to retry"
              : `Waiting for ${providerDisplayName(request.provider)}`;
  if (request.agentError) status.title = request.agentError;
  // The explicit, keyboard-reachable way to the passage. The card itself is a
  // plain article: it holds buttons and a text field, so it cannot be a button.
  const location = document.createElement(anchorMissing ? "span" : "button");
  location.className = "request-location";
  if (!anchorMissing) {
    location.type = "button";
    location.classList.add("request-goto");
  }
  const resolvedEndBlockIndex = captionOrigin
    ? resolvedBlockIndex
    : request.path === state.document?.path ? resolvedRequestEndBlockIndex(request) : (request.endBlockIndex ?? request.blockIndex);
  const paragraphLabel = Number(resolvedEndBlockIndex) !== Number(resolvedBlockIndex)
    ? `P${Number(resolvedBlockIndex) + 1}–P${Number(resolvedEndBlockIndex) + 1}`
    : `P${Number(resolvedBlockIndex) + 1}`;
  location.textContent = anchorMissing
    ? "Reselect passage"
    : captionOrigin ? `${labelForPath(request.path)} · Caption`
      // A card beside its own file needs only the paragraph; the file name is
      // already in the Source picker. Cards of other files keep it.
      : !compact && request.path === state.document?.path ? paragraphLabel.replace(/P/g, "Paragraph ").replace(/^Paragraph (\d+)–Paragraph (\d+)$/, "Paragraphs $1–$2")
        : `${labelForPath(request.path)} · ${paragraphLabel}`;
  meta.append(status, location);
  const code = document.createElement("code");
  code.textContent = request.id;
  card.setAttribute("aria-label", `Comment: ${String(request.comment ?? "").slice(0, 120)}`);
  const focusComment = async () => {
    if (captionOrigin && captionOrigin.path === state.document?.path) {
      requestAnimationFrame(() => scrollToBlock(resolvedBlockIndex));
      return;
    }
    if (request.path !== state.document?.path) await loadDocument(request.path);
    const targetIndex = resolvedRequestBlockIndex(request);
    if (targetIndex === null) {
      showToast("The original passage changed. Reselect the intended text and leave a new comment.", 4800);
      return;
    }
    requestAnimationFrame(() => scrollToBlock(targetIndex));
  };
  // Clicking the card's own surface is a pointer shortcut for the same thing;
  // clicks that land on a control or on selected text are left alone.
  card.addEventListener("click", (event) => {
    if (event.target instanceof Element && event.target.closest("button, a, textarea, input, select, summary, [contenteditable='true']")) return;
    if (String(window.getSelection?.() || "").trim()) return;
    focusComment();
  });
  if (!anchorMissing) {
    location.title = "Go to this passage in the manuscript";
    location.setAttribute("aria-label", `Go to passage, ${location.textContent}`);
    location.addEventListener("click", (event) => {
      event.stopPropagation();
      focusComment();
      focusReviewLink(request.id);
    });
  }
  card.append(meta, title, detail);
  if (!compact && request.agentStatus === "failed" && request.agentError) {
    const problem = document.createElement("p");
    problem.className = "request-error";
    problem.textContent = String(request.agentError);
    card.append(problem);
  }
  if (!compact) appendLinkedComments(card, request);
  const makeDeleteButton = () => {
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "icon-button request-delete";
    remove.textContent = "×";
    remove.title = "Delete comment and cancel its agent run";
    remove.setAttribute("aria-label", "Delete comment and cancel its agent run");
    card.classList.add("has-delete");
    remove.addEventListener("click", async (event) => {
      event.stopPropagation();
      remove.disabled = true;
      try {
        await api("/api/request/delete", {
          method: "POST",
          body: JSON.stringify({ id: request.id }),
        });
        await refreshRequests();
        showToast("Comment deleted. Any active agent run was cancelled.", 4200);
      } catch (error) {
        showToast(error.message, 5000);
      } finally {
        remove.disabled = false;
      }
    });
    return remove;
  };
  if (!compact && Array.isArray(request.conversation) && request.conversation.length > 1) {
    const thread = document.createElement("div");
    thread.className = "request-thread";
    const recent = request.conversation.slice(-4);
    // The card title already shows the opening comment; do not print it twice.
    const opening = recent[0];
    if (opening && opening === request.conversation[0] && opening.role !== "assistant"
      && String(opening.content || "").trim() === String(request.comment ?? "").trim()) recent.shift();
    for (const message of recent) {
      const label = message.role === "assistant"
        ? providerDisplayNameStart(message.provider || request.provider)
        : "You";
      const content = message.role === "assistant"
        ? (message.answer || message.summary || message.replacementText || message.content || "Responded to the comment.")
        : message.content;
      const value = String(content || "").trim();
      if (value.length > 420) {
        const details = document.createElement("details");
        details.className = `thread-message thread-${message.role}`;
        const summary = document.createElement("summary");
        summary.textContent = `${label}: ${value.slice(0, 180).replace(/\s+/g, " ")}…`;
        const full = document.createElement("p");
        full.textContent = value;
        details.append(summary, full);
        thread.append(details);
      } else {
        const row = document.createElement("p");
        row.className = `thread-${message.role}`;
        row.textContent = `${label}: ${value}`;
        thread.append(row);
      }
    }
    card.append(thread);
  }
  if (!compact && request.status === "discussed" && request.discussion) {
    const discussion = document.createElement("section");
    discussion.className = "request-discussion";
    const answer = document.createElement("p");
    answer.className = "discussion-answer";
    answer.textContent = request.discussion.answer;
    const recommendation = document.createElement("p");
    recommendation.innerHTML = "<strong>Recommendation</strong> ";
    recommendation.append(document.createTextNode(request.discussion.recommendation));
    const risk = document.createElement("p");
    risk.innerHTML = "<strong>Claim risk</strong> ";
    risk.append(document.createTextNode(request.discussion.claimRisk));
    const options = document.createElement("ol");
    for (const option of request.discussion.options || []) {
      const item = document.createElement("li");
      const label = document.createElement("strong");
      label.textContent = `${option.label}: `;
      item.append(label, document.createTextNode(option.wording));
      options.append(item);
    }
    discussion.append(answer, recommendation, risk, options);

    const actions = document.createElement("div");
    actions.className = "request-actions";
    const regenerate = document.createElement("button");
    regenerate.type = "button";
    regenerate.className = "button button-ghost request-regenerate";
    regenerate.textContent = "↻";
    regenerate.title = `Ask ${providerDisplayName()} to reconsider`;
    regenerate.setAttribute("aria-label", `Ask ${providerDisplayName()} to reconsider the discussion`);
    regenerate.addEventListener("click", async (event) => {
      event.stopPropagation();
      regenerate.disabled = true;
      regenerate.classList.add("is-spinning");
      try {
        await api("/api/request/regenerate", { method: "POST", body: JSON.stringify({ id: request.id }) });
        await refreshRequests();
        showToast(`${providerDisplayNameStart()} is reconsidering the question.`, 3600);
      } catch (error) {
        showToast(error.message, 5000);
      } finally {
        regenerate.disabled = false;
        regenerate.classList.remove("is-spinning");
      }
    });
    const generate = document.createElement("button");
    generate.type = "button";
    generate.className = "button button-dark";
    generate.textContent = "Generate proposal";
    generate.addEventListener("click", async (event) => {
      event.stopPropagation();
      generate.disabled = true;
      try {
        await api("/api/request/generate-proposal", { method: "POST", body: JSON.stringify({ id: request.id }) });
        await refreshRequests();
        showToast(`Direction confirmed. ${providerDisplayNameStart()} is generating a reviewable proposal.`, 4200);
      } catch (error) {
        showToast(error.message, 5000);
      } finally {
        generate.disabled = false;
      }
    });
    card.append(makeDeleteButton());
    actions.append(regenerate, generate);

    const followup = document.createElement("div");
    followup.className = "request-followup";
    const followupInput = document.createElement("textarea");
    followupInput.rows = 2;
    followupInput.placeholder = "Ask a follow-up or choose an option…";
    followupInput.setAttribute("aria-label", `Follow up on ${request.id}`);
    const followupButton = document.createElement("button");
    followupButton.type = "button";
    followupButton.className = "button button-ghost";
    followupButton.textContent = "Follow up";
    for (const element of [followupInput, followupButton]) {
      element.addEventListener("click", (event) => event.stopPropagation());
      element.addEventListener("keydown", (event) => event.stopPropagation());
    }
    followupButton.addEventListener("click", async (event) => {
      event.stopPropagation();
      const message = followupInput.value.trim();
      if (!message) {
        showToast("Write a follow-up question first.");
        return;
      }
      followupButton.disabled = true;
      try {
        await api("/api/request/followup", { method: "POST", body: JSON.stringify({ id: request.id, message }) });
        await refreshRequests();
        showToast(`Follow-up sent. ${providerDisplayNameStart()} will continue the discussion.`, 3600);
      } catch (error) {
        showToast(error.message, 5000);
      } finally {
        followupButton.disabled = false;
      }
    });
    followup.append(followupInput, followupButton);
    card.append(discussion, actions, followup);
  } else if (!compact && request.status === "proposed" && request.proposal) {
    const diff = document.createElement("div");
    diff.className = "request-diff";
    appendTextDiff(diff, request.proposal.originalDisplay, request.proposal.replacementDisplay);

    const actions = document.createElement("div");
    actions.className = "request-actions";
    const reject = document.createElement("button");
    reject.type = "button";
    reject.className = "button button-ghost";
    reject.textContent = "Reject";
    const regenerate = document.createElement("button");
    regenerate.type = "button";
    regenerate.className = "button button-ghost request-regenerate";
    regenerate.textContent = "↻";
    regenerate.title = "Generate another version";
    regenerate.setAttribute("aria-label", `Generate another version with ${providerDisplayName()}`);
    regenerate.addEventListener("click", async (event) => {
      event.stopPropagation();
      regenerate.disabled = true;
      regenerate.classList.add("is-spinning");
      try {
        await api("/api/request/regenerate", {
          method: "POST",
          body: JSON.stringify({ id: request.id }),
        });
        await refreshRequests();
        showToast(`${providerDisplayNameStart()} is generating another version.`, 3600);
      } catch (error) {
        showToast(error.message, 5000);
      } finally {
        regenerate.disabled = false;
        regenerate.classList.remove("is-spinning");
      }
    });
    const accept = document.createElement("button");
    accept.type = "button";
    accept.className = "button button-dark";
    accept.textContent = "Accept";
    if (isReadOnlyPath(request.path)) {
      accept.disabled = true;
      accept.title = "This file is not UTF-8, so Paper Pal will not modify it.";
    }
    for (const [button, endpoint] of [[reject, "/api/request/reject"], [accept, "/api/request/accept"]]) {
      button.addEventListener("click", async (event) => {
        event.stopPropagation();
        button.disabled = true;
        try {
          await api(endpoint, { method: "POST", body: JSON.stringify({ id: request.id }) });
          if (endpoint.endsWith("accept")) await refreshCompiledOutline({ render: false });
          await refreshRequests();
          if (endpoint.endsWith("accept") && request.path === state.document?.path) {
            await loadDocument(request.path, { quiet: true });
          } else if (endpoint.endsWith("accept") && request.origin?.type === "caption-selection" && request.origin.hostPath === state.document?.path) {
            await loadDocument(state.document.path, { quiet: true });
          }
          showToast(endpoint.endsWith("accept") ? "Proposal accepted and saved to LaTeX." : "Comment rejected and removed.", 4200);
        } catch (error) {
          showToast(error.message, 5000);
        } finally {
          button.disabled = false;
        }
      });
    }
    actions.append(regenerate, reject, accept);
    const followup = document.createElement("div");
    followup.className = "request-followup";
    const followupInput = document.createElement("textarea");
    followupInput.rows = 2;
    followupInput.placeholder = `Continue with ${providerDisplayName()}…`;
    followupInput.setAttribute("aria-label", `Follow up on ${request.id}`);
    const followupButton = document.createElement("button");
    followupButton.type = "button";
    followupButton.className = "button button-ghost";
    followupButton.textContent = "Follow up";
    for (const element of [followupInput, followupButton]) {
      element.addEventListener("click", (event) => event.stopPropagation());
      element.addEventListener("keydown", (event) => event.stopPropagation());
    }
    followupButton.addEventListener("click", async (event) => {
      event.stopPropagation();
      const message = followupInput.value.trim();
      if (!message) {
        showToast("Write a follow-up instruction first.");
        return;
      }
      followupButton.disabled = true;
      try {
        await api("/api/request/followup", {
          method: "POST",
          body: JSON.stringify({ id: request.id, message }),
        });
        await refreshRequests();
        showToast(`Follow-up sent. ${providerDisplayNameStart()} is drafting the next proposal.`, 3600);
      } catch (error) {
        showToast(error.message, 5000);
      } finally {
        followupButton.disabled = false;
      }
    });
    followup.append(followupInput, followupButton);
    card.append(diff, actions, followup);
  } else if (!compact && request.status === "pending") {
    const actions = document.createElement("div");
    actions.className = "request-actions";
    card.append(makeDeleteButton());
    if (request.agentStatus != null && !["failed", "complete"].includes(request.agentStatus)) {
      card.append(actions);
      card.append(code);
      return card;
    }
    const process = document.createElement("button");
    process.type = "button";
    process.className = "button button-dark";
    process.textContent = `${request.rejectedAt || ["failed", "complete"].includes(request.agentStatus) ? "Retry" : "Run"} ${providerDisplayName(request.provider)}`;
    process.addEventListener("click", async (event) => {
      event.stopPropagation();
      process.disabled = true;
      try {
        await api("/api/request/process", { method: "POST", body: JSON.stringify({ id: request.id }) });
        await refreshRequests();
        showToast(`Comment queued for ${providerDisplayName()}.`, 3600);
      } catch (error) {
        showToast(error.message, 5000);
      } finally {
        process.disabled = false;
      }
    });
    actions.append(process);
    card.append(actions);
  }
  card.append(code);
  return card;
}

function linkedChangeForCurrentDocument(request) {
  if (request.origin?.type === "caption-selection" && request.origin.hostPath === state.document?.path) {
    return {
      id: "caption-origin",
      path: request.origin.hostPath,
      blockIndex: Number(request.origin.hostBlockIndex),
      blockId: request.origin.hostBlockId || null,
    };
  }
  if (request.path === state.document?.path) {
    return {
      id: "primary",
      path: request.path,
      blockIndex: resolvedRequestBlockIndex(request),
    };
  }
  return (request.proposal?.linkedChanges || []).find((change) => change.path === state.document?.path) || null;
}

async function focusLinkedChange(change) {
  if (change.path !== state.document?.path) await loadDocument(change.path);
  const blockIndex = Number.isInteger(change.resolvedBlockIndex)
    ? change.resolvedBlockIndex
    : Number(change.blockIndex);
  if (!Number.isInteger(blockIndex)) {
    showToast("This linked source anchor changed. Regenerate the change set before applying it.", 4800);
    return;
  }
  requestAnimationFrame(() => scrollToBlock(blockIndex));
}

function createLinkedChangeSetCard(request) {
  const linkedChanges = request.proposal?.linkedChanges || [];
  const primaryStatus = request.proposal?.primaryReviewStatus || "pending";
  const unresolved = linkedChanges.filter((change) => (change.status || "pending") === "pending").length;
  const requiredRejected = linkedChanges.some((change) => change.required && change.status === "rejected");
  const ready = primaryStatus === "confirmed" && unresolved === 0 && !requiredRejected;
  const currentChange = linkedChangeForCurrentDocument(request);
  const card = document.createElement("article");
  card.className = `request-card request-proposed linked-change-set-card${ready ? " group-ready" : ""}`;
  card.dataset.requestId = request.id;
  if (currentChange && Number.isInteger(Number(currentChange.resolvedBlockIndex ?? currentChange.blockIndex))) {
    card.dataset.blockIndex = String(currentChange.resolvedBlockIndex ?? currentChange.blockIndex);
  } else {
    card.classList.add("anchor-missing");
  }

  const meta = document.createElement("div");
  meta.className = "request-meta";
  const status = document.createElement("span");
  status.className = "request-status";
  status.textContent = ready ? "Ready to apply" : "Linked change set";
  const location = document.createElement("span");
  location.className = "request-location";
  const decided = (primaryStatus === "pending" ? 0 : 1)
    + linkedChanges.filter((change) => (change.status || "pending") !== "pending").length;
  location.textContent = `${decided}/${linkedChanges.length + 1} reviewed`;
  meta.append(status, location);

  const title = document.createElement("strong");
  title.textContent = request.proposal.summary || request.comment;
  const intro = document.createElement("p");
  intro.className = "linked-change-intro";
  intro.textContent = `${linkedChanges.length + 1} synchronized manuscript changes. Confirm each item, then apply them atomically.`;
  const list = document.createElement("div");
  list.className = "linked-change-list";

  const changes = [{
    id: "primary",
    path: request.path,
    status: primaryStatus,
    required: true,
    reason: "Primary passage selected by the author.",
    summary: request.proposal.summary,
    originalDisplay: request.proposal.originalDisplay,
    replacementDisplay: request.proposal.replacementDisplay,
    blockIndex: request.blockIndex,
    resolvedBlockIndex: request.resolvedBlockIndex,
  }, ...linkedChanges];

  for (const [index, change] of changes.entries()) {
    const item = document.createElement("section");
    const changeStatus = change.status || "pending";
    item.className = `linked-change-item status-${changeStatus}`;
    const itemHeader = document.createElement("div");
    itemHeader.className = "linked-change-item-header";
    const itemTitle = document.createElement("strong");
    itemTitle.textContent = index === 0 ? "Primary passage" : labelForPath(change.path);
    const badge = document.createElement("span");
    badge.className = `linked-change-badge status-${changeStatus}`;
    badge.textContent = changeStatus === "confirmed"
      ? "Confirmed"
      : changeStatus === "rejected"
        ? "Skipped"
        : change.required
          ? "Required"
          : "Optional";
    itemHeader.append(itemTitle, badge);
    const pathLabel = document.createElement("code");
    pathLabel.textContent = sourceRelativePath(change.path);
    const reason = document.createElement("p");
    reason.textContent = change.reason || change.summary || "";
    const diff = document.createElement("div");
    diff.className = "request-diff linked-change-diff";
    appendTextDiff(
      diff,
      change.originalDisplay || change.selectedText || "",
      change.replacementDisplay || change.replacementText || "",
    );
    const itemActions = document.createElement("div");
    itemActions.className = "linked-change-item-actions";
    const jump = document.createElement("button");
    jump.type = "button";
    jump.className = "text-button";
    jump.textContent = change.path === state.document?.path ? "Show in text" : "Open source";
    jump.addEventListener("click", async (event) => {
      event.stopPropagation();
      await focusLinkedChange(change);
    });
    const confirm = document.createElement("button");
    confirm.type = "button";
    confirm.className = changeStatus === "confirmed" ? "button button-ghost" : "button button-dark";
    confirm.textContent = changeStatus === "confirmed" ? "Unconfirm" : "Confirm";
    confirm.addEventListener("click", async (event) => {
      event.stopPropagation();
      confirm.disabled = true;
      try {
        await api("/api/request/review-linked-change", {
          method: "POST",
          body: JSON.stringify({
            id: request.id,
            changeId: change.id,
            status: changeStatus === "confirmed" ? "pending" : "confirmed",
          }),
        });
        await refreshRequests();
      } catch (error) {
        showToast(error.message, 5000);
      } finally {
        confirm.disabled = false;
      }
    });
    itemActions.append(jump);
    if (!change.required && changeStatus !== "confirmed") {
      const skip = document.createElement("button");
      skip.type = "button";
      skip.className = "button button-ghost";
      skip.textContent = changeStatus === "rejected" ? "Reopen" : "Skip";
      skip.addEventListener("click", async (event) => {
        event.stopPropagation();
        skip.disabled = true;
        try {
          await api("/api/request/review-linked-change", {
            method: "POST",
            body: JSON.stringify({
              id: request.id,
              changeId: change.id,
              status: changeStatus === "rejected" ? "pending" : "rejected",
            }),
          });
          await refreshRequests();
        } catch (error) {
          showToast(error.message, 5000);
        } finally {
          skip.disabled = false;
        }
      });
      itemActions.append(skip);
    }
    if (changeStatus !== "rejected") itemActions.append(confirm);
    item.append(itemHeader, pathLabel, reason, diff, itemActions);
    list.append(item);
  }

  if (request.proposal.linkedWarnings?.length) {
    const warnings = document.createElement("details");
    warnings.className = "linked-change-warnings";
    const summary = document.createElement("summary");
    summary.textContent = `${request.proposal.linkedWarnings.length} related target warning${request.proposal.linkedWarnings.length === 1 ? "" : "s"}`;
    const warningList = document.createElement("ul");
    for (const warning of request.proposal.linkedWarnings) {
      const item = document.createElement("li");
      item.textContent = warning;
      warningList.append(item);
    }
    warnings.append(summary, warningList);
    list.append(warnings);
  }

  const actions = document.createElement("div");
  actions.className = "request-actions linked-change-group-actions";
  const retry = document.createElement("button");
  retry.type = "button";
  retry.className = "button button-ghost request-regenerate";
  retry.textContent = "↻";
  retry.title = "Regenerate the whole linked change set";
  retry.addEventListener("click", async (event) => {
    event.stopPropagation();
    retry.disabled = true;
    retry.classList.add("is-spinning");
    try {
      await api("/api/request/regenerate", { method: "POST", body: JSON.stringify({ id: request.id }) });
      await refreshRequests();
      showToast(`${providerDisplayNameStart()} is regenerating the linked change set.`, 3600);
    } catch (error) {
      showToast(error.message, 5000);
    } finally {
      retry.disabled = false;
      retry.classList.remove("is-spinning");
    }
  });
  const discard = document.createElement("button");
  discard.type = "button";
  discard.className = "button button-ghost";
  discard.textContent = "Discard";
  discard.addEventListener("click", async (event) => {
    event.stopPropagation();
    discard.disabled = true;
    try {
      await api("/api/request/reject", { method: "POST", body: JSON.stringify({ id: request.id }) });
      await refreshRequests();
      showToast("Linked change set discarded.");
    } catch (error) {
      showToast(error.message, 5000);
    } finally {
      discard.disabled = false;
    }
  });
  const confirmAll = document.createElement("button");
  confirmAll.type = "button";
  confirmAll.className = "button button-ghost";
  confirmAll.textContent = "Confirm all";
  confirmAll.addEventListener("click", async (event) => {
    event.stopPropagation();
    confirmAll.disabled = true;
    try {
      await api("/api/request/confirm-all-linked", { method: "POST", body: JSON.stringify({ id: request.id }) });
      await refreshRequests();
    } catch (error) {
      showToast(error.message, 5000);
    } finally {
      confirmAll.disabled = false;
    }
  });
  const apply = document.createElement("button");
  apply.type = "button";
  apply.className = "button button-dark";
  apply.textContent = "Apply change set";
  apply.disabled = !ready;
  apply.addEventListener("click", async (event) => {
    event.stopPropagation();
    if (!ready) return;
    apply.disabled = true;
    try {
      await api("/api/request/apply-linked", { method: "POST", body: JSON.stringify({ id: request.id }) });
      await refreshCompiledOutline({ render: false });
      await refreshRequests();
      if (state.document?.path) await loadDocument(state.document.path, { quiet: true });
      showToast("Linked changes were applied atomically. Undo restores every affected file.", 4800);
    } catch (error) {
      showToast(error.message, 5400);
    } finally {
      apply.disabled = false;
    }
  });
  actions.append(retry, discard, confirmAll, apply);

  const followup = document.createElement("div");
  followup.className = "request-followup linked-change-followup";
  const followupInput = document.createElement("textarea");
  followupInput.rows = 2;
  followupInput.placeholder = `Tell ${providerDisplayName()} how the linked changes should be revised…`;
  followupInput.setAttribute("aria-label", `Follow up on linked change set ${request.id}`);
  const followupButton = document.createElement("button");
  followupButton.type = "button";
  followupButton.className = "button button-ghost";
  followupButton.textContent = "Follow up";
  followupButton.addEventListener("click", async (event) => {
    event.stopPropagation();
    const message = followupInput.value.trim();
    if (!message) return showToast("Write a follow-up instruction first.");
    followupButton.disabled = true;
    try {
      await api("/api/request/followup", {
        method: "POST",
        body: JSON.stringify({ id: request.id, message }),
      });
      await refreshRequests();
      showToast(`${providerDisplayNameStart()} is revising the linked change set.`, 3800);
    } catch (error) {
      showToast(error.message, 5000);
    } finally {
      followupButton.disabled = false;
    }
  });
  for (const element of [followupInput, followupButton]) {
    element.addEventListener("click", (event) => event.stopPropagation());
    element.addEventListener("keydown", (event) => event.stopPropagation());
  }
  followup.append(followupInput, followupButton);
  card.append(meta, title, intro, list, actions, followup);
  return card;
}

function proposalUnitLabel(unit, index) {
  if (unit.kind === "heading") {
    return { 1: "Section", 2: "Subsection", 3: "Subsubsection" }[unit.level] || "Heading";
  }
  if (unit.kind === "paragraph-heading") return "Paragraph heading";
  if (unit.kind === "math") return "Equation";
  if (unit.kind === "table") return "Table";
  if (unit.kind === "figure") return "Figure";
  if (unit.kind === "code") return "Code";
  if (unit.kind === "bibliography") return "References";
  return `Paragraph ${index + 1}`;
}

function createProposalUnitCard(request, unit, index, total) {
  const proposalIsRevising = Boolean(request.pendingUnitRevision)
    && ["queued", "running", "validating"].includes(request.agentStatus);
  const isRevising = proposalIsRevising && request.pendingUnitRevision?.unitId === unit.id;
  const card = document.createElement("article");
  card.className = `request-card request-proposed proposal-unit-card${unit.status === "confirmed" ? " unit-confirmed" : ""}${isRevising ? " unit-revising" : ""}`;
  card.dataset.requestId = request.id;
  card.dataset.proposalUnitId = unit.id;
  card.dataset.blockIndex = String(resolvedRequestEndBlockIndex(request));
  const meta = document.createElement("div");
  meta.className = "request-meta";
  const status = document.createElement("span");
  status.className = "request-status";
  status.textContent = isRevising
    ? `${providerDisplayNameStart(request.provider)} is revising…`
    : unit.reviewKind === "human"
      ? "Human edit confirmed"
      : unit.status === "confirmed"
        ? "Unit confirmed"
        : "Review unit";
  if (isRevising) status.classList.add("agent-running");
  const location = document.createElement("span");
  location.className = "request-location";
  location.textContent = `${proposalUnitLabel(unit, index)} · ${index + 1}/${total}`;
  meta.append(status, location);
  const title = document.createElement("strong");
  title.textContent = unit.kind === "heading" || unit.kind === "paragraph-heading"
    ? unit.display
    : proposalUnitLabel(unit, index);
  const detail = document.createElement("p");
  detail.textContent = unit.display;
  const diff = document.createElement("div");
  diff.className = "request-diff proposal-unit-diff";
  const added = document.createElement("ins");
  added.textContent = unit.display;
  diff.append(added);
  const actions = document.createElement("div");
  actions.className = "request-actions";
  const confirm = document.createElement("button");
  confirm.type = "button";
  confirm.className = unit.status === "confirmed" ? "button button-ghost" : "button button-dark";
  confirm.textContent = unit.status === "confirmed" ? "Unconfirm" : "Confirm unit";
  confirm.disabled = proposalIsRevising;
  confirm.addEventListener("click", async (event) => {
    event.stopPropagation();
    confirm.disabled = true;
    try {
      await api("/api/request/review-unit", {
        method: "POST",
        body: JSON.stringify({
          id: request.id,
          unitId: unit.id,
          status: unit.status === "confirmed" ? "pending" : "confirmed",
        }),
      });
      await refreshRequests();
      showToast(unit.status === "confirmed"
        ? "Review unit reopened."
        : "Review unit confirmed. The LaTeX source is unchanged until the whole structure group is applied.", 4400);
    } catch (error) {
      showToast(error.message, 5000);
    } finally {
      confirm.disabled = false;
    }
  });
  actions.append(confirm);
  const followup = document.createElement("div");
  followup.className = "request-followup";
  followup.hidden = true;
  const followupInput = document.createElement("textarea");
  followupInput.rows = 2;
  followupInput.placeholder = `Continue with ${providerDisplayName()} about only this unit…`;
  followupInput.setAttribute("aria-label", `Revise ${proposalUnitLabel(unit, index)}`);
  const followupButton = document.createElement("button");
  followupButton.type = "button";
  followupButton.className = "button button-ghost";
  followupButton.textContent = "Send";
  followupButton.disabled = proposalIsRevising;
  for (const element of [followupInput, followupButton]) {
    element.addEventListener("click", (event) => event.stopPropagation());
    element.addEventListener("keydown", (event) => event.stopPropagation());
  }
  followupButton.addEventListener("click", async (event) => {
    event.stopPropagation();
    const feedback = followupInput.value.trim();
    if (!feedback) {
      showToast("Write what should change in this unit first.");
      return;
    }
    followupButton.disabled = true;
    try {
      const message = [
        `Revise only this ${proposalUnitLabel(unit, index).toLowerCase()} in the current structure proposal.`,
        "Keep every other proposal unit byte-for-byte unchanged and return the complete coherent replacement.",
        `<proposal_unit>${unit.display}</proposal_unit>`,
        `User feedback: ${feedback}`,
      ].join("\n\n");
      await api("/api/request/followup", {
        method: "POST",
        body: JSON.stringify({ id: request.id, unitId: unit.id, message }),
      });
      await refreshRequests();
      showToast(`${providerDisplayNameStart()} is revising this unit. Other proposal text and confirmations are preserved.`, 4400);
    } catch (error) {
      showToast(error.message, 5000);
    } finally {
      followupButton.disabled = false;
    }
  });
  followup.append(followupInput, followupButton);
  const regenerate = document.createElement("button");
  regenerate.type = "button";
  regenerate.className = "button button-ghost request-regenerate";
  regenerate.textContent = "↻";
  regenerate.title = "Generate another version of only this unit";
  regenerate.setAttribute("aria-label", `Regenerate ${proposalUnitLabel(unit, index)}`);
  regenerate.disabled = proposalIsRevising;
  regenerate.addEventListener("click", async (event) => {
    event.stopPropagation();
    regenerate.disabled = true;
    regenerate.classList.add("is-spinning");
    try {
      const message = [
        `Generate a materially different version of only this ${proposalUnitLabel(unit, index).toLowerCase()}.`,
        "Keep every other proposal unit byte-for-byte unchanged and return the complete coherent replacement.",
        `<proposal_unit>${unit.display}</proposal_unit>`,
        "The author does not want the current version; preserve its scientific scope while improving the writing.",
      ].join("\n\n");
      await api("/api/request/followup", {
        method: "POST",
        body: JSON.stringify({ id: request.id, unitId: unit.id, message }),
      });
      await refreshRequests();
      showToast(`${providerDisplayNameStart()} is generating another version of this unit only.`, 4000);
    } catch (error) {
      showToast(error.message, 5000);
    } finally {
      regenerate.disabled = false;
      regenerate.classList.remove("is-spinning");
    }
  });
  const continueChat = document.createElement("button");
  continueChat.type = "button";
  continueChat.className = "button button-ghost";
  continueChat.textContent = "Continue chat";
  continueChat.disabled = proposalIsRevising;
  continueChat.addEventListener("click", (event) => {
    event.stopPropagation();
    followup.hidden = !followup.hidden;
    if (!followup.hidden) followupInput.focus();
    requestAnimationFrame(() => positionCommentCards());
  });
  actions.append(regenerate, continueChat);
  card.addEventListener("click", () => {
    const target = dom.editor.querySelector(`[data-proposal-unit-id="${CSS.escape(String(unit.id))}"]`);
    target?.scrollIntoView({ behavior: "smooth", block: "center" });
  });
  card.append(meta, title, detail, diff, actions, followup);
  return card;
}

function createStructureProposalGroupCard(request, units) {
  const confirmed = units.filter((unit) => unit.status === "confirmed").length;
  const proposalIsRevising = Boolean(request.pendingUnitRevision)
    && ["queued", "running", "validating"].includes(request.agentStatus);
  const ready = confirmed === units.length && !proposalIsRevising;
  const card = document.createElement("article");
  card.className = `request-card request-proposed proposal-group-card${ready ? " group-ready" : ""}`;
  card.dataset.requestId = request.id;
  card.dataset.blockIndex = String(resolvedRequestEndBlockIndex(request));
  const meta = document.createElement("div");
  meta.className = "request-meta";
  const status = document.createElement("span");
  status.className = "request-status";
  status.textContent = proposalIsRevising
    ? "Revision in progress"
    : ready
      ? "Ready to apply"
      : "Grouped structure review";
  const location = document.createElement("span");
  location.className = "request-location";
  location.textContent = `${confirmed}/${units.length} confirmed`;
  meta.append(status, location);
  const title = document.createElement("strong");
  title.textContent = "Apply this structure group";
  const detail = document.createElement("p");
  detail.textContent = proposalIsRevising
    ? "The full proposal remains visible. Review actions resume when the revised unit returns."
    : ready
    ? "All units are confirmed. Apply them to LaTeX as one coherent source change."
    : "Confirm or revise every unit above. The LaTeX source remains unchanged.";
  const actions = document.createElement("div");
  actions.className = "request-actions";
  const reject = document.createElement("button");
  reject.type = "button";
  reject.className = "button button-ghost";
  reject.textContent = "Discard group";
  const apply = document.createElement("button");
  apply.type = "button";
  apply.className = "button button-dark";
  apply.textContent = "Apply confirmed structure";
  apply.disabled = !ready || isReadOnlyPath(request.path);
  reject.addEventListener("click", async (event) => {
    event.stopPropagation();
    reject.disabled = true;
    try {
      await api("/api/request/reject", { method: "POST", body: JSON.stringify({ id: request.id }) });
      await refreshRequests();
      showToast("Structure proposal discarded.");
    } catch (error) {
      showToast(error.message, 5000);
    } finally {
      reject.disabled = false;
    }
  });
  apply.addEventListener("click", async (event) => {
    event.stopPropagation();
    if (!ready) return;
    apply.disabled = true;
    try {
      await api("/api/request/accept", { method: "POST", body: JSON.stringify({ id: request.id }) });
      await refreshCompiledOutline({ render: false });
      await refreshRequests();
      if (request.path === state.document?.path) await loadDocument(request.path, { quiet: true });
      showToast("The reviewed structure group was applied to LaTeX.", 4200);
    } catch (error) {
      showToast(error.message, 5000);
    } finally {
      apply.disabled = false;
    }
  });
  actions.append(reject, apply);
  card.append(meta, title, detail, actions);
  return card;
}

// Cards are rebuilt on every server event. Carry unsent follow-up text (and
// focus) over to the rebuilt card so an agent status change cannot eat it.
function requestCardKey(card) {
  return `${card?.dataset.requestId || ""}\u0000${card?.dataset.proposalUnitId || ""}`;
}

function captureRequestCardDrafts() {
  const drafts = new Map();
  for (const textarea of dom.requestList.querySelectorAll(".request-card textarea")) {
    const focused = document.activeElement === textarea;
    if (!textarea.value && !focused) continue;
    const card = textarea.closest(".request-card");
    drafts.set(requestCardKey(card), {
      value: textarea.value,
      focused,
      start: textarea.selectionStart,
      end: textarea.selectionEnd,
      followupOpen: !textarea.closest(".request-followup")?.hidden,
    });
  }
  return drafts;
}

function restoreRequestCardDrafts(drafts) {
  if (!drafts.size) return;
  for (const card of dom.requestList.querySelectorAll(".request-card")) {
    const draft = drafts.get(requestCardKey(card));
    const textarea = card.querySelector("textarea");
    if (!draft || !textarea) continue;
    textarea.value = draft.value;
    const followup = textarea.closest(".request-followup");
    if (followup && draft.followupOpen) followup.hidden = false;
    if (draft.focused) {
      textarea.focus({ preventScroll: true });
      try {
        textarea.setSelectionRange(draft.start, draft.end);
      } catch {
        // Caret restoration is best-effort.
      }
    }
  }
}

// First-run explainer for the comments pane: the whole workflow in three steps.
function createCommentsEmptyState() {
  const empty = document.createElement("div");
  empty.className = "comments-empty";
  const title = document.createElement("strong");
  title.textContent = "No comments here";
  const hint = document.createElement("span");
  hint.textContent = "Review the draft one passage at a time:";
  const steps = document.createElement("ol");
  const addStep = (heading, detail, extra = null) => {
    const item = document.createElement("li");
    const name = document.createElement("b");
    name.textContent = heading;
    const copy = document.createElement("span");
    copy.textContent = detail;
    item.append(name, copy);
    if (extra) copy.append(extra);
    steps.append(item);
  };
  addStep("Select text", "Highlight a phrase or a paragraph in the manuscript. Confirm it as yours, or comment on it.");
  addStep("Write a comment", `Say what should change, or ask a question. ${providerDisplayNameStart()} drafts a reply in the background.`);
  const sample = document.createElement("span");
  sample.className = "diff-sample";
  sample.setAttribute("aria-hidden", "true");
  const removed = document.createElement("del");
  removed.textContent = "is weaker";
  const added = document.createElement("ins");
  added.textContent = "rests on less";
  sample.append("The evidence ", removed, " ", added, " than it seems.");
  addStep("Review the diff", "Every proposal arrives here as a before and after. Accept, reject, or ask for another version.", sample);
  const promise = document.createElement("p");
  promise.textContent = "Nothing in your .tex files changes until you accept it.";
  empty.append(title, hint, steps, promise);
  return empty;
}

function renderRequestLists() {
  const previousScrollTop = dom.requestList.scrollTop;
  const cardDrafts = captureRequestCardDrafts();
  commentCardResizeObserver?.disconnect();
  const active = state.requests.filter((request) => ["pending", "proposed", "discussed"].includes(request.status) && request.anchorValid !== false);
  const current = active
    .filter((request) => Boolean(linkedChangeForCurrentDocument(request)))
    .sort(compareCurrentReviewRequests);
  const other = active.filter((request) => !linkedChangeForCurrentDocument(request));
  const visibleCommentCount = current.reduce((count, request) => {
    if (request.proposal?.linkedChanges?.length) return count + request.proposal.linkedChanges.length + 1;
    const units = request.status === "proposed" ? request.proposal?.reviewUnits || [] : [];
    return count + (units.length > 1 ? units.length : 1);
  }, 0);
  dom.requestCount.textContent = String(visibleCommentCount);
  dom.requestCount.classList.toggle("is-zero", visibleCommentCount === 0);
  dom.requestList.replaceChildren();
  if (!current.length) {
    dom.requestList.append(createCommentsEmptyState());
  } else {
    for (const request of current) {
      const units = request.status === "proposed" ? request.proposal?.reviewUnits || [] : [];
      if (request.status === "proposed" && request.proposal?.linkedChanges?.length) {
        dom.requestList.append(createLinkedChangeSetCard(request));
      } else if (units.length > 1) {
        for (const [index, unit] of units.entries()) {
          dom.requestList.append(createProposalUnitCard(request, unit, index, units.length));
        }
        dom.requestList.append(createStructureProposalGroupCard(request, units));
      } else {
        dom.requestList.append(createRequestCard(request));
      }
    }
  }

  dom.otherRequestList.replaceChildren();
  dom.otherComments.hidden = other.length === 0;
  dom.otherRequestCount.textContent = String(other.length);
  for (const request of other) dom.otherRequestList.append(createRequestCard(request, { compact: true }));
  restoreRequestCardDrafts(cardDrafts);

  for (const card of dom.requestList.querySelectorAll(".request-card")) {
    commentCardResizeObserver?.observe(card);
  }
  decorateReviewCards(new Map(current.map((request, index) => [request.id, index + 1])));
  commentCardResizeObserver?.observe(dom.commentComposer);
  applyCommentMarkers();
  positionCommentCards({ restoreScrollTop: previousScrollTop });
}

async function refreshRequests() {
  const requests = await api("/api/requests");
  state.requests = Array.isArray(requests) ? requests : [];
  // The cards always update. The manuscript re-renders only when that cannot
  // destroy a selection or an edit in progress; otherwise it is replayed later.
  renderRequestLists();
  renderDocumentWhenSafe();
  if (state.chat && !dom.codexChat.hidden) renderChatSession({ scroll: false });
}

function appendInlineMarkdown(container, text) {
  const source = String(text || "");
  const pattern = /(\*\*[^*\n]+\*\*|`[^`\n]+`|\[[^\]\n]+\]\(https?:\/\/[^)\s]+\))/g;
  let cursor = 0;
  for (const match of source.matchAll(pattern)) {
    if (match.index > cursor) container.append(document.createTextNode(source.slice(cursor, match.index)));
    const token = match[0];
    if (token.startsWith("**")) {
      const strong = document.createElement("strong");
      strong.textContent = token.slice(2, -2);
      container.append(strong);
    } else if (token.startsWith("`")) {
      const code = document.createElement("code");
      code.textContent = token.slice(1, -1);
      container.append(code);
    } else {
      const link = token.match(/^\[([^\]]+)\]\((https?:\/\/[^)]+)\)$/);
      const anchor = document.createElement("a");
      anchor.textContent = link?.[1] || token;
      const href = safeHttpUrl(link?.[2]);
      if (!href) {
        container.append(document.createTextNode(token));
        cursor = match.index + token.length;
        continue;
      }
      anchor.href = href;
      anchor.target = "_blank";
      anchor.rel = "noopener noreferrer";
      container.append(anchor);
    }
    cursor = match.index + token.length;
  }
  if (cursor < source.length) container.append(document.createTextNode(source.slice(cursor)));
}

function appendChatText(container, text) {
  const lines = String(text || "").replace(/\r\n/g, "\n").split("\n");
  let index = 0;
  const isSpecial = (line) => !line.trim() || /^```/.test(line) || /^#{1,4}\s+/.test(line) || /^>\s?/.test(line) || /^\s*[-*]\s+/.test(line) || /^\s*\d+[.]\s+/.test(line);
  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      index += 1;
      continue;
    }
    if (/^```/.test(line)) {
      const language = line.slice(3).trim();
      const codeLines = [];
      index += 1;
      while (index < lines.length && !/^```/.test(lines[index])) codeLines.push(lines[index++]);
      if (index < lines.length) index += 1;
      const pre = document.createElement("pre");
      if (language) pre.dataset.language = language;
      pre.textContent = codeLines.join("\n").trim();
      container.append(pre);
      continue;
    }
    const heading = line.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      const element = document.createElement(`h${Math.min(4, heading[1].length + 1)}`);
      appendInlineMarkdown(element, heading[2]);
      container.append(element);
      index += 1;
      continue;
    }
    if (/^>\s?/.test(line)) {
      const quote = document.createElement("blockquote");
      const quoteLines = [];
      while (index < lines.length && /^>\s?/.test(lines[index])) quoteLines.push(lines[index++].replace(/^>\s?/, ""));
      appendInlineMarkdown(quote, quoteLines.join("\n"));
      container.append(quote);
      continue;
    }
    const unordered = /^\s*[-*]\s+/.test(line);
    const ordered = /^\s*\d+[.]\s+/.test(line);
    if (unordered || ordered) {
      const list = document.createElement(ordered ? "ol" : "ul");
      const itemPattern = ordered ? /^\s*\d+[.]\s+/ : /^\s*[-*]\s+/;
      while (index < lines.length && itemPattern.test(lines[index])) {
        const item = document.createElement("li");
        appendInlineMarkdown(item, lines[index++].replace(itemPattern, ""));
        list.append(item);
      }
      container.append(list);
      continue;
    }
    const paragraphLines = [line];
    index += 1;
    while (index < lines.length && !isSpecial(lines[index])) paragraphLines.push(lines[index++]);
    const paragraph = document.createElement("p");
    appendInlineMarkdown(paragraph, paragraphLines.join("\n"));
    container.append(paragraph);
  }
}

function linkedChatProposal(message) {
  if (!message?.proposalRequestId) return null;
  return state.requests.find((request) => request.id === message.proposalRequestId) || null;
}

async function showChatProposalInComments(request) {
  if (!request?.id) return;
  closeCodexChat();
  const linkedHere = Boolean(linkedChangeForCurrentDocument(request));
  if (request.path && request.path !== state.document?.path && !linkedHere) {
    const loaded = await loadDocument(request.path);
    if (!loaded) return;
  }
  await refreshRequests();
  const current = state.requests.find((item) => item.id === request.id) || request;
  const currentLink = linkedChangeForCurrentDocument(current);
  const blockIndex = Number(currentLink?.resolvedBlockIndex ?? currentLink?.blockIndex ?? resolvedRequestBlockIndex(current));
  if (Number.isInteger(blockIndex)) scrollToBlock(blockIndex);
  setTimeout(() => {
    positionCommentCards();
    const card = dom.requestList.querySelector(`[data-request-id="${CSS.escape(String(request.id))}"]`);
    if (card) {
      card.hidden = false;
      card.tabIndex = -1;
      focusReviewLink(request.id, { scrollCard: true });
      card.focus({ preventScroll: true });
    }
  }, 220);
}

async function createProposalFromChatMessage(message, button) {
  const linked = linkedChatProposal(message);
  if (linked && ["pending", "proposed", "discussed"].includes(linked.status)) {
    await showChatProposalInComments(linked);
    return;
  }
  button.disabled = true;
  try {
    const result = await api("/api/chat/create-proposal", {
      method: "POST",
      body: JSON.stringify({ assistantMessageId: message.id, sessionId: state.chat?.id || null }),
    });
    state.chat = result.session;
    await refreshRequests();
    showToast("This reply is becoming a red/green proposal in Comments.", 4200);
    await showChatProposalInComments(result.request);
  } catch (error) {
    showToast(error.message, 5200);
  } finally {
    button.disabled = false;
  }
}

function renderChatList() {
  dom.chatListCount.textContent = String(state.chats.length);
  dom.codexChatSessions.replaceChildren();
  if (!state.chats.length) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "No saved chats yet.";
    dom.codexChatSessions.append(empty);
    return;
  }
  const statusLabels = { idle: "Ready", queued: "Queued", running: "Working", failed: "Needs attention", stopped: "Stopped", interrupted: "Interrupted" };
  for (const session of state.chats) {
    const item = document.createElement("button");
    item.type = "button";
    item.className = `chat-session-item status-${session.status}${session.isCurrent ? " is-active" : ""}`;
    item.dataset.chatId = session.id;
    const dot = document.createElement("span");
    dot.className = "chat-session-dot";
    dot.setAttribute("aria-hidden", "true");
    const copy = document.createElement("span");
    copy.className = "chat-session-copy";
    const title = document.createElement("strong");
    title.className = "chat-session-title";
    title.textContent = session.title;
    const meta = document.createElement("span");
    meta.className = "chat-session-meta";
    meta.textContent = `${statusLabels[session.status] || session.status} · ${session.messageCount} messages`;
    copy.append(title, meta);
    const time = document.createElement("time");
    time.className = "chat-session-time";
    time.dateTime = session.updatedAt || "";
    time.textContent = session.updatedAt
      ? new Date(session.updatedAt).toLocaleDateString([], { month: "short", day: "numeric" })
      : "";
    item.append(dot, copy, time);
    item.addEventListener("click", () => switchChatSession(session.id));
    dom.codexChatSessions.append(item);
  }
}

async function refreshChatList() {
  state.chats = await api("/api/chats");
  renderChatList();
  return state.chats;
}

function setChatListOpen(open) {
  dom.codexChatList.hidden = !open;
  dom.toggleChatList.setAttribute("aria-expanded", String(open));
}

async function switchChatSession(sessionId) {
  if (!sessionId || sessionId === state.chat?.id) {
    setChatListOpen(false);
    return;
  }
  const item = dom.codexChatSessions.querySelector(`[data-chat-id="${CSS.escape(String(sessionId))}"]`);
  if (item) item.disabled = true;
  try {
    state.chat = await api("/api/chat/select", {
      method: "POST",
      body: JSON.stringify({ id: sessionId }),
    });
    await refreshChatList();
    renderChatSession();
    setChatListOpen(false);
    dom.codexChatInput.focus();
  } catch (error) {
    showToast(error.message, 5000);
  } finally {
    if (item) item.disabled = false;
  }
}

// Re-rendering the transcript on every server event collapses "Show more",
// drops a text selection and resets scroll inside long messages. Skip the
// rebuild when nothing the transcript shows has changed.
function chatRenderSignature(session) {
  return JSON.stringify([
    session?.id ?? null,
    session?.status ?? null,
    session?.error ?? null,
    providerDisplayName(),
    (session?.messages || []).map((message) => [
      message.id ?? null,
      message.role,
      String(message.content || "").length,
      message.provider ?? null,
      message.selectionMessageId ?? null,
      linkedChatProposal(message)?.status ?? null,
      Boolean(message.structureProposal),
    ]),
  ]);
}

function renderChatSession({ scroll = true, force = false } = {}) {
  const session = state.chat;
  const signature = chatRenderSignature(session);
  const unchanged = !force && signature === state.chatRenderSignature && dom.codexChatMessages.childElementCount > 0;
  state.chatRenderSignature = signature;
  if (unchanged) {
    updateChatChrome(session);
    return;
  }
  const structureProposal = latestStructureProposal(session);
  if (structureProposal) {
    state.structureProposal = structureProposal;
    state.outlinePreview = true;
    if (state.workspaceMode === "structure") renderProposedStructure();
    renderOutline();
  }
  dom.codexChatMessages.replaceChildren();
  if (!session?.messages?.length) {
    const empty = document.createElement("div");
    empty.className = "codex-chat-empty";
    const title = document.createElement("strong");
    title.textContent = "Ask about the paper, code, or experiments.";
    const detail = document.createElement("p");
    detail.textContent = `${providerDisplayNameStart()} can inspect the whole project. Inline comments remain the place for reviewable manuscript edits.`;
    empty.append(title, detail);
    dom.codexChatMessages.append(empty);
  } else {
    for (const message of session.messages) {
      const article = document.createElement("article");
      article.className = `chat-message chat-message-${message.role}`;
      const meta = document.createElement("span");
      meta.className = "chat-message-meta";
      const time = message.createdAt ? new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
      meta.textContent = `${message.role === "assistant" ? providerDisplayNameStart(message.provider || state.agentProvider) : "You"}${time ? ` · ${time}` : ""}`;
      const content = document.createElement("div");
      content.className = "chat-message-content";
      appendChatText(content, message.content);
      article.append(meta, content);
      const longUserMessage = message.role === "user" && (String(message.content || "").length > 1600 || String(message.content || "").split("\n").length > 14);
      if (longUserMessage) {
        article.classList.add("chat-message-collapsible", "is-collapsed");
        const toggle = document.createElement("button");
        toggle.type = "button";
        toggle.className = "chat-message-toggle";
        toggle.textContent = "Show more";
        toggle.addEventListener("click", () => {
          const collapsed = article.classList.toggle("is-collapsed");
          toggle.textContent = collapsed ? "Show more" : "Show less";
        });
        article.append(toggle);
      }
      if (message.role === "assistant" && message.selectionMessageId) {
        const actions = document.createElement("div");
        actions.className = "chat-message-actions";
        const hint = document.createElement("span");
        hint.textContent = "Use this reply and its preceding discussion for the selected passage.";
        const proposal = linkedChatProposal(message);
        const button = document.createElement("button");
        button.type = "button";
        button.className = "button button-ghost chat-proposal-button";
        if (proposal?.status === "resolved") {
          button.textContent = "Accepted";
          button.disabled = true;
        } else if (proposal && ["pending", "proposed", "discussed"].includes(proposal.status)) {
          button.textContent = "View in Comments";
        } else {
          button.textContent = "Generate reviewable edit";
        }
        button.addEventListener("click", () => createProposalFromChatMessage(message, button));
        actions.append(hint, button);
        article.append(actions);
      }
      if (message.role === "assistant" && message.structureProposal) {
        const actions = document.createElement("div");
        actions.className = "chat-message-actions structure-chat-actions";
        const hint = document.createElement("span");
        hint.textContent = "This reply contains a reviewable proposed section tree; it has not changed LaTeX.";
        const button = document.createElement("button");
        button.type = "button";
        button.className = "button button-ghost chat-proposal-button";
        button.textContent = "View proposed tree";
        button.addEventListener("click", () => showStructureProposal(message.structureProposal));
        actions.append(hint, button);
        article.append(actions);
      }
      dom.codexChatMessages.append(article);
    }
  }
  if (["queued", "running"].includes(session?.status)) {
    const working = document.createElement("div");
    working.className = "codex-chat-working";
    const chatAgent = session.provider || state.agentProvider;
    working.textContent = session.status === "queued"
      ? `Preparing ${providerDisplayName(chatAgent)}…`
      : `${providerDisplayNameStart(chatAgent)} is working${chatEffortLabel() ? ` · ${chatEffortLabel()}` : ""}…`;
    dom.codexChatMessages.append(working);
  }
  if (session?.error) {
    const error = document.createElement("div");
    error.className = "codex-chat-error";
    error.textContent = session.error;
    dom.codexChatMessages.append(error);
  }
  updateChatChrome(session);
  if (scroll) requestAnimationFrame(() => { dom.codexChatMessages.scrollTop = dom.codexChatMessages.scrollHeight; });
}

function updateChatChrome(session = state.chat) {
  const working = ["queued", "running"].includes(session?.status);
  const anyChatWorking = working || state.chats.some((item) => ["queued", "running"].includes(item.status));
  document.body.classList.toggle("chat-working", anyChatWorking);
  const labels = { idle: "Ready", queued: "Preparing…", running: "Working…", failed: "Needs attention", stopped: "Stopped", interrupted: "Interrupted" };
  dom.codexChatStatus.textContent = labels[session?.status] || "Ready";
  dom.sendCodexChat.disabled = working;
  dom.stopCodexChat.hidden = !working;
}

async function refreshChat(options = {}) {
  const [chat] = await Promise.all([api("/api/chat"), refreshChatList()]);
  state.chat = chat;
  renderChatSession(options);
  return state.chat;
}

async function openCodexChat() {
  document.body.classList.add("chat-pane-open");
  dom.commentsView.hidden = true;
  dom.codexChat.hidden = false;
  dom.showCommentsPane.classList.remove("is-active");
  dom.showCommentsPane.setAttribute("aria-selected", "false");
  dom.openCodexChat.classList.add("is-active");
  dom.openCodexChat.setAttribute("aria-selected", "true");
  syncSidePaneTabStops();
  applySidePaneWidth("chat");
  dom.codexChatDocument.textContent = state.document?.path || "Project context";
  updateChatMetaLabel();
  try {
    await refreshChat();
    dom.codexChatInput.focus();
  } catch (error) {
    showToast(error.message, 5000);
  }
}

function closeCodexChat() {
  setChatListOpen(false);
  document.body.classList.remove("chat-pane-open");
  dom.codexChat.hidden = true;
  dom.commentsView.hidden = false;
  dom.openCodexChat.classList.remove("is-active");
  dom.openCodexChat.setAttribute("aria-selected", "false");
  dom.showCommentsPane.classList.add("is-active");
  dom.showCommentsPane.setAttribute("aria-selected", "true");
  syncSidePaneTabStops();
  applySidePaneWidth("comments");
}

async function sendCodexChatMessage() {
  const message = dom.codexChatInput.value.trim();
  if (!message) {
    showToast("Write a message first.");
    return;
  }
  dom.sendCodexChat.disabled = true;
  try {
    state.chat = await api("/api/chat/message", {
      method: "POST",
      body: JSON.stringify({ message, activePath: state.document?.path || null, sessionId: state.chat?.id || null }),
    });
    dom.codexChatInput.value = "";
    renderChatSession();
    await refreshChatList();
  } catch (error) {
    showToast(error.message, 5000);
  } finally {
    if (!["queued", "running"].includes(state.chat?.status)) dom.sendCodexChat.disabled = false;
  }
}

async function startNewCodexChat() {
  dom.newCodexChat.disabled = true;
  try {
    state.chat = await api("/api/chat/new", { method: "POST", body: "{}" });
    await refreshChatList();
    renderChatSession();
    setChatListOpen(false);
    dom.codexChatInput.focus();
  } catch (error) {
    showToast(error.message, 5000);
  } finally {
    dom.newCodexChat.disabled = false;
  }
}

async function stopCodexChat() {
  dom.stopCodexChat.disabled = true;
  try {
    state.chat = await api("/api/chat/stop", {
      method: "POST",
      body: JSON.stringify({ sessionId: state.chat?.id || null }),
    });
    await refreshChatList();
    renderChatSession();
  } catch (error) {
    showToast(error.message, 5000);
  } finally {
    dom.stopCodexChat.disabled = false;
  }
}

async function refreshGit() {
  try {
    const git = await api("/api/git");
    const lines = Array.isArray(git.lines) ? git.lines.map(String) : [];
    const notARepository = git.available === false || /^fatal:/i.test(lines[0] || "");
    dom.refreshGit.hidden = notARepository;
    if (notARepository) {
      dom.gitIndicator.textContent = "Not a Git repository";
      dom.gitIndicator.title = "This project folder is not under Git version control. Undo inside the app still works.";
      return;
    }
    dom.gitIndicator.textContent = git.clean ? "Git · clean" : `Git · ${git.count} changed`;
    dom.gitIndicator.title = lines.join("\n");
  } catch {
    dom.gitIndicator.textContent = "Git unavailable";
    dom.gitIndicator.title = "";
  }
}

function applyCompileState(value) {
  const labels = { idle: "Ready", running: "Compiling…", succeeded: "PDF updated", failed: "Compile failed" };
  dom.compileStatus.textContent = labels[value.status] || value.status;
  dom.compileButton.disabled = value.status === "running";
  dom.compileLog.textContent = value.log || "No compiler output yet.";
  if (value.status === "failed") dom.compileDetails.open = true;
  if (value.status === "succeeded") {
    state.compiledPdfUrl = `/api/pdf?v=${value.pdfVersion}`;
    if (!dom.paperPreview.hidden && state.paperPreviewMode === "compiled") renderCompiledPdfPreview();
  }
}

async function compilePdf() {
  dom.compileButton.disabled = true;
  dom.compileStatus.textContent = "Compiling…";
  try {
    applyCompileState(await api("/api/compile", { method: "POST", body: "{}" }));
  } catch (error) {
    showToast(error.message, 5000);
  }
}

function setConnectionStatus(online, detail = "") {
  const status = dom.connectionStatus;
  if (!status) return;
  const label = online ? "Connected locally" : `Disconnected${detail ? ` — ${detail}` : ""}`;
  status.classList.remove("is-connecting");
  status.classList.toggle("offline", !online);
  // The pill is always labelled; the full sentence lives in aria-label/title.
  status.textContent = online ? "Local" : "Offline";
  status.setAttribute("aria-label", label);
  status.title = online
    ? "Connected to the local Paper Pal server"
    : "The local Paper Pal server is not answering. Live updates are paused; check the terminal where it runs.";
}

function connectEvents() {
  let events = null;
  let retryTimer = null;
  let attempts = 0;
  const disconnect = () => {
    clearTimeout(retryTimer);
    retryTimer = null;
    events?.close();
    events = null;
  };
  // The browser retries by itself while the stream is CONNECTING, but gives
  // up for good once it is CLOSED (a non-200 answer, a restart race). Then the
  // stream has to be rebuilt by hand, backing off from 1s to 30s.
  const scheduleReconnect = () => {
    if (retryTimer || document.hidden) return;
    const delay = Math.min(30000, 1000 * 2 ** Math.min(attempts, 5));
    attempts += 1;
    retryTimer = setTimeout(() => {
      retryTimer = null;
      connect();
    }, delay);
  };
  const connect = () => {
    if (events || document.hidden) return;
    const source = new EventSource("/api/events");
    events = source;
    events.onopen = () => {
      const reconnected = attempts > 0 || dom.connectionStatus?.classList.contains("offline");
      attempts = 0;
      setConnectionStatus(true);
      // Events sent while the stream was down are gone; re-read what they
      // would have updated.
      if (reconnected) {
        refreshRequests().catch(() => {});
        refreshUndo();
      }
      // A server restart can interrupt a local Codex process without emitting
      // its final chat event. Re-read persisted state as soon as SSE reconnects
      // so the UI never keeps showing a stale "working" indicator.
      refreshChat({ scroll: false }).catch(() => {});
      api("/api/structure/plan").then((plan) => {
        state.structurePlan = plan;
        if (plan?.proposal) state.structureProposal = plan.proposal;
        state.outlinePreview = structurePlanShowsPreview(plan);
        renderStructurePlanControls();
        renderOutline();
      }).catch(() => {});
    };
    events.addEventListener("compile", (event) => applyCompileState(JSON.parse(event.data)));
    events.addEventListener("undo", (event) => applyUndoStatus(JSON.parse(event.data)));
    events.addEventListener("request", () => refreshRequests());
    events.addEventListener("chat", () => {
      refreshChat({ scroll: !dom.codexChat.hidden });
    });
    events.addEventListener("structure-plan", (event) => {
      state.structurePlan = JSON.parse(event.data);
      if (state.structurePlan?.proposal) state.structureProposal = state.structurePlan.proposal;
      state.outlinePreview = structurePlanShowsPreview(state.structurePlan);
      renderProposedStructure();
      renderOutline();
    });
    events.addEventListener("document", (event) => {
      const value = JSON.parse(event.data);
      if (value.path !== state.document?.path || value.reason === "saved") return;
      state.externalChange = true;
      dom.externalChangeMessage.textContent = state.editing
        ? "The source changed while you were editing. Your text is still preserved here."
        : "The source changed outside this editor.";
      dom.externalKeep.hidden = !state.editing;
      dom.externalChange.hidden = false;
    });
    events.onerror = () => {
      if (events !== source) return;
      setConnectionStatus(false, "retrying");
      if (source.readyState === EventSource.CLOSED) {
        disconnect();
        scheduleReconnect();
      }
    };
  };
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) disconnect();
    else {
      attempts = 0;
      connect();
    }
  });
  window.addEventListener("pagehide", disconnect);
  connect();
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character]);
}

const AGENT_PROVIDER_STORAGE_KEY = "paper-pal.agentProvider";
const AGENT_MODEL_STORAGE_KEY = "paper-pal.agentModel";

function agentModelOptions(provider = state.agentProvider) {
  return agentProviderOptions().find((option) => option.id === provider)?.models || [];
}

// The model list belongs to the provider, so switching provider re-picks it.
function renderAgentModelPicker() {
  if (!dom.agentModel || !dom.agentModelPicker) return;
  const models = agentModelOptions();
  if (models.length < 2) {
    dom.agentModelPicker.hidden = true;
    state.agentModel = null;
    return;
  }
  dom.agentModelPicker.hidden = false;
  dom.agentModel.replaceChildren(...models.map((id) => {
    const element = document.createElement("option");
    element.value = id;
    element.textContent = id;
    return element;
  }));
  let stored = null;
  try {
    stored = localStorage.getItem(`${AGENT_MODEL_STORAGE_KEY}.${state.agentProvider}`);
  } catch {
    // A disabled store just means no remembered model.
  }
  const chosen = models.includes(stored) ? stored : models[0];
  state.agentModel = chosen;
  dom.agentModel.value = chosen;
}

function setAgentModel(model) {
  const models = agentModelOptions();
  state.agentModel = models.includes(model) ? model : models[0] || null;
  if (dom.agentModel && state.agentModel) dom.agentModel.value = state.agentModel;
  try {
    if (state.agentModel) {
      localStorage.setItem(`${AGENT_MODEL_STORAGE_KEY}.${state.agentProvider}`, state.agentModel);
    }
  } catch {
    // Not worth failing the app over.
  }
}

function agentProviderOptions() {
  return state.bootstrap?.agent?.providers || [];
}

function setAgentProvider(provider, { persist = true } = {}) {
  const options = agentProviderOptions();
  const chosen = options.some((option) => option.id === provider)
    ? provider
    : state.bootstrap?.agent?.provider || "codex";
  state.agentProvider = chosen;
  if (persist) {
    try {
      localStorage.setItem(AGENT_PROVIDER_STORAGE_KEY, chosen);
    } catch {
      // Private browsing or a disabled store is not worth failing the app over.
    }
  }
  if (dom.agentProvider) dom.agentProvider.value = chosen;
  renderAgentModelPicker();
  updateChatMetaLabel();
  applyProviderNameToChatCopy();
  renderAgentProviderMenu();
  updateAgentNotice();
  // The first-run explainer names the agent.
  const emptyState = dom.requestList?.querySelector(".comments-empty");
  if (emptyState && state.bootstrap) emptyState.replaceWith(createCommentsEmptyState());
  // So do the cards ("Continue with …", "Run …"); typed follow-ups survive.
  else if (state.document && dom.requestList?.querySelector(".request-card")) renderRequestLists();
}

// `available`, `reason` and `kind` are optional additions to a provider entry.
// A backend that does not send them means "available, kind unknown".
function providerIsAvailable(option) {
  return option?.available !== false;
}

function providerUnavailableReason(option) {
  return String(option?.reason || "").trim() || "Not set up on this machine yet.";
}

const PROVIDER_GROUPS = [
  { kind: "cli", label: "Command-line agents" },
  { kind: "api", label: "API providers" },
  { kind: null, label: "Other" },
];

function groupedAgentProviders() {
  const options = agentProviderOptions();
  const known = new Set(PROVIDER_GROUPS.map((group) => group.kind).filter(Boolean));
  const grouped = PROVIDER_GROUPS
    .map((group) => ({
      ...group,
      options: options.filter((option) => (known.has(option.kind) ? option.kind : null) === group.kind),
    }))
    .filter((group) => group.options.length);
  // With no kinds at all there is nothing to group by: one unlabelled list.
  if (grouped.length === 1 && grouped[0].kind === null) grouped[0].label = "";
  return grouped;
}

function setAgentProviderMenuOpen(open, { focus = true } = {}) {
  if (!dom.agentProviderMenu || !dom.agentProviderButton) return;
  dom.agentProviderMenu.hidden = !open;
  dom.agentProviderButton.setAttribute("aria-expanded", String(open));
  if (!focus) return;
  if (open) {
    const items = [...dom.agentProviderMenu.querySelectorAll(".menu-item")];
    (items.find((item) => item.getAttribute("aria-selected") === "true") || items[0])?.focus();
  } else {
    dom.agentProviderButton.focus();
  }
}

function renderAgentProviderMenu() {
  if (!dom.agentProviderMenu || !dom.agentProviderButton) return;
  const current = agentProviderOptions().find((option) => option.id === state.agentProvider);
  dom.agentProviderCurrent.textContent = current?.label || "Agent";
  dom.agentProviderButton.classList.toggle("is-unavailable", Boolean(current) && !providerIsAvailable(current));
  dom.agentProviderButton.title = current && !providerIsAvailable(current)
    ? `${current.label} is not ready: ${providerUnavailableReason(current)}`
    : current?.model || "";
  dom.agentProviderMenu.replaceChildren(...groupedAgentProviders().map((group) => {
    const section = document.createElement("div");
    section.className = "menu-group";
    section.setAttribute("role", "group");
    if (group.label) {
      const heading = document.createElement("p");
      heading.className = `menu-group-label${group.kind ? ` kind-${group.kind}` : ""}`;
      heading.textContent = group.label;
      section.setAttribute("aria-label", group.label);
      section.append(heading);
    }
    for (const option of group.options) {
      const available = providerIsAvailable(option);
      const item = document.createElement("button");
      item.type = "button";
      item.className = "menu-item";
      item.setAttribute("role", "option");
      item.dataset.providerId = option.id;
      item.setAttribute("aria-selected", String(option.id === state.agentProvider));
      if (!available) item.setAttribute("aria-disabled", "true");
      const label = document.createElement("span");
      label.className = "menu-item-label";
      label.textContent = option.label || option.id;
      const meta = document.createElement("span");
      meta.className = "menu-item-meta";
      meta.textContent = available ? String(option.model || "") : "Not ready";
      item.append(label, meta);
      if (!available) {
        const help = document.createElement("span");
        help.className = "menu-item-help";
        help.textContent = providerUnavailableReason(option);
        item.append(help);
      }
      item.addEventListener("click", () => {
        if (!available) return;
        setAgentProviderMenuOpen(false);
        if (option.id === state.agentProvider) return;
        dom.agentProvider.value = option.id;
        dom.agentProvider.dispatchEvent(new Event("change", { bubbles: true }));
      });
      section.append(item);
    }
    return section;
  }));
}

// "Agent not ready": say so where the replies would have appeared.
function updateAgentNotice() {
  if (!dom.agentNotice) return;
  const agent = state.bootstrap?.agent;
  const current = agentProviderOptions().find((option) => option.id === state.agentProvider);
  let title = "";
  let detail = "";
  if (agent && agent.enabled === false) {
    title = "The AI agent is turned off";
    detail = "Comments are saved but not answered. Enable the agent in this project's configuration.";
  } else if (current && !providerIsAvailable(current)) {
    const others = agentProviderOptions().some((option) => option.id !== current.id && providerIsAvailable(option));
    title = `${current.label} is not ready`;
    detail = `${providerUnavailableReason(current)}${others && agent?.allowOverride !== false ? " Choose another agent in the top bar, or set this one up and reload." : ""}`;
  }
  dom.agentNotice.hidden = !title;
  dom.agentNoticeTitle.textContent = title;
  dom.agentNoticeDetail.textContent = detail;
}

function applyProviderNameToChatCopy() {
  const name = providerDisplayName(state.agentProvider);
  if (dom.codexChatInput) {
    dom.codexChatInput.placeholder = `Message ${name} about this project…`;
    dom.codexChatInput.setAttribute("aria-label", `Message ${name}`);
  }
  const empty = document.querySelector(".codex-chat-empty p");
  if (empty) {
    empty.textContent = `${providerDisplayNameStart()} can inspect the whole project. Inline comments remain the place for reviewable manuscript edits.`;
  }
}

function updateChatMetaLabel() {
  const chatConfig = state.bootstrap?.chat;
  if (!chatConfig || !dom.codexChatModel) return;
  const option = agentProviderOptions().find((item) => item.id === state.agentProvider);
  const parallel = Number(chatConfig.concurrency) > 1 ? ` · up to ${chatConfig.concurrency} parallel` : "";
  // Everything shown here comes from the server: the picked model, else the
  // provider's configured chat model, plus the configured reasoning effort.
  const model = state.agentModel || option?.model || chatConfig.model || "";
  dom.codexChatModel.textContent = `${[model, chatEffortLabel()].filter(Boolean).join(" · ")}${parallel}`;
}

function initAgentProvider() {
  const agent = state.bootstrap?.agent;
  if (!dom.agentProvider) return;
  if (!agent || agent.allowOverride === false || agentProviderOptions().length < 2) {
    if (dom.agentPicker) dom.agentPicker.hidden = true;
    state.agentProvider = agent?.provider || "codex";
    renderAgentModelPicker();
    updateChatMetaLabel();
    applyProviderNameToChatCopy();
    updateAgentNotice();
    return;
  }
  if (dom.agentPicker) dom.agentPicker.hidden = false;
  dom.agentProvider.replaceChildren(...agentProviderOptions().map((option) => {
    const element = document.createElement("option");
    element.value = option.id;
    element.textContent = option.label;
    element.title = option.model;
    return element;
  }));
  if (dom.agentProviderButton && dom.agentProviderMenu) {
    dom.agentProviderButton.addEventListener("click", () => setAgentProviderMenuOpen(dom.agentProviderMenu.hidden));
    dom.agentProviderButton.addEventListener("keydown", (event) => {
      if (!["ArrowDown", "ArrowUp"].includes(event.key)) return;
      event.preventDefault();
      setAgentProviderMenuOpen(true);
    });
    dom.agentProviderMenu.addEventListener("keydown", (event) => {
      const items = [...dom.agentProviderMenu.querySelectorAll(".menu-item")];
      const index = items.indexOf(document.activeElement);
      if (event.key === "Escape") {
        // Handled here so the global Escape chain does not also close a pane.
        event.preventDefault();
        event.stopPropagation();
        setAgentProviderMenuOpen(false);
      } else if (event.key === "Tab") {
        setAgentProviderMenuOpen(false, { focus: false });
      } else if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key) && items.length) {
        event.preventDefault();
        const next = event.key === "Home" ? 0
          : event.key === "End" ? items.length - 1
            : (index + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
        items[next].focus();
      }
    });
    document.addEventListener("pointerdown", (event) => {
      if (dom.agentProviderMenu.hidden) return;
      if (event.target instanceof Element && event.target.closest("#agent-picker")) return;
      setAgentProviderMenuOpen(false, { focus: false });
    });
  }
  let stored = null;
  try {
    stored = localStorage.getItem(AGENT_PROVIDER_STORAGE_KEY);
  } catch {
    stored = null;
  }
  setAgentProvider(stored || agent.provider, { persist: false });
  dom.agentProvider.addEventListener("change", (event) => {
    setAgentProvider(event.target.value);
    showToast(`New comments and chat turns will use ${providerDisplayName(event.target.value)}.`, 3200);
  });
  if (dom.agentModel) {
    dom.agentModel.addEventListener("change", (event) => {
      setAgentModel(event.target.value);
    });
  }
}

// The agent is user-selectable, so copy never hard-codes a product name.
// Falls back to neutral wording when the provider is unknown.
function providerDisplayName(provider = state.agentProvider) {
  const id = provider || state.agentProvider;
  return agentProviderOptions().find((option) => option.id === id)?.label || "the agent";
}

// Same name, for the start of a sentence.
function providerDisplayNameStart(provider = state.agentProvider) {
  const name = providerDisplayName(provider);
  return name.charAt(0).toUpperCase() + name.slice(1);
}

function chatEffortLabel() {
  const effort = String(state.bootstrap?.chat?.reasoningEffort || "").trim();
  return effort ? `${effort} effort` : "";
}

async function start() {
  try {
    migrateLegacyStorage();
    loadSidePaneWidths();
    applyOutlinePaneWidth();
    applySidePaneWidth("comments");
    state.bootstrap = await api("/api/bootstrap");
    state.structurePlan = state.bootstrap.structurePlan;
    if (state.structurePlan?.proposal) {
      state.structureProposal = state.structurePlan.proposal;
      state.outlinePreview = structurePlanShowsPreview(state.structurePlan);
    }
    applyUndoStatus(state.bootstrap.undo);
    initAgentProvider();
    dom.productTitle.textContent = state.bootstrap.title || "Untitled project";
    dom.productTitle.title = dom.productTitle.textContent;
    dom.projectLabel.textContent = state.bootstrap.projectLabel || "Local LaTeX project";
    if (state.bootstrap.chat?.enabled === false) {
      dom.openCodexChat.disabled = true;
      dom.openCodexChat.title = "The AI agent is disabled in this project's configuration.";
      dom.askCommentInChat.disabled = true;
    }
    if (state.bootstrap.latex?.enabled === false) {
      dom.compileButton.disabled = true;
      dom.compileButton.title = "PDF compilation is disabled in this project's configuration.";
      dom.previewButton.disabled = !state.bootstrap.pdfExists;
    }
    document.title = state.bootstrap.title ? `${state.bootstrap.title} · Paper Pal` : "Paper Pal";
    for (const documentInfo of state.bootstrap.documents) {
      const option = document.createElement("option");
      option.value = documentInfo.path;
      option.textContent = documentInfo.label;
      dom.documentSelect.append(option);
    }
    const initial = state.bootstrap.documents.some((item) => item.path === state.bootstrap.initialDocument)
      ? state.bootstrap.initialDocument
      : state.bootstrap.documents[0]?.path;
    if (!initial) throw new Error("No LaTeX or Markdown documents were found.");
    applyCompileState(state.bootstrap.compile);
    // The document, the comments and the outline all feed one render; hold it
    // until every piece has arrived instead of rendering (and typesetting every
    // formula) three times.
    state.suppressRender = true;
    try {
      await Promise.all([
        loadDocument(initial),
        refreshRequests(),
        refreshGit(),
        refreshCompiledOutline({ render: false }),
        ...(state.structureProposal ? [loadStructure({ force: true }).catch(() => {})] : []),
      ]);
    } finally {
      state.suppressRender = false;
    }
    renderDocument();
    renderStructurePlanControls();
    connectEvents();
  } catch (error) {
    dom.editor.innerHTML = `<div class="loading-card">${escapeHtml(error.message)}</div>`;
    showToast(error.message, 6000);
  }
}

document.addEventListener("selectionchange", () => {
  clearTimeout(showSelectionToolbar.timer);
  showSelectionToolbar.timer = setTimeout(() => {
    showSelectionToolbar();
    flushPendingRender();
  }, 80);
});
dom.editor.addEventListener("focusout", () => setTimeout(flushPendingRender, 0));
document.addEventListener("pointerdown", (event) => {
  state.lastPointerInEditorPane = event.target instanceof Element && Boolean(event.target.closest(".editor-pane"));
}, true);

// Cmd/Ctrl+Z here is a server-side undo: it can revert an accepted proposal in
// another file. It therefore only fires while the author is demonstrably
// working in the manuscript pane and not typing anywhere; everywhere else the
// key keeps its native meaning and the Undo button remains the explicit route.
function shortcutUndoAllowed(event) {
  if (!state.undo?.available) return false;
  const target = event.target instanceof Element ? event.target : null;
  if (target?.closest("textarea, input, select, [contenteditable='true'], .editor-block.is-editing")) return false;
  if (!dom.commentComposer.hidden || !dom.paperPreview.hidden) return false;
  const active = document.activeElement;
  if (active && active !== document.body) return Boolean(active.closest(".editor-pane"));
  return state.lastPointerInEditorPane;
}

document.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey && event.key.toLowerCase() === "z") {
    if (shortcutUndoAllowed(event)) {
      event.preventDefault();
      undoLastAction();
    }
    return;
  }
  if (event.key !== "Escape" || event.isComposing || event.keyCode === 229) return;
  // Close whatever is on top first.
  if (!dom.commentComposer.hidden) closeCommentComposer();
  else if (!dom.selectionToolbar.hidden) {
    window.getSelection()?.removeAllRanges();
    dom.selectionToolbar.hidden = true;
  } else if (!dom.paperPreview.hidden) closePaperPreview();
  else if (dom.referenceManager.open) dom.referenceManager.open = false;
  else if (!dom.codexChat.hidden && !dom.codexChatList.hidden) setChatListOpen(false);
  else if (!dom.codexChat.hidden) closeCodexChat();
});

// Comments / Chat behave as a real tablist: arrow keys move between the tabs
// and only the selected tab sits in the Tab order.
function syncSidePaneTabStops() {
  for (const tab of [dom.showCommentsPane, dom.openCodexChat]) {
    tab.tabIndex = tab.getAttribute("aria-selected") === "true" ? 0 : -1;
  }
}
for (const tab of [dom.showCommentsPane, dom.openCodexChat]) {
  tab.addEventListener("keydown", (event) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    const tabs = [dom.showCommentsPane, dom.openCodexChat].filter((item) => !item.disabled);
    if (tabs.length < 2) return;
    event.preventDefault();
    const current = tabs.indexOf(event.currentTarget);
    const next = event.key === "Home" ? 0
      : event.key === "End" ? tabs.length - 1
        : (current + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
    tabs[next].focus();
    tabs[next].click();
  });
}
syncSidePaneTabStops();

// Theme: light | dark | system, saved as "paper-pal.theme". <head> applies the
// saved choice before first paint; this keeps it in sync afterwards.
const THEME_STORAGE_KEY = "paper-pal.theme";
const THEME_CHOICES = ["system", "light", "dark"];
const systemDarkQuery = window.matchMedia?.("(prefers-color-scheme: dark)") || null;

function currentThemeChoice() {
  const choice = document.documentElement.dataset.themeChoice;
  return THEME_CHOICES.includes(choice) ? choice : "system";
}

function applyTheme(choice, { persist = false } = {}) {
  const next = THEME_CHOICES.includes(choice) ? choice : "system";
  const dark = next === "dark" || (next === "system" && Boolean(systemDarkQuery?.matches));
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  document.documentElement.dataset.themeChoice = next;
  if (persist) {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // The theme still applies for this visit.
    }
  }
  if (dom.themeToggle) {
    const label = `Theme: ${next}${next === "system" ? ` (${dark ? "dark" : "light"} now)` : ""}`;
    dom.themeToggle.dataset.themeChoice = next;
    dom.themeToggle.title = label;
    dom.themeToggle.setAttribute("aria-label", label);
  }
  for (const item of dom.themeMenu?.querySelectorAll("[data-theme-value]") || []) {
    item.setAttribute("aria-checked", String(item.dataset.themeValue === next));
  }
  const systemNow = dom.themeMenu?.querySelector("[data-theme-system-now]");
  if (systemNow) systemNow.textContent = systemDarkQuery ? (systemDarkQuery.matches ? "Dark now" : "Light now") : "";
}

function setThemeMenuOpen(open, { focus = true } = {}) {
  if (!dom.themeMenu || !dom.themeToggle) return;
  dom.themeMenu.hidden = !open;
  dom.themeToggle.setAttribute("aria-expanded", String(open));
  if (!focus) return;
  if (open) {
    const items = [...dom.themeMenu.querySelectorAll(".menu-item")];
    (items.find((item) => item.getAttribute("aria-checked") === "true") || items[0])?.focus();
  } else {
    dom.themeToggle.focus();
  }
}

applyTheme(currentThemeChoice());
if (dom.themeToggle && dom.themeMenu) {
  dom.themeToggle.addEventListener("click", () => setThemeMenuOpen(dom.themeMenu.hidden));
  dom.themeToggle.addEventListener("keydown", (event) => {
    if (!["ArrowDown", "ArrowUp"].includes(event.key)) return;
    event.preventDefault();
    setThemeMenuOpen(true);
  });
  for (const item of dom.themeMenu.querySelectorAll("[data-theme-value]")) {
    item.addEventListener("click", () => {
      applyTheme(item.dataset.themeValue, { persist: true });
      setThemeMenuOpen(false);
    });
  }
  dom.themeMenu.addEventListener("keydown", (event) => {
    const items = [...dom.themeMenu.querySelectorAll(".menu-item")];
    const index = items.indexOf(document.activeElement);
    if (event.key === "Escape") {
      // Handled here so the global Escape chain does not also close a pane.
      event.preventDefault();
      event.stopPropagation();
      setThemeMenuOpen(false);
    } else if (event.key === "Tab") {
      setThemeMenuOpen(false, { focus: false });
    } else if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      const next = event.key === "Home" ? 0
        : event.key === "End" ? items.length - 1
          : (index + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
      items[next].focus();
    }
  });
  document.addEventListener("pointerdown", (event) => {
    if (dom.themeMenu.hidden) return;
    if (event.target instanceof Element && event.target.closest("#theme-picker")) return;
    setThemeMenuOpen(false, { focus: false });
  });
}
systemDarkQuery?.addEventListener?.("change", () => {
  if (currentThemeChoice() === "system") applyTheme("system");
});

dom.documentSelect.addEventListener("change", () => loadDocument(dom.documentSelect.value));
dom.showTextWorkspace.addEventListener("click", () => setWorkspaceMode("text"));
dom.showStructureWorkspace.addEventListener("click", () => setWorkspaceMode("structure"));
dom.selectMainSections.addEventListener("click", () => {
  const main = (state.structure?.sections || []).filter((section) => !section.appendix);
  const allSelected = main.length && main.every((section) => state.structureSelected.has(section.id));
  state.structureSelected = allSelected ? new Set() : new Set(main.map((section) => section.id));
  state.structureProposal = null;
  renderCurrentStructure();
  renderProposedStructure();
  updateStructureControls();
});
dom.discussStructure.addEventListener("click", () => sendStructurePrompt("discuss"));
dom.generateStructure.addEventListener("click", () => sendStructurePrompt("generate"));
dom.confirmStructure.addEventListener("click", confirmCurrentStructure);
dom.revertStructure.addEventListener("click", revertCurrentStructure);
dom.outlineModeToggle.addEventListener("click", () => {
  state.outlinePreview = !state.outlinePreview;
  renderStructurePlanControls();
  renderOutline();
});
dom.undoButton.addEventListener("click", undoLastAction);
dom.toggleSectionReview.addEventListener("click", () => {
  setCurrentSectionReviewStatus(dom.toggleSectionReview.dataset.status || "confirmed");
});
dom.editorPane.addEventListener("scroll", syncOutlineFromScroll, { passive: true });
dom.editorPane.addEventListener("scroll", positionCommentCards, { passive: true });
window.addEventListener("resize", () => {
  applyOutlinePaneWidth();
  applySidePaneWidth();
}, { passive: true });
dom.reloadButton.addEventListener("click", async () => {
  if (!state.document?.path) {
    window.location.reload();
    return;
  }
  // Pending edits are written first, so Reload can never lose typed text. If
  // that save is blocked by a conflict the banner offers "Use disk version".
  const loaded = await loadDocument(state.document.path, { quiet: true });
  if (loaded) showToast("Reloaded from disk.");
  else if (state.saveConflict) dom.externalChange.hidden = false;
});
dom.saveButton.addEventListener("click", () => {
  if (state.saveConflict) {
    dom.externalChange.hidden = false;
    return;
  }
  flushSave();
});
dom.confirmSelection.addEventListener("click", confirmCurrentSelection);
dom.commentSelection.addEventListener("click", openCommentComposer);
dom.closeComment.addEventListener("click", closeCommentComposer);
dom.cancelComment.addEventListener("click", closeCommentComposer);
dom.askCommentInChat.addEventListener("click", askCommentQuestionInChat);
if (dom.rewriteScope) dom.rewriteScope.addEventListener("change", updateScopeHint);
if (dom.reviewSection) dom.reviewSection.addEventListener("click", runSectionReview);
if (dom.reviewPanelClose) {
  dom.reviewPanelClose.addEventListener("click", () => { dom.reviewPanel.hidden = true; });
}
dom.submitComment.addEventListener("click", () => submitComment());
dom.findLinked.addEventListener("click", () => submitComment({ responseMode: "link" }));
dom.openCodexChat.addEventListener("click", openCodexChat);
dom.showCommentsPane.addEventListener("click", closeCodexChat);
dom.closeCodexChat.addEventListener("click", closeCodexChat);
dom.reviewPaneResizer.addEventListener("pointerdown", beginSidePaneResize);
window.addEventListener("pointermove", moveSidePaneResize);
window.addEventListener("pointerup", finishSidePaneResize);
window.addEventListener("pointercancel", finishSidePaneResize);
dom.reviewPaneResizer.addEventListener("lostpointercapture", finishSidePaneResize);
dom.reviewPaneResizer.addEventListener("keydown", handleSidePaneResizeKey);
dom.reviewPaneResizer.addEventListener("dblclick", () => {
  resetSidePaneWidth();
  showToast("Sidebar width reset.");
});
dom.outlinePaneResizer.addEventListener("pointerdown", beginOutlinePaneResize);
window.addEventListener("pointermove", moveOutlinePaneResize);
window.addEventListener("pointerup", finishOutlinePaneResize);
window.addEventListener("pointercancel", finishOutlinePaneResize);
dom.outlinePaneResizer.addEventListener("lostpointercapture", finishOutlinePaneResize);
dom.outlinePaneResizer.addEventListener("keydown", handleOutlinePaneResizeKey);
dom.outlinePaneResizer.addEventListener("dblclick", () => {
  resetOutlinePaneWidth();
  showToast("Outline width reset.");
});
window.addEventListener("blur", () => {
  finishSidePaneResize();
  finishOutlinePaneResize();
});
dom.newCodexChat.addEventListener("click", startNewCodexChat);
dom.toggleChatList.addEventListener("click", () => setChatListOpen(dom.codexChatList.hidden));
dom.sendCodexChat.addEventListener("click", sendCodexChatMessage);
dom.stopCodexChat.addEventListener("click", stopCodexChat);
dom.codexChatInput.addEventListener("compositionstart", () => {
  state.chatComposing = true;
});
dom.codexChatInput.addEventListener("compositionend", () => {
  state.chatComposing = false;
  state.chatCompositionEndedAt = Date.now();
});
dom.codexChatInput.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" || event.shiftKey) return;
  // Enter confirms an IME candidate while composing Chinese/Japanese/Korean.
  // Safari may report isComposing=false on the key event immediately after
  // compositionend, so keep a short grace window as well.
  if (event.isComposing || state.chatComposing || event.keyCode === 229 || Date.now() - state.chatCompositionEndedAt < 120) return;
  event.preventDefault();
  sendCodexChatMessage();
});
dom.refreshGit.addEventListener("click", refreshGit);
dom.compileButton.addEventListener("click", compilePdf);
dom.previewButton.addEventListener("click", () => {
  if (!dom.paperPreview.hidden && state.paperPreviewMode === "compiled") {
    closePaperPreview();
    return;
  }
  dom.previewButton.classList.add("is-active");
  dom.previewButton.setAttribute("aria-pressed", "true");
  openCompiledPdfPreview();
});
dom.externalKeep.addEventListener("click", () => flushSave({ force: true }));
dom.externalReload.addEventListener("click", () => {
  if (state.document?.path) loadDocument(state.document.path, { discardEditing: true });
});
dom.referenceSearch.addEventListener("input", () => renderReferenceList(dom.referenceSearch.value));
dom.paperPreviewSizeToggle.addEventListener("click", () => setPaperPreviewExpanded(!state.paperPreviewExpanded));
dom.closePaperPreview.addEventListener("click", closePaperPreview);
window.addEventListener("beforeunload", (event) => {
  if (!state.editing && !state.proposalEditing && !state.savePromise) return;
  event.preventDefault();
  event.returnValue = "";
});

setInterval(() => {
  if (document.hidden || dom.codexChat.hidden) return;
  const mayBeWorking = ["queued", "running"].includes(state.chat?.status) ||
    state.chats.some((item) => ["queued", "running"].includes(item.status));
  if (mayBeWorking) refreshChat({ scroll: false }).catch(() => {});
}, 5000);

start();
