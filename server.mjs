import { createHash, randomBytes } from "node:crypto";
import { execFile, spawn } from "node:child_process";
import { existsSync, promises as fs, realpathSync, watch } from "node:fs";
import { createServer } from "node:http";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { buildRelatedCommentContext } from "./agent-context.mjs";
import {
  AGENT_PROVIDERS,
  buildAgentInvocation,
  captureAgentOutput,
  childEnvironment,
  describeProvider,
  normalizeProvider,
  providerCapabilities,
  providerLabel,
  providerModel,
  providerModelChoices as configuredModelChoices,
  redactSecrets,
  rememberConfig,
  resolveExecutable,
  spawnPlan,
} from "./agent-providers.mjs";
import { isInside, loadReviewConfig } from "./config.mjs";
import { loadEnvFile } from "./env.mjs";
import {
  APP_ID, APP_NAME, CONFIG_NAME, ENV, TEMP_PREFIX, appVersion, hostFromEnvironment, resolveStateDir,
} from "./names.mjs";


const appRoot = path.dirname(fileURLToPath(import.meta.url));
// API keys and app-local switches come from <appRoot>/.env (never from the
// project directory). Variables already set in the shell win.
loadEnvFile(appRoot);
// A missing or invalid configuration is the most common first-run mistake: say
// what to do in plain words, without a stack trace around it.
const { repoRoot, configPath, config, port } = await loadReviewConfig({ appRoot }).catch((error) => {
  console.error(`${APP_NAME} could not start.\n${error instanceof Error ? error.message : error}`);
  process.exit(1);
});
rememberConfig(config);
// Only the app-specific variable is honoured. Many shells and CI images export
// a generic HOST=<machine name>, which would silently expose this
// unauthenticated server on the network.
// PAPER_PAL_HOST, or DRAFT_REVIEW_HOST from before the rename.
const host = hostFromEnvironment(process.env);
const loopbackHosts = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);
const hostIsLoopback = loopbackHosts.has(host);
const publicRoot = path.join(appRoot, "public");
const sourceRoot = path.resolve(repoRoot, config.sourceRoot);
// .paper-pal/, unless the project still has only a pre-rename .draft-review/.
const reviewRoot = resolveStateDir(repoRoot);
const statePath = path.join(reviewRoot, "state.json");
const undoPath = path.join(reviewRoot, "undo.json");
const requestsRoot = path.join(reviewRoot, "requests");
const codexRunsRoot = path.join(reviewRoot, "runs");
const chatRoot = path.join(reviewRoot, "chat");
const chatArchiveRoot = path.join(chatRoot, "sessions");
const chatSessionPath = path.join(chatRoot, "current.json");
const structurePlanPath = path.join(reviewRoot, "structure-plan.json");
const allowedExtensions = new Set([".tex", ".md", ".bib"]);
const requestIdPattern = /^rw_[A-Za-z0-9_]{1,120}$/;
const chatIdPattern = /^chat_[A-Za-z0-9_-]+$/;
const sseClients = new Set();
const recentWrites = new Map();

await Promise.all([
  fs.mkdir(requestsRoot, { recursive: true }),
  fs.mkdir(codexRunsRoot, { recursive: true }),
  fs.mkdir(chatArchiveRoot, { recursive: true }),
]);
// The state directory holds chats, traces and review history. Make sure it can
// never be committed by accident, even when setup was skipped.
try {
  await fs.writeFile(path.join(reviewRoot, ".gitignore"), "*\n", { encoding: "utf8", flag: "wx" });
} catch (error) {
  if (error?.code !== "EEXIST") console.warn(`Could not write ${path.join(path.basename(reviewRoot), ".gitignore")}: ${error.message}`);
}
const realRepoRoot = realpathSync(repoRoot);
const realSourceRoot = realpathSync(sourceRoot);

let compileState = {
  status: "idle",
  startedAt: null,
  finishedAt: null,
  exitCode: null,
  log: "",
  pdfVersion: Date.now(),
};
let compileTimer = null;
const codexRuns = new Map();
const codexQueue = [];
const cancelledCodexRequests = new Set();
let codexQueueRunning = false;
let activeCodexChild = null;
let activeCodexRequestId = null;
let currentChatSessionId = null;
const chatQueue = [];
const activeChatRuns = new Map();
const maxConcurrentChatTurns = Math.max(1, Number(config.codex?.chatConcurrency) || 1);
let chatQueueDraining = false;
const proposalSchemaPath = path.join(appRoot, "schemas", "proposal-output.schema.json");
const discussionSchemaPath = path.join(appRoot, "schemas", "discussion-output.schema.json");
const linkSchemaPath = path.join(appRoot, "schemas", "link-output.schema.json");
const reviewSchemaPath = path.join(appRoot, "schemas", "review-output.schema.json");
const defaultProvider = normalizeProvider(config.agent?.provider, "codex");

// A request or chat session may name the agent it wants. Honour it only when
// the project allows overrides, so a shared configuration can pin one provider.
function resolveProvider(requested) {
  if (!requested || config.agent?.allowOverride === false) return defaultProvider;
  return normalizeProvider(requested, defaultProvider);
}

// Models a provider may be switched to from the UI. The configured default is
// always allowed; anything else must be listed, so a request body cannot name
// an arbitrary model.
function providerModelChoices(provider) {
  return configuredModelChoices(provider, config);
}

// One sentence explaining why a provider cannot run, as an error the UI shows.
function assertProviderReady(provider) {
  const state = describeProvider(provider, config);
  if (!state.available) throw new HttpError(409, `${state.label} is not ready. ${state.reason}`);
}

function providerSummaries() {
  return AGENT_PROVIDERS.map((id) => describeProvider(id, config));
}

function latexAvailable() {
  return config.latex?.enabled !== false && Boolean(resolveExecutable(config.latex.command));
}

function resolveModel(provider, requested) {
  const fallback = providerModel(provider, config);
  if (!requested || config.agent?.allowOverride === false) return fallback;
  const candidate = String(requested);
  return providerModelChoices(provider).includes(candidate) ? candidate : fallback;
}

function sha(value) {
  return createHash("sha256").update(value).digest("hex");
}

function relativeRepo(absolutePath) {
  return path.relative(repoRoot, absolutePath).split(path.sep).join("/");
}

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// Lexical containment plus a realpath re-check, so a symlink inside the source
// root cannot be used to read or write a file outside it. A path that does not
// exist yet is checked through its nearest existing ancestor.
function realPathInside(realParent, absolutePath) {
  let probe = absolutePath;
  for (;;) {
    try {
      const real = realpathSync(probe);
      return isInside(realParent, path.join(real, path.relative(probe, absolutePath)));
    } catch (error) {
      if (error?.code !== "ENOENT" && error?.code !== "ENOTDIR") return false;
      const parent = path.dirname(probe);
      if (parent === probe) return false;
      probe = parent;
    }
  }
}

function insideSourceRoot(absolutePath) {
  return isInside(sourceRoot, absolutePath) && realPathInside(realSourceRoot, absolutePath);
}

function resolveDocument(relativePath) {
  if (!relativePath || typeof relativePath !== "string") {
    throw new HttpError(400, "A document path is required.");
  }
  const absolutePath = path.resolve(repoRoot, relativePath);
  if (!insideSourceRoot(absolutePath)) {
    throw new HttpError(403, "Document is outside the configured source root.");
  }
  if (!allowedExtensions.has(path.extname(absolutePath).toLowerCase())) {
    throw new HttpError(400, "Unsupported document type.");
  }
  return absolutePath;
}

// Write-temp-then-rename. The temp name is random, so two writers can never
// share it. When the target is a symlink the link is kept and its target is
// replaced (callers have already checked the target stays inside the project);
// the previous file mode is carried over.
async function atomicWrite(target, text) {
  let destination = target;
  let mode = null;
  try {
    destination = await fs.realpath(target);
    mode = (await fs.stat(destination)).mode & 0o7777;
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  const temporary = `${destination}.${APP_ID}-${process.pid}-${randomBytes(6).toString("hex")}.tmp`;
  try {
    await fs.writeFile(temporary, text, { encoding: "utf8", ...(mode === null ? {} : { mode }) });
    if (mode !== null) await fs.chmod(temporary, mode);
    await fs.rename(temporary, destination);
  } catch (error) {
    await fs.rm(temporary, { force: true }).catch(() => {});
    throw error;
  }
}

// Every manuscript write made by this app goes through here, so the change
// watcher can tell its own writes from edits made in another program.
const sourceSignatures = new Map();

async function fileSignature(absolutePath) {
  try {
    const stat = await fs.stat(absolutePath);
    return stat.isFile() ? `${stat.mtimeMs}:${stat.size}` : null;
  } catch {
    return null;
  }
}

// Source is read as UTF-8 text and written back whole, so a file in another
// encoding (Latin-1, Windows-1252) would come back with every non-ASCII byte
// turned into U+FFFD, in blocks the author never touched. Such a file is
// read-only: it is shown with the lossy decoding and never written. A BOM is
// valid UTF-8 and survives, because readFile keeps it in the text.
function sourceEncoding(bytes) {
  const decodes = (length, stream) => {
    try {
      new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, length), { stream });
      return true;
    } catch {
      return false;
    }
  };
  if (decodes(bytes.length, false)) return { valid: true };
  // The shortest prefix that no longer decodes ends on the line of the first bad byte.
  let low = 0;
  let high = bytes.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (decodes(middle + 1, true)) low = middle + 1;
    else high = middle;
  }
  const offset = Math.min(low, bytes.length - 1);
  let line = 1;
  for (let index = 0; index < offset; index += 1) if (bytes[index] === 0x0a) line += 1;
  return {
    valid: false,
    line,
    reason: `Line ${line} contains bytes that are not valid UTF-8.`,
  };
}

function notUtf8Message(relativePath) {
  const name = path.basename(relativePath);
  const converted = name.replace(/(\.[^.]*)?$/, ".utf8$1");
  return `This file is not UTF-8, so Paper Pal will not modify it. Convert it to UTF-8 to edit: iconv -f latin1 -t utf-8 ${name} > ${converted}`;
}

async function readSourceEncoding(relativePath) {
  let bytes;
  try {
    bytes = await fs.readFile(resolveDocument(relativePath));
  } catch (error) {
    // A file that does not exist yet has no bytes to damage.
    if (error?.code === "ENOENT") return { valid: true };
    throw error;
  }
  return sourceEncoding(bytes);
}

// Call this for every target before the first write of a multi-file action,
// so the action is refused as a whole. writeSource checks again on its own.
async function assertSourcesWritable(relativePaths) {
  for (const relativePath of new Set(relativePaths)) {
    if (!(await readSourceEncoding(relativePath)).valid) throw new HttpError(409, notUtf8Message(relativePath));
  }
}

async function writeSource(relativePath, text) {
  const absolutePath = resolveDocument(relativePath);
  await assertSourcesWritable([relativePath]);
  // A lone surrogate (a selection that split an emoji) would be written as U+FFFD.
  if (typeof text !== "string" || !text.isWellFormed()) {
    throw new HttpError(422, "The new text contains half of a character pair (for example a split emoji), so it was not saved. Reload the document and try again.");
  }
  recentWrites.set(relativePath, Date.now());
  await atomicWrite(absolutePath, text);
  recentWrites.set(relativePath, Date.now());
  sourceSignatures.set(relativePath, await fileSignature(absolutePath));
}

// One async mutex per key. Every read-modify-write of the review state files
// (state.json, undo.json, requests/*.json, chat sessions, the structure plan)
// runs under the single "project" key, so an agent run finishing while the
// author clicks cannot lose either update. Not re-entrant: take it at the
// outermost caller only.
const lockTails = new Map();
function withLock(key, task) {
  const previous = lockTails.get(key) || Promise.resolve();
  const run = previous.then(task, task);
  const tail = run.then(() => {}, () => {});
  lockTails.set(key, tail);
  tail.then(() => {
    if (lockTails.get(key) === tail) lockTails.delete(key);
  });
  return run;
}
const withProjectLock = (task) => withLock("project", task);

async function readState() {
  try {
    const parsed = JSON.parse(await fs.readFile(statePath, "utf8"));
    return {
      version: 1,
      selections: Array.isArray(parsed.selections) ? parsed.selections : [],
      paragraphs: parsed.paragraphs && typeof parsed.paragraphs === "object" ? parsed.paragraphs : {},
    };
  } catch {
    return { version: 1, selections: [], paragraphs: {} };
  }
}

async function writeState(state) {
  await atomicWrite(statePath, `${JSON.stringify(state, null, 2)}\n`);
}

async function readUndoStack() {
  try {
    const parsed = JSON.parse(await fs.readFile(undoPath, "utf8"));
    return Array.isArray(parsed.actions) ? parsed.actions : [];
  } catch {
    return [];
  }
}

async function writeUndoStack(actions) {
  await atomicWrite(undoPath, `${JSON.stringify({ version: 1, actions: actions.slice(-50) }, null, 2)}\n`);
}

function reviewStateSnapshot(state, relativePath) {
  return {
    selections: state.selections.filter((item) => item.path === relativePath),
    paragraphs: structuredClone(state.paragraphs[relativePath] || {}),
  };
}

function restoreReviewStateSnapshot(state, relativePath, snapshot) {
  state.selections = state.selections.filter((item) => item.path !== relativePath);
  state.selections.push(...structuredClone(snapshot?.selections || []));
  if (snapshot?.paragraphs && Object.keys(snapshot.paragraphs).length) {
    state.paragraphs[relativePath] = structuredClone(snapshot.paragraphs);
  } else delete state.paragraphs[relativePath];
}

function sameSnapshot(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

async function undoStatus() {
  const actions = await readUndoStack();
  const action = actions.at(-1) || null;
  return {
    available: Boolean(action),
    label: action?.label || null,
    kind: action?.kind || null,
    path: action?.path || null,
    createdAt: action?.createdAt || null,
    depth: actions.length,
  };
}

async function pushUndoAction(action) {
  const actions = await readUndoStack();
  actions.push({
    id: `undo_${Date.now()}_${randomBytes(3).toString("hex")}`,
    createdAt: new Date().toISOString(),
    ...action,
  });
  await writeUndoStack(actions);
  emit("undo", await undoStatus());
}

// A sectioning command up to the brace that opens its title. The optional
// short title of \section[short]{long} is skipped: the long title is the text
// the author reads and edits, the short one stays untouched in the source.
const HEADING_OPEN_PATTERN = /^\s*\\(?:section|subsection|subsubsection|paragraph|subparagraph)\*?\s*(?:\[[^\]\n]*\]\s*)?\{/i;
const HEADING_COMMAND_PATTERN = /^\\(section|subsection|subsubsection|paragraph|subparagraph)\*?\s*(?:\[[^\]\n]*\]\s*)?\{/i;

// Environments whose \begin/\end lines are wrappers around ordinary prose: the
// wrapper becomes its own hidden block and the text inside is parsed normally,
// so an inline abstract and every \item of a list are visible and editable.
const PROSE_WRAPPERS = "abstract|itemize|enumerate|description";
const LIST_WRAPPERS = new Set(["itemize", "enumerate", "description"]);
// Wrappers that only group text (no label of their own in the page).
const TRANSPARENT_WRAPPERS = "approvedcontent|draftcontent|subequations|sloppypar|appendices|flushleft|flushright|multicols\\*?|spacing|CJK\\*?";
// Wrappers the page labels or sets apart: quotations, centred text, keywords,
// acknowledgements and the usual theorem-like names. \newtheorem declarations
// in the same file add to this list (see declaredTheoremNames).
const LABELLED_WRAPPERS = "quote|quotation|verse|center|keywords|IEEEkeywords|keyword|ack|acks|acknowledgments|acknowledgements|acknowledgement|acknowledgment|credits"
  + "|theorem|lemma|proposition|corollary|definition|proof|remark|example|claim|conjecture|assumption|observation|fact|note|notation|problem|exercise|solution|axiom|property|hypothesis"
  + "|thm|lem|prop|cor|defn|rem";
// \begin of these wrappers takes brace arguments that are layout, not prose.
const WRAPPER_BRACE_ARGUMENTS = { "cjk": 2, "cjk*": 2, "multicols": 1, "multicols*": 1, "spacing": 1 };

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// The patterns that cut wrapper lines out of the text around them, for the
// built-in wrapper names plus any theorem-like names the file declares.
function wrapperPatterns(extraNames = []) {
  const extra = extraNames.map(escapeRegExp).join("|");
  const names = `${PROSE_WRAPPERS}|${TRANSPARENT_WRAPPERS}|${LABELLED_WRAPPERS}${extra ? `|${extra}` : ""}`;
  const beginArguments = "(?:[ \\t]*\\[[^\\]\\n]*\\])?";
  return {
    begin: new RegExp(`^\\\\begin\\{(?:(?:CJK\\*?)\\}(?:\\{[^{}\\n]*\\}){0,2}|(?:multicols\\*?|spacing)\\}(?:\\{[^{}\\n]*\\})?|(?:${names})\\}${beginArguments})`, "i"),
    endLeading: new RegExp(`^\\\\end\\{(?:${names})\\}`, "i"),
    endTrailing: new RegExp(`\\\\end\\{(?:${names})\\}[ \\t]*(?:%[^\\n]*)?\\s*$`, "i"),
    // A whole block that is nothing but one wrapper line.
    line: new RegExp(`^\\\\(begin|end)\\{(${names})\\}(?:[ \\t]*\\[([^\\]\\n]*)\\])?(?:\\{[^{}\\n]*\\}){0,2}[ \\t]*(?:%[^\\n]*)?$`, "i"),
    // A line that begins one of these starts a new block even without a blank
    // line above it: headings, list items, wrapper boundaries and one-line commands.
    segmentStart: new RegExp(
      "^[ \\t]*\\\\(?:"
      + "(?:section|subsection|subsubsection|paragraph|subparagraph)\\*?\\s*(?:\\[[^\\]\\n]*\\]\\s*)?\\{"
      + "|item\\b"
      + `|(?:begin|end)\\{(?:${names}|document)\\}`
      + "|(?:input|include|subfile|import|subimport|maketitle|tableofcontents|bibliographystyle|bibliography|printbibliography|appendix)\\b"
      + ")",
      "i",
    ),
  };
}
const defaultWrapperPatterns = wrapperPatterns();

// Names declared with \newtheorem{name}, \newtheorem*{name}, \declaretheorem
// or \spnewtheorem in this file. Only the file itself is read, so the same
// source always yields the same blocks whatever else is in the project.
function declaredTheoremNames(masked) {
  const names = new Set();
  const pattern = /\\(?:newtheorem|spnewtheorem|declaretheorem|newmdtheoremenv)\*?\s*(?:\[[^\]\n]*\]\s*)?\{([A-Za-z][A-Za-z0-9*]*)\}/g;
  let match;
  while ((match = pattern.exec(masked)) !== null) names.add(match[1]);
  return [...names];
}

// A whole line that is only a comment or one self-contained command. A run of
// these at the top of a block is split off so it cannot hide the prose below.
const standaloneLinePattern = /^(?:%[^\n]*|\\(?:begin|end)\{document\}|\\(?:label|input|include|subfile|bibliographystyle|bibliography|addbibresource)\s*\{[^{}\n]*\}|\\(?:import|subimport)\s*\{[^{}\n]*\}\s*\{[^{}\n]*\}|\\(?:maketitle|tableofcontents|printbibliography|appendix|clearpage|newpage|FloatBarrier)(?![A-Za-z@])(?:\[[^\]\n]*\])?)[ \t]*(?:%[^\n]*)?$/;

// Environments whose body is not LaTeX prose: nothing inside them is a
// comment, a heading, math or an \input.
const VERBATIM_ENVIRONMENTS = /^(?:verbatim\*?|Verbatim\*?|BVerbatim|LVerbatim|lstlisting|minted|comment|filecontents\*?|CCSXML)$/;
// \ifsomething commands that do not pair with \fi (amsmath's \iff, ifthen and etoolbox tests).
const NOT_A_TEX_CONDITIONAL = /^(?:iff|ifthenelse|ifdef\w*|ifundef|ifcsdef|ifcsundef|ifstr\w+|ifblank|ifbool|iftoggle|ifnum\w+|ifdim\w+)$/;

// The same text with everything TeX would not read as LaTeX replaced by
// spaces: % comments, the body of verbatim-like environments, \verb and
// \lstinline arguments, and text switched off with \iffalse ... \fi. Line
// breaks stay, and the result has the same length, so an offset found in the
// masked text is the offset in the source. Used to look for structure (math,
// floats, includes, braces) without being fooled by text that only looks like it.
function maskLatex(source) {
  if (!/%|\\verb|\\lstinline|\\mintinline|\\iffalse|\\begin\{(?:[vV]erbatim|BVerbatim|LVerbatim|lstlisting|minted|comment|filecontents|CCSXML)/.test(source)) return source;
  const out = source.split("");
  const blank = (from, to) => {
    for (let index = from; index < to; index += 1) {
      if (out[index] !== "\n" && out[index] !== "\r") out[index] = " ";
    }
  };
  const lineEnd = (from) => {
    const newline = source.indexOf("\n", from);
    return newline < 0 ? source.length : newline;
  };
  let cursor = 0;
  let openConditionals = 0;
  while (cursor < source.length) {
    const character = source[cursor];
    if (character === "%") {
      const end = lineEnd(cursor);
      blank(cursor, end);
      cursor = end;
      continue;
    }
    if (character !== "\\") {
      cursor += 1;
      continue;
    }
    const command = /^\\([A-Za-z@]+)\*?/.exec(source.slice(cursor, cursor + 48));
    if (!command) {
      cursor += 2;
      continue;
    }
    let after = cursor + command[0].length;
    const name = command[1];
    if (name === "verb" || name === "lstinline" || name === "mintinline") {
      if (name !== "verb") {
        if (source[after] === "[") {
          const close = source.indexOf("]", after);
          if (close >= 0 && close < lineEnd(after)) after = close + 1;
        }
        if (name === "mintinline" && source[after] === "{") {
          const close = source.indexOf("}", after);
          if (close >= 0 && close < lineEnd(after)) after = close + 1;
        }
      }
      const delimiter = source[after];
      if (delimiter === "{" && name !== "verb") {
        const group = braceGroupAt(source, after);
        if (group) {
          blank(group.start, group.contentEnd);
          cursor = group.end;
          continue;
        }
      } else if (delimiter && !/[\sA-Za-z*]/.test(delimiter)) {
        const close = source.indexOf(delimiter, after + 1);
        if (close >= 0 && close <= lineEnd(after)) {
          blank(after + 1, close);
          cursor = close + 1;
          continue;
        }
      }
      cursor = after;
      continue;
    }
    if (name === "url" || name === "nolinkurl" || name === "path" || name === "href") {
      // A % inside a web address is part of the address, not a comment.
      const group = source[after] === "{" ? braceGroupAt(source, after) : null;
      if (group && !group.value.includes("\n")) {
        cursor = group.end;
        continue;
      }
      cursor = after;
      continue;
    }
    if (name === "begin") {
      const environment = /^\{([^{}\n]*)\}/.exec(source.slice(after, after + 48));
      if (environment && VERBATIM_ENVIRONMENTS.test(environment[1])) {
        const bodyStart = after + environment[0].length;
        const endAt = source.indexOf(`\\end{${environment[1]}}`, bodyStart);
        if (endAt >= 0) {
          blank(bodyStart, endAt);
          cursor = endAt;
          continue;
        }
      }
      cursor = after;
      continue;
    }
    // A few \iffalse without a \fi are tolerated; after that the file is not
    // worth another scan to its end for each one.
    if (name === "iffalse" && openConditionals < 8) {
      const conditional = /\\(if[A-Za-z@]*|fi)(?![A-Za-z@])/g;
      conditional.lastIndex = after;
      let depth = 1;
      let match;
      let closeAt = -1;
      while ((match = conditional.exec(source)) !== null) {
        if (match[1] === "fi") {
          depth -= 1;
          if (depth === 0) {
            closeAt = match.index;
            break;
          }
        } else if (!NOT_A_TEX_CONDITIONAL.test(match[1])) depth += 1;
      }
      if (closeAt >= 0) {
        blank(after, closeAt);
        cursor = closeAt;
        continue;
      }
      openConditionals += 1;
    }
    cursor = after;
  }
  return out.join("");
}

// Where the environment opened just before `from` ends (the offset after its
// \end{name}), counting nested environments of the same name. -1 when open.
function environmentEnd(masked, name, from) {
  const token = new RegExp(`\\\\(begin|end)\\{${escapeRegExp(name)}\\}`, "g");
  token.lastIndex = from;
  let depth = 1;
  let match;
  while ((match = token.exec(masked)) !== null) {
    depth += match[1] === "begin" ? 1 : -1;
    if (depth === 0) return match.index + match[0].length;
  }
  return -1;
}

// \input-like commands that are live (not commented out, not in verbatim or
// \iffalse text): [{ index, end, command, target }]. For \import{dir/}{file}
// and \subimport the target is dir/file.
function includeCommands(masked) {
  const found = [];
  const pattern = /\\(input|include|subfile|import|subimport|inputfrom|subinputfrom|includefrom|subincludefrom)(?![A-Za-z@])\s*\{([^{}\n]*)\}(?:\s*\{([^{}\n]*)\})?/g;
  let match;
  while ((match = pattern.exec(masked)) !== null) {
    const twoArguments = !["input", "include", "subfile"].includes(match[1]);
    if (twoArguments && match[3] === undefined) continue;
    let end = match.index + match[0].length;
    let target = match[2].trim();
    if (twoArguments) target = path.posix.join(match[2].trim() || ".", match[3].trim());
    else if (match[3] !== undefined) end -= match[0].length - match[0].indexOf("}") - 1;
    if (target) found.push({ index: match.index, end, command: match[1], target });
  }
  return found;
}

function parseBlocks(source) {
  const blocks = [];
  let index = 0;
  const masked = maskLatex(source);
  const theoremNames = declaredTheoremNames(masked);
  const patterns = theoremNames.length ? wrapperPatterns(theoremNames) : defaultWrapperPatterns;

  function pushBlock(start, end, forcedKind = null) {
    if (end <= start) return;
    const raw = source.slice(start, end);
    if (!raw.trim()) return;
    if (forcedKind) {
      blocks.push({ index, start, end, raw, id: `${index}-${sha(raw).slice(0, 12)}`, kind: forcedKind });
      index += 1;
      return;
    }
    // Comments are blanked in this copy, so a brace or a command inside a
    // comment cannot move a block boundary.
    const scan = masked.slice(start, end);
    const leading = raw.length - raw.trimStart().length;
    const wrapperMatch = scan.slice(leading).match(patterns.begin)
      || scan.slice(leading).match(patterns.endLeading);
    if (wrapperMatch) {
      const wrapperEnd = leading + wrapperMatch[0].length;
      if (raw.slice(wrapperEnd).trim()) {
        pushBlock(start, start + wrapperEnd);
        pushBlock(start + wrapperEnd, end);
        return;
      }
    }
    const trailingWrapper = scan.match(patterns.endTrailing);
    if (trailingWrapper && raw.slice(0, trailingWrapper.index).trim()) {
      pushBlock(start, start + trailingWrapper.index);
      pushBlock(start + trailingWrapper.index, end);
      return;
    }
    // Full-width boxes (\twocolumn[{...}]) hide the headings they wrap from
    // block classification. Split the wrapper prefix into its own block so the
    // heading that follows is parsed normally; the closing "}]" stays with the
    // trailing content block.
    const twocolumnAt = scan.search(/\\twocolumn\s*\[\s*\{/);
    if (twocolumnAt >= 0) {
      const wrapper = scan.slice(twocolumnAt).match(/^\\twocolumn\s*\[\s*\{/)[0];
      const wrapperEnd = twocolumnAt + wrapper.length;
      if (raw.slice(wrapperEnd).trim()) {
        pushBlock(start, start + wrapperEnd);
        pushBlock(start + wrapperEnd, end);
        return;
      }
    }
    // Comment lines, \label{...}, \FloatBarrier and similar one-line commands
    // glued directly above a heading or a paragraph would otherwise classify
    // the whole block as structure and hide it; split such a prefix off.
    let prefixEnd = leading;
    while (prefixEnd < raw.length) {
      const newline = raw.indexOf("\n", prefixEnd);
      const lineEnd = newline < 0 ? raw.length : newline + 1;
      if (!standaloneLinePattern.test(raw.slice(prefixEnd, lineEnd).trim())) break;
      prefixEnd = lineEnd;
    }
    if (prefixEnd > leading && raw.slice(prefixEnd).trim()) {
      pushBlock(start, start + prefixEnd);
      pushBlock(start + prefixEnd, end);
      return;
    }
    const headingMatch = scan.slice(leading).match(HEADING_OPEN_PATTERN);
    if (headingMatch) {
      const open = leading + headingMatch[0].lastIndexOf("{");
      let depth = 0;
      for (let offset = open; offset < scan.length; offset += 1) {
        if (scan[offset] === "{" && scan[offset - 1] !== "\\") depth += 1;
        if (scan[offset] === "}" && scan[offset - 1] !== "\\") {
          depth -= 1;
          if (depth === 0) {
            const headingEnd = offset + 1;
            if (raw.slice(headingEnd).trim()) {
              pushBlock(start, start + headingEnd);
              pushBlock(start + headingEnd, end);
              return;
            }
            break;
          }
        }
      }
    }
    blocks.push({
      index,
      start,
      end,
      raw,
      id: `${index}-${sha(raw).slice(0, 12)}`,
      kind: classifyBlock(raw, patterns),
    });
    index += 1;
  }

  // Regions that are one block whatever they contain: display math, floats,
  // code, drawings, a bibliography, and text LaTeX never reads.
  const specialRegions = [];
  const environmentPattern = /\\begin\{(equation\*?|align\*?|alignat\*?|flalign\*?|gather\*?|multline\*?|eqnarray\*?|displaymath|table\*?|figure\*?|teaserfigure|wrapfigure|sidewaysfigure|sidewaystable|longtable\*?|algorithm\*?|algorithmic|algorithm2e|verbatim\*?|Verbatim\*?|BVerbatim|LVerbatim|lstlisting|minted|comment|filecontents\*?|CCSXML|tikzpicture|pgfpicture|thebibliography)\}/g;
  let environmentMatch;
  while ((environmentMatch = environmentPattern.exec(masked)) !== null) {
    const endAt = environmentEnd(masked, environmentMatch[1], environmentPattern.lastIndex);
    if (endAt >= 0) {
      specialRegions.push({ start: environmentMatch.index, end: endAt });
      environmentPattern.lastIndex = endAt;
    }
  }
  // \[ ... \], but not the \[ of a line break with a length: \\[4pt].
  const displayMathPattern = /(?<!\\)\\\[[\s\S]*?\\\]/g;
  let displayMathMatch;
  while ((displayMathMatch = displayMathPattern.exec(masked)) !== null) {
    specialRegions.push({ start: displayMathMatch.index, end: displayMathMatch.index + displayMathMatch[0].length });
  }
  // \iffalse ... \fi that starts a line is a hidden block of its own; inside
  // a sentence it is skipped by the display conversion instead.
  const switchedOffPattern = /^[ \t]*(\\iffalse)(?![A-Za-z@])/gm;
  let switchedOffMatch;
  while ((switchedOffMatch = switchedOffPattern.exec(masked)) !== null) {
    const from = switchedOffMatch.index + switchedOffMatch[0].length;
    const close = /\\fi(?![A-Za-z@])/g;
    close.lastIndex = from;
    const closeMatch = close.exec(masked);
    if (!closeMatch) break;
    specialRegions.push({
      start: switchedOffMatch.index + switchedOffMatch[0].indexOf("\\"),
      end: closeMatch.index + closeMatch[0].length,
      kind: "structure",
    });
    switchedOffPattern.lastIndex = closeMatch.index + closeMatch[0].length;
  }
  specialRegions.sort((a, b) => a.start - b.start);

  // One blank-line-separated chunk, further split wherever a line starts a
  // heading, a list item, a wrapper boundary or a one-line command.
  function pushSegments(start, end, forcedKind) {
    if (forcedKind) {
      pushBlock(start, end, forcedKind);
      return;
    }
    let segmentStart = start;
    let lineStart = start;
    while (lineStart < end) {
      const newline = source.indexOf("\n", lineStart);
      const lineEnd = newline < 0 || newline >= end ? end : newline + 1;
      if (lineStart > segmentStart && patterns.segmentStart.test(masked.slice(lineStart, lineEnd))) {
        pushBlock(segmentStart, lineStart);
        segmentStart = lineStart;
      }
      lineStart = lineEnd;
    }
    pushBlock(segmentStart, end);
  }

  function pushOrdinary(start, end, forcedKind = null) {
    // A blank line, with LF or CRLF line endings.
    const separator = /\r?\n[\t ]*\r?\n(?:\r?\n)*/g;
    let cursor = start;
    let match;
    separator.lastIndex = start;
    while ((match = separator.exec(source)) !== null && match.index < end) {
      pushSegments(cursor, match.index, forcedKind);
      cursor = Math.min(end, match.index + match[0].length);
    }
    pushSegments(cursor, end, forcedKind);
  }

  // Everything before \begin{document} is preamble and everything after
  // \end{document} is ignored by LaTeX: neither is prose.
  const beginDocument = /^[ \t﻿]*\\begin\{document\}/m.exec(masked);
  const bodyStart = beginDocument ? beginDocument.index : 0;
  const endDocumentPattern = /^[ \t]*\\end\{document\}[^\n]*\n?/gm;
  endDocumentPattern.lastIndex = bodyStart;
  const endDocument = beginDocument ? endDocumentPattern.exec(masked) : null;
  const bodyEnd = endDocument ? endDocument.index + endDocument[0].length : source.length;

  pushOrdinary(0, bodyStart, "structure");
  let cursor = bodyStart;
  for (const region of specialRegions) {
    if (region.start < cursor || region.end > bodyEnd) continue;
    pushOrdinary(cursor, region.start);
    pushBlock(region.start, region.end, region.kind || null);
    cursor = region.end;
  }
  pushOrdinary(cursor, bodyEnd);
  pushOrdinary(bodyEnd, source.length, "structure");

  // Tell the client which prose sits inside an abstract, a list, or an
  // environment it labels (theorem, proof, quote, keywords...).
  const wrappers = [];
  const transparent = new RegExp(`^(?:${TRANSPARENT_WRAPPERS})$`, "i");
  for (const block of blocks) {
    const boundary = block.kind === "structure" && /^\s*\\(?:begin|end)\{/.test(block.raw)
      ? patterns.line.exec(maskLatex(block.raw).trim())
      : null;
    if (boundary) {
      const name = boundary[2];
      if (boundary[1].toLowerCase() === "begin") {
        wrappers.push({ name, key: name.toLowerCase(), title: boundary[3] || "", opened: false, items: 0, label: null });
      } else {
        const openAt = wrappers.map((wrapper) => wrapper.key).lastIndexOf(name.toLowerCase());
        if (openAt >= 0) wrappers.length = openAt;
      }
      continue;
    }
    if (block.kind === "structure") {
      // \label on its own line right under \begin{theorem} names the environment.
      const pending = wrappers.at(-1);
      const label = pending && !pending.opened ? /\\label\{([^{}]+)\}/.exec(block.raw) : null;
      if (label) pending.label = label[1];
      continue;
    }
    const scope = [...wrappers].reverse().find((wrapper) => !transparent.test(wrapper.name));
    if (!scope) continue;
    if (scope.key === "abstract") {
      block.role = "abstract";
    } else if (LIST_WRAPPERS.has(scope.key)) {
      block.role = "list-item";
      block.list = scope.key;
      block.listDepth = wrappers.filter((wrapper) => LIST_WRAPPERS.has(wrapper.key)).length;
      if (/^\s*\\item(?![A-Za-z@])/.test(block.raw)) {
        scope.items += 1;
        block.itemNumber = scope.items;
      }
    } else {
      block.environment = scope.name;
      if (!scope.opened) {
        block.environmentStart = true;
        if (scope.title) block.environmentTitle = scope.title;
        const label = scope.label || /\\label\{([^{}]+)\}/.exec(block.raw)?.[1];
        if (label) block.environmentLabel = label;
      }
    }
    scope.opened = true;
  }
  return blocks;
}

function classifyBlock(raw, patterns = defaultWrapperPatterns) {
  const value = raw.trim();
  if (/^\\(?:sub)*section\*?\s*(?:\[[^\]\n]*\]\s*)?\{/.test(value)) return "heading";
  if (/^\\(?:sub)?paragraph\*?\s*(?:\[[^\]\n]*\]\s*)?\{/.test(value)) return "paragraph-heading";
  if (/^\\begin\{(?:equation|align|alignat|flalign|gather|multline|eqnarray)\*?\}/.test(value) || /^\\begin\{displaymath\}/.test(value) || /^\\\[/.test(value)) return "math";
  if (/^\\begin\{(?:table\*?|sidewaystable|longtable\*?)\}/.test(value)) return "table";
  if (/^\\begin\{(?:figure\*?|teaserfigure|wrapfigure|sidewaysfigure)\}/.test(value)) return "figure";
  // Read-only views: program text and pseudo-code, a hand-written
  // bibliography, and drawings that only LaTeX can render.
  if (/^\\begin\{(?:verbatim\*?|Verbatim\*?|BVerbatim|LVerbatim|lstlisting|minted|algorithm\*?|algorithmic|algorithm2e)\}/.test(value)) return "code";
  if (/^\\begin\{thebibliography\}/.test(value)) return "bibliography";
  if (/^\\begin\{(?:tikzpicture|pgfpicture)\}/.test(value)) return "figure";
  if (/^\\begin\{(?:comment|CCSXML|filecontents\*?)\}/.test(value)) return "structure";
  // A bare tabular or \includegraphics outside a float environment (for
  // example inside a box or minipage) is rendered as a table or figure rather
  // than as raw source text.
  const live = maskLatex(value);
  if (/\\begin\{(?:tabular\*?|tabularx)\}/.test(live) && !/^%/.test(value)) return "table";
  if (/\\includegraphics\b/.test(live) && !/^%/.test(value)) return "figure";
  if (/^\\begin\{minipage\b/.test(value)) return "paragraph";
  if (/^\}?\]/.test(value)) return "structure";
  if (patterns.line.test(live.trim())) return "structure";
  // Definitions and set-up commands: their arguments are code, not prose.
  if (/^\\(?:documentclass|usepackage|RequirePackage|newcommand|renewcommand|providecommand|newenvironment|renewenvironment|DeclareMathOperator|newtheorem|def|makeatletter|makeatother|IfFileExists|twocolumn)(?![A-Za-z@])/.test(value)) return "structure";
  // Whatever is left is prose when the reader would see any text in it. A
  // block of labels, spacing, \maketitle, front-matter commands, an unknown
  // environment's \begin or \end line and the like shows nothing: structure.
  return hasVisibleText(value) ? "paragraph" : "structure";
}

// True when the display conversion of `value` shows anything besides the
// names of commands it does not know.
function hasVisibleText(value) {
  const rendered = latexToDisplay(value, "paragraph");
  if (!rendered.display.trim()) return false;
  const chips = (rendered.styles || []).filter((style) => style.type === "command");
  if (!chips.length) return true;
  let text = "";
  let cursor = 0;
  for (const chip of chips) {
    text += rendered.display.slice(cursor, chip.start);
    cursor = Math.max(cursor, chip.end);
  }
  text += rendered.display.slice(cursor);
  return Boolean(text.trim());
}

function headingArgument(raw) {
  const match = String(raw || "").match(HEADING_OPEN_PATTERN);
  if (!match) return null;
  const open = match[0].lastIndexOf("{");
  let depth = 0;
  for (let index = open; index < raw.length; index += 1) {
    if (raw[index] === "{" && raw[index - 1] !== "\\") depth += 1;
    if (raw[index] === "}" && raw[index - 1] !== "\\") {
      depth -= 1;
      if (depth === 0) return raw.slice(open + 1, index);
    }
  }
  return raw.slice(open + 1);
}

function assertNoNestedHeadingCommands(source) {
  for (const block of parseBlocks(source)) {
    if (!["heading", "paragraph-heading"].includes(block.kind)) continue;
    const title = headingArgument(block.raw);
    if (HEADING_OPEN_PATTERN.test(title || "")) {
      throw new Error("A heading command was pasted inside another heading. Edit only the visible heading text; Paper Pal preserves the LaTeX command.");
    }
  }
}

// The end of a [ ... ] argument that opens at `openAt`, skipping brackets
// inside braces. -1 when it does not close before a blank line.
function bracketEnd(value, openAt) {
  if (value[openAt] !== "[") return -1;
  let depth = 0;
  // An optional argument is short; the cap keeps a stray "[" cheap.
  const limit = Math.min(value.length, openAt + 4000);
  for (let cursor = openAt + 1; cursor < limit; cursor += 1) {
    const character = value[cursor];
    if (character === "\\") cursor += 1;
    else if (character === "{") depth += 1;
    else if (character === "}") depth -= 1;
    else if (character === "]" && depth <= 0) return cursor;
    else if (character === "\n" && /^[ \t\r]*\n/.test(value.slice(cursor + 1))) return -1;
  }
  return -1;
}

// Macro definitions of a source text, for display only: name -> { params,
// optional, body }. `params` counts the mandatory arguments; `optional` is the
// default of a leading optional argument (or null). Understands \newcommand,
// \renewcommand, \providecommand, \DeclareRobustCommand (with or without
// braces around the name, with [n] and [default]), \def\name#1#2{...},
// \DeclareMathOperator and simple \NewDocumentCommand signatures. Anything
// cleverer is left alone.
function collectMacros(source) {
  const macros = new Map();
  if (!/\\(?:newcommand|renewcommand|providecommand|DeclareRobustCommand|DeclareMathOperator|def|gdef|NewDocumentCommand|RenewDocumentCommand|ProvideDocumentCommand)/.test(source)) return macros;
  const text = maskLatex(source);
  const pattern = /\\(newcommand|renewcommand|providecommand|DeclareRobustCommand|DeclareMathOperator|def|gdef|NewDocumentCommand|RenewDocumentCommand|ProvideDocumentCommand)(\*?)(?![A-Za-z@])/g;
  const skipSpace = (at) => {
    while (/[ \t\r\n]/.test(text[at] || "")) at += 1;
    return at;
  };
  let match;
  while ((match = pattern.exec(text)) !== null) {
    let at = skipSpace(match.index + match[0].length);
    const braced = text[at] === "{";
    if (braced) at = skipSpace(at + 1);
    const nameMatch = /^\\([A-Za-z@]+)/.exec(text.slice(at, at + 80));
    if (!nameMatch) continue;
    const name = nameMatch[1];
    at += nameMatch[0].length;
    if (braced) {
      at = skipSpace(at);
      if (text[at] !== "}") continue;
      at += 1;
    }
    let params = 0;
    let optional = null;
    if (match[1] === "def" || match[1] === "gdef") {
      const parameters = /^(?:#[1-9])*/.exec(text.slice(at, at + 40))[0];
      params = parameters.length / 2;
      at += parameters.length;
      if (text[at] !== "{") continue;
    } else if (/DocumentCommand$/.test(match[1])) {
      at = skipSpace(at);
      const specification = braceGroupAt(text, at);
      if (!specification) continue;
      const tokens = specification.value.match(/O\s*\{[^{}]*\}|[A-Za-z+!>]/g) || [];
      let supported = true;
      for (const [position, token] of tokens.entries()) {
        if (token === "m") params += 1;
        else if (position === 0 && token === "o") optional = "";
        else if (position === 0 && token.startsWith("O")) optional = token.slice(token.indexOf("{") + 1, -1);
        else supported = false;
      }
      if (!supported) continue;
      at = specification.end;
    } else if (match[1] !== "DeclareMathOperator") {
      at = skipSpace(at);
      if (text[at] === "[") {
        const close = text.indexOf("]", at);
        const count = close < 0 ? NaN : Number.parseInt(text.slice(at + 1, close), 10);
        if (!Number.isInteger(count) || count < 0 || count > 9) continue;
        params = count;
        at = skipSpace(close + 1);
        if (text[at] === "[") {
          const defaultClose = bracketEnd(text, at);
          if (defaultClose < 0) continue;
          optional = text.slice(at + 1, defaultClose);
          params -= 1;
          at = defaultClose + 1;
        }
      }
    }
    at = skipSpace(at);
    const body = braceGroupAt(text, at);
    if (!body || body.value.length > 4000) continue;
    const value = body.value.trim();
    if (match[1] === "DeclareMathOperator") {
      macros.set(name, { params: 0, optional: null, body: `\\operatorname${match[2]}{${value}}`, mathOnly: true });
    } else {
      // \providecommand does not replace an earlier definition.
      const provide = match[1] === "providecommand" || match[1] === "ProvideDocumentCommand";
      if (provide && macros.has(name)) continue;
      macros.set(name, { params: Math.max(0, params), optional, body: value, ...(provide ? { provide: true } : {}) });
    }
    pattern.lastIndex = body.end;
  }
  return macros;
}

// Macros that KaTeX receives with every formula: the ones a preamble usually
// provides through packages KaTeX does not know.
const DEFAULT_MATH_MACROS = {
  "\\ensuremath": "#1",
  "\\xspace": "",
  "\\qedhere": "",
  "\\mathbbm": "\\mathbb{#1}",
  "\\mathds": "\\mathbb{#1}",
  "\\textsc": "\\text{#1}",
  "\\mbox": "\\text{#1}",
  "\\bm": "\\boldsymbol{#1}",
};

// The author's macros in the form KaTeX's `macros` option takes. A macro with
// an optional argument is given a plain signature here; mathWithExplicitOptionals
// rewrites its uses to match.
function katexMacros(macros) {
  const result = { ...DEFAULT_MATH_MACROS };
  let count = 0;
  for (const [name, macro] of macros) {
    if (count >= 400) break;
    if (!macro || /[$]|\\\(|\\\[|\\begin\{(?:equation|align|gather|multline)/.test(macro.body)) continue;
    result[`\\${name}`] = macro.body || "{}";
    count += 1;
  }
  return result;
}

// \unit[px]{12} -> \unit{px}{12} and \unit{12} -> \unit{m}{12} for macros
// declared with an optional first argument, which KaTeX macros cannot express.
function mathWithExplicitOptionals(latex, macros) {
  let result = String(latex || "");
  for (const [name, macro] of macros) {
    if (!macro || macro.optional == null || !result.includes(`\\${name}`)) continue;
    const pattern = new RegExp(`\\\\${escapeRegExp(name)}(?![A-Za-z@])`, "g");
    let rebuilt = "";
    let cursor = 0;
    let match;
    while ((match = pattern.exec(result)) !== null) {
      let at = match.index + match[0].length;
      while (result[at] === " ") at += 1;
      let value = macro.optional;
      let end = match.index + match[0].length;
      if (result[at] === "[") {
        const close = bracketEnd(result, at);
        if (close >= 0) {
          value = result.slice(at + 1, close);
          end = close + 1;
        }
      }
      rebuilt += `${result.slice(cursor, match.index)}\\${name}{${value}}`;
      cursor = end;
      pattern.lastIndex = end;
    }
    result = rebuilt + result.slice(cursor);
  }
  return result;
}

// What the prose view does with a command. `sig` lists the arguments in
// order: o = optional [..], p = optional (..), m = mandatory {..}, M = a
// further {..} only when it follows directly, * = every following group (for
// definitions). `show` picks the arguments (by position in `sig`) whose text is
// displayed; without it the command and its arguments are hidden. `text` is a
// fixed replacement. `style` marks the shown text for the page (italic, code,
// footnote...). `before`/`after`/`sep` are shown around and between arguments.
const TEXT_COMMANDS = new Map();
function defineTextCommands(names, spec) {
  for (const name of names.split(/\s+/).filter(Boolean)) TEXT_COMMANDS.set(name, spec);
}
defineTextCommands("textrm textsf textnormal textup textmd textlf mbox hbox fbox text mathrm mathbf mathit mathcal mathsf mathtt mathbb boldsymbol operatorname centerline leftline rightline uppercase lowercase MakeUppercase MakeLowercase IEEEauthorblockN chapter part", { sig: "m", show: [0] });
defineTextCommands("emph textit textsl", { sig: "m", show: [0], style: "emph" });
defineTextCommands("textbf", { sig: "m", show: [0], style: "strong" });
defineTextCommands("texttt", { sig: "m", show: [0], style: "code" });
defineTextCommands("textsc", { sig: "m", show: [0], style: "smallcaps" });
defineTextCommands("underline uline uuline", { sig: "m", show: [0], style: "underline" });
defineTextCommands("sout st", { sig: "m", show: [0], style: "strike" });
defineTextCommands("hl", { sig: "m", show: [0], style: "highlight" });
defineTextCommands("textsuperscript", { sig: "m", show: [0], style: "sup" });
defineTextCommands("textsubscript", { sig: "m", show: [0], style: "sub" });
defineTextCommands("shortstack", { sig: "om", show: [1] });
defineTextCommands("makebox framebox", { sig: "oom", show: [2] });
defineTextCommands("parbox", { sig: "ooomm", show: [4] });
defineTextCommands("raisebox", { sig: "moom", show: [3] });
defineTextCommands("scalebox", { sig: "mom", show: [2] });
defineTextCommands("resizebox", { sig: "mmm", show: [2] });
defineTextCommands("rotatebox textcolor colorbox", { sig: "omm", show: [2] });
defineTextCommands("fcolorbox", { sig: "ommm", show: [3] });
defineTextCommands("adjustbox href", { sig: "mm", show: [1] });
defineTextCommands("multicolumn multirow", { sig: "mmm", show: [2] });
defineTextCommands("footnote footnotetext marginpar marginnote", { sig: "om", show: [1], style: "footnote", before: " [", after: "]" });
defineTextCommands("thanks", { sig: "m", show: [0], style: "footnote", before: " [", after: "]" });
defineTextCommands("todo", { sig: "om", show: [1], style: "todo", before: "[TODO: ", after: "]" });
defineTextCommands("url nolinkurl path", { sig: "m", show: [0], style: "url", verbatim: true });
defineTextCommands("caption subcaption", { sig: "om", show: [1] });
defineTextCommands("keywords", { sig: "m", show: [0], before: "Keywords: " });
defineTextCommands("IEEEPARstart", { sig: "mm", show: [0, 1], sep: "" });
// Hidden, with their arguments: anchors, spacing, files, counters.
defineTextCommands("label vspace hspace addvspace phantom hphantom vphantom index glsadd nocite bibliographystyle bibliography input include subfile includeonly pagestyle thispagestyle pagenumbering stepcounter refstepcounter enlargethispage cline theoremstyle date subtitle titlerunning authorrunning institute email orcid orcidID orcidlink inst city country institution department streetaddress state postcode pacs preprint icmltitle icmltitlerunning icmlkeywords shortauthors setcopyright copyrightyear acmYear acmDOI acmISBN acmJournal acmVolume acmNumber acmArticle acmMonth acmPrice acmBooktitle acmSubmissionID Description IEEEauthorblockA printAffiliationsAndNotice lstset captionsetup geometry hypersetup graphicspath", { sig: "m" });
defineTextCommands("addlinespace footnotemark linebreak pagebreak nopagebreak nolinebreak printbibliography tableofcontents", { sig: "o" });
defineTextCommands("title author affiliation altaffiliation address ccsdesc received color addbibresource includegraphics lstinputlisting missingfigure", { sig: "om" });
defineTextCommands("import subimport inputfrom subinputfrom includefrom subincludefrom setcounter addtocounter icmlauthor icmlaffiliation icmlcorrespondingauthor icmlsetsymbol markboth", { sig: "mm" });
defineTextCommands("inputminted rule", { sig: "omm" });
defineTextCommands("acmConference", { sig: "ommm" });
defineTextCommands("cmidrule", { sig: "pm" });
defineTextCommands("newcommand renewcommand providecommand DeclareRobustCommand DeclareMathOperator NewDocumentCommand RenewDocumentCommand ProvideDocumentCommand newenvironment renewenvironment newtheorem spnewtheorem declaretheorem newcounter definecolor colorlet usepackage RequirePackage documentclass PassOptionsToPackage IfFileExists AtBeginDocument AtEndDocument", { sig: "*" });
// Hidden, no arguments: layout switches and one-word structure commands.
defineTextCommands("noindent indent smallskip medskip bigskip par centering raggedright raggedleft flushbottom raggedbottom clearpage cleardoublepage newpage maketitle listoffigures listoftables appendix FloatBarrier sloppy fussy frenchspacing nonfrenchspacing protect relax hfill vfill hrule hline toprule midrule bottomrule null strut onecolumn twocolumn balance IEEEpeerreviewmaketitle IEEEoverridecommandlockouts normalfont rmfamily sffamily ttfamily bfseries mdseries itshape slshape scshape upshape em bf it tt sc rm sf sl tiny scriptsize footnotesize small normalsize large Large LARGE huge Huge qed qedhere xspace ignorespaces unskip leavevmode selectfont makeatletter makeatother displaystyle textstyle limits nolimits nonumber notag allowbreak", { sig: "" });
// Text symbols.
for (const [names, text] of [
  ["LaTeX", "LaTeX"], ["LaTeXe", "LaTeX2e"], ["TeX", "TeX"], ["BibTeX", "BibTeX"], ["S", "§"], ["P", "¶"], ["dag", "†"], ["ddag", "‡"],
  ["copyright textcopyright", "©"], ["textregistered", "®"], ["texttrademark", "™"], ["pounds textsterling", "£"], ["euro texteuro", "€"],
  ["textdegree", "°"], ["ldots dots textellipsis", "…"], ["cdots", "⋯"], ["textbackslash", "\\"], ["textasciitilde", "~"],
  ["textasciicircum", "^"], ["textbar", "|"], ["textless", "<"], ["textgreater", ">"], ["textbullet", "•"], ["textendash", "–"],
  ["textemdash", "—"], ["textquoteleft", "‘"], ["textquoteright", "’"], ["textquotedblleft", "“"], ["textquotedblright", "”"],
  ["guillemotleft", "«"], ["guillemotright", "»"], ["ss", "ß"], ["SS", "SS"], ["o", "ø"], ["O", "Ø"], ["ae", "æ"], ["AE", "Æ"],
  ["oe", "œ"], ["OE", "Œ"], ["aa", "å"], ["AA", "Å"], ["l", "ł"], ["L", "Ł"], ["i", "ı"], ["j", "ȷ"], ["quad enspace thinspace space", " "],
  ["qquad", "  "], ["slash", "/"], ["and", "·"], ["ackname", "Acknowledgements"], ["textperiodcentered", "·"], ["textvisiblespace", "␣"],
]) defineTextCommands(names, { text });
defineTextCommands("newline", { text: "\n", style: "linebreak" });

// \'e, \"o, \c{c}, \v{s}... as the combining mark each one adds.
const ACCENT_MARKS = {
  "'": "́", "`": "̀", "^": "̂", "\"": "̈", "~": "̃", "=": "̄", ".": "̇",
  c: "̧", v: "̌", u: "̆", H: "̋", r: "̊", k: "̨", d: "̣", b: "̱",
};
// A backslash followed by one non-letter.
const CONTROL_SYMBOLS = { ",": " ", ";": " ", ":": " ", " ": " ", "\n": " ", "\t": " ", "!": "", "/": "", "-": "", "@": "", "%": "%", "&": "&", "_": "_", "#": "#", "$": "$", "{": "{", "}": "}" };
// Layout arguments of \begin{environment} that are not prose.
const ENVIRONMENT_BRACE_ARGUMENTS = {
  "minipage": 1, "tabular": 1, "tabular*": 2, "tabularx": 2, "longtable": 1, "array": 1, "CJK": 2, "CJK*": 2, "multicols": 1,
  "spacing": 1, "thebibliography": 1, "subfigure": 1, "subtable": 1, "wrapfigure": 2, "adjustbox": 1, "minted": 1, "alignat": 1, "alignat*": 1,
};
const CITE_MODES = {
  cite: "paren", citep: "paren", Citep: "paren", parencite: "paren", Parencite: "paren", autocite: "paren", Autocite: "paren",
  footcite: "foot", footcitetext: "foot", footfullcite: "foot", supercite: "paren", smartcite: "paren", citeyearpar: "yearParen",
  citet: "text", Citet: "text", textcite: "text", Textcite: "text", fullcite: "text",
  citealp: "bare", citealt: "bareText", onlinecite: "bare", citenum: "bare", citeauthor: "author", Citeauthor: "author", citeyear: "year",
};
const REFERENCE_COMMANDS = new Set(["ref", "eqref", "autoref", "Autoref", "cref", "Cref", "vref", "Vref", "pageref", "autopageref", "nameref", "labelcref", "subref"]);
const LABEL_PREFIX_TYPES = {
  fig: "figure", tab: "table", tbl: "table", eq: "equation", eqn: "equation", sec: "section", subsec: "section", ssec: "section", app: "appendix",
  thm: "theorem", lem: "lemma", prop: "proposition", cor: "corollary", def: "definition", alg: "algorithm", lst: "listing", ch: "chapter", chap: "chapter",
};
const MAX_MACRO_DEPTH = 6;
// Macro expansions left for the block being converted. Together with the
// depth limit this stops \newcommand{\a}{\a\a\a} from running away.
const MAX_MACRO_EXPANSIONS = 1500;
let macroExpansionsLeft = MAX_MACRO_EXPANSIONS;
// How deep \emph{\emph{...}} may nest before the rest is copied as plain text.
const MAX_DISPLAY_NESTING = 120;
let displayNesting = 0;

function latexToDisplay(raw, kind, macros = new Map(), referenceContext = { labels: {}, citations: {} }, depth = 0, keepEdges = false) {
  if (kind === "structure") return { display: "", displayStarts: [], displayEnds: [], hidden: true };
  if (depth === 0) {
    macroExpansionsLeft = MAX_MACRO_EXPANSIONS;
    displayNesting = 0;
  }
  if (kind === "code" || kind === "bibliography") {
    // Read-only views: the page draws them from `semantic`; as text they are
    // one unit that maps to the whole block.
    const text = raw.trim();
    return {
      display: text,
      displayStarts: Array(text.length).fill(0),
      displayEnds: Array(text.length).fill(raw.length),
      annotations: [],
      styles: [],
      hidden: false,
    };
  }

  const display = [];
  const displayStarts = [];
  const displayEnds = [];
  const annotations = [];
  // Presentation ranges over the display text (italic, code, footnote...).
  // Unlike annotations they may nest and they never change what is editable.
  const styles = [];
  // Braces and commands are looked for in a copy with comments and verbatim
  // text blanked, so "% {" in a comment cannot unbalance a group.
  const scan = maskLatex(raw);
  const appendCopied = (character, rawStart, rawEnd = rawStart + 1) => {
    display.push(character);
    displayStarts.push(rawStart);
    displayEnds.push(rawEnd);
  };
  const appendReplacement = (value, rawStart, rawEnd, annotation = null) => {
    if (!value) return;
    const displayStart = display.length;
    for (let offset = 0; offset < value.length; offset += 1) {
      display.push(value[offset]);
      displayStarts.push(rawStart);
      displayEnds.push(rawEnd);
    }
    if (annotation) annotations.push({ ...annotation, start: displayStart, end: display.length });
  };
  // Every "{" with the "}" that closes it, found in one pass the first time a
  // group is looked up: a thousand unclosed braces stay cheap.
  let braceMatches = null;
  const findClosingBrace = (openAt) => {
    if (scan[openAt] !== "{") return -1;
    if (!braceMatches) {
      braceMatches = new Map();
      const open = [];
      for (let cursor = 0; cursor < scan.length; cursor += 1) {
        if (scan[cursor - 1] === "\\") continue;
        if (scan[cursor] === "{") open.push(cursor);
        else if (scan[cursor] === "}" && open.length) braceMatches.set(open.pop(), cursor);
      }
    }
    return braceMatches.get(openAt) ?? -1;
  };
  const appendNested = (nested, offsetOf, displayRange = null) => {
    const displayOffset = display.length;
    for (let cursor = 0; cursor < nested.display.length; cursor += 1) {
      display.push(nested.display[cursor]);
      displayStarts.push(displayRange ? displayRange[0] : offsetOf + nested.displayStarts[cursor]);
      displayEnds.push(displayRange ? displayRange[1] : offsetOf + nested.displayEnds[cursor]);
    }
    for (const annotation of nested.annotations || []) {
      annotations.push({ ...annotation, start: displayOffset + annotation.start, end: displayOffset + annotation.end });
    }
    for (const style of nested.styles || []) {
      styles.push({ ...style, start: displayOffset + style.start, end: displayOffset + style.end });
    }
  };
  // The text between two source offsets, converted; every character keeps
  // its own source range, so it stays editable in place.
  const appendInner = (start, end) => {
    if (displayNesting >= MAX_DISPLAY_NESTING) {
      for (let at = start; at < end; at += 1) {
        if (!"{}\\%$".includes(raw[at])) appendCopied(raw[at], at);
      }
      return;
    }
    displayNesting += 1;
    try {
      appendNested(latexToDisplay(raw.slice(start, end), "paragraph", macros, referenceContext, Math.max(depth, 1)), start);
    } finally {
      displayNesting -= 1;
    }
  };
  // Text that is not in the source (a macro body): converted, and every
  // character maps to the source range of the command that produced it.
  const appendExpanded = (text, rawStart, rawEnd, keepSpaces = false) => {
    if (depth >= MAX_MACRO_DEPTH || macroExpansionsLeft <= 0) return;
    macroExpansionsLeft -= 1;
    appendNested(latexToDisplay(text, "paragraph", macros, referenceContext, depth + 1, keepSpaces), 0, [rawStart, rawEnd]);
  };
  const appendStyled = (style, write) => {
    const start = display.length;
    write();
    if (style && display.length > start) styles.push({ type: style, start, end: display.length });
  };
  const flatText = (text) => latexToDisplay(text, "paragraph", macros, referenceContext, depth + 1).display.replace(/\s+/g, " ").trim();
  const skipBlanks = (at) => {
    while (raw[at] === " " || raw[at] === "\t") at += 1;
    return at;
  };
  // The arguments of a command by its signature; null when a mandatory one is missing.
  const readArguments = (sig, from) => {
    const found = [];
    let at = from;
    for (const type of sig) {
      if (type === "o" || type === "p") {
        const next = skipBlanks(at);
        const close = type === "o"
          ? (scan[next] === "[" ? bracketEnd(scan, next) : -1)
          : (scan[next] === "(" ? scan.indexOf(")", next) : -1);
        if (close >= 0 && !/\n[ \t\r]*\n/.test(scan.slice(next, close))) {
          found.push({ start: next + 1, end: close });
          at = close + 1;
        } else found.push(null);
        continue;
      }
      const next = type === "M" ? at : skipBlanks(at);
      const close = scan[next] === "{" ? findClosingBrace(next) : -1;
      if (close < 0) {
        if (type === "M") {
          found.push(null);
          continue;
        }
        // Incomplete: report how far the arguments that were there reach.
        return { found, end: at, incomplete: true };
      }
      found.push({ start: next + 1, end: close });
      at = close + 1;
    }
    return { found, end: at };
  };

  let cursor = 0;
  while (cursor < raw.length) {
    const character = raw[cursor];
    if (character === "%") {
      // Every \% was consumed with its backslash, so this starts a comment.
      const newline = raw.indexOf("\n", cursor);
      cursor = newline < 0 ? raw.length : newline;
      continue;
    }
    if (character === "{") {
      // {\itshape text}: a font switch that lasts to the end of its group.
      const scoped = /^\{\s*\\(itshape|slshape|em|it|sl|bfseries|bf|ttfamily|tt|scshape|sc)(?![A-Za-z@])/.exec(scan.slice(cursor, cursor + 24));
      const close = scoped ? findClosingBrace(cursor) : -1;
      if (close >= 0) {
        const style = { itshape: "emph", slshape: "emph", em: "emph", it: "emph", sl: "emph", bfseries: "strong", bf: "strong", ttfamily: "code", tt: "code", scshape: "smallcaps", sc: "smallcaps" }[scoped[1]];
        appendStyled(style, () => appendInner(cursor + scoped[0].length, close));
        cursor = close + 1;
        continue;
      }
      cursor += 1;
      continue;
    }
    if (character === "}") {
      cursor += 1;
      continue;
    }
    if (character === "\r" && raw[cursor + 1] === "\n") {
      cursor += 1;
      continue;
    }
    if (character === "~") {
      appendReplacement(" ", cursor, cursor + 1);
      cursor += 1;
      continue;
    }
    if (character === "`" || (character === "'" && raw[cursor + 1] === "'")) {
      const double = raw[cursor + 1] === character;
      appendReplacement(character === "`" ? (double ? "“" : "‘") : "”", cursor, cursor + (double ? 2 : 1));
      cursor += double ? 2 : 1;
      continue;
    }
    if (character === "-" && raw[cursor + 1] === "-") {
      const length = raw[cursor + 2] === "-" ? 3 : 2;
      appendReplacement(length === 3 ? "—" : "–", cursor, cursor + length);
      cursor += length;
      continue;
    }
    if (character === "$" && raw[cursor - 1] !== "\\") {
      const delimiterLength = raw[cursor + 1] === "$" ? 2 : 1;
      const closeToken = delimiterLength === 2 ? "$$" : "$";
      let close = scan.indexOf(closeToken, cursor + delimiterLength);
      while (close >= 0 && scan[close - 1] === "\\") close = scan.indexOf(closeToken, close + delimiterLength);
      if (close >= 0) {
        const latex = mathWithExplicitOptionals(raw.slice(cursor + delimiterLength, close).replace(/\\label\{[^{}]*\}/g, "").trim(), macros);
        appendReplacement(latex, cursor, close + delimiterLength, { type: "math", latex, display: delimiterLength === 2 });
        cursor = close + delimiterLength;
        continue;
      }
      cursor += delimiterLength;
      continue;
    }
    if (character !== "\\") {
      appendCopied(character, cursor);
      cursor += 1;
      continue;
    }

    const escaped = raw[cursor + 1];
    if (escaped === "\\") {
      // \\, \\* and \\[4pt]
      let end = cursor + 2;
      if (raw[end] === "*") end += 1;
      if (raw[end] === "[") {
        const close = raw.indexOf("]", end);
        if (close >= 0 && /^\[[^\]\n]{0,24}\]$/.test(raw.slice(end, close + 1))) end = close + 1;
      }
      appendStyled("linebreak", () => appendReplacement("\n", cursor, end));
      cursor = end;
      continue;
    }
    if (escaped === "(" || escaped === "[") {
      const closeToken = escaped === "(" ? "\\)" : "\\]";
      const close = scan.indexOf(closeToken, cursor + 2);
      if (close >= 0) {
        const latex = mathWithExplicitOptionals(raw.slice(cursor + 2, close).replace(/\\label\{[^{}]*\}/g, "").trim(), macros);
        appendReplacement(latex, cursor, close + 2, { type: "math", latex, display: escaped === "[" });
        cursor = close + 2;
        continue;
      }
      cursor += 2;
      continue;
    }
    if (escaped !== undefined && Object.hasOwn(ACCENT_MARKS, escaped) && !/[A-Za-z]/.test(escaped)) {
      // \'e  \'{e}  \"{\i}  \~{}
      let at = cursor + 2;
      let base = null;
      let end = at;
      if (raw[at] === "{") {
        const close = findClosingBrace(at);
        if (close >= 0) {
          base = raw.slice(at + 1, close).trim();
          end = close + 1;
        }
      } else if (raw[at] === "\\" && /^\\[ij](?![A-Za-z@])/.test(raw.slice(at, at + 3))) {
        base = raw.slice(at, at + 2);
        end = at + 2;
      } else if (raw[at] && /\S/.test(raw[at]) && raw[at] !== "\\") {
        base = raw[at];
        end = at + 1;
      }
      if (base !== null) {
        const letter = base.replace(/^\\([ij])$/, "$1");
        const value = letter === "" ? escaped : /^\p{L}$/u.test(letter) ? `${letter}${ACCENT_MARKS[escaped]}`.normalize("NFC") : letter;
        appendReplacement(value, cursor, end);
        cursor = end;
        continue;
      }
      cursor += 2;
      continue;
    }
    if (escaped !== undefined && Object.hasOwn(CONTROL_SYMBOLS, escaped)) {
      appendReplacement(CONTROL_SYMBOLS[escaped], cursor, cursor + 2);
      cursor += 2;
      continue;
    }
    const commandMatch = raw.slice(cursor, cursor + 80).match(/^\\([A-Za-z@]+)\*?/);
    if (!commandMatch) {
      cursor += escaped === undefined ? 1 : 2;
      continue;
    }
    const command = commandMatch[1];
    const commandEnd = cursor + commandMatch[0].length;
    let argumentStart = skipBlanks(commandEnd);

    if (command === "verb" || command === "lstinline" || command === "mintinline") {
      // Literal text: nothing inside is a command, a comment or math.
      let at = commandEnd;
      if (command !== "verb" && raw[at] === "[") {
        const close = raw.indexOf("]", at);
        if (close >= 0) at = close + 1;
      }
      if (command === "mintinline" && raw[at] === "{") {
        const close = raw.indexOf("}", at);
        if (close >= 0) at = close + 1;
      }
      const delimiter = raw[at];
      let close = -1;
      if (delimiter === "{" && command !== "verb") close = findClosingBrace(at);
      else if (delimiter && !/[\sA-Za-z*]/.test(delimiter)) close = raw.indexOf(delimiter, at + 1);
      const newline = raw.indexOf("\n", at);
      if (close > at && (newline < 0 || close < newline || delimiter === "{")) {
        appendStyled("code", () => appendReplacement(raw.slice(at + 1, close), cursor, close + 1));
        cursor = close + 1;
        continue;
      }
      cursor = commandEnd;
      continue;
    }
    if (command === "iffalse") {
      // Switched-off text inside a sentence; maskLatex blanked it up to its \fi.
      const close = /\\fi(?![A-Za-z@])/.exec(scan.slice(commandEnd));
      cursor = close ? commandEnd + close.index + close[0].length : commandEnd;
      continue;
    }
    if (command === "ensuremath" && raw[argumentStart] === "{") {
      const close = findClosingBrace(argumentStart);
      if (close >= 0) {
        const latex = raw.slice(argumentStart + 1, close).trim();
        appendReplacement(latex, cursor, close + 1, { type: "math", latex, display: false });
        cursor = close + 1;
        continue;
      }
    }
    if (Object.hasOwn(ACCENT_MARKS, command)) {
      // \c{c}  \v{s}  \H{o}  \c c
      let base = null;
      let end = commandEnd;
      if (raw[argumentStart] === "{") {
        const close = findClosingBrace(argumentStart);
        if (close >= 0) {
          base = raw.slice(argumentStart + 1, close).trim();
          end = close + 1;
        }
      } else if (argumentStart > commandEnd && /\p{L}/u.test(raw[argumentStart] || "")) {
        base = raw[argumentStart];
        end = argumentStart + 1;
      }
      if (base !== null && /^\p{L}$/u.test(base)) {
        appendReplacement(`${base}${ACCENT_MARKS[command]}`.normalize("NFC"), cursor, end);
        cursor = end;
        continue;
      }
    }
    if (["def", "gdef", "edef", "xdef", "let"].includes(command)) {
      // \def\name#1{...} and \let\a=\b are code.
      const definition = /^\s*\\[A-Za-z@]+\s*(?:=?\s*\\[A-Za-z@]+|[^{}\n]*)/.exec(scan.slice(commandEnd));
      let end = definition ? commandEnd + definition[0].length : commandEnd;
      if (command !== "let" && scan[end] === "{") {
        const close = findClosingBrace(end);
        if (close >= 0) end = close + 1;
      }
      cursor = end;
      continue;
    }
    if (["vskip", "hskip", "kern", "vglue", "hglue"].includes(command)) {
      // TeX glue: \vskip 0.3in plus 2pt minus 1pt
      const glue = /^\s*-?(?:\d*\.)?\d+\s*(?:true)?(?:[a-z]{2}|\\[A-Za-z]+)(?:\s+(?:plus|minus)\s*-?(?:\d*\.)?\d+\s*(?:[a-z]{2,4}|\\[A-Za-z]+))*/.exec(raw.slice(commandEnd, commandEnd + 80));
      cursor = commandEnd + (glue ? glue[0].length : 0);
      continue;
    }
    if (["chadd", "chdel"].includes(command) && raw[argumentStart] === "{") {
      const close = findClosingBrace(argumentStart);
      if (close >= 0) {
        const annotation = { type: command, start: display.length, end: display.length };
        annotations.push(annotation);
        appendInner(argumentStart + 1, close);
        annotation.end = display.length;
        cursor = close + 1;
        continue;
      }
    }
    if (command === "frac" && raw[argumentStart] === "{") {
      const numeratorClose = findClosingBrace(argumentStart);
      let denominatorOpen = numeratorClose + 1;
      while (raw[denominatorOpen] === " " || raw[denominatorOpen] === "\t") denominatorOpen += 1;
      const denominatorClose = numeratorClose >= 0 && raw[denominatorOpen] === "{" ? findClosingBrace(denominatorOpen) : -1;
      if (denominatorClose >= 0) {
        appendReplacement("(", cursor, argumentStart + 1);
        appendInner(argumentStart + 1, numeratorClose);
        appendReplacement(")/(", numeratorClose, denominatorOpen + 1);
        appendInner(denominatorOpen + 1, denominatorClose);
        appendReplacement(")", denominatorClose, denominatorClose + 1);
        cursor = denominatorClose + 1;
        continue;
      }
    }
    if (["begin", "end"].includes(command) && raw[argumentStart] === "{") {
      const close = findClosingBrace(argumentStart);
      if (close >= 0) {
        // Environments whose \begin takes layout arguments (width, column
        // spec) would otherwise leak those arguments into the display text.
        let after = close + 1;
        const braceArguments = command === "begin" ? ENVIRONMENT_BRACE_ARGUMENTS[raw.slice(argumentStart + 1, close)] : 0;
        // [key=value, ...] right after \begin{...} is an option list, not prose.
        if (command === "begin" && !braceArguments && scan[after] === "[") {
          const optionsClose = bracketEnd(scan, after);
          if (optionsClose >= 0 && /^[^\]\n]*=/.test(scan.slice(after + 1, optionsClose))) after = optionsClose + 1;
        }
        if (braceArguments) {
          after = skipBlanks(after);
          if (raw[after] === "[") {
            const bracketClose = raw.indexOf("]", after);
            if (bracketClose >= 0) after = bracketClose + 1;
          }
          for (let group = 0; group < braceArguments; group += 1) {
            after = skipBlanks(after);
            if (raw[after] !== "{") break;
            const groupClose = findClosingBrace(after);
            if (groupClose < 0) break;
            after = groupClose + 1;
          }
        }
        appendReplacement("\n", cursor, after);
        cursor = after;
        continue;
      }
    }
    if (command === "captionof" && raw[argumentStart] === "{") {
      const environmentClose = findClosingBrace(argumentStart);
      if (environmentClose >= 0) {
        let second = environmentClose + 1;
        while (raw[second] === " " || raw[second] === "\t" || raw[second] === "\n") second += 1;
        if (raw[second] === "{") {
          const close = findClosingBrace(second);
          if (close >= 0) {
            appendInner(second + 1, close);
            cursor = close + 1;
            continue;
          }
        }
        cursor = environmentClose + 1;
        continue;
      }
    }
    if (command === "setlength" || command === "addtolength") {
      let next = argumentStart;
      for (let groupIndex = 0; groupIndex < 2; groupIndex += 1) {
        while (raw[next] === " " || raw[next] === "\t") next += 1;
        if (raw[next] === "\\" && groupIndex === 0) {
          // \setlength\parindent{0pt}
          next += (/^\\[A-Za-z@]+/.exec(raw.slice(next, next + 80)) || [""])[0].length;
          continue;
        }
        if (raw[next] !== "{") break;
        const close = findClosingBrace(next);
        if (close < 0) break;
        next = close + 1;
      }
      cursor = Math.max(commandEnd, next);
      continue;
    }
    if (command === "item") {
      // The blank after \item belongs to the bullet, not to the item text.
      const termClose = raw[commandEnd] === "[" || raw[argumentStart] === "[" ? bracketEnd(scan, argumentStart) : -1;
      if (termClose >= 0) {
        // \item[Term] of a description list.
        appendReplacement("\n• ", cursor, argumentStart + 1);
        appendStyled("strong", () => appendInner(argumentStart + 1, termClose));
        const afterTerm = skipBlanks(termClose + 1);
        appendReplacement(" ", termClose, Math.max(termClose + 1, afterTerm));
        cursor = Math.max(termClose + 1, afterTerm);
        continue;
      }
      appendReplacement("\n• ", cursor, Math.max(commandEnd, argumentStart));
      cursor = Math.max(commandEnd, argumentStart);
      continue;
    }
    if (["left", "right"].includes(command)) {
      cursor = commandEnd;
      continue;
    }
    if (["hat", "bar", "tilde", "vec"].includes(command)) {
      if (raw[argumentStart] === "{") {
        const close = findClosingBrace(argumentStart);
        if (close >= 0) {
          appendInner(argumentStart + 1, close);
          cursor = close + 1;
          continue;
        }
      }
      cursor = commandEnd;
      continue;
    }
    if (["section", "subsection", "subsubsection", "paragraph", "subparagraph"].includes(command)) {
      // \section[short]{long}: the short title is not shown.
      const optional = raw.slice(argumentStart).match(/^\s*\[[^\]\n]*\]\s*/);
      if (optional && raw[argumentStart + optional[0].length] === "{") argumentStart += optional[0].length;
      const close = raw[argumentStart] === "{" ? findClosingBrace(argumentStart) : -1;
      if (close >= 0) {
        appendInner(argumentStart + 1, close);
        cursor = close + 1;
        continue;
      }
    }
    if (Object.hasOwn(CITE_MODES, command)) {
      const mode = CITE_MODES[command];
      const notes = [];
      while (scan[argumentStart] === "[" && notes.length < 2) {
        const optionalClose = bracketEnd(scan, argumentStart);
        if (optionalClose < 0) break;
        notes.push(raw.slice(argumentStart + 1, optionalClose));
        argumentStart = optionalClose + 1;
      }
      const close = raw[argumentStart] === "{" ? findClosingBrace(argumentStart) : -1;
      if (close >= 0) {
        const keys = raw.slice(argumentStart + 1, close).split(",").map((key) => key.trim()).filter(Boolean);
        const before = notes.length === 2 ? flatText(notes[0]) : "";
        const after = notes.length ? flatText(notes.at(-1)) : "";
        const entries = keys.map((key) => referenceContext.citations?.[key] || null);
        // A hand-written thebibliography has numbers, not authors and years.
        const numeric = keys.length > 0 && entries.every((entry) => entry?.numeric && !entry.author);
        const parts = keys.map((key, position) => {
          const citation = entries[position];
          if (!citation) return key;
          if (numeric) return String(citation.number);
          if (mode === "author") return citation.author || key;
          if (mode === "year" || mode === "yearParen") return citation.year || "n.d.";
          return `${citation.author || key}, ${citation.year || "n.d."}`;
        });
        const textual = mode === "text" || mode === "bareText";
        // \footcite reads as a footnote: " [Author, Year]".
        const open = mode === "foot" ? " [" : numeric ? "[" : "(";
        const shut = numeric || mode === "foot" ? "]" : ")";
        const wrapped = mode === "foot" || (numeric ? mode !== "author" && mode !== "year" : mode === "paren" || mode === "yearParen");
        const whole = [cursor, close + 1];
        const citeStart = display.length;
        if (wrapped) appendReplacement(open, ...whole);
        if (before) appendReplacement(`${before} `, ...whole);
        for (let index = 0; index < parts.length; index += 1) {
          const last = index === parts.length - 1;
          let value = parts[index];
          if (textual && !numeric) {
            value = mode === "text"
              ? value.replace(/, ([^,]+)$/, (_, year) => ` (${year}${last && after ? `, ${after}` : ""})`)
              : value.replace(/, ([^,]+)$/, " $1");
          }
          appendReplacement(value, ...whole, { type: "citation", keys: [keys[index]] });
          if (!last) appendReplacement(numeric ? ", " : "; ", ...whole);
        }
        if (after && !(mode === "text" && !numeric)) appendReplacement(`, ${after}`, ...whole);
        if (wrapped) appendReplacement(shut, ...whole);
        if (mode === "foot") styles.push({ type: "footnote", start: citeStart, end: display.length });
        cursor = close + 1;
        continue;
      }
    }
    if (REFERENCE_COMMANDS.has(command) && raw[argumentStart] === "{") {
      const close = findClosingBrace(argumentStart);
      if (close >= 0) {
        const keys = raw.slice(argumentStart + 1, close).split(",").map((key) => key.trim()).filter(Boolean);
        if (!keys.length) keys.push("");
        let previousType = null;
        for (const [position, key] of keys.entries()) {
          const reference = referenceContext.labels?.[key];
          const number = reference?.number || "?";
          const guessed = LABEL_PREFIX_TYPES[key.split(":")[0].toLowerCase()];
          const type = reference?.type && reference.type !== "reference" ? reference.type : guessed || "reference";
          const title = `${type[0]?.toUpperCase() || "R"}${type.slice(1)}`;
          let value = number;
          if (command === "eqref") value = `(${number})`;
          else if (command === "pageref" || command === "autopageref") value = String(reference?.page || "?");
          else if (["autoref", "Autoref", "cref", "Cref", "vref", "Vref"].includes(command)) value = type === previousType ? number : `${title} ${number}`;
          if (position > 0) appendReplacement(", ", cursor, close + 1);
          appendReplacement(value, cursor, close + 1, { type: "reference", key, targetType: type, page: reference?.page || null });
          previousType = type;
        }
        cursor = close + 1;
        continue;
      }
    }
    // A symbol name the author redefined (\newcommand{\P}{\mathbb{P}}) is theirs.
    const spec = TEXT_COMMANDS.get(command)?.text !== undefined && macros.has(command) ? null : TEXT_COMMANDS.get(command);
    if (spec) {
      if (spec.text !== undefined) {
        appendStyled(spec.style, () => appendReplacement(spec.text, cursor, commandEnd));
        cursor = commandEnd;
        continue;
      }
      if (spec.sig === "*") {
        // A definition: its name and every group that follows are code.
        let at = commandEnd;
        for (;;) {
          let next = at;
          while (/[ \t\r\n]/.test(scan[next] || "") && !/^\r?\n[ \t\r]*\n/.test(scan.slice(next))) next += 1;
          if (scan[next] === "{") {
            const close = findClosingBrace(next);
            if (close < 0) break;
            at = close + 1;
          } else if (scan[next] === "[") {
            const close = bracketEnd(scan, next);
            if (close < 0) break;
            at = close + 1;
          } else if (at === commandEnd && scan[next] === "\\" && /^\\[A-Za-z@]+/.test(scan.slice(next, next + 80))) {
            at = next + /^\\[A-Za-z@]+/.exec(scan.slice(next, next + 80))[0].length;
          } else break;
        }
        cursor = at;
        continue;
      }
      const parsed = readArguments(spec.sig, commandEnd);
      if (parsed.incomplete) {
        // An argument is missing (or is cut off, as in a piece of a macro
        // body): drop the name and the arguments that came before it.
        cursor = Math.max(commandEnd, parsed.end);
        continue;
      }
      const shown = (spec.show || []).map((position) => parsed.found[position]).filter(Boolean);
      if (shown.length) {
        appendStyled(spec.style, () => {
          if (spec.before) appendReplacement(spec.before, cursor, shown[0].start);
          for (const [position, argument] of shown.entries()) {
            if (position > 0 && spec.sep !== "") appendReplacement(spec.sep ?? " ", shown[position - 1].end, argument.start);
            if (spec.verbatim) {
              for (let at = argument.start; at < argument.end; at += 1) {
                if (raw[at] === "\\" && /[%#&_{}~^\\]/.test(raw[at + 1] || "")) continue;
                appendCopied(raw[at], at);
              }
            } else appendInner(argument.start, argument.end);
          }
          if (spec.after) appendReplacement(spec.after, shown.at(-1).end, parsed.end);
        });
      }
      cursor = parsed.end;
      continue;
    }
    if (macros.has(command) && depth < MAX_MACRO_DEPTH) {
      const macro = macros.get(command);
      const body = typeof macro === "string" ? macro : String(macro?.body ?? "");
      const params = typeof macro === "string" ? 0 : macro.params || 0;
      const optional = typeof macro === "string" ? null : macro.optional ?? null;
      // An operator or a bare math macro used in prose shows its name.
      if (macro?.mathOnly) {
        appendReplacement(flatText(body.replace(/^\\operatorname\*?/, "")), cursor, commandEnd);
        cursor = commandEnd;
        continue;
      }
      const parsed = readArguments(`${optional === null ? "" : "o"}${"m".repeat(params)}`, commandEnd);
      if (!parsed.incomplete) {
        const values = parsed.found.map((argument, position) => (argument
          ? { range: argument, text: raw.slice(argument.start, argument.end) }
          : { range: null, text: position === 0 && optional !== null ? optional : "" }));
        const alias = /^\\([A-Za-z@]+)\s*\{\s*#1\s*\}$/.exec(body);
        if (!values.length) {
          appendExpanded(body, cursor, parsed.end);
        } else if (alias && values.length === 1 && values[0].range && TEXT_COMMANDS.get(alias[1])?.show?.length === 1 && TEXT_COMMANDS.get(alias[1]).sig === "m") {
          // \newcommand{\term}[1]{\emph{#1}}: the argument stays editable and keeps the style.
          appendStyled(TEXT_COMMANDS.get(alias[1]).style, () => appendInner(values[0].range.start, values[0].range.end));
        } else if (/[$]|\\\(|\\\[|\\ensuremath|\\begin\b|\\verb/.test(body)) {
          // Arguments may sit inside math: substitute as text, show as one unit.
          appendExpanded(body.replace(/#([1-9])/g, (_, number) => values[Number(number) - 1]?.text ?? ""), cursor, parsed.end);
        } else {
          // Literal pieces map to the command; each argument keeps its own range.
          for (const piece of body.split(/(#[1-9])/)) {
            const value = /^#[1-9]$/.test(piece) ? values[Number(piece[1]) - 1] : null;
            if (!value) {
              // The blanks of "[#1: #2]" are part of the text.
              if (!/^#[1-9]$/.test(piece)) appendExpanded(piece, cursor, parsed.end, true);
            } else if (value.range) appendInner(value.range.start, value.range.end);
            else appendExpanded(value.text, cursor, parsed.end);
          }
        }
        cursor = parsed.end;
        continue;
      }
    }
    const common = {
      eg: "e.g.", ie: "i.e.", etal: "et al.", vs: "vs.",
      ell: "ℓ", alpha: "α", beta: "β", gamma: "γ", theta: "θ", lambda: "λ",
      mu: "μ", sigma: "σ", times: "×", pm: "±", leq: "≤", geq: "≥",
      sum: "∑", prod: "∏", in: "∈", cdot: "·", approx: "≈", neq: "≠",
      uparrow: "↑", downarrow: "↓",
      leftarrow: "←", rightarrow: "→", Leftrightarrow: "⇔", lvert: "|", rvert: "|",
    }[command];
    if (common) {
      appendReplacement(common, cursor, commandEnd);
      cursor = commandEnd;
      continue;
    }
    // A command this parser does not know. With arguments, their text is
    // shown and the name is not; alone, the command is shown as it is
    // written (marked "command" for the page), never as a bare word.
    const groups = [];
    let at = commandEnd;
    for (;;) {
      if (scan[at] === "[") {
        const close = bracketEnd(scan, at);
        if (close < 0 || /\n/.test(scan.slice(at, close))) break;
        at = close + 1;
        continue;
      }
      const open = skipBlanks(at);
      const close = scan[open] === "{" ? findClosingBrace(open) : -1;
      if (close < 0) break;
      groups.push({ start: open + 1, end: close });
      at = close + 1;
    }
    const filled = groups.filter((group) => raw.slice(group.start, group.end).trim());
    if (!filled.length) {
      appendStyled("command", () => appendReplacement(`\\${command}`, cursor, commandEnd));
      cursor = commandEnd;
      continue;
    }
    for (const [position, group] of filled.entries()) {
      if (position > 0) appendReplacement(" ", filled[position - 1].end, group.start);
      appendInner(group.start, group.end);
    }
    cursor = at;
  }

  const value = display.join("");
  const leftTrim = keepEdges ? 0 : value.length - value.trimStart().length;
  const rightEdge = keepEdges ? value.length : value.trimEnd().length;
  const clip = (ranges) => ranges
    .map((range) => ({ ...range, start: range.start - leftTrim, end: range.end - leftTrim }))
    .filter((range) => range.end > 0 && range.start < rightEdge - leftTrim)
    .map((range) => ({ ...range, start: Math.max(0, range.start), end: Math.min(rightEdge - leftTrim, range.end) }));
  return {
    display: value.slice(leftTrim, rightEdge),
    displayStarts: displayStarts.slice(leftTrim, rightEdge),
    displayEnds: displayEnds.slice(leftTrim, rightEdge),
    annotations: clip(annotations),
    styles: clip(styles),
    hidden: false,
  };
}

function braceGroupAt(value, openAt) {
  if (value[openAt] !== "{") return null;
  let depth = 0;
  for (let cursor = openAt; cursor < value.length; cursor += 1) {
    if (value[cursor] === "{" && value[cursor - 1] !== "\\") depth += 1;
    if (value[cursor] === "}" && value[cursor - 1] !== "\\") {
      depth -= 1;
      if (depth === 0) {
        return {
          value: value.slice(openAt + 1, cursor),
          start: openAt + 1,
          contentEnd: cursor,
          end: cursor + 1,
        };
      }
    }
  }
  return null;
}

function commandArgument(value, command) {
  const match = new RegExp(`\\\\${command}\\*?(?:\\s*\\[[^\\]]*\\])?\\s*\\{`, "i").exec(value);
  if (!match) return null;
  const openAt = match.index + match[0].lastIndexOf("{");
  return braceGroupAt(value, openAt);
}

function renderTex(value, macros = new Map(), references = { labels: {}, citations: {} }) {
  const unwrapped = String(value || "")
    .replace(/\\(?:hyp|phantom|makebox)\s*\{([^{}]*)\}/g, "$1")
    .replace(/\\(?:tiny|scriptsize|small|normalsize|raggedright|centering)\b/g, "");
  return latexToDisplay(unwrapped, "paragraph", macros, references);
}

function stripTex(value, macros = new Map(), references = { labels: {}, citations: {} }) {
  return renderTex(value, macros, references).display
    .replace(/\\Delta\b/g, "Δ")
    .replace(/\\(?:rightarrow|to)\b/g, "→")
    .replace(/\\([,%])/g, "$1")
    .replace(/[{}]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeCaptionDisplay(rendered) {
  const value = String(rendered?.display || "");
  const display = [];
  const displayStarts = [];
  const displayEnds = [];
  const replacements = [
    ["\\rightarrow", "→"],
    ["\\Delta", "Δ"],
    ["\\to", "→"],
    ["\\%", "%"],
    ["\\,", ""],
  ];
  const append = (text, start, end) => {
    for (const character of text) {
      display.push(character);
      displayStarts.push(start);
      displayEnds.push(end);
    }
  };
  for (let index = 0; index < value.length;) {
    const replacement = replacements.find(([source]) => value.startsWith(source, index));
    if (replacement) {
      const [source, target] = replacement;
      const last = index + source.length - 1;
      append(target, rendered.displayStarts[index], rendered.displayEnds[last]);
      index += source.length;
      continue;
    }
    const character = value[index];
    if (character === "{" || character === "}") {
      index += 1;
      continue;
    }
    if (/\s/.test(character)) {
      const first = index;
      while (index < value.length && /\s/.test(value[index])) index += 1;
      if (display.length && display.at(-1) !== " ") {
        append(" ", rendered.displayStarts[first], rendered.displayEnds[index - 1]);
      }
      continue;
    }
    append(character, rendered.displayStarts[index], rendered.displayEnds[index]);
    index += 1;
  }
  if (display.at(-1) === " ") {
    display.pop();
    displayStarts.pop();
    displayEnds.pop();
  }
  return { display: display.join(""), displayStarts, displayEnds };
}

function auxGroups(value, startAt) {
  const groups = [];
  let cursor = startAt;
  while (cursor < value.length) {
    while (/\s/.test(value[cursor] || "")) cursor += 1;
    if (value[cursor] !== "{") break;
    const group = braceGroupAt(value, cursor);
    if (!group) break;
    groups.push(group.value);
    cursor = group.end;
  }
  return groups;
}

async function projectReferences() {
  const compileRoot = path.resolve(repoRoot, config.latex.cwd);
  const mainArgument = [...config.latex.args].reverse().find((value) => String(value).endsWith(".tex")) || "main.tex";
  const auxPath = path.join(compileRoot, `${path.basename(mainArgument, ".tex")}.aux`);
  const labels = {};
  const citations = {};
  try {
    let aux = await fs.readFile(auxPath, "utf8");
    // \include{chapter} writes chapter.aux and names it in the main .aux.
    for (const match of [...aux.matchAll(/^\\@input\{([^{}]+[.]aux)\}/gm)].slice(0, 200)) {
      const included = path.resolve(compileRoot, match[1]);
      if (!isInside(compileRoot, included)) continue;
      try {
        aux += `\n${await fs.readFile(included, "utf8")}`;
      } catch {
        // Not compiled yet.
      }
    }
    for (const line of aux.split("\n")) {
      if (line.startsWith("\\newlabel{")) {
        const keyGroup = braceGroupAt(line, line.indexOf("{"));
        const payloadOpen = keyGroup ? line.indexOf("{", keyGroup.end) : -1;
        const payload = payloadOpen >= 0 ? braceGroupAt(line, payloadOpen) : null;
        const groups = payload ? auxGroups(payload.value, 0) : [];
        const key = keyGroup?.value;
        if (key) {
          const prefix = key.split(":")[0];
          labels[key] = {
            key,
            number: stripTex(groups[0] || "?"),
            page: Number.parseInt(groups[1], 10) || null,
            type: prefix === "fig" ? "figure" : prefix === "tab" ? "table" : prefix === "eq" ? "equation" : prefix === "sec" ? "section" : LABEL_PREFIX_TYPES[prefix.toLowerCase()] || "reference",
          };
        }
      } else if (line.startsWith("\\bibcite{")) {
        const keyGroup = braceGroupAt(line, line.indexOf("{"));
        const payloadOpen = keyGroup ? line.indexOf("{", keyGroup.end) : -1;
        const payload = payloadOpen >= 0 ? braceGroupAt(line, payloadOpen) : null;
        const groups = payload ? auxGroups(payload.value, 0) : [];
        if (keyGroup?.value) {
          citations[keyGroup.value] = {
            key: keyGroup.value,
            number: stripTex(groups[0] || ""),
            year: stripTex(groups[1] || ""),
            author: stripTex(groups[2] || "").replace(/^\{+|\}+$/g, ""),
          };
        }
      }
    }
  } catch {
    // A source-only project can still render unresolved reference keys.
  }

  // Bibliographies may sit next to the main file or anywhere under the source
  // root. A missing latex.cwd must not break every document request.
  const bibFiles = new Set();
  try {
    for (const entry of await fs.readdir(compileRoot, { withFileTypes: true })) {
      if (entry.isFile() && entry.name.toLowerCase().endsWith(".bib")) bibFiles.add(path.join(compileRoot, entry.name));
    }
  } catch {
    // No compile directory: fall back to the source tree below.
  }
  for (const found of await walkSourceFiles((name) => name.toLowerCase().endsWith(".bib"))) bibFiles.add(found);
  for (const bibFile of bibFiles) {
    let bib;
    try {
      bib = await fs.readFile(bibFile, "utf8");
    } catch {
      continue;
    }
    const entryPattern = /@[A-Za-z]+\s*\{\s*([^,\s]+)\s*,/g;
    let match;
    while ((match = entryPattern.exec(bib)) !== null) {
      let depth = 1;
      let cursor = entryPattern.lastIndex;
      for (; cursor < bib.length && depth > 0; cursor += 1) {
        if (bib[cursor] === "{" && bib[cursor - 1] !== "\\") depth += 1;
        if (bib[cursor] === "}" && bib[cursor - 1] !== "\\") depth -= 1;
      }
      const body = bib.slice(entryPattern.lastIndex, cursor - 1);
      const field = (name) => {
        const fieldMatch = new RegExp(`${name}\\s*=\\s*\\{`, "i").exec(body);
        if (!fieldMatch) return "";
        return braceGroupAt(body, fieldMatch.index + fieldMatch[0].lastIndexOf("{"))?.value || "";
      };
      citations[match[1]] ||= { key: match[1] };
      citations[match[1]].title = stripTex(field("title"));
      citations[match[1]].year ||= stripTex(field("year"));
      const authorField = field("author");
      citations[match[1]].authors = stripTex(authorField).replace(/\s+and\s+/gi, ", ");
      citations[match[1]].venue = stripTex(field("journal") || field("booktitle"));
      // Only web links leave the server: a .bib pasted from elsewhere must not
      // be able to hand the browser a javascript: or data: URL.
      citations[match[1]].url = safeHttpUrl(stripTex(field("url")));
      citations[match[1]].doi = stripTex(field("doi")).replace(/^https?:\/\/(?:dx[.])?doi[.]org\//i, "");
      if (!/^10[.]\d{4,9}\/\S+$/.test(citations[match[1]].doi)) citations[match[1]].doi = "";
      citations[match[1]].abstract = stripTex(field("abstract"));
      const paperUrl = citations[match[1]].url;
      if (/^https?:\/\/arxiv[.]org\/abs\//i.test(paperUrl)) {
        citations[match[1]].pdfUrl = `${paperUrl.replace(/\/abs\//i, "/pdf/").replace(/\/$/, "")}.pdf`;
      } else if (/^https?:\/\/openreview[.]net\/forum[?]/i.test(paperUrl)) {
        citations[match[1]].pdfUrl = paperUrl.replace("/forum?", "/pdf?");
      } else if (/^https?:\/\/aclanthology[.]org\/[^/]+\/$/i.test(paperUrl)) {
        citations[match[1]].pdfUrl = `${paperUrl.slice(0, -1)}.pdf`;
      } else if (/[.]pdf(?:[?#]|$)/i.test(paperUrl)) {
        citations[match[1]].pdfUrl = paperUrl;
      }
      if (!citations[match[1]].author) {
        const firstAuthor = authorField.split(/\s+and\s+/i)[0] || "";
        const family = firstAuthor.includes(",") ? firstAuthor.split(",")[0] : firstAuthor.trim().split(/\s+/).at(-1);
        citations[match[1]].author = stripTex(family || match[1]);
      }
      entryPattern.lastIndex = cursor;
    }
  }
  for (const absolute of await walkSourceFiles((name) => name.toLowerCase().endsWith(".tex"))) {
    let source;
    try {
      source = await fs.readFile(absolute, "utf8");
    } catch {
      continue;
    }
    for (const block of parseBlocks(source)) {
      const pattern = /\\label\{([^}]+)\}/g;
      let labelMatch;
      while ((labelMatch = pattern.exec(block.raw)) !== null) {
        labels[labelMatch[1]] ||= { key: labelMatch[1], number: "?", page: null, type: "reference" };
        labels[labelMatch[1]].path = relativeRepo(absolute);
        labels[labelMatch[1]].blockIndex = block.index;
        labels[labelMatch[1]].blockId = block.id;
      }
      // A hand-written \begin{thebibliography}: entries cite by number.
      if (block.kind === "bibliography") {
        for (const [position, item] of bibliographyItems(block.raw).entries()) {
          citations[item.key] ||= { key: item.key, number: item.label || String(position + 1), numeric: true };
          citations[item.key].title ||= stripTex(item.raw).slice(0, 600);
          citations[item.key].path ||= relativeRepo(absolute);
        }
      }
    }
  }
  return { labels, citations, macros: await projectMacros() };
}

// \bibitem[label]{key} text ... of one thebibliography block.
function bibliographyItems(raw) {
  const items = [];
  const masked = maskLatex(raw);
  const endAt = masked.lastIndexOf("\\end{thebibliography}");
  const pattern = /\\bibitem(?![A-Za-z@])\s*(?:\[([^\]\n]*)\])?\s*\{([^{}\n]*)\}/g;
  const found = [...masked.matchAll(pattern)];
  for (const [position, match] of found.entries()) {
    const start = match.index + match[0].length;
    const end = position + 1 < found.length ? found[position + 1].index : (endAt >= 0 ? endAt : raw.length);
    const key = match[2].trim();
    if (key) items.push({ key, label: (match[1] || "").trim(), raw: raw.slice(start, Math.max(start, end)).trim() });
  }
  return items;
}

// Macros defined in the main file and in whatever it pulls in with \input,
// \include and friends (or a local .sty/.cls named by \usepackage). They only
// affect how text is displayed; no offset depends on them.
async function projectMacros() {
  const compileRoot = path.resolve(repoRoot, config.latex.cwd);
  const mainArgument = [...config.latex.args].reverse().find((value) => String(value).endsWith(".tex")) || "main.tex";
  const macros = new Map();
  const visited = new Set();
  async function visit(absolutePath, depth) {
    const normalized = path.resolve(absolutePath);
    if (depth > 12 || visited.size > 200 || visited.has(normalized)) return;
    if (!existsSync(normalized) || !insideSourceRoot(normalized)) return;
    visited.add(normalized);
    let source;
    try {
      const stat = await fs.stat(normalized);
      if (!stat.isFile() || stat.size > 2_000_000) return;
      source = await fs.readFile(normalized, "utf8");
    } catch {
      return;
    }
    const masked = maskLatex(source);
    const events = includeCommands(masked).map((item) => ({ index: item.index, targets: [path.extname(item.target) ? item.target : `${item.target}.tex`] }));
    for (const match of masked.matchAll(/\\(?:usepackage|RequirePackage|documentclass)\s*(?:\[[^\]]*\]\s*)?\{([^{}]*)\}/g)) {
      const extension = /documentclass/.test(match[0]) ? ".cls" : ".sty";
      events.push({ index: match.index, targets: match[1].split(",").map((name) => `${name.trim()}${extension}`).filter((name) => name.length > 4) });
    }
    events.sort((left, right) => left.index - right.index);
    // Definitions and included files in source order: a later one wins.
    let cursor = 0;
    for (const event of events) {
      for (const [name, macro] of collectMacros(source.slice(cursor, event.index))) {
        if (!(macro.provide && macros.has(name))) macros.set(name, macro);
      }
      cursor = event.index;
      for (const target of event.targets) {
        for (const base of [compileRoot, path.dirname(normalized)]) await visit(path.resolve(base, target), depth + 1);
      }
    }
    for (const [name, macro] of collectMacros(source.slice(cursor))) {
      if (!(macro.provide && macros.has(name))) macros.set(name, macro);
    }
  }
  await visit(path.resolve(compileRoot, mainArgument), 0);
  return macros;
}

// The macros that apply to one file: the project's, then the file's own.
function documentMacros(source, references) {
  const macros = new Map(references?.macros || []);
  for (const [name, macro] of collectMacros(source)) {
    if (!(macro.provide && macros.has(name))) macros.set(name, macro);
  }
  return macros;
}

function safeHttpUrl(value) {
  try {
    const url = new URL(String(value || "").trim());
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : "";
  } catch {
    return "";
  }
}

const skippedDirectories = new Set(["build", "__pycache__", "node_modules"]);

// Every regular file under the source root whose name passes `accept`.
// Symbolic links are never followed, so a link cannot pull files from outside
// the project into the document list, the label index or the bibliography.
async function walkSourceFiles(accept) {
  const found = [];
  async function walk(directory) {
    let entries;
    try {
      entries = await fs.readdir(directory, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (!entry.name.startsWith(".") && !skippedDirectories.has(entry.name)) await walk(absolute);
      } else if (entry.isFile() && accept(entry.name)) found.push(absolute);
    }
  }
  await walk(sourceRoot);
  return found;
}

let projectReferencesCache = null;
let projectReferencesCachedAt = 0;
let projectReferencesInFlight = null;

async function cachedProjectReferences() {
  if (projectReferencesCache && Date.now() - projectReferencesCachedAt < 5000) return projectReferencesCache;
  if (projectReferencesInFlight) return projectReferencesInFlight;
  projectReferencesInFlight = projectReferences()
    .then((references) => {
      projectReferencesCache = references;
      projectReferencesCachedAt = Date.now();
      return references;
    })
    .finally(() => {
      projectReferencesInFlight = null;
    });
  return projectReferencesInFlight;
}

function tableRows(raw, macros, references) {
  // A table this parser cannot read (no tabular, or one that is cut off)
  // has no rows: the page then shows the compiled-PDF note.
  const unreadable = { rows: [], formattedRows: [], headerRows: 1 };
  const begin = /\\begin\{(tabular\*?|tabularx|longtable\*?)\}/i.exec(raw);
  if (!begin) return unreadable;
  let cursor = begin.index + begin[0].length;
  if (/^(?:tabular\*|tabularx)$/i.test(begin[1])) {
    while (/\s/.test(raw[cursor] || "")) cursor += 1;
    const width = braceGroupAt(raw, cursor);
    if (!width) return unreadable;
    cursor = width.end;
  }
  while (/\s/.test(raw[cursor] || "")) cursor += 1;
  if (raw[cursor] === "[") {
    // \begin{tabular}[t]{ll}
    const positionEnd = raw.indexOf("]", cursor);
    if (positionEnd >= 0 && positionEnd - cursor < 12) cursor = positionEnd + 1;
    while (/\s/.test(raw[cursor] || "")) cursor += 1;
  }
  const columns = braceGroupAt(raw, cursor);
  if (!columns) return unreadable;
  const endAt = raw.indexOf(`\\end{${begin[1]}}`, columns.end);
  if (endAt < 0) return unreadable;
  const body = raw.slice(columns.end, endAt);
  const multicolumnValue = (cell) => {
    const command = /\\multicolumn\s*/.exec(cell);
    if (!command) return null;
    let at = command.index + command[0].length;
    const groups = [];
    for (let index = 0; index < 3; index += 1) {
      while (/\s/.test(cell[at] || "")) at += 1;
      const group = braceGroupAt(cell, at);
      if (!group) return null;
      groups.push(group.value);
      at = group.end;
    }
    return { value: groups[2], colspan: Number.parseInt(groups[0], 10) || 1 };
  };
  const multirowValue = (cell) => {
    const command = /\\multirow\s*/.exec(cell);
    if (!command) return null;
    let at = command.index + command[0].length;
    const groups = [];
    for (let index = 0; index < 3; index += 1) {
      while (/\s/.test(cell[at] || "")) at += 1;
      const group = braceGroupAt(cell, at);
      if (!group) return null;
      groups.push(group.value);
      at = group.end;
    }
    return { value: groups[2], rowspan: Number.parseInt(groups[0], 10) || 1 };
  };
  const cleanRow = (row) => row
    .replace(/\\(?:toprule|midrule|bottomrule|cmidrule)(?:\([^)]*\))?(?:\{[^}]*\})?/g, "")
    // longtable keeps its caption, label and head/foot markers among the rows.
    .replace(/\\(?:caption|label)\s*(?:\[[^\]]*\])?\s*\{(?:[^{}]|\{[^{}]*\})*\}|\\end(?:first)?head(?![A-Za-z])|\\end(?:last)?foot(?![A-Za-z])/g, "")
    .trim();
  const splitRows = (value) => {
    const rows = [];
    let start = 0;
    let depth = 0;
    for (let index = 0; index < value.length; index += 1) {
      const character = value[index];
      if (character === "{" && value[index - 1] !== "\\") {
        depth += 1;
        continue;
      }
      if (character === "}" && value[index - 1] !== "\\") {
        depth = Math.max(0, depth - 1);
        continue;
      }
      if (character !== "\\" || value[index + 1] !== "\\" || depth !== 0) continue;
      rows.push(value.slice(start, index));
      index += 1;
      if (value[index + 1] === "[") {
        const optionalEnd = value.indexOf("]", index + 2);
        if (optionalEnd >= 0) index = optionalEnd;
      }
      start = index + 1;
    }
    rows.push(value.slice(start));
    return rows;
  };
  const headerBoundary = body.indexOf("\\midrule");
  const headerRows = headerBoundary < 0 ? 1 : body
    .slice(0, headerBoundary);
  const headerRowCount = headerBoundary < 0 ? 1 : splitRows(headerRows)
    .map(cleanRow)
    .filter(Boolean).length;
  const formattedRows = splitRows(body)
    .map(cleanRow)
    .filter(Boolean)
    .map((row) => row.split(/(?<!\\)&/).map((cell) => {
      const multicolumn = multicolumnValue(cell);
      const multirow = multirowValue(cell);
      const source = multicolumn?.value || multirow?.value || cell.replace(/^\\quad\s*/, " ");
      const rendered = renderTex(source, macros, references);
      return {
        text: rendered.display,
        annotations: rendered.annotations || [],
        styles: rendered.styles || [],
        colspan: multicolumn?.colspan || 1,
        rowspan: multirow?.rowspan || 1,
      };
    }))
    .filter((row) => row.some((cell) => cell.text));
  return {
    rows: formattedRows.map((row) => row.map((cell) => cell.text.replace(/\s+/g, " ").trim())),
    formattedRows,
    headerRows: Math.max(1, headerRowCount),
  };
}

async function resolveGraphic(relativePath, target) {
  if (!target) return null;
  const documentDirectory = path.dirname(resolveDocument(relativePath));
  const compileRoot = path.resolve(repoRoot, config.latex.cwd);
  const extensions = path.extname(target) ? [""] : [".pdf", ".png", ".jpg", ".jpeg", ".webp", ".svg"];
  for (const base of [documentDirectory, compileRoot]) {
    for (const extension of extensions) {
      const candidate = path.resolve(base, `${target}${extension}`);
      if (existsSync(candidate) && insideSourceRoot(candidate)) {
        return { path: relativeRepo(candidate), type: path.extname(candidate).slice(1).toLowerCase() };
      }
    }
  }
  return null;
}

async function resolveIncludedArtifact(relativePath, target, macros, references, { onlyArtifacts = false } = {}) {
  if (!target) return null;
  const documentDirectory = path.dirname(resolveDocument(relativePath));
  const compileRoot = path.resolve(repoRoot, config.latex.cwd);
  const candidates = [];
  for (const base of [documentDirectory, compileRoot, sourceRoot]) {
    for (const extension of path.extname(target) ? [""] : [".tex", ""]) {
      candidates.push(path.resolve(base, `${target}${extension}`));
    }
  }
  for (const candidate of candidates) {
    if (!existsSync(candidate) || !insideSourceRoot(candidate)) continue;
    let includedSource;
    try {
      includedSource = await fs.readFile(candidate, "utf8");
    } catch {
      continue;
    }
    const includedBlocks = parseBlocks(includedSource);
    const artifact = includedBlocks.find((item) => ["table", "figure"].includes(item.kind));
    if (!artifact) continue;
    // Without a telling file name, only a file that holds nothing but the
    // float counts: a section file that happens to contain a figure does not.
    if (onlyArtifacts && includedBlocks.some((item) => !["table", "figure", "structure"].includes(item.kind))) continue;
    const includedMacros = new Map([...macros, ...collectMacros(includedSource)]);
    const includedPath = relativeRepo(candidate);
    const semantic = await semanticBlock(artifact, includedPath, includedMacros, references);
    if (!semantic) continue;
    return {
      ...semantic,
      artifactType: artifact.kind,
      embedded: true,
      sourcePath: includedPath,
      sourceEtag: sha(includedSource),
      sourceBlockIndex: artifact.index,
      captionSource: semantic.captionSource
        ? { ...semantic.captionSource, etag: sha(includedSource) }
        : null,
    };
  }
  return null;
}

// True when \input{target} names a readable file inside the source root.
async function includeResolves(relativePath, target) {
  const documentDirectory = path.dirname(resolveDocument(relativePath));
  const compileRoot = path.resolve(repoRoot, config.latex.cwd);
  for (const base of [documentDirectory, compileRoot, sourceRoot]) {
    for (const extension of path.extname(target) ? [""] : [".tex", ""]) {
      const candidate = path.resolve(base, `${target}${extension}`);
      try {
        if (insideSourceRoot(candidate) && (await fs.stat(candidate)).isFile()) return true;
      } catch {
        // Try the next place LaTeX would look.
      }
    }
  }
  return false;
}

// \captionof{table}{...} / \captionof{figure}{...} (caption package) captions
// outside a float; returns the same shape as commandArgument.
function captionOfArgument(value) {
  const match = /\\captionof\s*\{[^}]*\}\s*\{/.exec(value);
  if (!match) return null;
  return braceGroupAt(value, match.index + match[0].length - 1);
}

// The caption of a float itself, not of a subfigure or a minipage inside it:
// the same shape as commandArgument, found in a copy with those inner
// environments blanked.
function floatCaptionArgument(raw) {
  let outer = maskLatex(raw);
  const inner = /\\begin\{(subfigure|subtable|minipage|subcaptionblock)\}/g;
  let match;
  while ((match = inner.exec(outer)) !== null) {
    const end = environmentEnd(outer, match[1], inner.lastIndex);
    if (end < 0) break;
    outer = `${outer.slice(0, match.index)}${outer.slice(match.index, end).replace(/[^\n]/g, " ")}${outer.slice(end)}`;
    inner.lastIndex = end;
  }
  return commandArgument(outer, "caption") || captionOfArgument(outer) || commandArgument(maskLatex(raw), "caption");
}

// Pseudo-code of algorithmic / algpseudocode as indented plain lines.
function algorithmText(body) {
  const lines = [];
  let indent = 0;
  const openers = /^\\(?:If|For|ForAll|While|Loop|Repeat|Function|Procedure|IF|FOR|FORALL|WHILE|LOOP|REPEAT)(?![A-Za-z])/;
  const closers = /^\\(?:EndIf|EndFor|EndWhile|EndLoop|Until|EndFunction|EndProcedure|ENDIF|ENDFOR|ENDWHILE|ENDLOOP|UNTIL)(?![A-Za-z])/;
  const middles = /^\\(?:Else|ElsIf|ELSE|ELSIF)(?![A-Za-z])/;
  const groups = (text) => {
    const found = [];
    let at = 0;
    while (/\s/.test(text[at] || "")) at += 1;
    while (text[at] === "{") {
      const group = braceGroupAt(text, at);
      if (!group) break;
      found.push(group.value);
      at = group.end;
    }
    return { found, rest: text.slice(at) };
  };
  const words = {
    If: (a) => `\\textbf{if} ${a[0] || ""} \\textbf{then}`, ElsIf: (a) => `\\textbf{else if} ${a[0] || ""} \\textbf{then}`,
    Else: () => "\\textbf{else}", For: (a) => `\\textbf{for} ${a[0] || ""} \\textbf{do}`, ForAll: (a) => `\\textbf{for all} ${a[0] || ""} \\textbf{do}`,
    While: (a) => `\\textbf{while} ${a[0] || ""} \\textbf{do}`, Loop: () => "\\textbf{loop}",
    Repeat: () => "\\textbf{repeat}", Until: (a) => `\\textbf{until} ${a[0] || ""}`,
    Function: (a) => `\\textbf{function} \\textsc{${a[0] || ""}}(${a[1] || ""})`, Procedure: (a) => `\\textbf{procedure} \\textsc{${a[0] || ""}}(${a[1] || ""})`,
    EndIf: () => "\\textbf{end if}", EndFor: () => "\\textbf{end for}", EndWhile: () => "\\textbf{end while}",
    EndLoop: () => "\\textbf{end loop}", EndFunction: () => "\\textbf{end function}", EndProcedure: () => "\\textbf{end procedure}",
  };
  // The upper-case spellings of the older algorithmic package.
  for (const [upper, name] of Object.entries({ IF: "If", ELSIF: "ElsIf", ELSE: "Else", FOR: "For", FORALL: "ForAll", WHILE: "While", LOOP: "Loop", REPEAT: "Repeat", UNTIL: "Until", ENDIF: "EndIf", ENDFOR: "EndFor", ENDWHILE: "EndWhile", ENDLOOP: "EndLoop" })) words[upper] = words[name];
  const tidy = (text) => text
    .replace(/\\Comment\s*\{((?:[^{}]|\{[^{}]*\})*)\}/g, "  ▷ $1")
    .replace(/\\COMMENT\s*\{((?:[^{}]|\{[^{}]*\})*)\}/g, "  ▷ $1")
    .replace(/\\Call\s*\{([^{}]*)\}\s*\{((?:[^{}]|\{[^{}]*\})*)\}/g, "\\text{$1}($2)")
    .replace(/\\(?:Return|RETURN)(?![A-Za-z])/g, "\\textbf{return}")
    .replace(/\\(?:State|Statex|STATE)(?![A-Za-z])\s*/g, "")
    .replace(/[ \t]+/g, " ")
    .trim();
  const statements = maskLatex(body)
    .replace(/\\(?=(?:State|Statex|STATE|If|IF|ElsIf|ELSIF|Else|ELSE|EndIf|ENDIF|For|FOR|ForAll|FORALL|EndFor|ENDFOR|While|WHILE|EndWhile|ENDWHILE|Loop|LOOP|EndLoop|ENDLOOP|Repeat|REPEAT|Until|UNTIL|Function|EndFunction|Procedure|EndProcedure|Require|Ensure|REQUIRE|ENSURE|Input|Output)(?![A-Za-z]))/g, "\n\\")
    .split("\n").map((line) => line.trim()).filter(Boolean);
  for (const statement of statements) {
    if (/^\[[^\]]*\]$/.test(statement)) continue;
    let text = statement;
    const keyword = /^\\([A-Za-z]+)/.exec(statement)?.[1];
    if (closers.test(statement) || middles.test(statement)) indent = Math.max(0, indent - 1);
    if (keyword && words[keyword]) {
      const { found, rest } = groups(statement.slice(keyword.length + 1));
      text = `${words[keyword](found.map(tidy))} ${tidy(rest)}`;
    } else if (/^\\(?:Require|REQUIRE|Input)(?![A-Za-z])/.test(statement)) text = `\\textbf{Require:} ${tidy(statement.replace(/^\\[A-Za-z]+/, ""))}`;
    else if (/^\\(?:Ensure|ENSURE|Output)(?![A-Za-z])/.test(statement)) text = `\\textbf{Ensure:} ${tidy(statement.replace(/^\\[A-Za-z]+/, ""))}`;
    else text = tidy(statement);
    if (text.trim()) lines.push({ indent, latex: text.trim() });
    if (openers.test(statement) || middles.test(statement)) indent += 1;
  }
  return lines;
}

// Program text of a verbatim-like block: common indentation and empty first
// and last lines removed.
function dedentCode(text) {
  const lines = String(text || "").replace(/\r\n/g, "\n").replace(/\t/g, "    ").split("\n");
  while (lines.length && !lines[0].trim()) lines.shift();
  while (lines.length && !lines.at(-1).trim()) lines.pop();
  const margin = Math.min(...lines.filter((line) => line.trim()).map((line) => line.length - line.trimStart().length), 80);
  return lines.map((line) => line.slice(Math.min(margin, line.length - line.trimStart().length))).join("\n");
}

async function semanticBlock(block, relativePath, macros, references) {
  const label = commandArgument(block.raw, "label")?.value || null;
  const reference = label ? references.labels[label] : null;
  const common = { label, number: reference?.number || null, page: reference?.page || null };
  if (block.kind === "math") {
    const environment = block.raw.match(/\\begin\{([^}]+)\}/)?.[1] || "display";
    let latex = block.raw
      .replace(/^\s*\\begin\{(?:equation|align|alignat|flalign|gather|multline|eqnarray|displaymath)\*?\}/, "")
      .replace(/\\end\{(?:equation|align|alignat|flalign|gather|multline|eqnarray|displaymath)\*?\}\s*$/, "")
      .replace(/^\s*\\\[/, "").replace(/\\\]\s*$/, "").replace(/\\label\{[^}]+\}/g, "").trim();
    // Multi-line environments need an environment KaTeX knows; the starred
    // forms keep KaTeX from inventing equation numbers of its own.
    const base = environment.replace(/\*$/, "");
    if (base === "align" || base === "flalign") latex = `\\begin{align*}\n${latex}\n\\end{align*}`;
    else if (base === "alignat") latex = `\\begin{alignat*}${latex}\n\\end{alignat*}`;
    else if (base === "gather" || base === "multline") latex = `\\begin{gather*}\n${latex}\n\\end{gather*}`;
    else if (base === "eqnarray") latex = `\\begin{array}{rcl}\n${latex}\n\\end{array}`;
    return { ...common, latex: mathWithExplicitOptionals(latex, macros), environment, fallback: false };
  }
  if (block.kind === "code") {
    const environment = block.raw.match(/\\begin\{([^}]+)\}/)?.[1] || "verbatim";
    const open = new RegExp(`^\\s*\\\\begin\\{${escapeRegExp(environment)}\\}`).exec(block.raw);
    const closeAt = block.raw.lastIndexOf(`\\end{${environment}}`);
    let body = block.raw.slice(open ? open[0].length : 0, closeAt >= 0 ? closeAt : block.raw.length);
    let options = "";
    let language = "";
    if (/^(?:lstlisting|minted|Verbatim\*?|algorithm\*?|algorithmic|algorithm2e)$/.test(environment) && body[0] === "[") {
      const close = bracketEnd(body, 0);
      if (close >= 0) {
        options = body.slice(1, close);
        body = body.slice(close + 1);
      }
    }
    if (environment === "minted") {
      const group = braceGroupAt(body, 0);
      if (group) {
        language = group.value.trim();
        body = body.slice(group.end);
      }
    }
    language ||= /(?:^|,)\s*language\s*=\s*\{?\s*(?:\[[^\]]*\])?\s*([A-Za-z+#0-9 ]+)/.exec(options)?.[1]?.trim() || "";
    const pseudo = /^algorithm/.test(environment);
    let captionRaw = "";
    if (pseudo) captionRaw = commandArgument(maskLatex(block.raw), "caption")?.value || "";
    else {
      const optionCaption = /(?:^|,)\s*caption\s*=\s*/.exec(options);
      if (optionCaption) {
        const rest = options.slice(optionCaption.index + optionCaption[0].length);
        captionRaw = rest[0] === "{" ? braceGroupAt(rest, 0)?.value || "" : rest.split(",")[0];
      }
    }
    if (pseudo) {
      const inner = /\\begin\{algorithmic\}(?:\[[^\]]*\])?/.exec(body);
      const innerEnd = body.lastIndexOf("\\end{algorithmic}");
      if (inner && innerEnd > inner.index) body = body.slice(inner.index + inner[0].length, innerEnd);
      body = body.replace(/\\caption\s*(?:\[[^\]]*\])?\s*\{(?:[^{}]|\{(?:[^{}]|\{[^{}]*\})*\})*\}/g, "").replace(/\\label\{[^{}]*\}/g, "");
    }
    // Pseudo-code lines carry typeset math and bold keywords; program text is literal.
    const lines = pseudo
      ? algorithmText(body).slice(0, 400).map((line) => {
        const rendered = renderTex(line.latex, macros, references);
        return { indent: line.indent, text: rendered.display, annotations: rendered.annotations || [], styles: rendered.styles || [] };
      })
      : null;
    return {
      ...common,
      environment,
      language,
      pseudo,
      caption: stripTex(captionRaw, macros, references),
      text: (lines ? lines.map((line) => `${"  ".repeat(line.indent)}${line.text}`).join("\n") : dedentCode(body)).slice(0, 60000),
      ...(lines ? { lines } : {}),
      fallback: false,
    };
  }
  if (block.kind === "bibliography") {
    const items = bibliographyItems(block.raw).slice(0, 2000).map((item, position) => {
      const rendered = renderTex(item.raw.replace(/\\newblock(?![A-Za-z])/g, " "), macros, references);
      return {
        key: item.key,
        label: item.label || String(position + 1),
        text: rendered.display,
        annotations: rendered.annotations || [],
        styles: rendered.styles || [],
      };
    });
    return { ...common, items, fallback: false };
  }
  if (block.kind === "table") {
    const captionArgument = commandArgument(block.raw, "caption") || captionOfArgument(block.raw);
    const captionRaw = captionArgument?.value || "";
    const captionRendered = normalizeCaptionDisplay(renderTex(captionRaw, macros, references));
    const table = tableRows(block.raw, macros, references);
    return {
      ...common,
      caption: stripTex(captionRaw, macros, references),
      captionDisplay: captionRendered.display,
      captionSource: captionArgument ? {
        path: relativePath,
        blockIndex: block.index,
        blockId: block.id,
        start: captionArgument.start,
        end: captionArgument.contentEnd,
        absoluteStart: block.start + captionArgument.start,
        absoluteEnd: block.start + captionArgument.contentEnd,
        raw: captionRaw,
        display: captionRendered.display,
        displayStarts: captionRendered.displayStarts,
        displayEnds: captionRendered.displayEnds,
      } : null,
      ...table,
      fallback: table.rows.length === 0,
    };
  }
  if (block.kind === "figure") {
    const foundCaption = floatCaptionArgument(block.raw);
    // Offsets come from a masked copy of the same length; the text is the source's.
    const captionArgument = foundCaption ? { ...foundCaption, value: block.raw.slice(foundCaption.start, foundCaption.contentEnd) } : null;
    const captionRaw = captionArgument?.value || "";
    const captionRendered = normalizeCaptionDisplay(renderTex(captionRaw, macros, references));
    const live = maskLatex(block.raw);
    const graphicPattern = /\\includegraphics(?:\[([^\]]*)\])?\s*\{([^}]+)\}/g;
    const graphicMatches = [...live.matchAll(graphicPattern)].slice(0, 12);
    const graphicMatch = graphicMatches[0] || null;
    const graphic = await resolveGraphic(relativePath, graphicMatch?.[2]);
    // Subfigures: every further image with the caption that follows it.
    const panels = [];
    if (graphicMatches.length > 1) {
      for (const [position, match] of graphicMatches.entries()) {
        const until = position + 1 < graphicMatches.length ? graphicMatches[position + 1].index : block.raw.length;
        const panelCaption = commandArgument(live.slice(match.index, until), "caption");
        const own = panelCaption && (!captionArgument || match.index + panelCaption.start !== captionArgument.start)
          ? block.raw.slice(match.index + panelCaption.start, match.index + panelCaption.contentEnd)
          : "";
        panels.push({ graphic: await resolveGraphic(relativePath, match[2]), caption: stripTex(own, macros, references) });
      }
    }
    return {
      ...common,
      caption: stripTex(captionRaw, macros, references),
      captionDisplay: captionRendered.display,
      captionSource: captionArgument ? {
        path: relativePath,
        blockIndex: block.index,
        blockId: block.id,
        start: captionArgument.start,
        end: captionArgument.contentEnd,
        absoluteStart: block.start + captionArgument.start,
        absoluteEnd: block.start + captionArgument.contentEnd,
        raw: captionRaw,
        display: captionRendered.display,
        displayStarts: captionRendered.displayStarts,
        displayEnds: captionRendered.displayEnds,
      } : null,
      graphic,
      ...(panels.length ? { panels } : {}),
      options: graphicMatch?.[1] || "",
      fallback: !graphic,
    };
  }
  if (block.kind === "structure") {
    const includes = /^\s*\\(?:input|include|subfile|import|subimport|inputfrom|subinputfrom|includefrom|subincludefrom)(?![A-Za-z@])/.test(block.raw)
      ? includeCommands(maskLatex(block.raw))
      : [];
    const input = includes[0]?.target || null;
    if (input) {
      // A name such as figures/overview or tab_results is a strong hint; any
      // other included file is shown inline when a float is all it contains.
      const named = /(?:figure|figs?[_\/-]|table|tabs?[_\/-]|plot|diagram|chart)/i.test(input);
      const included = await resolveIncludedArtifact(relativePath, input, macros, references, { onlyArtifacts: !named });
      if (included) return { ...included, input };
      // A file that cannot be followed (missing, or outside the source root)
      // gets a read-only note instead of silence.
      const resolvable = await includeResolves(relativePath, input);
      if (named && resolvable) return { ...common, input, fallback: true, artifactType: /tab/i.test(input) ? "table" : "figure" };
      if (!resolvable) return { ...common, input, fallback: true, missing: true, artifactType: "include" };
    }
  }
  return null;
}

async function listDocuments() {
  const results = [];
  const hiddenDocuments = new Set(config.ui?.hiddenDocuments || []);
  for (const absolute of await walkSourceFiles((name) => [".tex", ".md"].includes(path.extname(name).toLowerCase()))) {
    const relative = relativeRepo(absolute);
    if (hiddenDocuments.has(relative)) continue;
    results.push({
      path: relative,
      label: sourceLabel(relative),
      approvedByDefault: config.approvedDocuments.includes(relative),
    });
  }
  return results.sort((a, b) => a.label.localeCompare(b.label));
}

// Path shown in the UI: relative to the source root rather than the repository.
function sourceLabel(relative) {
  const prefix = config.sourceRoot === "." ? "" : `${config.sourceRoot}/`;
  return prefix && relative.startsWith(prefix) ? relative.slice(prefix.length) : relative;
}

function headingLevel(raw) {
  const command = raw.trim().match(HEADING_COMMAND_PATTERN)?.[1]?.toLowerCase();
  return { section: 1, subsection: 2, subsubsection: 3, paragraph: 3, subparagraph: 3 }[command] || 1;
}

function headingTitle(raw, macros = new Map()) {
  const match = raw.match(HEADING_OPEN_PATTERN);
  if (!match) return "";
  const open = match[0].lastIndexOf("{");
  let depth = 0;
  for (let cursor = open; cursor < raw.length; cursor += 1) {
    if (raw[cursor] === "{" && raw[cursor - 1] !== "\\") depth += 1;
    if (raw[cursor] === "}" && raw[cursor - 1] !== "\\") {
      depth -= 1;
      if (depth === 0) return latexToDisplay(raw.slice(open + 1, cursor), "paragraph", macros).display.trim();
    }
  }
  return "";
}

function structureHeadingLevel(raw) {
  const command = raw.trim().match(HEADING_COMMAND_PATTERN)?.[1]?.toLowerCase();
  return { section: 1, subsection: 2, subsubsection: 3, paragraph: 4, subparagraph: 5 }[command] || 1;
}

function structureHeadingKind(raw) {
  return raw.trim().match(HEADING_COMMAND_PATTERN)?.[1]?.toLowerCase() || "section";
}

// True when `position` sits behind an unescaped % on its own line.
function isCommentedOut(source, position) {
  const lineStart = source.lastIndexOf("\n", position - 1) + 1;
  return /(?:^|[^\\])%/.test(source.slice(lineStart, position));
}

// A file that \input / \include may pull into the outline and the structure
// view: an existing .tex file inside the source root (symlinks resolved).
function isIncludableSource(absolutePath) {
  return path.extname(absolutePath).toLowerCase() === ".tex"
    && existsSync(absolutePath)
    && insideSourceRoot(absolutePath);
}

function mergeStructureFragments(fragments) {
  const byPath = new Map();
  for (const fragment of fragments) {
    if (fragment.blank || fragment.end <= fragment.start) continue;
    const list = byPath.get(fragment.path) || [];
    const previous = list.at(-1);
    if (previous && previous.end === fragment.start) previous.end = fragment.end;
    else list.push({ path: fragment.path, start: fragment.start, end: fragment.end });
    byPath.set(fragment.path, list);
  }
  return [...byPath.values()].flat();
}

async function paperStructure() {
  const compileRoot = path.resolve(repoRoot, config.latex.cwd);
  const mainArgument = [...config.latex.args].reverse().find((value) => String(value).endsWith(".tex")) || "main.tex";
  const mainPath = path.resolve(compileRoot, mainArgument);
  const stream = [];
  const visited = new Set();
  const projectWide = await cachedProjectReferences();

  const pushFragment = (relativePath, source, start, end) => {
    stream.push({ type: "fragment", path: relativePath, start, end, blank: !source.slice(start, end).trim() });
  };

  async function visit(absolutePath) {
    const normalized = path.resolve(absolutePath);
    if (visited.has(normalized) || !isIncludableSource(normalized)) return;
    visited.add(normalized);
    let source;
    try {
      source = await fs.readFile(normalized, "utf8");
    } catch {
      // A directory called x.tex, or a file that vanished: nothing to follow.
      return;
    }
    const relativePath = relativeRepo(normalized);
    const macros = documentMacros(source, projectWide);
    const parsedBlocks = parseBlocks(source);
    const events = parsedBlocks
      .filter((block) => ["heading", "paragraph-heading"].includes(block.kind))
      .map((block) => ({ type: "heading", position: block.start, end: block.end, block }));
    // Commands are looked for in the masked text: a commented-out \input, or
    // one inside verbatim or \iffalse text, is not followed.
    const masked = maskLatex(source);
    const liveCommand = (position) => !isCommentedOut(source, position);
    for (const include of includeCommands(masked)) {
      events.push({ type: "include", position: include.index, end: include.end, target: include.target });
    }
    const appendixPattern = /\\appendix\b|\\begin\{appendices\}/g;
    let appendixMatch;
    while ((appendixMatch = appendixPattern.exec(masked)) !== null) {
      if (!liveCommand(appendixMatch.index)) continue;
      events.push({ type: "appendix", position: appendixMatch.index, end: appendixMatch.index + appendixMatch[0].length });
    }
    // The bibliography and \end{document} close the last section: what follows
    // them in the root file is not part of its text.
    const closingPattern = /\\(?:bibliographystyle|bibliography|printbibliography)(?![A-Za-z@])|\\end\{document\}/g;
    let closingMatch;
    while ((closingMatch = closingPattern.exec(masked)) !== null) {
      if (!liveCommand(closingMatch.index)) continue;
      const lineEnd = source.indexOf("\n", closingMatch.index);
      events.push({ type: "close", position: closingMatch.index, end: lineEnd < 0 ? source.length : lineEnd + 1 });
    }
    events.sort((left, right) => left.position - right.position || left.end - right.end);

    let cursor = 0;
    for (const event of events) {
      if (event.position > cursor) pushFragment(relativePath, source, cursor, event.position);
      if (event.type === "heading") {
        stream.push({ type: "heading", path: relativePath, block: event.block, macros, source });
      } else if (event.type === "appendix") {
        stream.push({ type: "appendix" });
      } else if (event.type === "close") {
        stream.push({ type: "close" });
      } else {
        let target = event.target.trim();
        if (!path.extname(target)) target = `${target}.tex`;
        const candidates = [path.resolve(compileRoot, target), path.resolve(path.dirname(normalized), target)];
        // Any .tex file inside the source root is followed, whatever its
        // directory is called (sections/, chapters/, content/, or none).
        const included = candidates.find((candidate) => !visited.has(path.resolve(candidate)) && isIncludableSource(candidate));
        if (included) await visit(included);
        else pushFragment(relativePath, source, event.position, event.end);
      }
      cursor = Math.max(cursor, event.end);
    }
    if (cursor < source.length) pushFragment(relativePath, source, cursor, source.length);
  }

  await visit(mainPath);
  const sections = [];
  const stack = [];
  let currentSection = null;
  let appendix = false;
  let sectionNumber = 0;
  let appendixNumber = 0;

  for (const item of stream) {
    if (item.type === "close") {
      currentSection = null;
      stack.length = 0;
      continue;
    }
    if (item.type === "appendix") {
      appendix = true;
      currentSection = null;
      stack.length = 0;
      continue;
    }
    if (item.type === "heading") {
      const level = structureHeadingLevel(item.block.raw);
      const kind = structureHeadingKind(item.block.raw);
      const title = headingTitle(item.block.raw, item.macros);
      if (!title) continue;
      if (level === 1) {
        const starred = /^\s*\\section\*/i.test(item.block.raw);
        if (!starred) {
          if (appendix) appendixNumber += 1;
          else sectionNumber += 1;
        }
        const number = starred ? "" : appendix ? String.fromCharCode(64 + appendixNumber) : String(sectionNumber);
        const id = `section_${sha(`${item.path}:${item.block.id}:${title}`).slice(0, 14)}`;
        currentSection = {
          id,
          number,
          title,
          appendix,
          path: item.path,
          blockIndex: item.block.index,
          blockId: item.block.id,
          nodes: [],
          fragments: [],
        };
        sections.push(currentSection);
        stack.length = 0;
      }
      if (!currentSection) continue;
      const node = {
        id: `node_${sha(`${item.path}:${item.block.id}:${title}`).slice(0, 14)}`,
        title,
        kind,
        level,
        path: item.path,
        blockIndex: item.block.index,
        blockId: item.block.id,
        children: [],
      };
      while (stack.length && stack.at(-1).level >= level) stack.pop();
      if (level === 1) currentSection.nodes.push(node);
      else if (stack.length) stack.at(-1).children.push(node);
      else currentSection.nodes.push(node);
      stack.push(node);
      currentSection.fragments.push({ path: item.path, start: item.block.start, end: item.block.end });
      continue;
    }
    if (item.type === "fragment" && currentSection) {
      currentSection.fragments.push({ path: item.path, start: item.start, end: item.end, blank: item.blank });
    }
  }

  for (const section of sections) {
    section.fragments = mergeStructureFragments(section.fragments);
    section.sources = [];
    for (const fragment of section.fragments) {
      const source = await fs.readFile(resolveDocument(fragment.path), "utf8");
      section.sources.push({
        path: fragment.path,
        start: fragment.start,
        end: fragment.end,
        etag: sha(source),
        text: source.slice(fragment.start, fragment.end),
      });
    }
    section.characterCount = section.sources.reduce((sum, source) => sum + source.text.length, 0);
    section.snapshotHash = sha(section.sources.map((source) => `${source.path}:${source.start}:${source.end}:${source.etag}`).join("|"));
    delete section.fragments;
  }
  return {
    root: relativeRepo(mainPath),
    generatedAt: new Date().toISOString(),
    sections,
    snapshotHash: sha(sections.map((section) => `${section.id}:${section.snapshotHash}`).join("|")),
  };
}

async function compiledOutline() {
  const compileRoot = path.resolve(repoRoot, config.latex.cwd);
  const mainArgument = [...config.latex.args].reverse().find((value) => String(value).endsWith(".tex")) || "main.tex";
  const mainPath = path.resolve(compileRoot, mainArgument);
  const outline = [];
  const visited = new Set();
  const counters = { section: 0, subsection: 0, subsubsection: 0 };
  let appendixMode = false;
  const projectWide = await cachedProjectReferences();

  function appendixLetter(value) {
    let number = value;
    let label = "";
    while (number > 0) {
      number -= 1;
      label = String.fromCharCode(65 + (number % 26)) + label;
      number = Math.floor(number / 26);
    }
    return label || "A";
  }

  function nextHeadingNumber(level, starred) {
    if (starred) return "";
    if (level === 1) {
      counters.section += 1;
      counters.subsection = 0;
      counters.subsubsection = 0;
    } else if (level === 2) {
      counters.subsection += 1;
      counters.subsubsection = 0;
    } else {
      counters.subsubsection += 1;
    }
    const section = appendixMode ? appendixLetter(counters.section) : String(counters.section);
    if (level === 1) return section;
    if (level === 2) return `${section}.${counters.subsection}`;
    return `${section}.${counters.subsection}.${counters.subsubsection}`;
  }

  async function visit(absolutePath) {
    const normalized = path.resolve(absolutePath);
    if (visited.has(normalized) || !isIncludableSource(normalized)) return;
    visited.add(normalized);
    let source;
    try {
      source = await fs.readFile(normalized, "utf8");
    } catch {
      // A directory called x.tex, or a file that vanished: nothing to follow.
      return;
    }
    const relativePath = relativeRepo(normalized);
    const macros = documentMacros(source, projectWide);
    const parsedBlocks = parseBlocks(source);
    const masked = maskLatex(source);
    // The first visible block inside \begin{abstract}...\end{abstract}.
    const abstractBlock = parsedBlocks.find((block) => block.role === "abstract" && block.kind !== "structure") || null;
    if (abstractBlock) {
      outline.push({
        path: relativePath,
        fileLabel: sourceLabel(relativePath),
        blockIndex: abstractBlock.index,
        blockId: abstractBlock.id,
        title: "Abstract",
        level: 1,
        number: "",
        reviewIncludesBlock: true,
      });
    }
    const events = parsedBlocks
      .filter((block) => block.kind === "heading")
      .map((block) => ({ type: "heading", position: block.start, block }));
    for (const include of includeCommands(masked)) {
      events.push({ type: "include", position: include.index, target: include.target });
    }
    const appendixPattern = /\\appendix\b|\\begin\{appendices\}/g;
    let appendixMatch;
    while ((appendixMatch = appendixPattern.exec(masked)) !== null) {
      if (isCommentedOut(source, appendixMatch.index)) continue;
      events.push({ type: "appendix", position: appendixMatch.index });
    }
    events.sort((a, b) => a.position - b.position);

    for (const event of events) {
      if (event.type === "appendix") {
        appendixMode = true;
        counters.section = 0;
        counters.subsection = 0;
        counters.subsubsection = 0;
        continue;
      }
      if (event.type === "heading") {
        const rendered = headingTitle(event.block.raw, macros);
        const level = headingLevel(event.block.raw);
        if (rendered.trim()) {
          outline.push({
            path: relativePath,
            fileLabel: sourceLabel(relativePath),
            blockIndex: event.block.index,
            blockId: event.block.id,
            title: rendered,
            level,
            number: nextHeadingNumber(level, /^\s*\\(?:section|subsection|subsubsection|paragraph|subparagraph)\*/i.test(event.block.raw)),
          });
        }
        continue;
      }
      let target = event.target.trim();
      if (!path.extname(target)) target = `${target}.tex`;
      const candidates = [path.resolve(compileRoot, target), path.resolve(path.dirname(normalized), target)];
      const included = candidates.find((candidate) => isIncludableSource(candidate));
      if (included) await visit(included);
    }
  }

  await visit(mainPath);
  if (!outline.some((item) => item.title === "Abstract")) {
    const mainSource = await fs.readFile(mainPath, "utf8");
    const abstractInput = includeCommands(maskLatex(mainSource)).find((include) => /abstract/i.test(include.target))?.target;
    if (abstractInput) {
      const target = path.extname(abstractInput) ? abstractInput : `${abstractInput}.tex`;
      const candidates = [path.resolve(compileRoot, target), path.resolve(path.dirname(mainPath), target)];
      const abstractPath = candidates.find((candidate) => existsSync(candidate));
      if (abstractPath) {
        const abstractSource = await fs.readFile(abstractPath, "utf8");
        const abstractBlock = parseBlocks(abstractSource).find((block) =>
          block.kind !== "structure" && block.raw?.trim()
        );
        if (abstractBlock) {
          const relativePath = relativeRepo(abstractPath);
          outline.unshift({
            path: relativePath,
            fileLabel: sourceLabel(relativePath),
            blockIndex: abstractBlock.index,
            blockId: abstractBlock.id,
            title: "Abstract",
            level: 1,
            number: "",
            reviewIncludesBlock: true,
          });
        }
      }
    }
  }
  const payloads = new Map();
  const directMetrics = [];
  for (const item of outline) {
    if (!payloads.has(item.path)) payloads.set(item.path, await documentPayload(item.path));
    const payload = payloads.get(item.path);
    const sameFileItems = outline.filter((candidate) => candidate.path === item.path && candidate.blockIndex > item.blockIndex);
    const nextHeadingIndex = sameFileItems.length ? sameFileItems[0].blockIndex : payload.blocks.length;
    const reviewable = payload.blocks.filter((block) =>
      block.index >= (item.reviewIncludesBlock ? item.blockIndex : item.blockIndex + 1) &&
      block.index < nextHeadingIndex && block.kind !== "heading" && block.kind !== "structure" && !block.hidden
    );
    let points = 0;
    for (const block of reviewable) {
      if (["accepted", "human"].includes(block.status)) {
        points += 1;
        continue;
      }
      // Measured over the block's text without the white space at its edges: a
      // selection can never cover that, so an abstract block that begins with a
      // newline stopped at 99% after its whole text was accepted.
      const textStart = block.raw.length - block.raw.trimStart().length;
      const textEnd = Math.max(textStart, block.raw.trimEnd().length);
      const ranges = [...(block.acceptedRanges || []), ...(block.humanRanges || [])]
        .map((range) => ({ start: Math.max(textStart, range.start), end: Math.min(textEnd, range.end) }))
        .filter((range) => range.end > range.start)
        .sort((a, b) => a.start - b.start);
      const merged = [];
      for (const range of ranges) {
        const previous = merged.at(-1);
        if (previous && range.start <= previous.end) previous.end = Math.max(previous.end, range.end);
        else merged.push({ ...range });
      }
      const acceptedLength = merged.reduce((sum, range) => sum + range.end - range.start, 0);
      points += Math.min(1, acceptedLength / Math.max(1, textEnd - textStart));
    }
    directMetrics.push({ points, total: reviewable.length });
  }

  for (let index = 0; index < outline.length; index += 1) {
    let end = index + 1;
    while (end < outline.length && outline[end].level > outline[index].level) end += 1;
    const metrics = directMetrics.slice(index, end);
    const points = metrics.reduce((sum, metric) => sum + metric.points, 0);
    const total = metrics.reduce((sum, metric) => sum + metric.total, 0);
    outline[index].reviewedPercent = total ? Math.round((points / total) * 100) : 0;
    outline[index].reviewedBlocks = Math.round(points * 10) / 10;
    outline[index].totalBlocks = total;
  }
  const overallPoints = directMetrics.reduce((sum, metric) => sum + metric.points, 0);
  const overallTotal = directMetrics.reduce((sum, metric) => sum + metric.total, 0);
  return {
    root: relativeRepo(mainPath),
    overallProgress: overallTotal ? Math.round((overallPoints / overallTotal) * 100) : 0,
    items: outline,
  };
}

async function documentPayload(relativePath) {
  const absolutePath = resolveDocument(relativePath);
  const bytes = await fs.readFile(absolutePath);
  // Same text as readFile(..., "utf8"): a lossy decoding when the file is not UTF-8.
  const source = bytes.toString("utf8");
  const checked = sourceEncoding(bytes);
  const encoding = checked.valid
    ? { valid: true }
    : { valid: false, reason: checked.reason, message: notUtf8Message(relativePath) };
  const stat = await fs.stat(absolutePath);
  const state = await readState();
  const selections = state.selections.filter((item) => item.path === relativePath && ["accepted", "human"].includes(item.status));
  const paragraphStates = state.paragraphs[relativePath] || {};
  const approvedByDefault = config.approvedDocuments.includes(relativePath);
  const references = await cachedProjectReferences();
  const macros = documentMacros(source, references);
  const blocks = await Promise.all(parseBlocks(source).map(async (block) => {
    const rawSemantic = await semanticBlock(block, relativePath, macros, references);
    const semantic = rawSemantic?.captionSource && !rawSemantic.captionSource.etag
      ? { ...rawSemantic, captionSource: { ...rawSemantic.captionSource, etag: sha(source) } }
      : rawSemantic;
    let rendered = latexToDisplay(block.raw, block.kind, macros, references);
    if (semantic && ["math", "table", "figure", "code", "bibliography"].includes(block.kind)) {
      const noun = { table: "Table", figure: "Figure", code: semantic.pseudo ? "Algorithm" : "Code listing", bibliography: "References" }[block.kind];
      const display = block.kind === "math"
        ? semantic.latex
        : semantic.caption || `${noun}${semantic.number ? ` ${semantic.number}` : ""}`;
      rendered = {
        display,
        displayStarts: Array(display.length).fill(0),
        displayEnds: Array(display.length).fill(block.raw.length),
        annotations: [],
        hidden: false,
      };
    } else if (semantic && block.kind === "structure") {
      const display = semantic.missing ? `File not found: ${semantic.input}` : `Included ${semantic.artifactType}: ${semantic.input}`;
      rendered = {
        display,
        displayStarts: Array(display.length).fill(0),
        displayEnds: Array(display.length).fill(block.raw.length),
        annotations: [],
        hidden: false,
      };
    }
    // "Theorem 2": the number LaTeX gave the environment, when it has a label.
    const environmentNumber = block.environmentLabel ? references.labels[block.environmentLabel]?.number : null;
    return {
      ...block,
      ...rendered,
      ...(environmentNumber && environmentNumber !== "?" ? { environmentNumber } : {}),
      ...(block.environmentTitle ? { environmentTitle: stripTex(block.environmentTitle, macros, references) } : {}),
      semantic,
      // False for every block of a file that Paper Pal will not write.
      editable: encoding.valid,
      status: paragraphStates[block.id]?.status || (approvedByDefault ? "accepted" : "draft"),
      acceptedRanges: selections
        .filter((item) => item.status === "accepted" && selectionAnchorsToBlock(item, block))
        .map((item) => ({ id: item.id, start: item.start, end: item.end, quote: item.quote })),
      humanRanges: selections
        .filter((item) => item.status === "human" && selectionAnchorsToBlock(item, block))
        .map((item) => ({ id: item.id, start: item.start, end: item.end, quote: item.quote })),
    };
  }));
  const liveSource = maskLatex(source);
  const usedCitationKeys = [...liveSource.matchAll(new RegExp(`\\\\(?:${Object.keys(CITE_MODES).join("|")})\\*?(?:\\[[^\\]]*\\])*\\{([^}]+)\\}`, "g"))]
    .flatMap((match) => match[1].split(",").map((key) => key.trim())).filter(Boolean);
  const usedLabelKeys = [...liveSource.matchAll(new RegExp(`\\\\(?:${[...REFERENCE_COMMANDS].join("|")})\\*?\\{([^}]+)\\}`, "g"))]
    .flatMap((match) => match[1].split(",").map((key) => key.trim())).filter(Boolean);
  return {
    path: relativePath,
    etag: sha(source),
    modifiedAt: stat.mtime.toISOString(),
    source,
    encoding,
    readOnly: !encoding.valid,
    approvedByDefault,
    blocks,
    // The author's macros for KaTeX, so formulas that use them render.
    mathMacros: katexMacros(macros),
    frontMatter: frontMatterOf(source, macros, references),
    references: {
      labels: Object.values(references.labels),
      citations: Object.values(references.citations),
      usedCitationKeys,
      usedLabelKeys,
      unresolved: [
        ...usedCitationKeys.filter((key) => !references.citations[key]).map((key) => ({ type: "citation", key })),
        ...usedLabelKeys.filter((key) => !references.labels[key]).map((key) => ({ type: "reference", key })),
      ],
    },
  };
}

// \title, \author and \date of the file, for a read-only title block above the
// manuscript. Blocks are untouched: every entry carries the absolute source
// offsets of its argument, so source.slice(start, end) is the LaTeX inside the
// braces. Commented-out commands are ignored; the last live one wins, as in
// LaTeX. Returns null when the file has no \title.
function frontMatterOf(source, macros = new Map(), references = { labels: {}, citations: {} }) {
  // Commented-out and verbatim text is blanked, offsets unchanged.
  const live = maskLatex(source);
  const limit = (() => {
    const end = live.search(/\\end\{document\}/);
    return end < 0 ? source.length : end;
  })();
  const argumentsOf = (command) => {
    const pattern = new RegExp(`(?<!\\\\)\\\\${command}(?![A-Za-z@])\\s*(?:\\[[^\\]\\n]*\\]\\s*)?\\{`, "g");
    const found = [];
    let match;
    while ((match = pattern.exec(live)) !== null) {
      if (match.index >= limit) break;
      const group = braceGroupAt(live, match.index + match[0].length - 1);
      if (group) found.push({ start: group.start, end: group.contentEnd });
    }
    return found;
  };
  // Footnote-like material, affiliations and marks are not part of a name or
  // the title: blank them (same length) before the text is converted.
  const withoutMarks = (text) => {
    let result = text;
    const pattern = /\\(?:thanks|footnote|footnotemark|footnotetext|orcidlink|orcidID|orcid|inst|IEEEauthorblockA|IEEEauthorrefmark|affiliation|email|textsuperscript|authornote|authornotemark|fnmark|fnref|corref|tnoteref)(?![A-Za-z@])\s*(?:\[[^\]]*\]\s*)?/g;
    let match;
    while ((match = pattern.exec(result)) !== null) {
      const group = result[match.index + match[0].length] === "{" ? braceGroupAt(result, match.index + match[0].length) : null;
      const end = group ? group.end : match.index + match[0].length;
      result = `${result.slice(0, match.index)}${" ".repeat(end - match.index)}${result.slice(end)}`;
      pattern.lastIndex = end;
    }
    return result;
  };
  const textOf = (start, end) => {
    const raw = withoutMarks(source.slice(start, end)).replace(/\\\\(?:\s*\[[^\]]*\])?/g, (value) => " ".repeat(value.length));
    return latexToDisplay(raw, "paragraph", macros, references).display.replace(/\s+/g, " ").trim();
  };
  const entry = (range) => {
    if (!range) return null;
    const text = textOf(range.start, range.end);
    return text ? { text, start: range.start, end: range.end } : null;
  };
  // The last live \title wins, as in LaTeX. Some conference styles have a
  // title command of their own.
  const title = entry(argumentsOf("title").at(-1)) || entry(argumentsOf("icmltitle").at(-1));
  if (!title) return null;
  const authors = [];
  // One \author{A \and B}, or one \author per person (acmart, revtex).
  for (const authorRange of argumentsOf("author")) {
    const raw = source.slice(authorRange.start, authorRange.end);
    const separator = /\\(?:and|And|AND)(?![A-Za-z@])/g;
    let cursor = 0;
    const pieces = [];
    let match;
    while ((match = separator.exec(raw)) !== null) {
      pieces.push([cursor, match.index]);
      cursor = match.index + match[0].length;
    }
    pieces.push([cursor, raw.length]);
    for (const [from, to] of pieces) {
      const piece = raw.slice(from, to);
      const lead = piece.length - piece.trimStart().length;
      const start = authorRange.start + from + lead;
      const end = authorRange.start + from + piece.trimEnd().length;
      if (end <= start) continue;
      // The first line is the name; affiliation lines after \\ are kept in
      // the offsets but not in the display text.
      const firstLine = withoutMarks(source.slice(start, end)).split(/\\\\/)[0];
      const text = textOf(start, start + firstLine.length);
      if (text) authors.push({ text, start, end });
    }
  }
  if (!authors.length) {
    for (const range of argumentsOf("icmlauthor")) {
      const author = entry(range);
      if (author) authors.push(author);
    }
  }
  const dateRange = argumentsOf("date").at(-1);
  const date = dateRange && !/\\today\b/.test(source.slice(dateRange.start, dateRange.end)) ? entry(dateRange) : null;
  return { title, authors, date };
}

function json(response, status, value) {
  const body = JSON.stringify(value);
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(body);
}

function text(response, status, value, type = "text/plain; charset=utf-8") {
  response.writeHead(status, {
    "Content-Type": type,
    "Content-Length": Buffer.byteLength(value),
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(value);
}

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 2_000_000) throw new HttpError(413, "Request body is too large.");
    chunks.push(chunk);
  }
  const body = Buffer.concat(chunks).toString("utf8");
  if (!body.trim()) return {};
  // A JSON content type cannot be sent cross-origin without a CORS preflight,
  // which this server never answers, so it doubles as CSRF protection.
  if (!/^application\/json\b/i.test(String(request.headers["content-type"] || ""))) {
    throw new HttpError(415, "Request bodies must be sent as application/json.");
  }
  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch {
    throw new HttpError(400, "Request body is not valid JSON.");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new HttpError(400, "Request body must be a JSON object.");
  }
  return parsed;
}

// Host names this server answers to. Anything else is a DNS-rebinding attempt
// (a web page that points its own domain at 127.0.0.1 to become same-origin)
// or a misdirected request. A deliberately configured non-loopback bind host
// is added as typed.
function allowedHostHeaders() {
  const names = ["127.0.0.1", "localhost", "[::1]"];
  if (!hostIsLoopback && !["0.0.0.0", "::", "[::]"].includes(host)) {
    names.push(host.includes(":") && !host.startsWith("[") ? `[${host}]` : host);
  }
  const listeningPort = server.address()?.port ?? port;
  const allowed = new Set();
  for (const name of names) {
    allowed.add(`${name}:${listeningPort}`.toLowerCase());
    if (Number(listeningPort) === 80) allowed.add(name.toLowerCase());
  }
  return allowed;
}

function assertAllowedHost(request) {
  const header = String(request.headers.host || "").trim().toLowerCase();
  if (!header || !allowedHostHeaders().has(header)) {
    throw new HttpError(421, "This server only answers requests addressed to its own local address.");
  }
}

// State-changing requests must come from this app's own page: a matching
// Origin, or, when the client sends no Origin at all (curl, scripts, tests),
// the custom X-Paper-Pal header, which a cross-site form or image cannot set.
function assertLocalOrigin(request) {
  const origin = request.headers.origin;
  if (origin) {
    const allowed = new Set([...allowedHostHeaders()].map((value) => `http://${value}`));
    if (!allowed.has(String(origin).toLowerCase())) throw new HttpError(403, "Request origin is not allowed.");
    return;
  }
  if (String(request.headers["x-paper-pal"] || "") !== "1") {
    throw new HttpError(403, "State-changing requests must carry the X-Paper-Pal: 1 header.");
  }
}

// Error text shown in the browser never carries absolute paths from this
// machine (they include the OS user name) or API key values.
function publicErrorMessage(message) {
  let value = redactSecrets(String(message || ""));
  const roots = [
    [realRepoRoot, "<project>"], [repoRoot, "<project>"], [appRoot, "<app>"],
    [tmpdir(), "<tmp>"], [homedir(), "~"],
  ].filter(([root]) => root && root.length > 1).sort((a, b) => b[0].length - a[0].length);
  for (const [root, label] of roots) value = value.split(root).join(label);
  return value;
}

function errorResponse(error) {
  if (error instanceof HttpError) return { status: error.status, message: publicErrorMessage(error.message) };
  if (error?.code === "ENOENT" || error?.code === "ENOTDIR" || error?.code === "EISDIR") {
    return { status: 404, message: "The requested file was not found." };
  }
  const internal = !(error instanceof Error)
    || typeof error.code === "string" && /^E[A-Z0-9_]+$/.test(error.code)
    || error instanceof TypeError || error instanceof RangeError
    || error instanceof ReferenceError || error instanceof SyntaxError;
  if (internal) {
    console.error("[request failed]", error instanceof Error ? error.stack || error.message : error);
    return { status: 500, message: "Internal error. See the server log for details." };
  }
  // Everything else is a deliberate, user-facing validation message.
  const message = publicErrorMessage(error.message);
  const conflict = /\b(?:changed|no longer|still (?:being|answering)|already)\b/i.test(message);
  return { status: conflict ? 409 : 400, message };
}

function emit(event, payload) {
  const message = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const client of sseClients) client.write(message);
}

function execFilePromise(command, args, options = {}) {
  return new Promise((resolve) => {
    execFile(command, args, { ...options, maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
      resolve({ code: error?.code ?? 0, stdout: stdout || "", stderr: stderr || "" });
    });
  });
}

// Agent CLIs start helpers of their own (shells, language servers, MCP
// processes). On POSIX every agent child is therefore started as the leader of
// a new process group, and signals go to the whole group so nothing is left
// behind after a timeout, a cancel or a shutdown. Windows has no process
// groups in this sense; there only the child itself is signalled.
const useProcessGroups = process.platform !== "win32";

function signalChild(child, signal) {
  // Windows has no process groups to signal, and CLI agents installed through
  // npm run behind a .cmd shim: killing cmd.exe alone leaves the agent running.
  if (process.platform === "win32" && child.pid) {
    try {
      spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true }).on("error", () => {});
    } catch {
      // Fall through to the plain kill below.
    }
  }
  if (useProcessGroups && child.paperPalGroup && child.pid) {
    try {
      process.kill(-child.pid, signal);
      return true;
    } catch (error) {
      if (error?.code === "ESRCH") return false;
      // EPERM and friends: fall back to the child alone.
    }
  }
  try {
    return child.kill(signal);
  } catch {
    return false;
  }
}

// SIGTERM first; whatever ignores it is killed outright a few seconds later.
// The SIGKILL goes to the group even when the leader has already exited,
// because a grandchild may have outlived it.
function terminateChild(child, graceMs = 5000) {
  if (!child) return;
  const grouped = useProcessGroups && child.paperPalGroup;
  if (!grouped && (child.exitCode !== null || child.signalCode)) return;
  signalChild(child, "SIGTERM");
  const timer = setTimeout(() => signalChild(child, "SIGKILL"), graceMs);
  timer.unref?.();
  if (!grouped) child.once("exit", () => clearTimeout(timer));
}

// `input` is written to the child's stdin (this is how every agent receives its
// prompt: argv is far too small for a prompt that embeds a source file). `env`
// defaults to an environment without this app's API keys.
function spawnCaptured(command, args, { cwd, env = childEnvironment(), input = null, timeoutMs = 300000, label = "The agent run", onChild, group = true } = {}) {
  return new Promise((resolve) => {
    let settled = false;
    let stdout = "";
    let stderr = "";
    let child;
    let timer;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ ...value, stdout, stderr });
    };
    try {
      const plan = spawnPlan(command, args);
      const grouped = group && useProcessGroups;
      child = spawn(plan.command, plan.args, { cwd, env, shell: false, detached: grouped, ...plan.options });
      child.paperPalGroup = grouped;
      onChild?.(child);
      // A child that exits early closes the pipe; that must not crash us.
      child.stdin?.on("error", () => {});
      // Always close stdin: CLIs wait for more prompt text while it stays open.
      child.stdin?.end(input == null ? undefined : String(input));
    } catch (error) {
      resolve({ code: -1, stdout, stderr: error instanceof Error ? error.message : String(error) });
      return;
    }
    // Codex writes its answer to a file and only traces here, but the Claude
    // adapter carries the whole reply on stdout, so this cap has to be well
    // above any proposal or chat turn or the JSON arrives truncated.
    child.stdout?.on("data", (chunk) => { stdout = `${stdout}${chunk}`.slice(-400000); });
    child.stderr?.on("data", (chunk) => { stderr = `${stderr}${chunk}`.slice(-32000); });
    child.on("error", (error) => {
      if (!stderr) stderr = error?.code === "ENOENT"
        ? `Could not start "${command}": the program was not found. Check that it is installed and on PATH, then run "npm run doctor".`
        : String(error?.message || error);
      finish({ code: -1, error });
    });
    child.on("close", (code) => finish({ code: code ?? -1 }));
    timer = setTimeout(() => {
      terminateChild(child);
      const message = `${label} timed out after ${timeoutMs >= 1000 ? `${Math.round(timeoutMs / 1000)} s` : `${timeoutMs} ms`}.`;
      finish({ code: -1, error: new Error(message), timedOut: true, timeoutMessage: message });
    }, timeoutMs);
  });
}

// What a failed agent run tells the author. A CLI's stderr is a trace, not a
// message: Codex echoes the whole prompt there and logs every reconnect with a
// timestamp, so the raw tail is a wall of noise that also pushes "timed out"
// out of view. Lead with our own sentence, keep the few lines that say what
// went wrong (once each), and end with what to do. The full trace stays in
// TRACE.log.
function agentFailureMessage(result, fallback, { timeoutSetting = "agent.timeoutMs" } = {}) {
  const seen = new Set();
  const lines = String(result?.stderr || result?.stdout || "")
    .replace(/\u001b\[[0-9;]*[A-Za-z]/g, "")
    .split(/\r?\n/)
    .map((line) => line.replace(/^\d{4}-\d\d-\d\dT[\d:.]+Z?\s+(?:ERROR|WARN|INFO)\s+/, "").trim())
    .reverse()
    .filter((line) => {
      // "Reconnecting... 2/5" and "3/5" are one message; keep the last of each.
      const key = line.replace(/\d+/g, "#");
      if (!line || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .reverse();
  const telling = lines.filter((line) => /error|fail|denied|unauthori[sz]ed|invalid|cannot|could not|not (?:found|logged|supported|permitted|allowed)|refus|limit|quota|log ?in|warning/i.test(line));
  const detail = (telling.length ? telling : lines).slice(-3).join(" ").slice(0, 600);
  const all = lines.join("\n");
  // The API adapter already ends its messages with what to check.
  const hint = /\.env\b/.test(all) ? "" : /unexpected argument|unrecognized (?:option|argument)|unknown (?:option|argument)/i.test(all)
    ? "The installed CLI does not accept an option Paper Pal passes: update the CLI to its current version, then Retry."
    : /unauthori[sz]ed|\b401\b|not logged in|log ?in (?:required|again)|please (?:run )?.{0,20}log ?in|invalid api key|authentication/i.test(all)
    ? "The backend is not signed in: sign in to its CLI in a terminal (or check the key in .env), then Retry."
    : /waiting for network|failed to connect|connection failed|stream disconnected|ENOTFOUND|ECONNREFUSED|ECONNRESET|EAI_AGAIN|fetch failed/i.test(all)
      ? "The backend could not reach its service: check the network connection or proxy, then Retry."
      : result?.timedOut
        ? `Retry, or raise ${timeoutSetting} in ${CONFIG_NAME} and restart.`
        : "";
  const head = result?.timedOut ? result.timeoutMessage : "";
  return [head, detail || (head ? "" : fallback), hint].filter(Boolean).join(" ").trim();
}

function codexRunRoot(requestId) {
  if (!requestIdPattern.test(String(requestId || ""))) throw new Error("Invalid rewrite request ID.");
  return path.join(codexRunsRoot, requestId);
}

async function writeCodexRunJson(requestId, name, value) {
  const runRoot = codexRunRoot(requestId);
  await fs.mkdir(runRoot, { recursive: true });
  await atomicWrite(path.join(runRoot, name), `${JSON.stringify(value, null, 2)}\n`);
}

function codexRunPayload(id, status, extra = {}) {
  const value = { status, updatedAt: new Date().toISOString(), ...extra };
  codexRuns.set(id, value);
  emit("request", { id, reason: `codex-${status}` });
  return value;
}

async function persistedCodexRunPayload(request) {
  try {
    const status = JSON.parse(await fs.readFile(path.join(codexRunRoot(request.id), "STATUS.json"), "utf8"));
    const state = String(status.state || "").toUpperCase();
    if (state === "FAILED") {
      return {
        status: "failed",
        error: String(status.error || "The previous agent run failed."),
        updatedAt: status.finishedAt || status.startedAt || null,
      };
    }
    if (["DRAFTING", "DISCUSSING", "LINKING", "VALIDATING"].includes(state) && request.status === "pending") {
      return {
        status: "failed",
        error: "The previous agent run was interrupted when the local server restarted. Retry to continue.",
        updatedAt: status.startedAt || null,
      };
    }
    if (["PROPOSED", "DISCUSSED", "LINKED"].includes(state) && ["proposed", "discussed"].includes(request.status)) {
      return { status: "complete", updatedAt: status.finishedAt || status.startedAt || null };
    }
  } catch {
    // A request may not have been sent to an agent yet, so no persisted run is normal.
  }
  return null;
}

// Every JSON object the text could contain: fenced blocks first, then bare
// brace-balanced spans, skipping braces inside strings.
function jsonObjectCandidates(text) {
  const candidates = [];
  const fenced = /```(?:json)?\s*([\s\S]*?)```/gi;
  let match;
  while ((match = fenced.exec(text))) candidates.push(match[1].trim());
  for (let start = 0; start < text.length; start += 1) {
    if (text[start] !== "{") continue;
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let index = start; index < text.length; index += 1) {
      const character = text[index];
      if (inString) {
        if (escaped) escaped = false;
        else if (character === "\\") escaped = true;
        else if (character === '"') inString = false;
        continue;
      }
      if (character === '"') inString = true;
      else if (character === "{") depth += 1;
      else if (character === "}") {
        depth -= 1;
        if (depth === 0) {
          candidates.push(text.slice(start, index + 1));
          start = index;
          break;
        }
      }
    }
  }
  return candidates;
}

// Providers that carry the schema in the prompt rather than enforcing it
// sometimes answer twice: a first object, a line of prose noticing a missing
// field, then a corrected object. Take the last object that parses, because
// that is the corrected one.
function cleanJsonOutput(value) {
  const text = String(value || "").trim();
  const stripped = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    JSON.parse(stripped);
    return stripped;
  } catch {
    // Fall through to candidate extraction.
  }
  const candidates = jsonObjectCandidates(text);
  for (let index = candidates.length - 1; index >= 0; index -= 1) {
    try {
      const parsed = JSON.parse(candidates[index]);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return candidates[index];
    } catch {
      // Try the next candidate.
    }
  }
  return stripped;
}

async function relatedCommentContext(request, contextMode) {
  return buildRelatedCommentContext(request, await listRequests(), contextMode);
}

function selectionMatchFromAbsolute(blocks, absoluteStart, absoluteEnd) {
  const startBlock = blocks.find((block) => absoluteStart >= block.start && absoluteStart < block.end);
  const endProbe = Math.max(absoluteStart, absoluteEnd - 1);
  const endBlock = blocks.find((block) => endProbe >= block.start && endProbe < block.end);
  if (!startBlock || !endBlock) return null;
  return {
    block: startBlock,
    startBlock,
    endBlock,
    start: absoluteStart - startBlock.start,
    end: absoluteEnd - endBlock.start,
    absoluteStart,
    absoluteEnd,
  };
}

function selectionSpanFromAbsoluteRange(blocks, absoluteStart, absoluteEnd) {
  const startBlock = blocks.find((block) => block.end > absoluteStart) || blocks.at(-1);
  const endBlock = [...blocks].reverse().find((block) => block.start < absoluteEnd) || blocks[0];
  if (!startBlock || !endBlock || endBlock.index < startBlock.index) return null;
  return {
    block: startBlock,
    startBlock,
    endBlock,
    start: Math.max(0, absoluteStart - startBlock.start),
    end: Math.max(0, absoluteEnd - endBlock.start),
    absoluteStart,
    absoluteEnd,
  };
}

function findSelectionAnchor(source, blocks, selection) {
  const selectedText = String(selection?.selectedText || "");
  if (!selectedText) return { match: null, matchCount: 0 };
  const suppliedAbsoluteStart = Number(selection?.absoluteStart);
  const suppliedAbsoluteEnd = Number(selection?.absoluteEnd);
  if (Number.isInteger(suppliedAbsoluteStart) && Number.isInteger(suppliedAbsoluteEnd) && suppliedAbsoluteEnd > suppliedAbsoluteStart &&
      source.slice(suppliedAbsoluteStart, suppliedAbsoluteEnd) === selectedText) {
    const directMatch = selectionMatchFromAbsolute(blocks, suppliedAbsoluteStart, suppliedAbsoluteEnd) ||
      selectionSpanFromAbsoluteRange(blocks, suppliedAbsoluteStart, suppliedAbsoluteEnd);
    const stableStart = !selection.blockId || directMatch?.startBlock.id === selection.blockId;
    const stableEnd = !selection.endBlockId || directMatch?.endBlock.id === selection.endBlockId;
    if (directMatch && stableStart && stableEnd) return { match: directMatch, matchCount: 1 };
  }
  const direct = Number.isInteger(selection?.blockIndex)
    ? blocks[selection.blockIndex]
    : blocks.find((block) => block.id === selection?.blockId);
  if (direct) {
    const start = Number(selection.start);
    const end = Number(selection.end);
    const exactRange = Number.isInteger(start) && Number.isInteger(end) && end > start &&
      direct.raw.slice(start, end) === selectedText;
    const stableBlock = !selection.blockId || direct.id === selection.blockId;
    const prefixMatches = !selection.prefix || direct.raw.slice(Math.max(0, start - selection.prefix.length), start) === selection.prefix;
    const suffixMatches = !selection.suffix || direct.raw.slice(end, end + selection.suffix.length) === selection.suffix;
    if (exactRange && (stableBlock || (prefixMatches && suffixMatches))) {
      return { match: selectionMatchFromAbsolute(blocks, direct.start + start, direct.start + end), matchCount: 1 };
    }
  }

  const matches = [];
  let cursor = 0;
  while (cursor <= source.length) {
    const absoluteStart = source.indexOf(selectedText, cursor);
    if (absoluteStart < 0) break;
    const absoluteEnd = absoluteStart + selectedText.length;
    const match = selectionMatchFromAbsolute(blocks, absoluteStart, absoluteEnd);
    if (match) {
      const prefixMatches = !selection.prefix || source.slice(Math.max(0, absoluteStart - selection.prefix.length), absoluteStart) === selection.prefix;
      const suffixMatches = !selection.suffix || source.slice(absoluteEnd, absoluteEnd + selection.suffix.length) === selection.suffix;
      matches.push({ ...match, contextMatches: prefixMatches && suffixMatches });
    }
    cursor = absoluteStart + Math.max(1, selectedText.length);
  }
  const contextual = matches.filter((match) => match.contextMatches);
  return {
    match: contextual.length === 1 ? contextual[0] : matches.length === 1 ? matches[0] : null,
    matchCount: matches.length,
  };
}

function selectionAnchorPayload(pathValue, documentEtag, source, match, selectedText, message = null) {
  return {
    path: pathValue,
    documentEtag,
    blockId: match.block.id,
    blockIndex: match.block.index,
    start: match.start,
    end: match.end,
    endBlockId: match.endBlock.id,
    endBlockIndex: match.endBlock.index,
    absoluteStart: match.absoluteStart,
    absoluteEnd: match.absoluteEnd,
    selectedText,
    prefix: source.slice(Math.max(0, match.absoluteStart - 120), match.absoluteStart),
    suffix: source.slice(match.absoluteEnd, Math.min(source.length, match.absoluteEnd + 120)),
    selectedAt: message?.createdAt || new Date().toISOString(),
    messageId: message?.id || null,
  };
}

async function normalizeChatSelectionContext(value, message = null, { requireEtag = true } = {}) {
  if (!value || typeof value !== "object") return null;
  const pathValue = String(value.path || message?.activePath || "");
  const selectedText = String(value.selectedText || "");
  if (!pathValue || !selectedText) throw new Error("The chat selection is incomplete. Reselect the passage and try again.");
  const payload = await documentPayload(pathValue);
  const suppliedEtag = String(value.etag || value.documentEtag || "");
  if (requireEtag && suppliedEtag && suppliedEtag !== payload.etag) {
    throw new Error("The source changed after you selected this passage. Reselect it before opening Chat.");
  }
  const { match, matchCount } = findSelectionAnchor(payload.source, payload.blocks, {
    ...value,
    selectedText,
  });
  if (!match) {
    throw new Error(`The selected passage matched ${matchCount} current locations. Reselect it before creating a proposal.`);
  }
  return selectionAnchorPayload(pathValue, payload.etag, payload.source, match, selectedText, message);
}

async function normalizeChatStructureContext(value, message = null, { requireSnapshot = true } = {}) {
  if (!value || typeof value !== "object") return null;
  const requestedIds = [...new Set(Array.isArray(value.sectionIds) ? value.sectionIds.map(String) : [])];
  if (!requestedIds.length) throw new Error("Choose at least one section for Structure Chat.");
  const structure = await paperStructure();
  if (requireSnapshot && value.snapshotHash && value.snapshotHash !== structure.snapshotHash) {
    throw new Error("The paper structure changed after you selected these sections. Refresh Structure and try again.");
  }
  const sections = requestedIds.map((id) => structure.sections.find((section) => section.id === id)).filter(Boolean);
  if (sections.length !== requestedIds.length) throw new Error("One of the selected sections no longer exists. Refresh Structure and try again.");
  return {
    sectionIds: sections.map((section) => section.id),
    snapshotHash: structure.snapshotHash,
    label: sections.map((section) => `${section.number} ${section.title}`).join(" · "),
    sections: sections.map((section) => ({
      id: section.id,
      number: section.number,
      title: section.title,
      paths: [...new Set(section.sources.map((source) => source.path))],
      snapshotHash: section.snapshotHash,
    })),
    selectedAt: message?.createdAt || new Date().toISOString(),
    messageId: message?.id || null,
  };
}

function legacySelectionFromMessage(message) {
  if (message?.role !== "user") return null;
  const content = String(message.content || "");
  const source = content.match(/(?:^|\n)Source:\s*([^\n]+)\s*(?:\n|$)/);
  const passage = content.match(/<selected_passage>\s*\n([\s\S]*?)\n\s*<\/selected_passage>/);
  if (!source || !passage) return null;
  return {
    path: source[1].trim(),
    selectedText: passage[1].trim(),
  };
}

async function hydrateChatSelectionLinks(session) {
  let currentSelection = null;
  let currentStructure = null;
  let changed = false;
  for (const message of session.messages) {
    if (message.role === "user") {
      if (message.selectionContext?.selectedText) {
        currentSelection = message.selectionContext;
        currentStructure = null;
      } else if (message.structureContext?.sectionIds?.length) {
        currentStructure = message.structureContext;
        currentSelection = null;
      } else {
        const legacy = legacySelectionFromMessage(message);
        if (legacy) {
          try {
            currentSelection = await normalizeChatSelectionContext(legacy, message, { requireEtag: false });
            message.selectionContext = currentSelection;
            changed = true;
          } catch {
            currentSelection = null;
          }
        }
      }
    } else if (message.role === "assistant") {
      if (currentSelection?.messageId && !message.selectionMessageId) {
        message.selectionMessageId = currentSelection.messageId;
        changed = true;
      }
      if (currentStructure?.messageId && !message.structureMessageId) {
        message.structureMessageId = currentStructure.messageId;
        changed = true;
      }
    }
  }
  if (currentSelection && JSON.stringify(session.activeSelection || null) !== JSON.stringify(currentSelection)) {
    session.activeSelection = currentSelection;
    changed = true;
  } else if (!currentSelection && session.activeSelection) {
    delete session.activeSelection;
    changed = true;
  }
  if (currentStructure && JSON.stringify(session.activeStructure || null) !== JSON.stringify(currentStructure)) {
    session.activeStructure = currentStructure;
    changed = true;
  } else if (!currentStructure && session.activeStructure) {
    delete session.activeStructure;
    changed = true;
  }
  return changed;
}

async function refreshRewriteRequestAnchor(target, request) {
  const hostPayload = await documentPayload(request.path);
  const captionRedirect = await captionRewriteRedirect(hostPayload, request, request.comment);
  if (captionRedirect) {
    const { payload, span, origin } = captionRedirect;
    request.path = payload.path;
    request.documentEtag = payload.etag;
    request.blockId = span.startBlock.id;
    request.blockIndex = span.startBlock.index;
    request.start = span.start;
    request.end = span.end;
    request.endBlockId = span.endBlock.id;
    request.endBlockIndex = span.endBlock.index;
    request.absoluteStart = span.absoluteStart;
    request.absoluteEnd = span.absoluteEnd;
    request.selectedText = payload.source.slice(span.absoluteStart, span.absoluteEnd);
    request.prefix = payload.source.slice(Math.max(0, span.absoluteStart - 120), span.absoluteStart);
    request.suffix = payload.source.slice(span.absoluteEnd, Math.min(payload.source.length, span.absoluteEnd + 120));
    request.blockText = payload.source.slice(span.startBlock.start, span.endBlock.end);
    request.origin = origin;
  }
  const source = await fs.readFile(resolveDocument(request.path), "utf8");
  const blocks = parseBlocks(source);
  const selectedText = String(request.selectedText || "");
  if (!selectedText) throw new Error("This comment no longer has a selected passage.");
  const { match, matchCount } = findSelectionAnchor(source, blocks, request);
  if (!match) {
    throw new Error(`Selected passage matched ${matchCount} current locations; reselect it before retrying.`);
  }
  const spansMultipleBlocks = match.startBlock.index !== match.endBlock.index;
  const structuralKinds = new Set(["heading", "paragraph-heading"]);
  const snappedStart = spansMultipleBlocks && structuralKinds.has(match.startBlock.kind) ? 0 : match.start;
  const snappedEnd = spansMultipleBlocks && structuralKinds.has(match.endBlock.kind) ? match.endBlock.raw.length : match.end;
  const snappedAbsoluteStart = match.startBlock.start + snappedStart;
  const snappedAbsoluteEnd = match.endBlock.start + snappedEnd;
  request.blockId = match.block.id;
  request.blockIndex = match.block.index;
  request.start = snappedStart;
  request.end = snappedEnd;
  request.endBlockId = match.endBlock.id;
  request.endBlockIndex = match.endBlock.index;
  request.absoluteStart = snappedAbsoluteStart;
  request.absoluteEnd = snappedAbsoluteEnd;
  request.selectedText = source.slice(snappedAbsoluteStart, snappedAbsoluteEnd);
  request.prefix = source.slice(Math.max(0, snappedAbsoluteStart - 120), snappedAbsoluteStart);
  request.suffix = source.slice(snappedAbsoluteEnd, Math.min(source.length, snappedAbsoluteEnd + 120));
  request.blockText = source.slice(match.startBlock.start, match.endBlock.end);
  request.documentEtag = sha(source);
  await atomicWrite(target, `${JSON.stringify(request, null, 2)}\n`);
  return request;
}

function exactTextMatches(source, selectedText) {
  const matches = [];
  let cursor = 0;
  while (selectedText && cursor <= source.length) {
    const start = source.indexOf(selectedText, cursor);
    if (start < 0) break;
    matches.push(start);
    cursor = start + Math.max(1, selectedText.length);
  }
  return matches;
}

// Resolve the locations returned by link mode into anchored comment targets.
// Unlike related proposal changes these carry no replacement text, may share a
// file with each other, and are capped only by the output schema.
async function validateLinkedCommentTargets(rawTargets, source) {
  const targets = [];
  const warnings = [];
  const seen = new Set();
  for (const [index, raw] of (Array.isArray(rawTargets) ? rawTargets : []).entries()) {
    try {
      const suppliedPath = String(raw?.path || "").trim();
      if (!suppliedPath) throw new Error("the target path is empty");
      const sourcePrefix = config.sourceRoot === "." ? "" : `${config.sourceRoot}/`;
      const candidatePath = sourcePrefix && suppliedPath.startsWith(sourcePrefix)
        ? suppliedPath
        : path.posix.join(config.sourceRoot, suppliedPath.replace(/^[/]+/, ""));
      const absolutePath = resolveDocument(candidatePath);
      const targetPath = relativeRepo(absolutePath);
      if (path.extname(absolutePath).toLowerCase() !== ".tex") {
        throw new Error("linked comments are limited to LaTeX source files");
      }
      const selectedText = String(raw?.selectedText || "");
      if (!selectedText.trim()) throw new Error("the source anchor is empty");
      const comment = String(raw?.comment || "").trim();
      const reason = String(raw?.reason || "").trim();
      if (!comment || !reason) throw new Error("the target needs a comment and a reason");
      const fileSource = await fs.readFile(absolutePath, "utf8");
      const matches = exactTextMatches(fileSource, selectedText);
      if (matches.length !== 1) {
        throw new Error(`the source anchor matched ${matches.length} locations`);
      }
      const absoluteStart = matches[0];
      const absoluteEnd = absoluteStart + selectedText.length;
      if (targetPath === source.path && absoluteStart < source.absoluteEnd && absoluteEnd > source.absoluteStart) {
        throw new Error("the target overlaps the commented passage");
      }
      const key = `${targetPath}:${absoluteStart}:${absoluteEnd}`;
      if (seen.has(key)) throw new Error("the target duplicates an earlier one");
      const blocks = parseBlocks(fileSource);
      const span = selectionMatchFromAbsolute(blocks, absoluteStart, absoluteEnd)
        || selectionSpanFromAbsoluteRange(blocks, absoluteStart, absoluteEnd);
      if (!span) throw new Error("the source anchor does not map to a reviewable source range");
      seen.add(key);
      targets.push({ path: targetPath, span, comment, reason });
    } catch (error) {
      warnings.push(`Linked location ${index + 1} was not attached: ${error.message}`);
    }
  }
  return { targets, warnings };
}

// Create one comment per resolved target and link it to its source comment in
// both directions. Each is an ordinary comment at that location, so it can be
// run for a proposal later; it just does not draft one on arrival, because the
// author asked to be shown the locations first.
async function createLinkedCommentRequests(sourceRequest, targets, { autoProcess = false } = {}) {
  const created = [];
  for (const target of targets) {
    const payload = await documentPayload(target.path);
    const request = buildRewriteRequest({
      payload,
      span: target.span,
      comment: target.comment,
      rewriteScope: "selection",
      contextMode: sourceRequest.contextMode || "smart",
      origin: {
        type: "linked-comment",
        sourceRequestId: sourceRequest.id,
        sourcePath: sourceRequest.path,
        reason: target.reason,
      },
    });
    request.provider = sourceRequest.provider;
    request.links = [sourceRequest.id];
    await persistRewriteRequest(request, { autoProcess });
    created.push({ id: request.id, path: request.path, reason: target.reason });
  }
  return created;
}

async function validateRelatedProposalChanges(rawChanges, primaryPath) {
  const changes = [];
  const warnings = [];
  const seenPaths = new Set([primaryPath]);
  for (const [index, raw] of (Array.isArray(rawChanges) ? rawChanges.slice(0, 3) : []).entries()) {
    try {
      const suppliedPath = String(raw?.path || "").trim();
      const sourcePrefix = config.sourceRoot === "." ? "" : `${config.sourceRoot}/`;
      const candidatePath = sourcePrefix && suppliedPath.startsWith(sourcePrefix)
        ? suppliedPath
        : path.posix.join(config.sourceRoot, suppliedPath.replace(/^[/]+/, ""));
      const absolutePath = resolveDocument(candidatePath);
      const relatedPath = relativeRepo(absolutePath);
      if (path.extname(absolutePath).toLowerCase() !== ".tex") {
        throw new Error("linked changes are limited to LaTeX source files");
      }
      if (seenPaths.has(relatedPath)) {
        throw new Error("each linked change must target a different file");
      }
      const selectedText = String(raw?.selectedText || "");
      if (!selectedText) throw new Error("the related source anchor is empty");
      const source = await fs.readFile(absolutePath, "utf8");
      const matches = exactTextMatches(source, selectedText);
      if (matches.length !== 1) {
        throw new Error(`the related source anchor matched ${matches.length} locations`);
      }
      const absoluteStart = matches[0];
      const absoluteEnd = absoluteStart + selectedText.length;
      const blocks = parseBlocks(source);
      const match = selectionMatchFromAbsolute(blocks, absoluteStart, absoluteEnd)
        || selectionSpanFromAbsoluteRange(blocks, absoluteStart, absoluteEnd);
      if (!match) throw new Error("the related source anchor does not map to a reviewable source range");
      const replacementText = String(raw?.replacementText ?? "");
      const summary = String(raw?.summary || "").trim();
      const reason = String(raw?.reason || "").trim();
      if (!summary || !reason) throw new Error("the related change needs a summary and reason");
      const id = `linked_${index + 1}_${sha(`${relatedPath}:${selectedText}`).slice(0, 10)}`;
      changes.push({
        id,
        path: relatedPath,
        status: "pending",
        required: Boolean(raw?.required),
        reason,
        summary,
        sourceEtag: sha(source),
        absoluteStart,
        absoluteEnd,
        blockIndex: match.startBlock.index,
        endBlockIndex: match.endBlock.index,
        selectedText,
        replacementText,
      });
      seenPaths.add(relatedPath);
    } catch (error) {
      warnings.push(`Related change ${index + 1} was not attached: ${error.message}`);
    }
  }
  return { changes, warnings };
}

// A model asked to rewrite part of a sentence sometimes repeats what stands
// just outside the selection: "the evidence for it is" + "is weaker than…", the
// rest of a sentence whose first half was selected, or a full stop that is
// already there. Accepting that would double the text in the source. An echo
// is removed when the replacement begins (ends) with the text right before
// (after) the selection and the selected text itself did not: either up to
// three whole words, or any run of 12 or more characters.
function trimBoundaryEcho(replacementText, originalText, before, after) {
  let result = replacementText;
  const overlap = (longest, candidate, original) => {
    for (let length = longest; length >= 12; length -= 1) {
      const echo = candidate(length);
      if (echo && !original(echo)) return echo.length;
    }
    return 0;
  };
  const longLead = overlap(
    Math.min(before.length, result.length),
    (length) => (result.startsWith(before.slice(-length)) ? before.slice(-length) : ""),
    (echo) => originalText.startsWith(echo),
  );
  if (longLead) result = result.slice(longLead);
  const longTail = overlap(
    Math.min(after.length, result.length),
    (length) => (result.endsWith(after.slice(0, length)) ? after.slice(0, length) : ""),
    (echo) => originalText.endsWith(echo),
  );
  if (longTail) result = result.slice(0, -longTail);

  const lead = longLead || /^\s/.test(result) ? "" : before.match(/(?:^|\s)((?:\S+[ \t]+){1,3})$/)?.[1] || "";
  const leadWords = lead.split(/(?<=[ \t])(?=\S)/);
  for (let count = leadWords.length; count >= 1; count -= 1) {
    const echo = leadWords.slice(-count).join("");
    if (/\w/.test(echo) && result.startsWith(echo) && !originalText.startsWith(echo)) {
      result = result.slice(echo.length);
      break;
    }
  }
  const tail = longTail || /\s$/.test(result) ? "" : after.match(/^((?:[ \t]+\S+){1,3})(?=\s|$)/)?.[1] || "";
  const tailWords = tail.split(/(?<=\S)(?=[ \t])/);
  for (let count = tailWords.length; count >= 1; count -= 1) {
    const echo = tailWords.slice(0, count).join("");
    if (/\w/.test(echo) && result.endsWith(echo) && !originalText.endsWith(echo)) {
      result = result.slice(0, -echo.length);
      break;
    }
  }
  const mark = longTail ? null : after.match(/^[.,;:!?]/)?.[0];
  if (mark && result.trim() && result.endsWith(mark) && !originalText.endsWith(mark)) result = result.slice(0, -1);
  return result;
}

async function attachGeneratedProposal(requestId, replacementText, summary) {
  const { target, value: request } = await readRewriteRequest(requestId);
  const unitRevision = request.status === "proposed"
    && request.pendingUnitRevision
    && request.proposal;
  if (request.status !== "pending" && !unitRevision) {
    throw new Error(`This review request is no longer waiting for a proposal: ${requestId}`);
  }
  const absolutePath = resolveDocument(request.path);
  const source = await fs.readFile(absolutePath, "utf8");
  const blocks = parseBlocks(source);
  const { match, matchCount } = findSelectionAnchor(source, blocks, request);
  if (!match) {
    throw new Error(`The selected passage matched ${matchCount} locations; refusing to guess.`);
  }
  const originalText = source.slice(match.absoluteStart, match.absoluteEnd);
  replacementText = trimBoundaryEcho(
    replacementText, originalText,
    source.slice(Math.max(0, match.absoluteStart - 200), match.absoluteStart),
    source.slice(match.absoluteEnd, match.absoluteEnd + 200),
  );
  if (replacementText === originalText) {
    // Usually the agent's way of saying "this is fine": its reason is the answer
    // the author was waiting for, so it must not be lost behind a bare error.
    throw new Error(`The agent proposed no change${summary ? `: ${summary}` : "."} Retry with a more specific instruction, or delete the comment.`);
  }
  request.status = "proposed";
  request.proposal = {
    proposedAt: new Date().toISOString(),
    summary,
    sourceEtag: sha(source),
    absoluteStart: match.absoluteStart,
    absoluteEnd: match.absoluteEnd,
    originalText,
    replacementText,
  };
  delete request.rejectedAt;
  await atomicWrite(target, `${JSON.stringify(request, null, 2)}\n`);
  return { target, value: request };
}

// Full source of the file being edited, so the agent can resolve references
// that live outside the selection. A manuscript section is normally a few
// kilobytes; anything unexpectedly large falls back to a wide window around
// the selection rather than being dropped.
const TASK_DOCUMENT_CHAR_LIMIT = 120000;
const TASK_DOCUMENT_FALLBACK_WINDOW = 8000;

async function documentContextForTask(request, limit = TASK_DOCUMENT_CHAR_LIMIT) {
  try {
    const source = await fs.readFile(resolveDocument(request.path), "utf8");
    if (source.length <= Math.min(limit, TASK_DOCUMENT_CHAR_LIMIT)) {
      return { path: request.path, chars: source.length, truncated: false, source };
    }
    const start = Math.max(0, request.absoluteStart - TASK_DOCUMENT_FALLBACK_WINDOW);
    const end = Math.min(source.length, request.absoluteEnd + TASK_DOCUMENT_FALLBACK_WINDOW);
    return {
      path: request.path,
      chars: source.length,
      truncated: true,
      windowStart: start,
      windowEnd: end,
      source: source.slice(start, end),
    };
  } catch {
    return null;
  }
}

// Project vocabulary (agent.terminologyFiles, default none): glossaries or style
// sheets whose wording is binding on the agent. Returns null when nothing was
// loaded, and the prompts then carry no terminology instructions at all.
async function terminologyForTask(budget = null) {
  const configured = Array.isArray(config.codex?.terminologyFiles) ? config.codex.terminologyFiles.map(String) : [];
  const documents = [];
  for (const relativePath of configured) {
    const absolute = path.resolve(repoRoot, relativePath);
    if (path.isAbsolute(relativePath) || !isInside(repoRoot, absolute) || !realPathInside(realRepoRoot, absolute)) continue;
    try {
      const source = await fs.readFile(absolute, "utf8");
      if (budget) {
        const taken = budget.take(source);
        if (taken) documents.push({ path: relativePath, source: taken.source, ...(taken.truncated ? { truncated: true } : {}) });
      } else {
        documents.push({ path: relativePath, source: source.slice(0, 60000) });
      }
    } catch {
      // A missing terminology file is not an error.
    }
  }
  return documents.length ? documents : null;
}

// Resolve the anchors a review returned into ranges in this one file. Findings
// whose anchor no longer matches are dropped with a reason rather than shown
// against the wrong text.
async function anchorReviewFindings(rawFindings, relativePath) {
  const payload = await documentPayload(relativePath);
  const blocks = parseBlocks(payload.source);
  const findings = [];
  const warnings = [];
  const seen = new Set();
  for (const [index, raw] of (Array.isArray(rawFindings) ? rawFindings : []).entries()) {
    try {
      const selectedText = String(raw?.selectedText || "");
      if (!selectedText.trim()) throw new Error("the anchor is empty");
      const matches = exactTextMatches(payload.source, selectedText);
      if (matches.length !== 1) throw new Error(`the anchor matched ${matches.length} places`);
      const absoluteStart = matches[0];
      const absoluteEnd = absoluteStart + selectedText.length;
      const key = `${absoluteStart}:${absoluteEnd}`;
      if (seen.has(key)) throw new Error("duplicate anchor");
      const span = selectionMatchFromAbsolute(blocks, absoluteStart, absoluteEnd)
        || selectionSpanFromAbsoluteRange(blocks, absoluteStart, absoluteEnd);
      if (!span) throw new Error("the anchor does not map to a reviewable range");
      seen.add(key);
      findings.push({
        id: `rf_${index + 1}_${sha(`${relativePath}:${selectedText}`).slice(0, 8)}`,
        level: String(raw?.level || "sentence"),
        principle: String(raw?.principle || "").trim(),
        issue: String(raw?.issue || "").trim(),
        suggestion: String(raw?.suggestion || "").trim(),
        selectedText,
        absoluteStart,
        absoluteEnd,
        blockIndex: span.startBlock.index,
        endBlockIndex: span.endBlock.index,
      });
    } catch (error) {
      warnings.push(`Finding ${index + 1} was dropped: ${error.message}`);
    }
  }
  return { path: relativePath, etag: payload.etag, findings, warnings };
}

function codexEntryPoints(activePath = null) {
  const configured = config.codex?.entryPoints || [];
  const conventional = [...(config.codex?.guidanceFiles || []), config.defaultDocument];
  return [...new Set([...configured, ...conventional, activePath].filter(Boolean))]
    .filter((relativePath) => existsSync(path.resolve(repoRoot, relativePath)));
}

// --- Context for providers that cannot read the repository ------------------
// A CLI agent opens files itself. An API provider sees only the prompt, so the
// server inlines what it needs: the file being edited, the terminology and
// guidance files, and (outside "local" context mode, and in chat) the other
// manuscript files and the outline. Everything inlined for one run shares one
// character budget (agent.contextBudgetChars) and is cut with a visible marker.
function providerReadsRepo(provider) {
  return providerCapabilities(provider).readRepo === true;
}

function contextBudgetChars() {
  return Math.max(2000, Number(config.codex?.contextBudgetChars) || 120_000);
}

function truncationMarker(shown, total) {
  return `\n[... truncated by ${APP_NAME}: ${shown} of ${total} characters shown; raise agent.contextBudgetChars to send more ...]`;
}

function createContextBudget(total = contextBudgetChars()) {
  let remaining = total;
  return {
    total,
    get remaining() { return remaining; },
    spend(characters) { remaining = Math.max(0, remaining - Math.max(0, characters)); },
    // Returns { source, chars, truncated } or null when nothing is left.
    take(text) {
      const value = String(text ?? "");
      if (remaining <= 0) return null;
      if (value.length <= remaining) {
        remaining -= value.length;
        return { source: value, chars: value.length, truncated: false };
      }
      const shown = remaining;
      remaining = 0;
      return { source: `${value.slice(0, shown)}${truncationMarker(shown, value.length)}`, chars: value.length, truncated: true };
    },
  };
}

async function readProjectFile(relativePath) {
  const absolute = path.resolve(repoRoot, relativePath);
  if (path.isAbsolute(relativePath) || !isInside(repoRoot, absolute) || !realPathInside(realRepoRoot, absolute)) return null;
  try {
    return await fs.readFile(absolute, "utf8");
  } catch {
    return null;
  }
}

/**
 * Project material inlined for a provider without repository access.
 * `exclude` lists paths the prompt already carries (the file being edited).
 * Returns null when there is nothing to add.
 */
async function inlinedProjectContext({ budget, exclude = [], activeDocument = null, includeOutline = false, includeManuscript = false }) {
  const files = [];
  const omitted = [];
  const seen = new Set(exclude);
  const add = async (relativePath, role) => {
    if (!relativePath || seen.has(relativePath)) return;
    seen.add(relativePath);
    const source = await readProjectFile(relativePath);
    if (source === null) return;
    const taken = budget.take(source);
    if (!taken) {
      omitted.push(relativePath);
      return;
    }
    files.push({ path: relativePath, role, ...taken });
  };
  if (activeDocument) await add(activeDocument, "active-document");
  for (const relativePath of config.codex?.guidanceFiles || []) await add(relativePath, "guidance");
  let outline = null;
  if (includeOutline) {
    try {
      const compiled = await compiledOutline();
      const text = compiled.items
        .map((item) => `${"  ".repeat(Math.max(0, item.level - 1))}${item.number ? `${item.number} ` : ""}${item.title} (${item.path})`)
        .join("\n");
      outline = budget.take(text)?.source ?? null;
    } catch {
      outline = null;
    }
  }
  if (includeManuscript) {
    const documents = (await listDocuments()).map((item) => item.path).filter((item) => /[.]tex$/i.test(item));
    // The main file first, then the rest in listing order.
    for (const relativePath of [config.defaultDocument, ...documents]) await add(relativePath, "manuscript");
  }
  if (!files.length && !outline) return null;
  return {
    note: "You cannot open files. These are the only project files you can see; treat anything not shown as unknown.",
    budgetChars: budget.total,
    ...(outline ? { outline } : {}),
    files,
    ...(omitted.length ? { omittedForSpace: omitted } : {}),
  };
}

// Whole-section review. The criteria are Gopen and Swan's reader-expectation
// principles plus Sommers' finding that experienced revision is about the shape
// of the argument, not the choice of words: a reviewer that only reports wording
// reproduces the failure this feature exists to catch.
function reviewPromptLines(task) {
  const hasTerminology = Boolean(task.terminology);
  return [
    "You are reviewing one section of an academic manuscript for its author. Report what to change. Do not rewrite anything.",
    hasTerminology
      ? "task.document is the complete source file under review. task.terminology is binding project vocabulary."
      : "task.document is the complete source file under review.",
    task.repository?.readAllowed === false
      ? `You cannot open files. Work only from the text in this task${task.projectContext ? " (task.projectContext holds the project's guidance files)" : ""}.`
      : "",
    "Read it the way its intended reader will: someone in the field who has not seen this work, reading once, at speed.",
    "Judge it at four levels, and spend your attention in this order.",
    "Argument: does the section claim something, and is it claimed in an order a reader can follow? Is a paragraph doing no work, or standing where its own conclusion cannot yet be understood? Sommers found that experienced revision is a search for the form of the argument, while weak revision only exchanges words; a review that only reports wording has failed.",
    "Paragraph: does each paragraph open on something the reader already has, and close on the point it wants remembered?",
    "Sentence: is the new information at the end of the sentence, where a reader places emphasis? Does the grammatical subject reach its verb quickly? Is the action of the sentence in its verb rather than buried in a noun? Does the sentence open on the thing whose story it tells?",
    hasTerminology
      ? "Wording: a term that is not the one task.terminology or the rest of task.document uses, or a phrase that hides what happened."
      : "Wording: a term that is not the one the rest of task.document uses, or a phrase that hides what happened.",
    "Prose that reads badly often marks a gap in the argument rather than a defect in the writing. When structure and substance are both at fault, say so in the finding: that is the more useful report.",
    "Anchor every finding with exact text copied from the source, occurring exactly once, as short as it can be while still containing the problem.",
    "Order findings by how much a reader loses, strongest first. Twelve is the maximum; fewer and better is the better review. Return [] for a section that needs nothing.",
    "Do not propose inventing a result, a number, a citation, or a comparison the work has not made.",
    reviewLanguageInstruction(hasTerminology),
    "Do not explain your reasoning outside the required JSON fields.",
    JSON.stringify(task),
  ].filter(Boolean);
}

// agent.reviewLanguage is the language the review is explained in: a code
// ("en", "zh", "de") or a plain name ("Chinese", "German"). It defaults to
// English. When it differs from the manuscript's language, anchors and quoted
// wording must still stay verbatim or they will not match the source.
function reviewLanguageName() {
  const raw = String(config.codex?.reviewLanguage || "en").replace(/[^\p{L}\p{N} ()_-]/gu, "").trim().slice(0, 40) || "en";
  let name = raw;
  try {
    const resolved = new Intl.DisplayNames(["en"], { type: "language" }).of(raw.replace(/_/g, "-"));
    if (resolved && resolved.toLowerCase() !== raw.toLowerCase()) name = resolved;
  } catch {
    // Not a language tag: use the name as typed.
  }
  return `${name[0].toUpperCase()}${name.slice(1)}`;
}

function reviewLanguageInstruction(hasTerminology = false) {
  const language = reviewLanguageName();
  if (/^english\b/i.test(language)) {
    return "Write summary, principle, issue and suggestion in English.";
  }
  return [
    `Write summary, principle, issue and suggestion in ${language}, so the author can triage quickly.`,
    "Two things stay in the manuscript's own language: selectedText, which must be copied character for character from the source, and any words you quote from the manuscript or propose as replacement wording.",
    hasTerminology ? "Keep technical terms from task.terminology in their registered form rather than translating them." : "",
  ].filter(Boolean).join(" ");
}

let activeReviewChild = null;
let sectionReviewRunning = false;

async function runSectionReview(body = {}) {
  assertAgentEnabled();
  const relativePath = body.path || config.defaultDocument;
  resolveDocument(relativePath);
  if (sectionReviewRunning) {
    throw new HttpError(409, "A section review is already running. Wait for it to finish before starting another.");
  }
  sectionReviewRunning = true;
  let temporaryRoot = null;
  try {
    const payload = await documentPayload(relativePath);
    const provider = resolveProvider(body.provider);
    const model = resolveModel(provider, body.model);
    assertProviderReady(provider);
    const reasoningEffort = config.codex?.projectReasoningEffort || "medium";
    temporaryRoot = await fs.mkdtemp(path.join(tmpdir(), `${TEMP_PREFIX}review-`));
    const outputPath = path.join(temporaryRoot, "review.json");
    const readsRepo = providerReadsRepo(provider);
    // Without repository access everything the reviewer sees is inlined here,
    // inside one character budget: the section first, then the vocabulary,
    // then the guidance files.
    const budget = readsRepo ? null : createContextBudget();
    const documentText = budget ? budget.take(payload.source) : { source: payload.source, truncated: false };
    const task = {
      version: 1,
      taskType: "paper_section_review",
      document: {
        path: relativePath,
        chars: payload.source.length,
        ...(documentText?.truncated ? { truncated: true } : {}),
        source: documentText?.source ?? "",
      },
      terminology: await terminologyForTask(budget),
      repository: readsRepo
        ? { root: ".", readAllowed: true, editAllowed: false, entryPoints: codexEntryPoints(relativePath) }
        : { root: ".", readAllowed: false, editAllowed: false, entryPoints: [] },
      ...(budget ? { projectContext: await inlinedProjectContext({ budget, exclude: [relativePath] }) } : {}),
    };
    const invocation = await buildAgentInvocation({
      provider,
      config,
      prompt: reviewPromptLines(task).join("\n"),
      schemaPath: reviewSchemaPath,
      outputPath,
      repoRoot,
      model,
      reasoningEffort,
      timeoutMs: Number(config.codex?.projectTimeoutMs) || 180_000,
    });
    const result = await spawnCaptured(invocation.command, invocation.args, {
      cwd: repoRoot,
      env: childEnvironment({ provider, config }),
      input: invocation.input,
      timeoutMs: Number(config.codex?.projectTimeoutMs) || 180_000,
      label: `${providerLabel(provider)} section review`,
      onChild: (child) => { activeReviewChild = child; },
    });
    activeReviewChild = null;
    await captureAgentOutput({ invocation, result, outputPath });
    if (result.code !== 0) {
      throw new HttpError(502, redactSecrets(agentFailureMessage(result, "The review could not be produced.", { timeoutSetting: "agent.projectTimeoutMs" })));
    }
    let parsed;
    try {
      parsed = JSON.parse(cleanJsonOutput(await fs.readFile(outputPath, "utf8")));
    } catch {
      throw new HttpError(502, `${providerLabel(provider)} did not return a review in the expected JSON format. Try again.`);
    }
    const anchored = await anchorReviewFindings(parsed?.findings, relativePath);
    return {
      ...anchored,
      summary: String(parsed?.summary || "").trim(),
      provider,
      model,
      createdAt: new Date().toISOString(),
    };
  } finally {
    activeReviewChild = null;
    sectionReviewRunning = false;
    if (temporaryRoot) await fs.rm(temporaryRoot, { recursive: true, force: true }).catch(() => {});
  }
}

// Turning a finding into a comment is the author's decision, so it is a
// separate call. The comment is created unprocessed: accepting a finding says
// "this is worth doing", not "draft it now".
async function acceptReviewFinding(body = {}) {
  const relativePath = body.path;
  resolveDocument(relativePath);
  const payload = await documentPayload(relativePath);
  const selectedText = String(body.selectedText || "");
  const matches = exactTextMatches(payload.source, selectedText);
  if (matches.length !== 1) {
    throw new Error("This passage changed since the review ran. Review the section again.");
  }
  const absoluteStart = matches[0];
  const absoluteEnd = absoluteStart + selectedText.length;
  const blocks = parseBlocks(payload.source);
  const span = selectionMatchFromAbsolute(blocks, absoluteStart, absoluteEnd)
    || selectionSpanFromAbsoluteRange(blocks, absoluteStart, absoluteEnd);
  if (!span) throw new Error("This passage no longer maps to a reviewable range.");
  const request = buildRewriteRequest({
    payload,
    span,
    comment: String(body.comment || "").trim() || "Address the reviewer finding on this passage.",
    rewriteScope: "selection",
    contextMode: "smart",
    origin: { type: "section-review", level: String(body.level || "sentence"), principle: String(body.principle || "") },
  });
  request.provider = resolveProvider(body.provider);
  request.model = resolveModel(request.provider, body.model);
  return persistRewriteRequest(request, { autoProcess: false });
}

async function generateCodexProposal(requestId) {
  if (cancelledCodexRequests.has(requestId)) {
    const error = new Error("The agent run was cancelled because the comment was deleted.");
    error.code = "CODEX_CANCELLED";
    throw error;
  }
  activeCodexRequestId = requestId;
  codexRunPayload(requestId, "running");
  const temporaryRoot = await fs.mkdtemp(path.join(tmpdir(), `${TEMP_PREFIX}agent-`));
  const outputPath = path.join(temporaryRoot, "proposal.json");
  const request = await withProjectLock(async () => {
    const { target: requestPath, value: savedRequest } = await readRewriteRequest(requestId);
    return refreshRewriteRequestAnchor(requestPath, savedRequest);
  });
  const provider = resolveProvider(request.provider);
  const activeModel = resolveModel(provider, request.model);
  const isDiscussion = request.responseMode === "discuss";
  // Link mode neither edits nor advises: it locates the other manuscript
  // positions the comment reaches and drops a linked comment at each one.
  const isLink = request.responseMode === "link";
  const contextMode = request.contextMode || "smart";
  const reasoningEffort = contextMode === "project"
    ? (config.codex?.projectReasoningEffort || "medium")
    : (config.codex?.reasoningEffort || "low");
  const timeoutMs = contextMode === "project"
    ? (Number(config.codex?.projectTimeoutMs) || 180000)
    : (Number(config.codex?.timeoutMs) || 90000);
  const relatedComments = await relatedCommentContext(request, contextMode);
  // A provider without repository access gets the material inlined instead of
  // being told to go and read it; all of it shares one character budget.
  const readsRepo = providerReadsRepo(provider);
  const budget = readsRepo ? null : createContextBudget();
  const taskDocument = await documentContextForTask(request, budget ? budget.total : undefined);
  if (budget) budget.spend(taskDocument?.source?.length || 0);
  const taskTerminology = await terminologyForTask(budget);
  const projectContext = budget
    ? await inlinedProjectContext({ budget, exclude: [request.path], includeManuscript: contextMode !== "local" })
    : null;
  const seesOtherFiles = contextMode !== "local"
    && (readsRepo || Boolean(projectContext?.files.some((file) => file.role === "manuscript")));
  const authoritativeChatDecision = request.chatDecision?.content
    ? request.chatDecision
    : request.origin?.type === "project-chat"
      ? (() => {
          const message = [...(Array.isArray(request.conversation) ? request.conversation : [])]
            .reverse()
            .find((item) => item.role === "assistant" && String(item.content || "").trim());
          return message
            ? { assistantMessageId: request.origin.assistantMessageId || null, content: message.content }
            : null;
        })()
      : null;
  const task = {
    version: 1,
    taskId: requestId,
    taskType: isLink
      ? "paper_linked_locations_with_repository_context"
      : isDiscussion ? "paper_discussion_with_repository_context" : "paper_rewrite_with_repository_context",
    responseMode: isLink ? "link" : isDiscussion ? "discuss" : "rewrite",
    rewriteScope: request.rewriteScope || "selection",
    contextMode,
    target: {
      path: request.path,
      blockId: request.blockId,
      blockIndex: request.blockIndex,
      endBlockId: request.endBlockId || request.blockId,
      endBlockIndex: Number.isInteger(request.endBlockIndex) ? request.endBlockIndex : request.blockIndex,
      spansMultipleBlocks: Number.isInteger(request.endBlockIndex) && request.endBlockIndex !== request.blockIndex,
      selectedText: request.selectedText,
      absoluteStart: request.absoluteStart,
      absoluteEnd: request.absoluteEnd,
      prefix: request.prefix,
      suffix: request.suffix,
      blockText: request.blockText,
    },
    // The whole source file the selection sits in. Without it the agent sees
    // only the paragraph plus a 120-character window, which is not enough to
    // resolve what a pronoun, a number, or "respectively" refers to earlier in
    // the section. target.absoluteStart/absoluteEnd index into this string.
    document: taskDocument,
    // Project vocabulary (agent.terminologyFiles), supplied in full rather than
    // merely pointed at: an agent told to "go and read the glossary" only does
    // so when it chooses to look. Null when the project configures none.
    terminology: taskTerminology,
    // Only for providers that cannot open files: guidance files and, outside
    // "local" context mode, the other manuscript files (within the budget).
    ...(projectContext ? { projectContext } : {}),
    instruction: request.comment,
    conversation: Array.isArray(request.conversation) && request.conversation.length
      ? request.conversation
      : [{ role: "user", content: request.comment, createdAt: request.createdAt }],
    proposalHistory: Array.isArray(request.proposalHistory) ? request.proposalHistory : [],
    discussionHistory: Array.isArray(request.discussionHistory) ? request.discussionHistory : [],
    currentDiscussion: request.discussion || null,
    authoritativeChatDecision,
    relatedComments,
    relatedCommentPolicy: "Use other active comments and their proposals to keep neighboring revisions coherent. They are context only: do not change text outside target.selectedText and do not assume an unaccepted proposal is already in the manuscript.",
    regeneration: request.regenerationRequestedAt
      ? {
          requestedAt: request.regenerationRequestedAt,
          count: Number(request.regenerationCount) || 1,
          instruction: isDiscussion
            ? "The user explicitly asked for a fresh analysis. Read discussionHistory and give a materially different, better-supported answer."
            : "The user explicitly retried because they did not want the most recent proposal. Read its complete replacementText and summary in proposalHistory, then generate a meaningfully different alternative instead of lightly paraphrasing it.",
        }
      : null,
    lockedRules: request.constraints,
    repository: {
      // The agent runs with the repository as its working directory; the
      // absolute path of this machine is never sent to the model.
      root: ".",
      readAllowed: readsRepo && contextMode !== "local",
      editAllowed: false,
      entryPoints: readsRepo ? codexEntryPoints(request.path) : [],
      guidance: !readsRepo
        ? "You cannot open files. Everything available is in this task: task.document, task.terminology and task.projectContext."
        : contextMode === "project"
          ? "Consult whatever in the repository is needed to answer the comment: other manuscript files and, where present, notes, data, code or analysis outputs. Use targeted search; do not scan unrelated large files."
          : "Start from the task itself. Read other files only when the comment cannot be answered reliably from the supplied text.",
    },
    outputContract: isLink
      ? {
          summary: "One sentence naming what the author asked for and how many other locations it reaches.",
          targets: `Every other location under ${config.sourceRoot} that the author's comment reaches, each with an exact unique selectedText anchor and the comment to place there. Return [] when the commented passage is the only affected location.`,
        }
      : isDiscussion
      ? {
          answer: "A direct, evidence-grounded answer to the author's question.",
          recommendation: "The preferred writing direction without editing the source.",
          claimRisk: "A concise assessment of claim scope and evidence risk.",
          options: "Two or three concrete wording options, each with a short label.",
        }
      : {
          replacementText: "Exact replacement for selectedText only; no surrounding prose. An empty string is allowed when the author explicitly asks for deletion or when the selected passage is redundant with immediately adjacent text and deletion is the clearest reader-first fix; explain that choice in the summary.",
          summary: "One concise sentence describing the change.",
          relatedChanges: `Zero to three synchronized changes in other .tex files under ${config.sourceRoot}. Each must provide an exact unique selectedText anchor. Return [] unless another manuscript location genuinely needs to change with the primary passage.`,
        },
  };
  const hasTerminology = Boolean(task.terminology);
  await writeCodexRunJson(requestId, "TASK.json", task);
  await writeCodexRunJson(requestId, "STATUS.json", {
    taskId: requestId,
    state: isLink ? "LINKING" : isDiscussion ? "DISCUSSING" : "DRAFTING",
    startedAt: new Date().toISOString(),
    provider,
    model: activeModel,
    reasoningEffort,
  });
  const linkPrompt = [
    "You are a focused academic manuscript auditor. Complete only the JSON task below.",
    "The author wrote one comment on target.selectedText. Your only job is to find every OTHER location in the manuscript that this comment reaches, so the author can review each one.",
    "Do not rewrite anything. Do not propose replacement text. Do not advise. Return locations and the comment to leave at each.",
    "Include a location when the author's instruction, if carried out, would leave it wrong, dangling, duplicated, or inconsistent. Typical cases: the body of a section the author wants removed or moved, sentences that cross-reference it, a caption or table note that repeats its claim, and a number stated in two places.",
    "Do not include the commented passage itself. Do not include a location merely because it is topically related; there must be something to do there.",
    `Each target.path must be an existing .tex file under ${config.sourceRoot}. Each selectedText must occur exactly once in that file, copied character for character from the source, including LaTeX markup. Anchor the smallest span that fully contains what must change; to flag a whole subsection, anchor its heading line.`,
    `Write each comment as a short instruction to the author in their own terms, naming what to do there and why it follows from their original comment.${hasTerminology ? " task.terminology holds the project's registered vocabulary; use it when you name a concept." : ""}`,
    "Several targets may live in the same file. Return [] when nothing else is affected; returning nothing is a valid and useful answer.",
    readsRepo
      ? "You may read the repository with targeted searches, beginning with repository.entryPoints. Do not edit or create files."
      : "You cannot open files. Search task.document and the manuscript files in task.projectContext.files, and report only locations whose text you can see there.",
    "Do not explain your reasoning outside the required JSON fields.",
    "Return only summary and targets in the required output schema.",
    JSON.stringify(task),
  ].join("\n");
  // Link mode has its own short prompt already; leave it alone.
  // Six lines carrying only what the run cannot work without: where the
  // replacement goes, how far the comment licenses going, what may not be
  // invented, and which vocabulary is binding. The long form below accumulated
  // by patching and ended up arguing with itself, which reads as timidity in
  // the output. Set codex.promptMode to "full" to send that one instead.
  const minimalPrompt = [
    isDiscussion
      ? "You are advising on one passage of an academic manuscript. Answer the author's question. Do not rewrite the manuscript."
      : "You are revising one passage of an academic manuscript.",
    "task.document is the whole source file. task.target.selectedText is the passage in question; your replacement takes its place, and nothing outside it may change.",
    isDiscussion
      ? "Give a clear judgment, name the claim or evidence risk, and offer two or three concrete wordings."
      : "Do what the comment asks, and check that you did it. First identify the selected passage's rhetorical job from the full paragraph and surrounding section. Rewrite it so the replacement works in that exact location: preserve the intended claim and necessary technical distinctions, remove repetition with adjacent sentences, and make the condition, action, or causal relation explicit. Prefer direct, concrete academic prose over generic transitions, inflated wording, or synonym swaps. Rewrite freely when the comment concerns the writing; fix only the named defect when it is narrow. If the selected passage is wholly redundant with adjacent text, deletion is allowed and must be explained in the summary. If the requested improvement requires changing text outside the selection, make only the best honest in-scope improvement and state the scope limitation in the summary rather than pretending the broader issue is solved.",
    "Keep numbers, citations, cross-references and LaTeX exactly as the source has them. Do not invent a result, a comparison, or a citation.",
    hasTerminology
      ? "task.terminology is binding. Elsewhere, name things the way task.document already names them rather than inventing a synonym."
      : "Name things the way task.document already names them rather than inventing a synonym.",
    "Resolve pronouns, numbers and names against task.document, not against the selected passage alone.",
    !readsRepo
      ? `You cannot open files; work only from this task.${seesOtherFiles ? " Other manuscript files are in task.projectContext.files." : " Return relatedChanges: []."}`
      : "",
    JSON.stringify(task),
  ].filter(Boolean);
  const useMinimalPrompt = String(config.codex?.promptMode || "minimal").toLowerCase() !== "full";
  const fullPrompt = isLink ? linkPrompt : [
    isDiscussion
      ? "You are a focused academic writing advisor. Complete only the JSON task below."
      : "You are a focused academic rewrite worker. Complete only the JSON task below.",
    isDiscussion
      ? "Answer the author's question before editing. Do not produce replacementText and do not modify the manuscript."
      : "Your replacement takes the place of target.selectedText and must satisfy the full conversation; the latest user message has highest priority.",
    isDiscussion
      ? "Give a clear judgment, identify claim or evidence risk, recommend a direction, and provide two or three usable wording options."
      : "When revising a previous proposal, improve it rather than merely repeating it.",
    !isDiscussion
      ? "If the edit instruction contains questions, treat them as diagnostic guidance: resolve them using the available evidence and express the best-supported answer through the proposed revision, not as conversational advice."
      : "Keep the discussion analytical until the author explicitly requests a proposal.",
    !isDiscussion
      ? "Match the revision to what the comment asks for. When the comment is about how the passage reads or what it should be saying, the sentences that are there have no claim on your answer. Throw them away and write the passage that does the job. You may change what it says: lead with a different point, argue it differently, shift the emphasis, drop something that is not earning its place, or state a point the passage was only implying. Use more sentences than the original or fewer, at greater length or less; the selected text marks where your replacement goes, not how long it may be, and nothing outside it may move. One thing is not yours to change: numbers, citations, cross-references and reported facts must stay faithful to the source. Do not invent a result, a number, a citation, or a comparison the work has not made, and do not restate an existing number as a different one. A reply that returns the original with its grammar tidied, or with a few words exchanged for synonyms, has not answered the comment. When the comment instead names one narrow defect, fix that and leave the rest alone."
      : "Do not draft replacement prose while discussing.",
    !isDiscussion
      ? "Before drafting, identify the selected passage's rhetorical job from the complete paragraph and surrounding section. The replacement must read naturally in place, not merely look better in isolation. Preserve the intended claim and every necessary technical distinction, but remove redundancy with adjacent sentences, expose the condition-action or cause-effect relation directly, and avoid generic transitions, inflated phrasing, and unnecessary jargon. After drafting, mentally insert the replacement between target.prefix and target.suffix and revise it once more for continuity, pronoun resolution, terminology, and repetition. If the selected passage is wholly redundant with immediately adjacent text, an empty replacement is allowed and the summary must explain why deletion is better. If the requested improvement requires edits outside the selected range, make only the best honest in-scope improvement and state that limitation in the summary instead of claiming the whole paragraph was fixed."
      : "Base the advice on the passage's rhetorical role, its surrounding paragraph, and the section-level argument.",
    !isDiscussion && Number.isInteger(request.endBlockIndex) && request.endBlockIndex !== request.blockIndex
      ? "This is a contiguous multi-block LaTeX selection. Return one complete, structurally valid replacement for the entire range. When the author asks to reduce or merge paragraphs, preserve the selected claims, equations, citations, references, and reported details; consolidate redundant paragraph headings and boundaries instead of truncating later blocks or flattening display environments into prose."
      : "This is a focused single-block selection.",
    hasTerminology
      ? "task.terminology holds the project's registered vocabulary. It is binding on every word you write, including headings, captions, and table text. Before returning anything, check your own output against it; a banned term in the replacement is a defect even when the author's comment did not mention wording, and even when the term already appears in the surrounding text. Do not rename LaTeX labels, file names, or code identifiers to satisfy it."
      : "No separate project vocabulary was supplied; the manuscript's own wording is the reference.",
    `The wording already in the manuscript is the manuscript's vocabulary. When you name a concept, a method, a variable, a group, a measure, or a source, reuse the exact phrase ${hasTerminology ? "task.document and task.terminology already use" : "task.document already uses"} for it. Do not substitute a synonym, and do not turn an established noun phrase into a new verb or gerund: if the manuscript says "the control condition", do not write "the baseline setup" or "controlling". Coin a term only when the author's comment explicitly asks for one.`,
    "task.document holds the complete source file the selection sits in. Read it before drafting. Resolve every pronoun, number, name, and word like \"respectively\" or \"the same\" against that full text, not against the selected paragraph alone; the antecedent is often in an earlier paragraph. Never guess an entity the selection does not name. Reading it does not widen what you may change.",
    relatedComments.length
      ? "Read task.relatedComments before drafting. Coordinate this sentence with the user's other active comments and proposals, especially same-paragraph items, so the planned revisions connect naturally. They are context only; output changes for target.selectedText and nothing else."
      : "There are no other active comments in this source file to coordinate with.",
    request.regenerationRequestedAt
      ? isDiscussion
        ? "The user clicked regenerate because they wanted a different analysis. Reconsider the discussion history and provide a materially different, better-supported answer."
        : "The user clicked regenerate because they did not want the most recent proposal. Its complete replacementText and summary are in proposalHistory. Produce a meaningfully different alternative, not a light paraphrase of that version."
      : isDiscussion
        ? "Resolve the uncertainty without silently choosing a scientific claim for the author."
        : "Produce the strongest revision the task supports.",
    !isDiscussion && authoritativeChatDecision
      ? "This request came from Project Chat. Treat task.authoritativeChatDecision as the writing decision the author explicitly chose. Operationalize its recommended structure, distinctions, terminology, and claim boundaries in the replacement; do not reduce it to a generic paraphrase of the original passage. If the chosen reply identifies a missing piece of context, transition, comparison, qualification, or caveat, add that element explicitly when it fits the selected scope. Internally check the draft against every applicable recommendation in the chosen reply before returning it. The replacement may be substantially longer than the selected text when that is necessary to implement the chosen decision, but it must remain within the selected source range."
      : "No separately chosen Project Chat decision applies to this task.",
    !isDiscussion && seesOtherFiles
      ? "If the requested writing decision makes another manuscript passage, appendix statement, figure caption, or table note inconsistent, include that exact cross-file edit in relatedChanges. Keep the primary replacement scoped to target.selectedText. Never include code, data, generated artifacts, bibliography files, or another change in the same source file. Include at most three related .tex files, using exact repository-relative paths and exact uniquely occurring selectedText anchors. Otherwise return relatedChanges: []."
      : !isDiscussion
        ? "Repository context is unavailable, so return relatedChanges: []."
        : "Do not create related changes while discussing.",
    isDiscussion
      ? "The selected passage is the object of discussion, not permission to edit it."
      : "Treat every character outside the selected passage as locked.",
    "Preserve LaTeX. Do not invent evidence, citations, results, or numbers; how the passage argues is yours to change, what it reports is not.",
    !isDiscussion
      ? "If the author explicitly requests deletion of the entire selected passage, replacementText may be an empty string; otherwise provide substantive replacement text."
      : "Do not propose deletion while discussing.",
    !readsRepo
      ? "You cannot open files or run commands. Everything available to you is in this task: task.document, task.terminology and, when present, task.projectContext. Treat anything not shown as unknown rather than guessing."
      : contextMode === "local"
        ? "Do not search the repository or run commands."
        : "You may read the repository with targeted searches when needed, beginning with repository.entryPoints. Do not edit or create files.",
    !readsRepo
      ? "Check what the comment asks about against the supplied text before drafting; report the result only through the replacement and summary."
      : contextMode === "project"
        ? "Verify what the comment asks about against the relevant sources in the repository (other manuscript files and, where present, notes, data, code or analysis outputs) before drafting; report the result only through the replacement and summary."
        : "Prefer a fast answer from the supplied task; inspect additional files only when necessary for correctness.",
    "Do not explain your reasoning outside the required JSON fields.",
    isDiscussion
      ? "Return only answer, recommendation, claimRisk, and options in the required output schema."
      : "Return only replacementText, summary, and relatedChanges (an empty array when nothing else must change) in the required output schema.",
    JSON.stringify(task),
  ].join("\n");
  const prompt = isLink || !useMinimalPrompt ? fullPrompt : minimalPrompt.join("\n");
  try {
    if (cancelledCodexRequests.has(requestId)) {
      const error = new Error("The agent run was cancelled because the comment was deleted.");
      error.code = "CODEX_CANCELLED";
      throw error;
    }
    // Inside the try so the temp directory and the run slot are released.
    assertProviderReady(provider);
    const invocation = await buildAgentInvocation({
      provider,
      config,
      prompt,
      schemaPath: isLink ? linkSchemaPath : isDiscussion ? discussionSchemaPath : proposalSchemaPath,
      outputPath,
      repoRoot,
      model: activeModel,
      reasoningEffort,
      timeoutMs,
    });
    const result = await spawnCaptured(invocation.command, invocation.args, {
      cwd: repoRoot,
      env: childEnvironment({ provider, config }),
      input: invocation.input,
      timeoutMs,
      label: `${providerLabel(provider)} ${isLink ? "link search" : isDiscussion ? "discussion" : "rewrite"}`,
      onChild: (child) => { activeCodexChild = child; },
    });
    activeCodexChild = null;
    await captureAgentOutput({ invocation, result, outputPath });
    await fs.writeFile(
      path.join(codexRunRoot(requestId), "TRACE.log"),
      redactSecrets(`${result.stdout || ""}${result.stderr ? `\n[stderr]\n${result.stderr}` : ""}`),
      "utf8",
    );
    if (cancelledCodexRequests.has(requestId)) {
      const error = new Error("The agent run was cancelled because the comment was deleted.");
      error.code = "CODEX_CANCELLED";
      throw error;
    }
    if (result.code !== 0) {
      throw new Error(agentFailureMessage(result, `${providerLabel(provider)} could not create a proposal.`, {
        timeoutSetting: contextMode === "project" ? "agent.projectTimeoutMs" : "agent.timeoutMs",
      }));
    }
    let proposal;
    try {
      proposal = JSON.parse(cleanJsonOutput(await fs.readFile(outputPath, "utf8")));
    } catch {
      throw new Error(`${providerLabel(provider)} did not return the expected JSON. Retry, or see TRACE.log in the run folder.`);
    }
    if (!proposal || typeof proposal !== "object") throw new Error(`${providerLabel(provider)} returned an empty answer.`);
    // Everything below reads and rewrites the request file (and may create
    // linked requests), so it runs under the project lock: a follow-up or a
    // delete arriving at the same moment cannot be overwritten.
    await withProjectLock(async () => {
      if (isDiscussion) {
        const answer = typeof proposal.answer === "string" ? proposal.answer.trim() : "";
        const recommendation = typeof proposal.recommendation === "string" ? proposal.recommendation.trim() : "";
        const claimRisk = typeof proposal.claimRisk === "string" ? proposal.claimRisk.trim() : "";
        const options = Array.isArray(proposal.options)
          ? proposal.options.filter((option) => option && typeof option.label === "string" && typeof option.wording === "string")
          : [];
        if (!answer || !recommendation || !claimRisk || options.length < 2) {
          throw new Error(`${providerLabel(provider)} returned an incomplete discussion response.`);
        }
        const { target: requestTarget, value: discussedRequest } = await readRewriteRequest(requestId);
        if (cancelledCodexRequests.has(requestId) || discussedRequest.status === "deleted") {
          const error = new Error("The agent discussion was cancelled because the comment was deleted.");
          error.code = "CODEX_CANCELLED";
          throw error;
        }
        discussedRequest.conversation = Array.isArray(discussedRequest.conversation) && discussedRequest.conversation.length
          ? discussedRequest.conversation
          : [{ role: "user", content: discussedRequest.comment, createdAt: discussedRequest.createdAt }];
        discussedRequest.discussion = { answer, recommendation, claimRisk, options, createdAt: new Date().toISOString() };
        discussedRequest.conversation.push({ role: "assistant", kind: "discussion", ...discussedRequest.discussion });
        discussedRequest.status = "discussed";
        delete discussedRequest.regenerationRequestedAt;
        await atomicWrite(requestTarget, `${JSON.stringify(discussedRequest, null, 2)}\n`);
        await writeCodexRunJson(requestId, "RESULT.json", discussedRequest.discussion);
        await writeCodexRunJson(requestId, "STATUS.json", {
          taskId: requestId,
          state: "DISCUSSED",
          finishedAt: new Date().toISOString(),
          provider,
          model: activeModel,
          reasoningEffort,
        });
        codexRunPayload(requestId, "complete");
        return;
      }
      if (isLink) {
        const summary = typeof proposal.summary === "string" ? proposal.summary.trim() : "";
        if (!summary) throw new Error(`${providerLabel(provider)} returned no summary of the linked locations.`);
        const { target: requestTarget, value: linkedRequest } = await readRewriteRequest(requestId);
        if (cancelledCodexRequests.has(requestId) || linkedRequest.status === "deleted") {
          const error = new Error("The agent link search was cancelled because the comment was deleted.");
          error.code = "CODEX_CANCELLED";
          throw error;
        }
        const resolved = await validateLinkedCommentTargets(proposal.targets, linkedRequest);
        const created = await createLinkedCommentRequests(linkedRequest, resolved.targets);
        linkedRequest.links = [...new Set([...(linkedRequest.links || []), ...created.map((item) => item.id)])];
        linkedRequest.linkSearch = {
          summary,
          createdAt: new Date().toISOString(),
          located: created,
          ...(resolved.warnings.length ? { warnings: resolved.warnings } : {}),
        };
        linkedRequest.conversation = Array.isArray(linkedRequest.conversation) && linkedRequest.conversation.length
          ? linkedRequest.conversation
          : [{ role: "user", content: linkedRequest.comment, createdAt: linkedRequest.createdAt }];
        linkedRequest.conversation.push({ role: "assistant", kind: "link", ...linkedRequest.linkSearch });
        linkedRequest.status = "discussed";
        delete linkedRequest.regenerationRequestedAt;
        await atomicWrite(requestTarget, `${JSON.stringify(linkedRequest, null, 2)}\n`);
        await writeCodexRunJson(requestId, "RESULT.json", linkedRequest.linkSearch);
        await writeCodexRunJson(requestId, "STATUS.json", {
          taskId: requestId,
          state: "LINKED",
          finishedAt: new Date().toISOString(),
          provider,
          model: activeModel,
          reasoningEffort,
        });
        codexRunPayload(requestId, "complete");
        return;
      }
      if (typeof proposal.replacementText !== "string") throw new Error(`${providerLabel(provider)} returned no replacement text.`);
      let replacementText = proposal.replacementText;
      const summary = typeof proposal.summary === "string" ? proposal.summary.trim() : "";
      if (!summary) throw new Error(`${providerLabel(provider)} returned no proposal summary.`);
      codexRunPayload(requestId, "validating");
      await attachGeneratedProposal(requestId, replacementText, summary);
      if (cancelledCodexRequests.has(requestId)) {
        const error = new Error("The agent run was cancelled because the comment was deleted.");
        error.code = "CODEX_CANCELLED";
        throw error;
      }
      const { target: requestTarget, value: proposedRequest } = await readRewriteRequest(requestId);
      if (cancelledCodexRequests.has(requestId) || proposedRequest.status === "deleted") {
        const error = new Error("The agent run was cancelled because the comment was deleted.");
        error.code = "CODEX_CANCELLED";
        throw error;
      }
      if (proposedRequest.pendingUnitRevision) {
        const pending = proposedRequest.pendingUnitRevision;
        const references = await cachedProjectReferences();
        const previousRequest = {
          ...proposedRequest,
          proposal: pending.previousProposal,
          proposalUnitReviews: pending.proposalUnitReviews,
        };
        const previousUnits = proposalReviewUnits(previousRequest, references);
        const generatedUnits = proposalReviewUnits(proposedRequest, references);
        const previousUnit = previousUnits.find((item) => item.id === pending.unitId);
        const generatedUnit = generatedUnits[pending.unitIndex];
        const compatible = Boolean(
          previousUnit &&
          generatedUnit &&
          previousUnits.length === generatedUnits.length &&
          generatedUnit.kind === pending.unitKind
        );
        if (!compatible) {
          proposedRequest.status = "proposed";
          proposedRequest.proposal = pending.previousProposal;
          proposedRequest.proposalUnitReviews = pending.proposalUnitReviews;
          delete proposedRequest.pendingUnitRevision;
          await atomicWrite(requestTarget, `${JSON.stringify(proposedRequest, null, 2)}\n`);
          throw new Error("The agent changed the grouped structure while revising one unit. The previous proposal was restored.");
        }
        const generatedReplacement = String(proposedRequest.proposal.replacementText || "");
        const generatedChunk = generatedReplacement.slice(generatedUnit.rawStart, generatedUnit.rawEnd);
        const previousReplacement = String(pending.previousProposal.replacementText || "");
        replacementText = `${previousReplacement.slice(0, previousUnit.rawStart)}${generatedChunk}${previousReplacement.slice(previousUnit.rawEnd)}`;
        proposedRequest.proposal.replacementText = replacementText;
        proposedRequest.proposalUnitReviews = pending.proposalUnitReviews;
        for (const key of Object.keys(proposedRequest.proposalUnitReviews)) {
          if (key === previousUnit.id || key.startsWith(`${previousUnit.id}_`)) {
            delete proposedRequest.proposalUnitReviews[key];
          }
        }
        delete proposedRequest.pendingUnitRevision;
        proposal.replacementText = replacementText;
      }
      const linked = await validateRelatedProposalChanges(proposal.relatedChanges, proposedRequest.path);
      if (linked.changes.length) {
        proposedRequest.proposal.linkedChanges = linked.changes;
        proposedRequest.proposal.primaryReviewStatus = "pending";
      } else {
        delete proposedRequest.proposal.linkedChanges;
        delete proposedRequest.proposal.primaryReviewStatus;
      }
      if (linked.warnings.length) proposedRequest.proposal.linkedWarnings = linked.warnings;
      else delete proposedRequest.proposal.linkedWarnings;
      proposedRequest.conversation = Array.isArray(proposedRequest.conversation) && proposedRequest.conversation.length
        ? proposedRequest.conversation
        : [{ role: "user", content: proposedRequest.comment, createdAt: proposedRequest.createdAt }];
      proposedRequest.conversation.push({
        role: "assistant",
        replacementText,
        summary,
        createdAt: new Date().toISOString(),
      });
      delete proposedRequest.regenerationRequestedAt;
      await atomicWrite(requestTarget, `${JSON.stringify(proposedRequest, null, 2)}\n`);
      await writeCodexRunJson(requestId, "RESULT.json", proposal);
      await writeCodexRunJson(requestId, "STATUS.json", {
        taskId: requestId,
        state: "PROPOSED",
        finishedAt: new Date().toISOString(),
        provider,
        model: activeModel,
        reasoningEffort,
      });
      codexRunPayload(requestId, "complete");
    });
  } finally {
    activeCodexChild = null;
    if (activeCodexRequestId === requestId) activeCodexRequestId = null;
    await fs.rm(temporaryRoot, { recursive: true, force: true });
  }
}

async function drainCodexQueue() {
  if (codexQueueRunning) return;
  codexQueueRunning = true;
  try {
    while (codexQueue.length) {
      const requestId = codexQueue.shift();
      try {
        await generateCodexProposal(requestId);
      } catch (error) {
        if (activeCodexRequestId === requestId) activeCodexRequestId = null;
        activeCodexChild = null;
        if (error?.code === "CODEX_CANCELLED" || cancelledCodexRequests.has(requestId)) {
          await writeCodexRunJson(requestId, "STATUS.json", {
            taskId: requestId,
            state: "CANCELLED",
            finishedAt: new Date().toISOString(),
          });
          codexRuns.delete(requestId);
          cancelledCodexRequests.delete(requestId);
          continue;
        }
        try {
          await withProjectLock(async () => {
            const { target, value: failedRequest } = await readRewriteRequest(requestId);
            if (!failedRequest.pendingUnitRevision) return;
            const pending = failedRequest.pendingUnitRevision;
            failedRequest.status = "proposed";
            failedRequest.proposal = pending.previousProposal;
            failedRequest.proposalUnitReviews = pending.proposalUnitReviews;
            delete failedRequest.pendingUnitRevision;
            await atomicWrite(target, `${JSON.stringify(failedRequest, null, 2)}\n`);
            emit("request", {
              id: failedRequest.id,
              path: failedRequest.path,
              status: "proposed",
              reason: "unit-followup-failed",
            });
          });
        } catch {
          // Preserve the original generation error if recovery itself fails.
        }
        const failure = publicErrorMessage(error instanceof Error ? error.message : String(error)).slice(-1200);
        await writeCodexRunJson(requestId, "STATUS.json", {
          taskId: requestId,
          state: "FAILED",
          finishedAt: new Date().toISOString(),
          error: failure,
        }).catch(() => {});
        codexRunPayload(requestId, "failed", { error: failure });
      }
    }
  } finally {
    codexQueueRunning = false;
  }
}

function assertAgentEnabled() {
  if (config.agent?.enabled === false) {
    throw new HttpError(409, "AI agents are disabled in this project's configuration (agent.enabled is false).");
  }
}

function queueCodexProposal(requestId) {
  assertAgentEnabled();
  if (codexQueue.includes(requestId) || ["queued", "running", "validating"].includes(codexRuns.get(requestId)?.status)) return;
  codexQueue.push(requestId);
  codexRunPayload(requestId, "queued");
  void drainCodexQueue();
}

function createEmptyChatSession() {
  const now = new Date().toISOString();
  return {
    version: 1,
    id: `chat_${Date.now()}_${randomBytes(3).toString("hex")}`,
    createdAt: now,
    updatedAt: now,
    status: "idle",
    // The provider's own default model is used when none is configured; the
    // model that actually answered is recorded on each assistant message.
    provider: defaultProvider,
    model: providerModel(defaultProvider, config, { chat: true }),
    reasoningEffort: config.codex?.chatReasoningEffort || "medium",
    messages: [],
  };
}

function chatArchivePath(sessionId) {
  if (!chatIdPattern.test(String(sessionId || ""))) throw new Error("Invalid chat session ID.");
  return path.join(chatArchiveRoot, `${sessionId}.json`);
}

async function ensureCurrentChatSessionId() {
  if (currentChatSessionId) return currentChatSessionId;
  try {
    const current = JSON.parse(await fs.readFile(chatSessionPath, "utf8"));
    if (chatIdPattern.test(String(current?.id || ""))) currentChatSessionId = current.id;
  } catch {
    // A first session will be created by readChatSession.
  }
  return currentChatSessionId;
}

async function writeChatSession(session, { makeCurrent = false, preserveUpdatedAt = false } = {}) {
  if (!chatIdPattern.test(String(session?.id || ""))) throw new Error("Invalid chat session ID.");
  if (!preserveUpdatedAt) session.updatedAt = new Date().toISOString();
  if (makeCurrent) currentChatSessionId = session.id;
  await ensureCurrentChatSessionId();
  const isCurrent = session.id === currentChatSessionId;
  const target = isCurrent ? chatSessionPath : chatArchivePath(session.id);
  await atomicWrite(target, `${JSON.stringify(session, null, 2)}\n`);
  emit("chat", { id: session.id, status: session.status, updatedAt: session.updatedAt, isCurrent });
  return session;
}

async function readChatSession({ id = null, create = true, normalize = true } = {}) {
  await ensureCurrentChatSessionId();
  let session;
  const requestedId = id ? String(id) : currentChatSessionId;
  try {
    const target = requestedId && requestedId !== currentChatSessionId
      ? chatArchivePath(requestedId)
      : chatSessionPath;
    session = JSON.parse(await fs.readFile(target, "utf8"));
  } catch {
    if (!create || id) return null;
    session = createEmptyChatSession();
    currentChatSessionId = session.id;
    await writeChatSession(session, { makeCurrent: true });
  }
  session.messages = Array.isArray(session.messages) ? session.messages : [];
  let changed = await hydrateChatSelectionLinks(session);
  const runIsMissing = !activeChatRuns.has(session.id) && !chatQueue.includes(session.id);
  if (normalize && ["queued", "running"].includes(session.status) && runIsMissing) {
    session.status = "interrupted";
    session.error = "The previous chat run was interrupted when the local server restarted. Your messages are preserved; send another message to continue.";
    changed = true;
  }
  if (changed) await writeChatSession(session);
  return session;
}

async function newChatSession() {
  const current = await readChatSession({ create: false, normalize: false });
  const next = createEmptyChatSession();
  currentChatSessionId = next.id;
  if (current?.id) {
    await atomicWrite(chatArchivePath(current.id), `${JSON.stringify(current, null, 2)}\n`);
  }
  return writeChatSession(next, { makeCurrent: true });
}

async function selectChatSession(body) {
  const sessionId = String(body.id || "");
  if (!chatIdPattern.test(sessionId)) throw new Error("Choose a valid chat session.");
  await ensureCurrentChatSessionId();
  if (sessionId === currentChatSessionId) return readChatSession({ id: sessionId });
  const selected = await readChatSession({ id: sessionId, create: false });
  if (!selected) throw new Error("This chat session no longer exists.");
  const current = await readChatSession({ create: false, normalize: false });
  currentChatSessionId = selected.id;
  if (current?.id) {
    await atomicWrite(chatArchivePath(current.id), `${JSON.stringify(current, null, 2)}\n`);
  }
  await writeChatSession(selected, { makeCurrent: true, preserveUpdatedAt: true });
  emit("chats", { currentId: selected.id, reason: "selected" });
  return selected;
}

function chatSessionTitle(session) {
  const userMessages = (session.messages || []).filter((message) => message.role === "user");
  if (!userMessages.length) return "New chat";
  const selectionQuestion = [...userMessages].reverse()
    .map((message) => String(message.content || "").match(/(?:^|\n)My question:\s*\n([\s\S]*?)(?:\n\n|$)/i)?.[1]?.trim())
    .find(Boolean);
  const shortQuestion = userMessages
    .map((message) => String(message.content || "").replace(/\s+/g, " ").trim())
    .find((content) => content.length > 3 && content.length <= 220 && !/^(?:continue|go on|继续)$/i.test(content));
  const candidate = selectionQuestion || shortQuestion || String(userMessages[0].content || "");
  const title = candidate.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return title.slice(0, 72) || "New chat";
}

async function listChatSessions() {
  await ensureCurrentChatSessionId();
  const byId = new Map();
  const readSummary = async (target, isCurrent = false) => {
    try {
      const session = JSON.parse(await fs.readFile(target, "utf8"));
      if (!chatIdPattern.test(String(session?.id || ""))) return;
      const runIsMissing = !activeChatRuns.has(session.id) && !chatQueue.includes(session.id);
      if (["queued", "running"].includes(session.status) && runIsMissing) {
        session.status = "interrupted";
        session.error = "The saved chat no longer has an active agent process. Your messages are preserved; send another message to continue.";
        session.updatedAt = new Date().toISOString();
        await atomicWrite(target, `${JSON.stringify(session, null, 2)}\n`);
      }
      const previous = byId.get(session.id);
      if (previous && !isCurrent && String(previous.updatedAt || "") >= String(session.updatedAt || "")) return;
      byId.set(session.id, {
        id: session.id,
        title: chatSessionTitle(session),
        status: session.status || "idle",
        createdAt: session.createdAt || null,
        updatedAt: session.updatedAt || session.createdAt || null,
        messageCount: Array.isArray(session.messages) ? session.messages.length : 0,
        isCurrent: isCurrent || session.id === currentChatSessionId,
      });
    } catch {
      // One malformed or concurrently replaced session should not break the list.
    }
  };
  await readSummary(chatSessionPath, true);
  const entries = await fs.readdir(chatArchiveRoot, { withFileTypes: true });
  await Promise.all(entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => readSummary(path.join(chatArchiveRoot, entry.name))));
  return [...byId.values()].sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
}

function boundedChatHistory(messages, maxCharacters = 100000) {
  const selected = [];
  let characters = 0;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    const size = String(message.content || "").length;
    if (selected.length && characters + size > maxCharacters) break;
    selected.unshift({ role: message.role, content: String(message.content || ""), activePath: message.activePath || null });
    characters += size;
  }
  return selected;
}

function sameChatSelection(left, right) {
  if (!left || !right) return false;
  return left.path === right.path &&
    Number(left.absoluteStart) === Number(right.absoluteStart) &&
    Number(left.absoluteEnd) === Number(right.absoluteEnd) &&
    String(left.selectedText || "") === String(right.selectedText || "");
}

async function activeStructurePrompt(context) {
  if (!context?.sectionIds?.length) return null;
  const structure = await paperStructure();
  const sections = context.sectionIds
    .map((id) => structure.sections.find((section) => section.id === id))
    .filter(Boolean);
  if (!sections.length) return null;
  return {
    snapshotHash: structure.snapshotHash,
    selectedSections: sections.map((section) => ({
      id: section.id,
      number: section.number,
      title: section.title,
      currentTree: section.nodes,
      sources: section.sources.map((source) => ({
        path: source.path,
        start: source.start,
        end: source.end,
        etag: source.etag,
        text: source.text,
      })),
    })),
    paperOutline: structure.sections
      .filter((section) => !section.appendix)
      .map((section) => ({ id: section.id, number: section.number, title: section.title })),
  };
}

function normalizeProposedStructureNode(value, depth = 0) {
  if (!value || typeof value !== "object" || depth > 6) return null;
  const title = String(value.title || value.role || "").trim();
  if (!title) return null;
  const allowedChanges = new Set(["keep", "move", "split", "merge", "new", "remove", "rewrite"]);
  return {
    id: String(value.id || `proposal_${randomBytes(4).toString("hex")}`),
    title: title.slice(0, 240),
    kind: new Set(["section", "subsection", "paragraph"]).has(value.kind) ? value.kind : "paragraph",
    change: allowedChanges.has(value.change) ? value.change : "rewrite",
    reason: String(value.reason || "").trim().slice(0, 800),
    sourceNodeIds: Array.isArray(value.sourceNodeIds) ? value.sourceNodeIds.map(String).slice(0, 12) : [],
    children: Array.isArray(value.children)
      ? value.children.map((child) => normalizeProposedStructureNode(child, depth + 1)).filter(Boolean).slice(0, 40)
      : [],
  };
}

function publicStructurePlan(plan) {
  if (!plan) return null;
  const { sourceSnapshots, reviewSnapshots, appliedEtags, ...visible } = plan;
  return {
    ...visible,
    sources: (sourceSnapshots || []).map(({ path: sourcePath, etag }) => ({ path: sourcePath, etag })),
  };
}

async function readStructurePlan({ publicOnly = false } = {}) {
  try {
    const plan = JSON.parse(await fs.readFile(structurePlanPath, "utf8"));
    return publicOnly ? publicStructurePlan(plan) : plan;
  } catch {
    return null;
  }
}

async function writeStructurePlan(plan) {
  await atomicWrite(structurePlanPath, `${JSON.stringify(plan, null, 2)}\n`);
  const visible = publicStructurePlan(plan);
  emit("structure-plan", visible);
  return visible;
}

function latestStructureProposal(session) {
  return [...(session?.messages || [])].reverse().find((message) => message.structureProposal)?.structureProposal || null;
}

function normalizedConfirmedProposal(value, structure) {
  if (!value || typeof value !== "object") throw new Error("No structure proposal is available to confirm.");
  const allowedIds = new Set(structure.sections.map((section) => section.id));
  const sections = (Array.isArray(value.sections) ? value.sections : [])
    .map((section) => ({
      sectionId: String(section.sectionId || ""),
      title: String(section.title || "").trim().slice(0, 240),
      reason: String(section.reason || "").trim().slice(0, 1200),
      nodes: (Array.isArray(section.nodes) ? section.nodes : [])
        .map((node) => normalizeProposedStructureNode(node))
        .filter(Boolean),
    }))
    .filter((section) => allowedIds.has(section.sectionId) && section.title && section.nodes.length);
  if (!sections.length) throw new Error("The proposed structure does not match the current paper sections.");
  return {
    summary: String(value.summary || "Confirmed paper restructuring plan").trim().slice(0, 1600),
    sections,
    basedOnSnapshot: String(value.basedOnSnapshot || ""),
    createdAt: value.createdAt || new Date().toISOString(),
  };
}

async function confirmStructurePlan(body = {}) {
  const structure = await paperStructure();
  const session = await readChatSession({ id: body.sessionId || null, create: false });
  const proposal = normalizedConfirmedProposal(body.proposal || latestStructureProposal(session), structure);
  const stale = Boolean(proposal.basedOnSnapshot && proposal.basedOnSnapshot !== structure.snapshotHash);
  if (stale && body.force !== true) {
    throw new Error("The paper changed after this structure was proposed. Review the current tree and generate or explicitly reconfirm the plan.");
  }
  const currentById = new Map(structure.sections.map((section) => [section.id, section]));
  const involvedPaths = [...new Set(proposal.sections.flatMap((section) =>
    (currentById.get(section.sectionId)?.sources || []).map((source) => source.path)
  ))];
  const reviewState = await readState();
  const sourceSnapshots = [];
  const reviewSnapshots = {};
  for (const sourcePath of involvedPaths) {
    const payload = await documentPayload(sourcePath);
    sourceSnapshots.push({ path: sourcePath, etag: payload.etag, source: payload.source });
    reviewSnapshots[sourcePath] = reviewStateSnapshot(reviewState, sourcePath);
  }
  const now = new Date().toISOString();
  const plan = {
    version: 1,
    id: `structure_${Date.now()}_${randomBytes(3).toString("hex")}`,
    status: "confirmed",
    createdAt: now,
    confirmedAt: now,
    chatSessionId: session?.id || null,
    basedOnSnapshot: structure.snapshotHash,
    proposal,
    staleAtConfirmation: stale,
    sourceSnapshots,
    reviewSnapshots,
    appliedEtags: {},
    sections: proposal.sections.map((section) => {
      const current = currentById.get(section.sectionId);
      return {
        sectionId: section.sectionId,
        number: current?.number || "",
        title: section.title,
        status: "pending",
        paths: [...new Set((current?.sources || []).map((source) => source.path))],
        sources: (current?.sources || []).map((source) => ({
          path: source.path,
          start: source.start,
          end: source.end,
        })),
        requestIds: [],
      };
    }),
  };
  return writeStructurePlan(plan);
}

async function markStructurePlanApplied(body = {}) {
  const plan = await readStructurePlan();
  if (!plan || plan.status === "reverted") throw new Error("There is no active structure plan to mark as applied.");
  const requested = new Set(Array.isArray(body.sectionIds) && body.sectionIds.length
    ? body.sectionIds.map(String)
    : plan.sections.map((section) => section.sectionId));
  for (const section of plan.sections) {
    if (requested.has(section.sectionId)) {
      section.status = "applied";
      section.appliedAt = new Date().toISOString();
    }
  }
  plan.appliedEtags ||= {};
  for (const snapshot of plan.sourceSnapshots || []) {
    const source = await fs.readFile(resolveDocument(snapshot.path), "utf8");
    plan.appliedEtags[snapshot.path] = sha(source);
  }
  plan.status = plan.sections.every((section) => section.status === "applied") ? "applied" : "applying";
  plan.updatedAt = new Date().toISOString();
  if (plan.status === "applied") plan.appliedAt = plan.updatedAt;
  return writeStructurePlan(plan);
}

async function revertStructurePlan() {
  const plan = await readStructurePlan();
  if (!plan || plan.status === "reverted") throw new Error("There is no active restructuring to revert.");
  const activeRequests = (await listRequests()).filter((request) =>
    ["pending", "discussed", "proposed"].includes(request.status) &&
    plan.sections.some((section) => section.requestIds?.includes(request.id))
  );
  if (activeRequests.length) throw new Error("Resolve or delete the active structure rewrite proposals before reverting the whole plan.");
  // A file that still holds its snapshot is left alone, so a read-only
  // (non-UTF-8) file the plan never changed does not block the revert.
  const unchanged = new Set();
  for (const snapshot of plan.sourceSnapshots || []) {
    const absolutePath = resolveDocument(snapshot.path);
    const current = await fs.readFile(absolutePath, "utf8");
    const expected = plan.appliedEtags?.[snapshot.path];
    if (expected && sha(current) !== expected) {
      throw new Error(`The source changed after restructuring: ${snapshot.path}. Revert was not applied.`);
    }
    if (current === snapshot.source) unchanged.add(snapshot.path);
  }
  await assertSourcesWritable((plan.sourceSnapshots || []).map((snapshot) => snapshot.path).filter((item) => !unchanged.has(item)));
  const reviewState = await readState();
  for (const snapshot of plan.sourceSnapshots || []) {
    if (!unchanged.has(snapshot.path)) await writeSource(snapshot.path, snapshot.source);
    restoreReviewStateSnapshot(reviewState, snapshot.path, plan.reviewSnapshots?.[snapshot.path]);
  }
  await writeState(reviewState);
  plan.status = "reverted";
  plan.revertedAt = new Date().toISOString();
  plan.updatedAt = plan.revertedAt;
  scheduleCompile();
  for (const snapshot of plan.sourceSnapshots || []) {
    emit("document", { path: snapshot.path, reason: "structure-reverted" });
    emit("state", { path: snapshot.path, reason: "structure-reverted" });
  }
  return writeStructurePlan(plan);
}

function extractStructureProposal(content, activeStructure) {
  const fence = /```structure-proposal\s*\n([\s\S]*?)\n```/i;
  const match = String(content || "").match(fence);
  if (!match) return { content: String(content || "").trim(), proposal: null };
  try {
    const parsed = JSON.parse(match[1]);
    const allowedIds = new Set(activeStructure?.sectionIds || []);
    const sections = (Array.isArray(parsed.sections) ? parsed.sections : [])
      .map((section) => ({
        sectionId: String(section.sectionId || ""),
        title: String(section.title || "").trim().slice(0, 240),
        reason: String(section.reason || "").trim().slice(0, 1200),
        nodes: (Array.isArray(section.nodes) ? section.nodes : [])
          .map((node) => normalizeProposedStructureNode(node))
          .filter(Boolean),
      }))
      .filter((section) => allowedIds.has(section.sectionId) && section.nodes.length);
    if (!sections.length) return { content: String(content || "").trim(), proposal: null };
    return {
      content: String(content || "").replace(fence, "").trim(),
      proposal: {
        summary: String(parsed.summary || "Proposed paper structure").trim().slice(0, 1600),
        sections,
        basedOnSnapshot: activeStructure?.snapshotHash || null,
        createdAt: new Date().toISOString(),
      },
    };
  } catch {
    return { content: String(content || "").trim(), proposal: null };
  }
}

function queueChatTurn(sessionId) {
  assertAgentEnabled();
  if (!chatIdPattern.test(String(sessionId || ""))) throw new Error("Invalid chat session ID.");
  if (activeChatRuns.has(sessionId) || chatQueue.includes(sessionId)) return;
  chatQueue.push(sessionId);
  void drainChatQueue();
}

function drainChatQueue() {
  if (chatQueueDraining) return;
  chatQueueDraining = true;
  try {
    while (chatQueue.length && activeChatRuns.size < maxConcurrentChatTurns) {
      const sessionId = chatQueue.shift();
      const run = { child: null, cancelled: false };
      activeChatRuns.set(sessionId, run);
      void runChatTurn(sessionId).finally(() => {
        if (activeChatRuns.get(sessionId) === run) activeChatRuns.delete(sessionId);
        drainChatQueue();
      });
    }
  } finally {
    chatQueueDraining = false;
  }
}

async function runChatTurn(sessionId) {
  const temporaryRoot = await fs.mkdtemp(path.join(tmpdir(), `${TEMP_PREFIX}chat-`));
  const outputPath = path.join(temporaryRoot, "answer.txt");
  const reasoningEffort = config.codex?.chatReasoningEffort || "medium";
  const timeoutMs = Number(config.codex?.chatTimeoutMs) || 300000;
  let provider = defaultProvider;
  let model = providerModel(provider, config, { chat: true });
  try {
    const run = activeChatRuns.get(sessionId);
    if (!run || run.cancelled) return;
    const session = await withProjectLock(async () => {
      const stored = await readChatSession({ id: sessionId, create: false, normalize: false });
      if (!stored || stored.id !== sessionId || stored.status === "stopped" || run.cancelled) return null;
      stored.status = "running";
      delete stored.error;
      await writeChatSession(stored);
      return stored;
    });
    if (!session || run.cancelled) return;
    provider = resolveProvider(session.provider);
    model = providerModel(provider, config, { chat: true });
    assertProviderReady(provider);
    const history = boundedChatHistory(session.messages);
    const latestPath = [...history].reverse().find((message) => message.activePath)?.activePath || config.defaultDocument;
    const structureScope = await activeStructurePrompt(session.activeStructure);
    const readsRepo = providerReadsRepo(provider);
    // No repository access: inline the visible document, the outline, the
    // guidance and terminology files and then as much of the rest of the
    // manuscript as the budget allows.
    let chatContext = null;
    if (!readsRepo) {
      const budget = createContextBudget();
      const terminology = await terminologyForTask(budget);
      const projectContext = await inlinedProjectContext({
        budget, activeDocument: latestPath, includeOutline: true, includeManuscript: true,
      });
      chatContext = { ...(projectContext || {}), ...(terminology ? { terminology } : {}) };
    }
    const prompt = [
      "You are the author's project chat inside a local manuscript-review app. The project is an academic manuscript written in LaTeX; it may belong to any field.",
      readsRepo
        ? "Understand the user's intent, inspect the repository when useful, and give a direct, evidence-grounded answer in the user's language."
        : "Understand the user's intent and give a direct, evidence-grounded answer in the user's language.",
      readsRepo
        ? "This chat is read-only. You may inspect the manuscript and anything else in the repository that helps (notes, data, code, analysis outputs, local guidance), but do not edit, create, delete, accept, or reject files or review proposals."
        : "This chat is read-only, and you cannot open files or run commands. The project material you can see is in the PROJECT CONTEXT JSON near the end of this prompt (files may be truncated; the truncation is marked). If the answer depends on something that is not shown, say so instead of guessing.",
      "If the user wants a change to the manuscript or to another file, reason through it fully and describe the recommended change. Actual manuscript edits are made through reviewable inline comments in the app.",
      "Distinguish observed evidence from interpretation. Do not invent citations, results, numbers, or facts.",
      readsRepo
        ? "Avoid generic advice: inspect relevant local sources before answering whenever the question depends on this project."
        : "Avoid generic advice: ground the answer in the supplied project material whenever the question depends on this project.",
      readsRepo
        ? "For a focused selected-passage question, begin with the selected text and its source section. Inspect only directly relevant files; do not scan large or unrelated files unless the question actually requires them."
        : "For a focused selected-passage question, begin with the selected text and its source section.",
      readsRepo ? "Repository root: . (your working directory)" : "",
      `Manuscript entry point: ${config.defaultDocument}`,
      `Document visible when the latest message was sent: ${latestPath}`,
      session.activeSelection
        ? `Active selected-passage anchor: ${JSON.stringify(session.activeSelection)}`
        : "No selected-passage anchor is active in this conversation.",
      structureScope
        ? `Active paper-structure scope follows. Treat its claims, evidence roles, terminology, citations, labels, equations, and numerical results as constraints rather than opportunities to invent or silently redefine them:\n${JSON.stringify(structureScope)}`
        : "No paper-structure scope is active in this conversation.",
      structureScope
        ? [
            "For this structure-scoped reply, first explain the structural diagnosis conversationally in the user's language.",
            "Then end the reply with exactly one fenced block labelled structure-proposal containing valid JSON and no commentary inside the fence.",
            "Schema: {\"summary\":\"...\",\"sections\":[{\"sectionId\":\"an id from selectedSections\",\"title\":\"...\",\"reason\":\"...\",\"nodes\":[{\"id\":\"stable proposal id\",\"title\":\"paragraph or subsection role\",\"kind\":\"section|subsection|paragraph\",\"change\":\"keep|move|split|merge|new|remove|rewrite\",\"reason\":\"...\",\"sourceNodeIds\":[\"current node ids when applicable\"],\"children\":[]}]}]}.",
            "The JSON is a reviewable proposed outline, not manuscript prose. Preserve decisions the author has left open as open and make any inferred rhetorical link explicit in the conversational diagnosis.",
          ].join("\n")
        : "Do not emit a structure-proposal block unless a paper-structure scope is active.",
      readsRepo ? `Useful entry points: ${codexEntryPoints(latestPath).join(", ") || latestPath}.` : "",
      chatContext ? `PROJECT CONTEXT JSON:\n${JSON.stringify(chatContext)}` : "",
      "Conversation JSON follows. The final item is the latest user message. Reply only with the conversational answer, not JSON and not a tool trace.",
      JSON.stringify(history),
    ].filter(Boolean).join("\n");
    const invocation = await buildAgentInvocation({
      provider,
      config,
      prompt,
      outputPath,
      repoRoot,
      model,
      reasoningEffort,
      timeoutMs,
    });
    if (run.cancelled) return;
    const result = await spawnCaptured(invocation.command, invocation.args, {
      cwd: repoRoot,
      env: childEnvironment({ provider, config }),
      input: invocation.input,
      timeoutMs,
      label: `${providerLabel(provider)} chat`,
      onChild: (child) => {
        const run = activeChatRuns.get(sessionId);
        if (!run || run.cancelled) {
          terminateChild(child);
          return;
        }
        run.child = child;
      },
    });
    await captureAgentOutput({ invocation, result, outputPath });
    const activeRun = activeChatRuns.get(sessionId);
    if (activeRun) activeRun.child = null;
    if (result.code !== 0) throw new Error(agentFailureMessage(result, `${providerLabel(provider)} chat could not answer.`, { timeoutSetting: "agent.chatTimeoutMs" }));
    const rawContent = (await fs.readFile(outputPath, "utf8")).trim();
    if (!rawContent) throw new Error(`${providerLabel(provider)} chat returned an empty answer.`);
    await withProjectLock(async () => {
      const current = await readChatSession({ id: sessionId, create: false, normalize: false });
      if (!current || current.id !== sessionId || current.status === "stopped") return;
      const structured = extractStructureProposal(rawContent, current.activeStructure);
      current.messages.push({
        id: `msg_${Date.now()}_${randomBytes(3).toString("hex")}`,
        role: "assistant",
        content: structured.content,
        createdAt: new Date().toISOString(),
        provider,
        model,
        reasoningEffort,
        ...(current.activeSelection?.messageId ? { selectionMessageId: current.activeSelection.messageId } : {}),
        ...(current.activeStructure?.messageId ? { structureMessageId: current.activeStructure.messageId } : {}),
        ...(structured.proposal ? { structureProposal: structured.proposal } : {}),
      });
      current.status = "idle";
      delete current.error;
      await writeChatSession(current);
    });
  } catch (error) {
    const activeRun = activeChatRuns.get(sessionId);
    if (activeRun) activeRun.child = null;
    await withProjectLock(async () => {
      const current = await readChatSession({ id: sessionId, create: false, normalize: false });
      if (current?.id === sessionId && current.status !== "stopped") {
        current.status = "failed";
        current.error = publicErrorMessage(error instanceof Error ? error.message : String(error)).slice(-1600);
        await writeChatSession(current);
      }
    }).catch(() => {});
  } finally {
    await fs.rm(temporaryRoot, { recursive: true, force: true });
  }
}

async function sendChatMessage(body) {
  const content = String(body.message || "").trim();
  if (!content) throw new Error("Write a message first.");
  let session = await readChatSession({ id: body.sessionId || null, create: !body.sessionId });
  if (!session) throw new Error("This chat session no longer exists.");
  if (["queued", "running"].includes(session.status) && body.newSessionIfBusy === true) {
    session = await newChatSession();
  } else if (["queued", "running"].includes(session.status)) {
    throw new Error(`${providerLabel(resolveProvider(body.provider))} is still answering in this chat. Open another chat to continue separately.`);
  }
  let activePath = null;
  if (body.activePath) {
    resolveDocument(body.activePath);
    activePath = body.activePath;
  }
  const message = {
    id: `msg_${Date.now()}_${randomBytes(3).toString("hex")}`,
    role: "user",
    content,
    activePath,
    createdAt: new Date().toISOString(),
  };
  const selectionContext = await normalizeChatSelectionContext(body.selectionContext, message);
  if (selectionContext && body.newSessionForNewSelection === true &&
      session.messages.length && !sameChatSelection(session.activeSelection, selectionContext)) {
    session = await newChatSession();
  }
  if (selectionContext) {
    message.selectionContext = selectionContext;
    session.activeSelection = selectionContext;
    delete session.activeStructure;
  }
  const structureContext = await normalizeChatStructureContext(body.structureContext, message);
  if (structureContext) {
    message.structureContext = structureContext;
    session.activeStructure = structureContext;
    delete session.activeSelection;
  }
  session.provider = resolveProvider(body.provider);
  session.messages.push(message);
  session.status = "queued";
  delete session.error;
  await writeChatSession(session);
  if (body.autoProcess !== false) queueChatTurn(session.id);
  return session;
}

async function stopChatTurn(body = {}) {
  const session = await readChatSession({ id: body.sessionId || null, create: !body.sessionId });
  if (!session) throw new Error("This chat session no longer exists.");
  const queuedIndex = chatQueue.indexOf(session.id);
  if (queuedIndex >= 0) {
    chatQueue.splice(queuedIndex, 1);
    session.status = "stopped";
    session.error = "Queued reply cancelled. Your conversation is preserved.";
    return writeChatSession(session);
  }
  const activeRun = activeChatRuns.get(session.id);
  if (!activeRun) {
    if (["queued", "running"].includes(session.status)) {
      session.status = "interrupted";
      session.error = "The chat run is no longer active. Send another message to continue.";
      return writeChatSession(session);
    }
    return session;
  }
  session.status = "stopped";
  session.error = "Generation stopped. Your conversation is preserved.";
  activeRun.cancelled = true;
  await writeChatSession(session);
  terminateChild(activeRun.child);
  return session;
}

function chatDiscussionForAssistant(session, assistantMessageId) {
  const assistantIndex = session.messages.findIndex((message) => message.id === assistantMessageId);
  const assistant = session.messages[assistantIndex];
  if (!assistant || assistant.role !== "assistant") throw new Error("Choose an assistant reply to turn into a proposal.");
  const selectionMessageId = assistant.selectionMessageId;
  const selectionIndex = session.messages.findIndex((message) => message.id === selectionMessageId);
  const selectionMessage = session.messages[selectionIndex];
  if (!selectionMessage?.selectionContext || selectionIndex < 0 || selectionIndex >= assistantIndex) {
    throw new Error("This reply is not linked to a selected passage. Select text and use Ask in Chat first.");
  }
  const conversation = session.messages.slice(selectionIndex, assistantIndex + 1).map((message) => ({
    role: message.role,
    content: String(message.content || ""),
    createdAt: message.createdAt || null,
  }));
  conversation.push({
    role: "user",
    content: "Create a reviewable proposal for the selected passage now. Apply the writing recommendation reached by this point in the discussion, return the exact replacement for the selection, and do not change surrounding text.",
    createdAt: new Date().toISOString(),
  });
  return { assistant, assistantIndex, selectionMessage, selectionMessageId, conversation };
}

async function activeProposalForSelection(session, selectionMessageId) {
  const linkedIds = session.messages
    .filter((message) => message.selectionMessageId === selectionMessageId && message.proposalRequestId)
    .map((message) => message.proposalRequestId)
    .reverse();
  for (const id of [...new Set(linkedIds)]) {
    try {
      const stored = await readRewriteRequest(id);
      if (["pending", "proposed", "discussed"].includes(stored.value.status)) return stored;
    } catch {
      // A deleted or manually removed proposal should not block a new one.
    }
  }
  return null;
}

async function createProposalFromChat(body) {
  const session = await readChatSession({ id: body.sessionId || null, create: !body.sessionId });
  if (!session) throw new Error("This chat session no longer exists.");
  if (["queued", "running"].includes(session.status)) throw new Error("Wait for this Chat reply before creating a proposal.");
  const discussion = chatDiscussionForAssistant(session, String(body.assistantMessageId || ""));
  const anchor = await normalizeChatSelectionContext(
    discussion.selectionMessage.selectionContext,
    discussion.selectionMessage,
    { requireEtag: false },
  );
  const payload = await documentPayload(anchor.path);
  const block = payload.blocks[anchor.blockIndex];
  const endBlock = payload.blocks[anchor.endBlockIndex];
  if (!block || !endBlock || block.id !== anchor.blockId || endBlock.id !== anchor.endBlockId ||
      payload.source.slice(anchor.absoluteStart, anchor.absoluteEnd) !== anchor.selectedText) {
    throw new Error("The selected passage changed during the discussion. Reselect it before creating a proposal.");
  }
  const comment = "Apply the writing decision reached in Project Chat to this selected passage. Use the discussion through the chosen assistant reply as the authority, preserve the surrounding text, and avoid unsupported claims.";
  const origin = {
    type: "project-chat",
    chatSessionId: session.id,
    selectionMessageId: discussion.selectionMessageId,
    assistantMessageId: discussion.assistant.id,
  };
  const chatDecision = {
    assistantMessageId: discussion.assistant.id,
    content: String(discussion.assistant.content || ""),
    chosenAt: new Date().toISOString(),
  };
  let stored = await activeProposalForSelection(session, discussion.selectionMessageId);
  let request;
  let created = false;
  if (stored && discussion.assistant.proposalRequestId === stored.value.id && stored.value.origin?.assistantMessageId === discussion.assistant.id) {
    request = stored.value;
  } else if (stored) {
    const runStatus = codexRuns.get(stored.value.id)?.status;
    if (["queued", "running", "validating"].includes(runStatus)) {
      throw new Error("The existing proposal for this passage is still being generated.");
    }
    request = stored.value;
    if (request.proposal) {
      request.proposalHistory = Array.isArray(request.proposalHistory) ? request.proposalHistory : [];
      request.proposalHistory.push({ ...request.proposal, supersededAt: new Date().toISOString() });
    }
    if (request.discussion) {
      request.discussionHistory = Array.isArray(request.discussionHistory) ? request.discussionHistory : [];
      request.discussionHistory.push({ ...request.discussion, continuedAt: new Date().toISOString() });
    }
    Object.assign(request, {
      status: "pending",
      path: anchor.path,
      documentEtag: payload.etag,
      blockId: block.id,
      blockIndex: block.index,
      endBlockId: endBlock.id,
      endBlockIndex: endBlock.index,
      rewriteScope: "selection",
      contextMode: "project",
      requestedResponseMode: "rewrite",
      responseMode: "rewrite",
      start: anchor.start,
      end: anchor.end,
      absoluteStart: anchor.absoluteStart,
      absoluteEnd: anchor.absoluteEnd,
      selectedText: anchor.selectedText,
      prefix: anchor.prefix,
      suffix: anchor.suffix,
      blockText: payload.source.slice(block.start, endBlock.end),
      comment,
      conversation: discussion.conversation,
      origin,
      chatDecision,
    });
    delete request.proposal;
    delete request.discussion;
    delete request.rejectedAt;
    request = await persistRewriteRequest(request, { autoProcess: body.autoProcess !== false });
  } else {
    request = buildRewriteRequest({
      payload,
      span: {
        startBlock: block,
        endBlock,
        start: anchor.start,
        end: anchor.end,
        absoluteStart: anchor.absoluteStart,
        absoluteEnd: anchor.absoluteEnd,
      },
      comment,
      rewriteScope: "selection",
      contextMode: "project",
      conversation: discussion.conversation,
      origin,
    });
    request.chatDecision = chatDecision;
    request = await persistRewriteRequest(request, { autoProcess: body.autoProcess !== false });
    created = true;
  }
  for (const message of session.messages) {
    if (message.selectionMessageId === discussion.selectionMessageId) delete message.proposalRequestId;
  }
  discussion.assistant.proposalRequestId = request.id;
  await writeChatSession(session);
  return { session, request, created };
}

async function processRewriteRequest(body) {
  const { target, value: request } = await readRewriteRequest(body.id);
  if (request.status !== "pending") throw new Error("Only pending comments can be sent to the agent.");
  const provider = resolveProvider(body.provider);
  if (provider !== request.provider) {
    request.provider = provider;
    await atomicWrite(target, `${JSON.stringify(request, null, 2)}\n`);
  }
  queueCodexProposal(request.id);
  return { ...request, agentStatus: codexRuns.get(request.id)?.status || "queued" };
}

async function restorePendingUnitRevision(body) {
  const { target, value: request } = await readRewriteRequest(body.id);
  const pending = request.pendingUnitRevision;
  if (!pending?.previousProposal) {
    throw new Error("This comment has no interrupted unit revision to restore.");
  }
  request.status = "proposed";
  request.proposal = pending.previousProposal;
  request.proposalUnitReviews = pending.proposalUnitReviews || {};
  delete request.pendingUnitRevision;
  await atomicWrite(target, `${JSON.stringify(request, null, 2)}\n`);
  emit("request", {
    id: request.id,
    path: request.path,
    status: "proposed",
    reason: "unit-revision-restored",
  });
  return request;
}

async function followupRewriteRequest(body) {
  const { target, value: request } = await readRewriteRequest(body.id);
  if (!["pending", "proposed", "discussed"].includes(request.status)) throw new Error("This comment thread is already resolved.");
  const message = String(body.message || "").trim();
  if (!message) throw new Error("Write a follow-up instruction first.");
  const unitId = String(body.unitId || "");
  let pendingUnitRevision = null;
  if (unitId) {
    if (request.status !== "proposed" || !request.proposal || request?.origin?.type !== "structure") {
      throw new Error("This proposal unit is no longer available for revision.");
    }
    if (request.pendingUnitRevision) {
      throw new Error("The agent is already revising a unit in this proposal.");
    }
    const units = proposalReviewUnits(request, await cachedProjectReferences());
    const unit = units.find((item) => item.id === unitId);
    if (!unit) throw new Error("This proposal unit changed. Refresh and select it again.");
    pendingUnitRevision = {
      unitId,
      unitIndex: unit.index,
      unitKind: unit.kind,
      previousProposal: structuredClone(request.proposal),
      proposalUnitReviews: structuredClone(request.proposalUnitReviews || {}),
    };
  }
  request.conversation = Array.isArray(request.conversation) && request.conversation.length
    ? request.conversation
    : [{ role: "user", content: request.comment, createdAt: request.createdAt }];
  request.conversation.push({ role: "user", content: message, createdAt: new Date().toISOString() });
  if (request.proposal) {
    request.proposalHistory = Array.isArray(request.proposalHistory) ? request.proposalHistory : [];
    request.proposalHistory.push({ ...request.proposal, supersededAt: new Date().toISOString() });
  }
  if (request.discussion) {
    request.discussionHistory = Array.isArray(request.discussionHistory) ? request.discussionHistory : [];
    request.discussionHistory.push({ ...request.discussion, continuedAt: new Date().toISOString() });
    delete request.discussion;
  }
  if (pendingUnitRevision) {
    // Keep the complete grouped proposal visible while the agent revises one unit.
    // The proposal is replaced only after the generated unit has been validated
    // and spliced back into the previous version.
    request.status = "proposed";
    request.pendingUnitRevision = pendingUnitRevision;
  } else {
    request.status = "pending";
    delete request.proposal;
    delete request.proposalUnitReviews;
  }
  await atomicWrite(target, `${JSON.stringify(request, null, 2)}\n`);
  emit("request", {
    id: request.id,
    path: request.path,
    status: request.status,
    reason: pendingUnitRevision ? "unit-followup" : "followup",
  });
  queueCodexProposal(request.id);
  return { ...request, agentStatus: codexRuns.get(request.id)?.status || "queued" };
}

async function regenerateRewriteRequest(body) {
  const { target, value: request } = await readRewriteRequest(body.id);
  if (request.status === "discussed" && request.discussion) {
    request.discussionHistory = Array.isArray(request.discussionHistory) ? request.discussionHistory : [];
    request.discussionHistory.push({ ...request.discussion, regeneratedAt: new Date().toISOString() });
    delete request.discussion;
  } else if (request.status === "proposed" && request.proposal) {
    request.proposalHistory = Array.isArray(request.proposalHistory) ? request.proposalHistory : [];
    request.proposalHistory.push({ ...request.proposal, regeneratedAt: new Date().toISOString() });
    delete request.proposal;
  } else {
    throw new Error("This comment has no agent response to regenerate.");
  }
  request.regenerationCount = (Number(request.regenerationCount) || 0) + 1;
  request.regenerationRequestedAt = new Date().toISOString();
  request.status = "pending";
  request.provider = resolveProvider(body.provider);
  request.model = resolveModel(request.provider, body.model);
  delete request.proposalUnitReviews;
  await atomicWrite(target, `${JSON.stringify(request, null, 2)}\n`);
  emit("request", { id: request.id, path: request.path, status: "pending", reason: "regenerate" });
  if (body.autoProcess !== false) queueCodexProposal(request.id);
  const agent = codexRuns.get(request.id);
  return agent ? { ...request, agentStatus: agent.status } : request;
}

async function generateProposalFromDiscussion(body) {
  const { target, value: request } = await readRewriteRequest(body.id);
  if (request.status !== "discussed" || !request.discussion) {
    throw new Error("Finish the discussion before generating a proposal.");
  }
  request.responseMode = "rewrite";
  request.proposalRequestedAt = new Date().toISOString();
  request.status = "pending";
  await atomicWrite(target, `${JSON.stringify(request, null, 2)}\n`);
  emit("request", { id: request.id, path: request.path, status: "pending", reason: "generate-proposal" });
  if (body.autoProcess !== false) queueCodexProposal(request.id);
  const agent = codexRuns.get(request.id);
  return agent ? { ...request, agentStatus: agent.status } : request;
}

async function deleteRewriteRequest(body) {
  const { target, value: request } = await readRewriteRequest(body.id);
  if (!["pending", "proposed", "discussed"].includes(request.status)) {
    throw new Error("Only an active comment can be deleted.");
  }
  const queuedIndex = codexQueue.indexOf(request.id);
  if (queuedIndex >= 0) codexQueue.splice(queuedIndex, 1);
  const runStatus = codexRuns.get(request.id)?.status;
  const active = activeCodexRequestId === request.id || ["running", "validating"].includes(runStatus);
  if (active) cancelledCodexRequests.add(request.id);
  if (activeCodexRequestId === request.id) terminateChild(activeCodexChild);
  request.status = "deleted";
  request.deletedAt = new Date().toISOString();
  request.deletedWhile = runStatus || (queuedIndex >= 0 ? "queued" : request.proposal ? "proposed" : request.discussion ? "discussed" : "pending");
  await atomicWrite(target, `${JSON.stringify(request, null, 2)}\n`);
  if (!active) {
    codexRuns.delete(request.id);
    cancelledCodexRequests.delete(request.id);
    await writeCodexRunJson(request.id, "STATUS.json", {
      taskId: request.id,
      state: "CANCELLED",
      finishedAt: request.deletedAt,
    });
  }
  emit("request", { id: request.id, path: request.path, status: "deleted", reason: "deleted" });
  await syncStructurePlanRequestState(request.id);
  return { id: request.id, path: request.path, status: "deleted", deletedAt: request.deletedAt };
}

async function gitStatus() {
  const result = await execFilePromise("git", ["status", "--short", "--untracked-files=normal"], { cwd: repoRoot, env: childEnvironment() });
  // A non-zero exit means "not a git repository" or "git is not installed":
  // neither is a dirty working tree.
  if (result.code !== 0) return { available: false, clean: true, count: 0, lines: [] };
  const lines = result.stdout.trim().split("\n").filter(Boolean);
  return { available: true, clean: lines.length === 0, count: lines.length, lines: lines.slice(0, 80) };
}

function scheduleCompile(delay = 900) {
  if (config.latex?.enabled === false) return;
  clearTimeout(compileTimer);
  compileTimer = setTimeout(() => { void compilePdf(); }, delay);
}

let compileDirty = false;

async function compilePdf() {
  if (config.latex?.enabled === false) {
    compileState = { ...compileState, status: "disabled", log: "PDF compilation is disabled in configuration." };
    return compileState;
  }
  if (compileState.status === "running") {
    // The source changed while a compile was in flight: compile once more when
    // it finishes, otherwise the PDF stays one edit behind.
    compileDirty = true;
    return compileState;
  }
  compileDirty = false;
  compileState = { ...compileState, status: "running", startedAt: new Date().toISOString(), log: "", exitCode: null };
  emit("compile", compileState);
  const cwd = path.resolve(repoRoot, config.latex.cwd);
  let log = "";
  let finished = false;
  const finish = (next) => {
    if (finished) return;
    finished = true;
    compileState = { ...compileState, finishedAt: new Date().toISOString(), ...next };
    emit("compile", compileState);
    if (compileDirty) scheduleCompile(200);
  };
  let child;
  try {
    const plan = spawnPlan(config.latex.command, config.latex.args);
    // LaTeX never needs this app's API keys.
    child = spawn(plan.command, plan.args, { cwd, env: childEnvironment(), shell: false, ...plan.options });
  } catch (error) {
    finish({ status: "failed", exitCode: -1, log: publicErrorMessage(error?.message || String(error)) });
    return compileState;
  }
  child.stdin?.end();
  child.stdout?.on("data", (chunk) => { log = `${log}${chunk}`.slice(-24000); });
  child.stderr?.on("data", (chunk) => { log = `${log}${chunk}`.slice(-24000); });
  // "error" (for example ENOENT) is followed by "close"; the first one wins so
  // the explanation is not overwritten by an empty log.
  child.on("error", (error) => {
    finish({
      status: "failed",
      exitCode: -1,
      log: error?.code === "ENOENT"
        ? `"${config.latex.command}" was not found. Install a TeX distribution that provides it (TeX Live, MacTeX or MiKTeX), set latex.command in the project configuration, or disable compilation with latex.enabled: false.`
        : publicErrorMessage(error?.message || String(error)),
    });
  });
  child.on("close", (code) => {
    finish({
      status: code === 0 ? "succeeded" : "failed",
      exitCode: code,
      log: code === 0 ? log : `${latexErrorSummary(log)}${log}`,
      pdfVersion: code === 0 ? Date.now() : compileState.pdfVersion,
    });
  });
  return compileState;
}

// A failed latexmk run ends in a page of boilerplate; the lines that say what is
// wrong ("! Undefined control sequence." and the "l.18 …" below it) are far
// above. Put them first so the author does not have to dig.
function latexErrorSummary(log) {
  const lines = String(log || "").split(/\r?\n/);
  const found = [];
  for (let index = 0; index < lines.length && found.length < 5; index += 1) {
    if (!/^! /.test(lines[index])) continue;
    const where = lines.slice(index + 1, index + 10).find((line) => /^l\.\d+ /.test(line));
    const entry = where ? `${lines[index]}\n    ${where.trim()}` : lines[index];
    if (!found.includes(entry)) found.push(entry);
  }
  return found.length ? `LaTeX errors:\n${found.join("\n")}\n\nFull compiler output:\n` : "";
}

function singleChangeSpan(baseText, changedText) {
  let start = 0;
  while (start < baseText.length && start < changedText.length && baseText[start] === changedText[start]) start += 1;
  let suffix = 0;
  while (
    suffix < baseText.length - start &&
    suffix < changedText.length - start &&
    baseText[baseText.length - 1 - suffix] === changedText[changedText.length - 1 - suffix]
  ) suffix += 1;
  return {
    start,
    end: baseText.length - suffix,
    replacement: changedText.slice(start, changedText.length - suffix),
  };
}

function mergeDisjointTextChanges(baseText, localText, diskText) {
  const local = singleChangeSpan(baseText, localText);
  const disk = singleChangeSpan(baseText, diskText);
  if (local.start === disk.start && local.end === disk.end && local.replacement === disk.replacement) return localText;
  const overlaps = (left, right) => {
    const leftInsertion = left.start === left.end;
    const rightInsertion = right.start === right.end;
    if (leftInsertion && rightInsertion) return left.start === right.start;
    if (leftInsertion) return left.start >= right.start && left.start <= right.end;
    if (rightInsertion) return right.start >= left.start && right.start <= left.end;
    return left.start < right.end && right.start < left.end;
  };
  if (overlaps(local, disk)) return null;
  let merged = baseText;
  for (const change of [local, disk].sort((left, right) => right.start - left.start)) {
    merged = `${merged.slice(0, change.start)}${change.replacement}${merged.slice(change.end)}`;
  }
  return merged;
}

async function mergeBlockText(baseText, localText, diskText) {
  if (localText === diskText) return { clean: true, text: localText };
  if (localText === baseText) return { clean: true, text: diskText };
  if (diskText === baseText) return { clean: true, text: localText };
  const disjointMerge = mergeDisjointTextChanges(baseText, localText, diskText);
  if (disjointMerge !== null) return { clean: true, text: disjointMerge };
  const mergeRoot = await fs.mkdtemp(path.join(tmpdir(), `${TEMP_PREFIX}merge-`));
  const localPath = path.join(mergeRoot, "local.txt");
  const basePath = path.join(mergeRoot, "base.txt");
  const diskPath = path.join(mergeRoot, "disk.txt");
  try {
    await Promise.all([
      fs.writeFile(localPath, localText, "utf8"),
      fs.writeFile(basePath, baseText, "utf8"),
      fs.writeFile(diskPath, diskText, "utf8"),
    ]);
    const result = await execFilePromise("git", ["merge-file", "--stdout", localPath, basePath, diskPath], { cwd: mergeRoot });
    if (result.code === 0) return { clean: true, text: result.stdout };
    if (Number(result.code) === 1) return { clean: false, text: result.stdout };
    throw new Error((result.stderr || "Automatic merge is unavailable.").trim());
  } finally {
    await fs.rm(mergeRoot, { recursive: true, force: true });
  }
}

function contiguousEdit(oldText, newText) {
  if (oldText === newText) return null;
  let start = 0;
  while (start < oldText.length && start < newText.length && oldText[start] === newText[start]) start += 1;
  let oldEnd = oldText.length;
  let newEnd = newText.length;
  while (oldEnd > start && newEnd > start && oldText[oldEnd - 1] === newText[newEnd - 1]) {
    oldEnd -= 1;
    newEnd -= 1;
  }
  return { oldStart: start, oldEnd, newStart: start, newEnd };
}

function blockContentHash(blockId) {
  const [, hash] = String(blockId || "").split("-");
  return hash || null;
}

// A block id is "<position>-<content hash>", so moving an untouched paragraph
// changes its id and used to drop every confirmation on it. Fall back to the
// content hash: identical text keeps its review state wherever it sits, while
// genuinely edited text still lapses, which is the behaviour we want.
function selectionAnchorsToBlock(selection, block) {
  if (selection.blockId === block.id) return true;
  if (!selection.blockId) return selection.blockIndex === block.index;
  const hash = blockContentHash(selection.blockId);
  return Boolean(hash) && hash === blockContentHash(block.id);
}

function selectionMatchesBlock(selection, relativePath, block) {
  return selection.path === relativePath && selectionAnchorsToBlock(selection, block);
}

function reviewSelection(relativePath, block, start, end, status, template = {}) {
  const now = new Date().toISOString();
  const prefix = status === "human" ? "human" : "accept";
  return {
    ...template,
    id: `${prefix}_${Date.now()}_${randomBytes(3).toString("hex")}`,
    path: relativePath,
    blockId: block.id,
    blockIndex: block.index,
    start,
    end,
    quote: block.raw.slice(start, end),
    prefix: block.raw.slice(Math.max(0, start - 48), start),
    suffix: block.raw.slice(end, Math.min(block.raw.length, end + 48)),
    status,
    ...(status === "human" ? { updatedAt: now } : { acceptedAt: now }),
  };
}

function rebaseReviewSelections(state, relativePath, oldBlock, newBlock, oldStart, oldEnd, newEnd) {
  const next = [];
  for (const selection of state.selections) {
    if (!["accepted", "human"].includes(selection.status) || !selectionMatchesBlock(selection, relativePath, oldBlock)) {
      next.push(selection);
      continue;
    }
    const pieces = [];
    const leftEnd = Math.min(selection.end, oldStart);
    if (leftEnd > selection.start) pieces.push({ start: selection.start, end: leftEnd });
    const rightStart = Math.max(selection.start, oldEnd);
    if (selection.end > rightStart) {
      pieces.push({
        start: newEnd + (rightStart - oldEnd),
        end: newEnd + (selection.end - oldEnd),
      });
    }
    for (const piece of pieces) {
      if (piece.end > piece.start) next.push(reviewSelection(relativePath, newBlock, piece.start, piece.end, selection.status, selection));
    }
  }
  state.selections = next;
}

function splitAbsoluteReviewRange(relativePath, blocks, absoluteStart, absoluteEnd, status, template = {}) {
  const ranges = [];
  for (const block of blocks) {
    const start = Math.max(absoluteStart, block.start);
    const end = Math.min(absoluteEnd, block.end);
    if (end <= start) continue;
    ranges.push(reviewSelection(relativePath, block, start - block.start, end - block.start, status, template));
  }
  return ranges;
}

function rebaseDocumentReviewSelections(state, relativePath, oldBlocks, newBlocks, absoluteStart, absoluteEnd, replacementEnd) {
  const next = [];
  for (const selection of state.selections) {
    if (selection.path !== relativePath || !["accepted", "human"].includes(selection.status)) {
      next.push(selection);
      continue;
    }
    const oldBlock = oldBlocks.find((block) => selectionMatchesBlock(selection, relativePath, block));
    if (!oldBlock) {
      next.push(selection);
      continue;
    }
    const selectionStart = oldBlock.start + selection.start;
    const selectionEnd = oldBlock.start + selection.end;
    if (selectionEnd <= absoluteStart) {
      next.push(...splitAbsoluteReviewRange(relativePath, newBlocks, selectionStart, selectionEnd, selection.status, selection));
      continue;
    }
    if (selectionStart >= absoluteEnd) {
      const delta = replacementEnd - absoluteEnd;
      next.push(...splitAbsoluteReviewRange(relativePath, newBlocks, selectionStart + delta, selectionEnd + delta, selection.status, selection));
      continue;
    }
    if (selectionStart < absoluteStart) {
      next.push(...splitAbsoluteReviewRange(relativePath, newBlocks, selectionStart, absoluteStart, selection.status, selection));
    }
    if (selectionEnd > absoluteEnd) {
      next.push(...splitAbsoluteReviewRange(
        relativePath,
        newBlocks,
        replacementEnd,
        replacementEnd + (selectionEnd - absoluteEnd),
        selection.status,
        selection,
      ));
    }
  }
  state.selections = next;
}

// Tracked changes: \chadd{...} (green addition) and \chdel{...} (red deletion)
// already present in the LaTeX source (for example written by a co-author or
// an external revision tool; the project must define both macros). Adjacent
// macros separated only by whitespace form one reviewable group.
function scanTrackedChangeGroups(raw) {
  const macros = [];
  const pattern = /\\ch(add|del)\s*\{/g;
  let match;
  while ((match = pattern.exec(raw))) {
    const open = match.index + match[0].length - 1;
    let depth = 0;
    let close = -1;
    for (let cursor = open; cursor < raw.length; cursor += 1) {
      if (raw[cursor] === "{" && raw[cursor - 1] !== "\\") depth += 1;
      if (raw[cursor] === "}" && raw[cursor - 1] !== "\\") {
        depth -= 1;
        if (depth === 0) { close = cursor; break; }
      }
    }
    if (close < 0) break;
    macros.push({ command: `ch${match[1]}`, start: match.index, end: close + 1, inner: raw.slice(open + 1, close) });
    pattern.lastIndex = close + 1;
  }
  const groups = [];
  for (const macro of macros) {
    const previous = groups.at(-1);
    if (previous && /^\s*$/.test(raw.slice(previous.end, macro.start))) {
      previous.macros.push(macro);
      previous.end = macro.end;
    } else {
      groups.push({ start: macro.start, end: macro.end, macros: [macro] });
    }
  }
  return groups;
}

async function resolveTrackedChange(body) {
  const absolutePath = resolveDocument(body.path);
  const currentSource = await fs.readFile(absolutePath, "utf8");
  const blocks = parseBlocks(currentSource);
  let block = blocks[body.blockIndex];
  if (!block || block.id !== body.blockId) block = blocks.find((candidate) => candidate.id === body.blockId);
  if (!block) throw new Error("The paragraph changed. Reload the document and try again.");
  const groups = scanTrackedChangeGroups(block.raw);
  const group = groups[Number(body.groupIndex)];
  if (!group) throw new Error("This tracked change no longer exists. Reload the document.");
  const accept = body.action === "accept";
  let resolved = "";
  let cursor = group.start;
  for (const macro of group.macros) {
    resolved += block.raw.slice(cursor, macro.start);
    resolved += (accept ? macro.command === "chadd" : macro.command === "chdel") ? macro.inner : "";
    cursor = macro.end;
  }
  const before = block.raw.slice(0, group.start);
  let after = block.raw.slice(group.end);
  if (/\s$/.test(before) && /^[ \t]/.test(resolved)) resolved = resolved.replace(/^[ \t]+/, "");
  if (/\s$/.test(resolved) && /^[ \t]/.test(after)) resolved = resolved.replace(/[ \t]+$/, "");
  if (!resolved && /\s$/.test(before) && /^[ \t]/.test(after)) after = after.replace(/^[ \t]+/, "");
  return saveBlock({
    path: body.path,
    etag: sha(currentSource),
    blockIndex: block.index,
    blockId: block.id,
    blockKind: block.kind,
    baseText: block.raw,
    text: `${before}${resolved}${after}`,
  });
}

async function saveBlock(body) {
  const absolutePath = resolveDocument(body.path);
  await assertSourcesWritable([body.path]);
  const currentSource = await fs.readFile(absolutePath, "utf8");
  const blocks = parseBlocks(currentSource);
  if (typeof body.text !== "string") throw new Error("Replacement text is required.");
  const fileChanged = sha(currentSource) !== body.etag;
  let block = blocks[body.blockIndex];
  let replacementText = body.text;
  let mergeApplied = false;
  if (fileChanged && !body.force) {
    const unchangedBlock = typeof body.baseText === "string"
      ? blocks.find((candidate) => candidate.raw === body.baseText)
      : null;
    if (unchangedBlock) block = unchangedBlock;
    else {
      if (!block || (body.blockKind && block.kind !== body.blockKind)) {
        throw new Error("The document structure changed at this location. Use the disk version and edit it again.");
      }
      const merged = await mergeBlockText(String(body.baseText || ""), body.text, block.raw);
      if (!merged.clean) {
        throw new Error("The paragraph changed in overlapping text. Automatic merge could not safely combine both versions; choose which version to keep.");
      }
      replacementText = merged.text;
      mergeApplied = true;
    }
  }
  if (!block) throw new Error("The paragraph no longer exists. Use the disk version and edit it again.");
  if (!body.force && !mergeApplied && block.id !== body.blockId && block.raw !== body.baseText) {
    throw new Error("The paragraph changed while you were editing. Choose which version to keep.");
  }
  if (body.force && body.blockKind && block.kind !== body.blockKind) {
    throw new Error("The document structure changed at this location. Use the disk version and edit it again.");
  }
  const savedBlockIndex = block.index;
  const savedBlock = block;
  const nextSource = `${currentSource.slice(0, block.start)}${replacementText}${currentSource.slice(block.end)}`;
  assertNoNestedHeadingCommands(nextSource);
  await writeSource(body.path, nextSource);

  const state = await readState();
  const beforeReview = reviewStateSnapshot(state, body.path);
  state.paragraphs[body.path] ||= {};
  const nextBlocks = parseBlocks(nextSource);
  const nextBlock = nextBlocks[Math.min(savedBlockIndex, nextBlocks.length - 1)];
  if (nextBlock) {
    const edit = contiguousEdit(savedBlock.raw, replacementText);
    if (edit) {
      rebaseReviewSelections(state, body.path, savedBlock, nextBlock, edit.oldStart, edit.oldEnd, edit.newEnd);
      if (edit.newEnd > edit.newStart) {
        state.selections.push(reviewSelection(body.path, nextBlock, edit.newStart, edit.newEnd, "human"));
      }
    }
    delete state.paragraphs[body.path][savedBlock.id];
    delete state.paragraphs[body.path][nextBlock.id];
  }
  const afterReview = reviewStateSnapshot(state, body.path);
  await writeState(state);
  if (currentSource !== nextSource || !sameSnapshot(beforeReview, afterReview)) {
    await pushUndoAction({
      kind: "edit",
      label: `Edit P${savedBlockIndex + 1} in ${path.basename(body.path)}`,
      path: body.path,
      beforeSource: currentSource,
      afterSource: nextSource,
      afterEtag: sha(nextSource),
      beforeReview,
      afterReview,
    });
  }
  scheduleCompile();
  emit("document", { path: body.path, reason: "saved" });
  return { ...await documentPayload(body.path), merge: { applied: mergeApplied } };
}

function validatedSelectionSegments(payload, body, errorMessage) {
  const supplied = Array.isArray(body.segments) && body.segments.length
    ? body.segments
    : [{ blockIndex: body.blockIndex, blockId: body.blockId, start: body.start, end: body.end }];
  const segments = supplied.map((item) => {
    const blockIndex = Number(item.blockIndex);
    const block = payload.blocks[blockIndex];
    const start = Number(item.start);
    const end = Number(item.end);
    if (!block || block.id !== item.blockId || !Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start || end > block.raw.length) {
      throw new Error(errorMessage);
    }
    return { block, start, end };
  });
  for (let index = 1; index < segments.length; index += 1) {
    if (segments[index - 1].block.index >= segments[index].block.index) throw new Error(errorMessage);
  }
  return segments;
}

function acceptedRangesByBlock(state, relativePath, segments) {
  return Object.fromEntries(segments.map(({ block }) => [
    block.index,
    state.selections
      .filter((item) => item.path === relativePath && item.status === "accepted" && selectionMatchesBlock(item, relativePath, block))
      .map((item) => ({ id: item.id, start: item.start, end: item.end, quote: item.quote })),
  ]));
}

async function confirmSelection(body) {
  const payload = await documentPayload(body.path);
  if (payload.etag !== body.etag) throw new Error("The file changed. Reload before confirming text.");
  const segments = validatedSelectionSegments(payload, body, "The selected passage changed.");
  const state = await readState();
  const beforeReview = reviewStateSnapshot(state, body.path);
  const acceptedSelections = [];
  for (const { block, start, end } of segments) {
    const quote = block.raw.slice(start, end);
    let selection = state.selections.find((item) =>
      item.path === body.path && item.status === "accepted" && selectionMatchesBlock(item, body.path, block) &&
      item.start === start && item.end === end && item.quote === quote
    );
    if (!selection) {
      selection = reviewSelection(body.path, block, start, end, "accepted");
      state.selections.push(selection);
    }
    acceptedSelections.push(selection);
  }
  const afterReview = reviewStateSnapshot(state, body.path);
  await writeState(state);
  if (!sameSnapshot(beforeReview, afterReview)) {
    const first = segments[0].block.index + 1;
    const last = segments.at(-1).block.index + 1;
    await pushUndoAction({
      kind: "confirm",
      label: `Confirm ${first === last ? `P${first}` : `P${first}–P${last}`} in ${path.basename(body.path)}`,
      path: body.path,
      afterEtag: payload.etag,
      beforeReview,
      afterReview,
    });
  }
  emit("state", { path: body.path, reason: "confirmed" });
  return {
    ...acceptedSelections[0],
    selections: acceptedSelections,
    acceptedRangesByBlock: acceptedRangesByBlock(state, body.path, segments),
  };
}

async function unconfirmSelection(body) {
  const payload = await documentPayload(body.path);
  if (payload.etag !== body.etag) throw new Error("The file changed. Reload before changing confirmation.");
  const segments = validatedSelectionSegments(payload, body, "Select confirmed text before removing confirmation.");
  const state = await readState();
  const beforeReview = reviewStateSnapshot(state, body.path);
  const nextSelections = [];
  const removedIds = [];
  let splitCounter = 0;
  for (const selection of state.selections) {
    const segment = segments.find(({ block }) => selectionMatchesBlock(selection, body.path, block));
    const sameBlock = selection.path === body.path && selection.status === "accepted" && segment;
    const overlaps = sameBlock && selection.end > segment.start && selection.start < segment.end;
    if (!overlaps) {
      nextSelections.push(selection);
      continue;
    }
    removedIds.push(selection.id);
    const { block, start, end } = segment;
    const pieces = [
      { start: selection.start, end: Math.min(selection.end, start) },
      { start: Math.max(selection.start, end), end: selection.end },
    ].filter((piece) => piece.end > piece.start);
    for (const piece of pieces) {
      splitCounter += 1;
      nextSelections.push({
        ...selection,
        id: `accept_${Date.now()}_${splitCounter}_${randomBytes(2).toString("hex")}`,
        start: piece.start,
        end: piece.end,
        quote: block.raw.slice(piece.start, piece.end),
        prefix: block.raw.slice(Math.max(0, piece.start - 48), piece.start),
        suffix: block.raw.slice(piece.end, Math.min(block.raw.length, piece.end + 48)),
        acceptedAt: new Date().toISOString(),
      });
    }
  }
  if (!removedIds.length) throw new Error("The selected text is not explicitly confirmed.");
  state.selections = nextSelections;
  const afterReview = reviewStateSnapshot(state, body.path);
  await writeState(state);
  const first = segments[0].block.index + 1;
  const last = segments.at(-1).block.index + 1;
  await pushUndoAction({
    kind: "unconfirm",
    label: `Unconfirm ${first === last ? `P${first}` : `P${first}–P${last}`} in ${path.basename(body.path)}`,
    path: body.path,
    afterEtag: payload.etag,
    beforeReview,
    afterReview,
  });
  const acceptedRangesByBlockValue = acceptedRangesByBlock(state, body.path, segments);
  const acceptedRanges = acceptedRangesByBlockValue[segments[0].block.index] || [];
  emit("state", { path: body.path, reason: "unconfirmed" });
  return { removedIds, acceptedRanges, acceptedRangesByBlock: acceptedRangesByBlockValue };
}

function rewriteSpan(payload, body, rewriteScope = "selection") {
  const suppliedSegments = validatedSelectionSegments(payload, body, "The selected passage changed.");
  const first = suppliedSegments[0];
  const last = suppliedSegments.at(-1);
  if (rewriteScope === "paragraph" && suppliedSegments.length === 1) {
    return {
      startBlock: first.block,
      endBlock: first.block,
      start: 0,
      end: first.block.raw.length,
      absoluteStart: first.block.start,
      absoluteEnd: first.block.end,
    };
  }
  const spansMultipleBlocks = suppliedSegments.length > 1;
  const structuralKinds = new Set(["heading", "paragraph-heading"]);
  const start = spansMultipleBlocks && structuralKinds.has(first.block.kind) ? 0 : first.start;
  const end = spansMultipleBlocks && structuralKinds.has(last.block.kind) ? last.block.raw.length : last.end;
  return {
    startBlock: first.block,
    endBlock: last.block,
    start,
    end,
    absoluteStart: first.block.start + start,
    absoluteEnd: last.block.start + end,
  };
}

function requestsCaptionRewrite(comment) {
  return /(?:\bcaption\b|图注|表注|figure\s+title|table\s+title)/iu.test(String(comment || ""));
}

async function captionRewriteRedirect(payload, selection, comment) {
  if (!requestsCaptionRewrite(comment) || selection?.origin?.type === "caption-selection") return null;
  const blockIndex = Number(selection?.blockIndex);
  const block = payload.blocks.find((candidate) =>
    candidate.id === selection?.blockId || (Number.isInteger(blockIndex) && candidate.index === blockIndex)
  );
  if (!block?.semantic?.captionSource) return null;
  const start = Number(selection?.start);
  const end = Number(selection?.end);
  const selectsWholeArtifact = Number.isFinite(start) && Number.isFinite(end) && start <= 0 && end >= block.raw.length;
  if (!selectsWholeArtifact) return null;
  const source = block.semantic.captionSource;
  const targetPayload = source.path === payload.path ? payload : await documentPayload(source.path);
  if (source.etag && targetPayload.etag !== source.etag) {
    throw new Error("The caption source changed. Reload before commenting.");
  }
  const targetBlock = targetPayload.blocks.find((candidate) =>
    candidate.id === source.blockId || candidate.index === source.blockIndex
  );
  if (!targetBlock) throw new Error("The caption source moved. Reload before commenting.");
  const captionStart = Number(source.start);
  const captionEnd = Number(source.end);
  if (!Number.isInteger(captionStart) || !Number.isInteger(captionEnd) || captionEnd <= captionStart ||
      targetBlock.raw.slice(captionStart, captionEnd) !== source.raw) {
    throw new Error("The caption source changed. Reload before commenting.");
  }
  return {
    payload: targetPayload,
    span: {
      startBlock: targetBlock,
      endBlock: targetBlock,
      start: captionStart,
      end: captionEnd,
      absoluteStart: targetBlock.start + captionStart,
      absoluteEnd: targetBlock.start + captionEnd,
    },
    origin: {
      type: "caption-selection",
      hostPath: payload.path,
      hostBlockIndex: block.index,
      hostBlockId: block.id,
    },
  };
}

function buildRewriteRequest({ payload, span, comment, rewriteScope = "selection", contextMode = "smart", conversation = null, origin = null }) {
  // A proposal for a file that is never written could not be accepted.
  if (payload.readOnly) throw new HttpError(409, notUtf8Message(payload.path));
  const now = new Date().toISOString();
  const id = `rw_${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}_${randomBytes(3).toString("hex")}`;
  return {
    version: 1,
    id,
    status: "pending",
    createdAt: now,
    path: payload.path,
    documentEtag: payload.etag,
    blockId: span.startBlock.id,
    blockIndex: span.startBlock.index,
    endBlockId: span.endBlock.id,
    endBlockIndex: span.endBlock.index,
    rewriteScope,
    contextMode,
    requestedResponseMode: "rewrite",
    responseMode: "rewrite",
    start: span.start,
    end: span.end,
    absoluteStart: span.absoluteStart,
    absoluteEnd: span.absoluteEnd,
    selectedText: payload.source.slice(span.absoluteStart, span.absoluteEnd),
    prefix: payload.source.slice(Math.max(0, span.absoluteStart - 120), span.absoluteStart),
    suffix: payload.source.slice(span.absoluteEnd, Math.min(payload.source.length, span.absoluteEnd + 120)),
    blockText: payload.source.slice(span.startBlock.start, span.endBlock.end),
    comment,
    conversation: Array.isArray(conversation) && conversation.length
      ? conversation
      : [{ role: "user", content: comment, createdAt: now }],
    ...(origin ? { origin } : {}),
    constraints: [
      "Modify only the selected passage unless the comment explicitly requires adjacent text.",
      "Preserve LaTeX commands, citations, labels, equations, and accepted surrounding text.",
      "Do not invent evidence, results, citations, or numerical values."
    ]
  };
}

async function persistRewriteRequest(request, { autoProcess = true } = {}) {
  await atomicWrite(path.join(requestsRoot, `${request.id}.json`), `${JSON.stringify(request, null, 2)}\n`);
  emit("request", { id: request.id, path: request.path, status: "pending" });
  if (autoProcess && config.agent?.enabled !== false && config.codex?.autoProcessComments !== false) queueCodexProposal(request.id);
  const agent = codexRuns.get(request.id);
  return agent ? { ...request, agentStatus: agent.status } : request;
}

async function createRewriteRequest(body) {
  const payload = await documentPayload(body.path);
  if (payload.etag !== body.etag) throw new Error("The file changed. Reload before commenting.");
  const multiBlock = Array.isArray(body.segments) && body.segments.length > 1;
  const rewriteScope = body.rewriteScope === "paragraph" && !multiBlock ? "paragraph" : "selection";
  const contextMode = new Set(["local", "smart", "project"]).has(body.contextMode) ? body.contextMode : "smart";
  const responseMode = new Set(["discuss", "link"]).has(body.responseMode) ? body.responseMode : "rewrite";
  const comment = String(body.comment || "").trim();
  if (!comment) throw new Error("Write a rewrite instruction first.");
  const captionRedirect = await captionRewriteRedirect(payload, body, comment);
  if (captionRedirect) {
    const request = buildRewriteRequest({
      payload: captionRedirect.payload,
      span: captionRedirect.span,
      comment,
      rewriteScope: "selection",
      contextMode,
      origin: captionRedirect.origin,
    });
    request.requestedResponseMode = responseMode;
    request.responseMode = responseMode;
    request.provider = resolveProvider(body.provider);
    request.model = resolveModel(request.provider, body.model);
    return persistRewriteRequest(request, { autoProcess: body.autoProcess !== false });
  }
  const span = rewriteSpan(payload, body, rewriteScope);
  if (span.absoluteEnd <= span.absoluteStart) throw new Error("Select the text that should be rewritten.");
  const origin = body.origin?.type === "caption-selection" && body.origin.hostPath
    ? {
        type: "caption-selection",
        hostPath: String(body.origin.hostPath),
        hostBlockIndex: Number(body.origin.hostBlockIndex),
        hostBlockId: body.origin.hostBlockId ? String(body.origin.hostBlockId) : null,
      }
    : null;
  const request = buildRewriteRequest({ payload, span, comment, rewriteScope, contextMode, origin });
  request.requestedResponseMode = responseMode;
  request.responseMode = responseMode;
  request.provider = resolveProvider(body.provider);
  request.model = resolveModel(request.provider, body.model);
  return persistRewriteRequest(request, { autoProcess: body.autoProcess !== false });
}

async function createStructureSectionRequests(body = {}) {
  const plan = await readStructurePlan();
  if (!plan || !["confirmed", "applying"].includes(plan.status)) {
    throw new Error("Confirm a structure plan before generating section rewrites.");
  }
  const section = plan.sections.find((item) => item.sectionId === String(body.sectionId || ""));
  const proposed = plan.proposal?.sections?.find((item) => item.sectionId === section?.sectionId);
  if (!section || !proposed) throw new Error("This section is not part of the confirmed structure plan.");
  const existingRequests = await listRequests();
  const active = existingRequests.filter((request) =>
    section.requestIds?.includes(request.id) && ["pending", "discussed", "proposed"].includes(request.status)
  );
  if (active.length) throw new Error("This section already has an active reviewable rewrite.");

  const plannedRanges = (section.sources || []).filter((source) =>
    Number.isInteger(source.start) && Number.isInteger(source.end) && source.end > source.start
  );
  const substantiveRanges = plannedRanges.filter((source) => source.end - source.start >= 80);
  const sourceRanges = substantiveRanges.length
    ? substantiveRanges
    : plannedRanges.length
      ? plannedRanges
      : (section.paths || []).map((sourcePath) => ({ path: sourcePath, start: 0, end: null }));
  const prepared = [];
  for (const sourceRange of sourceRanges) {
    const sourcePath = sourceRange.path;
    const payload = await documentPayload(sourcePath);
    const blocks = parseBlocks(payload.source);
    if (!blocks.length) continue;
    const absoluteStart = Math.max(0, Number(sourceRange.start) || 0);
    const absoluteEnd = sourceRange.end == null
      ? payload.source.length
      : Math.min(payload.source.length, Number(sourceRange.end));
    const span = selectionSpanFromAbsoluteRange(blocks, absoluteStart, absoluteEnd);
    if (!span) throw new Error(`The planned source range is no longer valid in ${sourcePath}. Regenerate the structure proposal.`);
    const comment = [
      "Implement this approved paper-structure section as a reviewable source-range proposal.",
      `Confirmed plan: ${plan.proposal.summary}`,
      `Target logical section: ${section.number} ${proposed.title}`,
      `Target tree: ${JSON.stringify(proposed)}`,
      `This source range is one part of the section: ${sourcePath} [${absoluteStart}, ${absoluteEnd})`,
      "Preserve every supported claim, numerical result, citation, equation, label, and figure/table include, and keep each piece of evidence in the role it plays in the argument. Move or rewrite prose only as required by the approved tree. Treat text outside this exact range as locked. If another source range carries part of this logical section, keep the boundary coherent and do not duplicate it. Do not introduce claims or decisions the author has not made.",
    ].join("\n\n");
    const request = buildRewriteRequest({
      payload,
      span,
      comment,
      rewriteScope: "selection",
      contextMode: "project",
      origin: { type: "structure", planId: plan.id, sectionId: section.sectionId },
    });
    prepared.push(request);
  }
  const created = [];
  for (const request of prepared) {
    created.push(await persistRewriteRequest(request, { autoProcess: body.autoProcess !== false }));
  }
  if (!created.length) throw new Error("No source files were found for this section.");
  section.requestIds = [...new Set([...(section.requestIds || []), ...created.map((request) => request.id)])];
  section.status = "reviewing";
  section.updatedAt = new Date().toISOString();
  plan.status = "applying";
  plan.updatedAt = section.updatedAt;
  await writeStructurePlan(plan);
  return { plan: publicStructurePlan(plan), requests: created };
}

async function syncStructurePlanRequestState(requestId) {
  const plan = await readStructurePlan();
  if (!plan || plan.status === "reverted") return;
  const section = plan.sections.find((item) => item.requestIds?.includes(requestId));
  if (!section) return;
  const requests = await Promise.all(section.requestIds.map(async (id) => {
    try {
      return (await readRewriteRequest(id)).value;
    } catch {
      return null;
    }
  }));
  const present = requests.filter(Boolean);
  if (present.length && present.every((request) => request.status === "resolved")) {
    section.status = "applied";
    section.appliedAt = new Date().toISOString();
  } else if (present.some((request) => ["pending", "discussed", "proposed"].includes(request.status))) {
    section.status = "reviewing";
  } else section.status = "pending";
  plan.appliedEtags ||= {};
  for (const sourcePath of section.paths) {
    const source = await fs.readFile(resolveDocument(sourcePath), "utf8");
    plan.appliedEtags[sourcePath] = sha(source);
  }
  plan.status = plan.sections.every((item) => item.status === "applied") ? "applied" : "applying";
  plan.updatedAt = new Date().toISOString();
  if (plan.status === "applied") plan.appliedAt = plan.updatedAt;
  await writeStructurePlan(plan);
}

function resolveRequestPath(requestId) {
  if (!requestIdPattern.test(String(requestId || ""))) throw new Error("Invalid rewrite request ID.");
  return path.join(requestsRoot, `${requestId}.json`);
}

async function readRewriteRequest(requestId) {
  const target = resolveRequestPath(requestId);
  const value = JSON.parse(await fs.readFile(target, "utf8"));
  return { target, value };
}

function proposalReviewUnits(request, referenceContext = { labels: {}, citations: {} }) {
  if (request?.origin?.type !== "structure" || !request?.proposal) return [];
  const replacement = String(request.proposal.replacementText || "");
  const macros = documentMacros(replacement, referenceContext);
  const units = [];
  for (const block of parseBlocks(replacement)) {
    let rendered = latexToDisplay(block.raw, block.kind, macros, referenceContext);
    if (block.kind === "math") {
      const environment = block.raw.trim().match(/^\\begin\{([^}]+)\}([\s\S]*?)\\end\{\1\}$/);
      const latex = environment
        ? environment[2].replace(/\\label\{[^}]+\}/g, "").trim()
        : block.raw.trim().replace(/^\\\[/, "").replace(/\\\]$/, "").trim();
      const displayLatex = environment && /^(?:align|alignat|gather|multline)/.test(environment[1])
        ? `\\begin{aligned}${latex}\\end{aligned}`
        : latex;
      rendered = {
        display: displayLatex,
        displayStarts: Array(displayLatex.length).fill(0),
        displayEnds: Array(displayLatex.length).fill(block.raw.length),
        annotations: [{
          type: "math",
          latex: displayLatex,
          display: true,
          start: 0,
          end: displayLatex.length,
        }],
        hidden: false,
      };
    }
    const display = String(rendered.display || "").trim();
    if (!display || rendered.hidden) continue;
    if (["math", "table", "figure"].includes(block.kind) && units.length) {
      const previous = units.at(-1);
      const offset = previous.display.length + 2;
      previous.display = `${previous.display}\n\n${display}`;
      previous.annotations.push(...(rendered.annotations || []).map((annotation) => ({
        ...annotation,
        start: annotation.start + offset,
        end: annotation.end + offset,
      })));
      previous.sourceKey += block.raw;
      previous.rawEnd = block.end;
      previous.editable = false;
      continue;
    }
    const command = block.raw.trim().match(HEADING_COMMAND_PATTERN)?.[1]?.toLowerCase();
    units.push({
      index: block.index,
      kind: block.kind,
      level: { section: 1, subsection: 2, subsubsection: 3, paragraph: 4, subparagraph: 5 }[command] || null,
      display,
      annotations: rendered.annotations || [],
      sourceKey: block.raw,
      sourceIndex: block.index,
      rawStart: block.start,
      rawEnd: block.end,
      raw: block.raw,
      displayStarts: rendered.displayStarts,
      displayEnds: rendered.displayEnds,
      editable: ["heading", "paragraph-heading", "paragraph"].includes(block.kind),
    });
  }
  return units.map((unit, index) => {
    const id = `unit_${unit.sourceIndex}`;
    const legacyId = Object.keys(request.proposalUnitReviews || {})
      .find((key) => key.startsWith(`unit_${unit.sourceIndex}_`));
    const review = request.proposalUnitReviews?.[id] || (legacyId ? request.proposalUnitReviews?.[legacyId] : null);
    return {
      id,
      index,
      kind: unit.kind,
      level: unit.level,
      display: unit.display,
      annotations: unit.annotations,
      rawStart: unit.rawStart,
      rawEnd: unit.rawEnd,
      raw: unit.raw,
      displayStarts: unit.displayStarts,
      displayEnds: unit.displayEnds,
      editable: unit.editable,
      status: review?.status === "confirmed" ? "confirmed" : "pending",
      reviewKind: review?.reviewKind || null,
      reviewedAt: review?.reviewedAt || null,
    };
  });
}

async function reviewProposalUnit(body) {
  const { target, value: request } = await readRewriteRequest(body.id);
  if (request.status !== "proposed" || !request.proposal || request?.origin?.type !== "structure") {
    throw new Error("This structure proposal is no longer waiting for review.");
  }
  if (request.pendingUnitRevision) {
    throw new Error("Wait for the current unit revision before changing review states.");
  }
  const units = proposalReviewUnits(request, await cachedProjectReferences());
  const unit = units.find((item) => item.id === body.unitId);
  if (!unit) throw new Error("This proposal unit no longer exists. Refresh the review page.");
  request.proposalUnitReviews ||= {};
  for (const key of Object.keys(request.proposalUnitReviews)) {
    if (key === unit.id || key.startsWith(`${unit.id}_`)) delete request.proposalUnitReviews[key];
  }
  if (body.status === "confirmed") {
    request.proposalUnitReviews[unit.id] = {
      status: "confirmed",
      reviewedAt: new Date().toISOString(),
    };
  } else if (body.status === "pending") {
    // Removing both current and legacy unit keys above reopens this unit.
  } else {
    throw new Error("Choose confirmed or pending for this proposal unit.");
  }
  await atomicWrite(target, `${JSON.stringify(request, null, 2)}\n`);
  emit("request", { id: request.id, path: request.path, status: request.status, reason: "proposal-unit-review" });
  return {
    id: request.id,
    unitId: unit.id,
    status: request.proposalUnitReviews[unit.id]?.status || "pending",
  };
}

function hasLinkedChangeSet(request) {
  return request?.status === "proposed"
    && request?.proposal
    && Array.isArray(request.proposal.linkedChanges)
    && request.proposal.linkedChanges.length > 0;
}

async function reviewLinkedChange(body) {
  const { target, value: request } = await readRewriteRequest(body.id);
  if (!hasLinkedChangeSet(request)) throw new Error("This comment has no linked change set waiting for review.");
  const status = String(body.status || "");
  if (!["pending", "confirmed", "rejected"].includes(status)) {
    throw new Error("Choose pending, confirmed, or rejected for this linked change.");
  }
  if (body.changeId === "primary") {
    if (status === "rejected") throw new Error("Discard the whole change set instead of skipping its primary passage.");
    request.proposal.primaryReviewStatus = status;
  } else {
    const change = request.proposal.linkedChanges.find((item) => item.id === body.changeId);
    if (!change) throw new Error("This linked proposal no longer exists.");
    if (status === "rejected" && change.required) {
      throw new Error("This change is required for consistency. Revise or discard the whole change set instead of skipping it.");
    }
    change.status = status;
    change.reviewedAt = status === "pending" ? null : new Date().toISOString();
  }
  await atomicWrite(target, `${JSON.stringify(request, null, 2)}\n`);
  emit("request", { id: request.id, path: request.path, status: request.status, reason: "linked-change-review" });
  return request;
}

async function confirmAllLinkedChanges(body) {
  const { target, value: request } = await readRewriteRequest(body.id);
  if (!hasLinkedChangeSet(request)) throw new Error("This comment has no linked change set waiting for review.");
  request.proposal.primaryReviewStatus = "confirmed";
  for (const change of request.proposal.linkedChanges) {
    change.status = "confirmed";
    change.reviewedAt = new Date().toISOString();
  }
  await atomicWrite(target, `${JSON.stringify(request, null, 2)}\n`);
  emit("request", { id: request.id, path: request.path, status: request.status, reason: "linked-change-review-all" });
  return request;
}

function prepareSourceReplacement({ path: relativePath, sourceEtag, absoluteStart, absoluteEnd, selectedText, replacementText }) {
  return fs.readFile(resolveDocument(relativePath), "utf8").then((source) => {
    const sourceBlocks = parseBlocks(source);
    let start = Number(absoluteStart);
    let end = Number(absoluteEnd);
    if (sha(source) !== sourceEtag ||
        !Number.isInteger(start) || !Number.isInteger(end) ||
        source.slice(start, end) !== selectedText) {
      const { match, matchCount } = findSelectionAnchor(source, sourceBlocks, {
        path: relativePath,
        selectedText,
        absoluteStart: start,
        absoluteEnd: end,
      });
      if (!match) {
        throw new Error(`${path.basename(relativePath)} changed and could not be merged safely (${matchCount} matching passages).`);
      }
      start = match.absoluteStart;
      end = match.absoluteEnd;
    }
    const sourceMatch = selectionMatchFromAbsolute(sourceBlocks, start, end)
      || selectionSpanFromAbsoluteRange(sourceBlocks, start, end);
    if (!sourceMatch) throw new Error(`${path.basename(relativePath)} no longer contains a reviewable target range.`);
    const replacement = String(replacementText ?? "");
    const nextSource = `${source.slice(0, start)}${replacement}${source.slice(end)}`;
    assertNoNestedHeadingCommands(nextSource);
    return {
      path: relativePath,
      source,
      sourceBlocks,
      start,
      end,
      replacement,
      nextSource,
    };
  });
}

function updateReviewStateForReplacement(reviewState, prepared) {
  const beforeReview = reviewStateSnapshot(reviewState, prepared.path);
  reviewState.paragraphs[prepared.path] ||= {};
  const nextBlocks = parseBlocks(prepared.nextSource);
  const replacementEnd = prepared.start + prepared.replacement.length;
  rebaseDocumentReviewSelections(
    reviewState,
    prepared.path,
    prepared.sourceBlocks,
    nextBlocks,
    prepared.start,
    prepared.end,
    replacementEnd,
  );
  if (prepared.replacement.length) {
    reviewState.selections.push(...splitAbsoluteReviewRange(
      prepared.path,
      nextBlocks,
      prepared.start,
      replacementEnd,
      "accepted",
    ));
  }
  for (const block of prepared.sourceBlocks.filter((block) => block.end > prepared.start && block.start < prepared.end)) {
    delete reviewState.paragraphs[prepared.path][block.id];
  }
  for (const block of nextBlocks.filter((block) => block.end > prepared.start && block.start < replacementEnd)) {
    delete reviewState.paragraphs[prepared.path][block.id];
  }
  return {
    beforeReview,
    afterReview: reviewStateSnapshot(reviewState, prepared.path),
  };
}

async function applyLinkedChangeSet(body) {
  const { target, value: request } = await readRewriteRequest(body.id);
  if (!hasLinkedChangeSet(request)) throw new Error("This comment has no linked change set waiting for application.");
  const primaryStatus = request.proposal.primaryReviewStatus || "pending";
  const pending = request.proposal.linkedChanges.filter((change) => (change.status || "pending") === "pending");
  if (primaryStatus !== "confirmed" || pending.length) {
    throw new Error("Confirm the primary passage and decide every linked change before applying this set.");
  }
  const rejectedRequired = request.proposal.linkedChanges.filter((change) => change.required && change.status !== "confirmed");
  if (rejectedRequired.length) throw new Error("A required linked change is not confirmed.");

  const selected = [{
    path: request.path,
    sourceEtag: request.proposal.sourceEtag,
    absoluteStart: request.proposal.absoluteStart,
    absoluteEnd: request.proposal.absoluteEnd,
    selectedText: request.proposal.originalText,
    replacementText: request.proposal.replacementText,
    summary: request.proposal.summary,
  }, ...request.proposal.linkedChanges.filter((change) => change.status === "confirmed")];
  // All or nothing: one target that cannot be written refuses the whole set.
  await assertSourcesWritable(selected.map((change) => change.path));
  const prepared = await Promise.all(selected.map(prepareSourceReplacement));
  const beforeRequest = structuredClone(request);
  const reviewState = await readState();
  const beforeState = structuredClone(reviewState);
  const files = prepared.map((change) => {
    const snapshots = updateReviewStateForReplacement(reviewState, change);
    return {
      path: change.path,
      beforeSource: change.source,
      afterSource: change.nextSource,
      afterEtag: sha(change.nextSource),
      ...snapshots,
    };
  });

  request.status = "resolved";
  request.acceptedAt = new Date().toISOString();
  request.resolutionSummary = `Applied linked change set across ${files.length} file${files.length === 1 ? "" : "s"}`;
  request.resolutionEtags = Object.fromEntries(files.map((file) => [file.path, file.afterEtag]));
  const written = [];
  try {
    for (const file of files) {
      await writeSource(file.path, file.afterSource);
      written.push(file);
    }
    await writeState(reviewState);
    await atomicWrite(target, `${JSON.stringify(request, null, 2)}\n`);
  } catch (error) {
    for (const file of [...written].reverse()) {
      await writeSource(file.path, file.beforeSource).catch(() => {});
    }
    await writeState(beforeState).catch(() => {});
    throw error;
  }

  await pushUndoAction({
    kind: "linked-change-set",
    label: `Apply linked writing changes across ${files.length} file${files.length === 1 ? "" : "s"}`,
    path: request.path,
    files,
    requestId: request.id,
    beforeRequest,
    afterRequest: structuredClone(request),
  });
  scheduleCompile();
  for (const file of files) {
    emit("document", { path: file.path, reason: "linked-change-set-applied" });
    emit("state", { path: file.path, reason: "linked-change-set-applied" });
  }
  emit("request", { id: request.id, path: request.path, status: "resolved" });
  return request;
}

async function editProposalUnit(body) {
  const { target, value: request } = await readRewriteRequest(body.id);
  if (request.status !== "proposed" || !request.proposal || request?.origin?.type !== "structure") {
    throw new Error("This structure proposal is no longer waiting for review.");
  }
  if (request.pendingUnitRevision) {
    throw new Error("Wait for the current unit revision before editing another proposal unit.");
  }
  const references = await cachedProjectReferences();
  const units = proposalReviewUnits(request, references);
  const unit = units.find((item) => item.id === body.unitId);
  if (!unit) throw new Error("This proposal unit no longer exists. Refresh the review page.");
  if (!unit.editable) throw new Error("This unit contains a formula, figure, or table. Revise it through the comment so its LaTeX structure stays intact.");
  if (String(body.baseText || "") !== unit.raw) {
    throw new Error("This proposal unit changed while you were editing. Refresh and try again.");
  }
  const nextRaw = String(body.text ?? "");
  const parsed = parseBlocks(nextRaw).filter((block) => {
    const rendered = latexToDisplay(block.raw, block.kind, documentMacros(nextRaw, references), references);
    return !rendered.hidden && String(rendered.display || "").trim();
  });
  if (parsed.length !== 1 || parsed[0].kind !== unit.kind) {
    throw new Error("Keep this edit within the current paragraph or heading. Use the structure proposal to add or remove blocks.");
  }
  const replacement = String(request.proposal.replacementText || "");
  if (replacement.slice(unit.rawStart, unit.rawEnd) !== unit.raw) {
    throw new Error("This proposal unit could not be merged safely. Refresh and try again.");
  }
  request.proposal.replacementText = `${replacement.slice(0, unit.rawStart)}${nextRaw}${replacement.slice(unit.rawEnd)}`;
  request.proposal.replacementDisplay = latexToDisplay(request.proposal.replacementText, "paragraph").display;
  request.proposalUnitReviews ||= {};
  for (const key of Object.keys(request.proposalUnitReviews)) {
    if (key === unit.id || key.startsWith(`${unit.id}_`)) delete request.proposalUnitReviews[key];
  }
  request.proposalUnitReviews[unit.id] = {
    status: "confirmed",
    reviewKind: "human",
    reviewedAt: new Date().toISOString(),
  };
  await atomicWrite(target, `${JSON.stringify(request, null, 2)}\n`);
  emit("request", { id: request.id, path: request.path, status: request.status, reason: "proposal-unit-edit" });
  return { id: request.id, unitId: unit.id, status: "confirmed", reviewKind: "human" };
}

async function acceptRewriteProposal(body) {
  const { target, value: request } = await readRewriteRequest(body.id);
  if (request.status !== "proposed" || !request.proposal) throw new Error("This comment has no proposal waiting for confirmation.");
  if (hasLinkedChangeSet(request)) {
    throw new Error("Review and apply this linked change set as one atomic manuscript update.");
  }
  if (request.pendingUnitRevision) {
    throw new Error("Wait for the agent to finish revising the current unit before applying this structure group.");
  }
  const reviewUnits = proposalReviewUnits(request, await cachedProjectReferences());
  if (reviewUnits.length > 1 && reviewUnits.some((unit) => unit.status !== "confirmed")) {
    const remaining = reviewUnits.filter((unit) => unit.status !== "confirmed").length;
    throw new Error(`Review all ${reviewUnits.length} structure units before applying this grouped rewrite (${remaining} remaining).`);
  }
  const beforeRequest = structuredClone(request);
  const absolutePath = resolveDocument(request.path);
  await assertSourcesWritable([request.path]);
  const source = await fs.readFile(absolutePath, "utf8");
  const sourceBlocks = parseBlocks(source);
  let start = Number(request.proposal.absoluteStart);
  let end = Number(request.proposal.absoluteEnd);
  if (sha(source) !== request.proposal.sourceEtag ||
      !Number.isInteger(start) || !Number.isInteger(end) ||
      source.slice(start, end) !== request.proposal.originalText) {
    const { match, matchCount } = findSelectionAnchor(source, sourceBlocks, {
      ...request,
      selectedText: request.proposal.originalText,
      absoluteStart: start,
      absoluteEnd: end,
    });
    if (!match) {
      throw new Error(`The source changed and this proposal could not be merged safely (${matchCount} matching passages). Run the agent again for this item.`);
    }
    start = match.absoluteStart;
    end = match.absoluteEnd;
  }
  const sourceMatch = selectionMatchFromAbsolute(sourceBlocks, start, end)
    || selectionSpanFromAbsoluteRange(sourceBlocks, start, end);
  if (!sourceMatch) throw new Error("The proposed source range no longer belongs to the selected passage.");
  const replacement = String(request.proposal.replacementText || "");
  const nextSource = `${source.slice(0, start)}${replacement}${source.slice(end)}`;
  assertNoNestedHeadingCommands(nextSource);
  await writeSource(request.path, nextSource);
  request.status = "resolved";
  request.acceptedAt = new Date().toISOString();
  request.resolutionSummary = request.proposal.summary || "Accepted Paper Pal proposal";
  request.resolutionEtag = sha(nextSource);
  await atomicWrite(target, `${JSON.stringify(request, null, 2)}\n`);

  const reviewState = await readState();
  const beforeReview = reviewStateSnapshot(reviewState, request.path);
  reviewState.paragraphs[request.path] ||= {};
  const nextBlocks = parseBlocks(nextSource);
  const replacementEnd = start + replacement.length;
  rebaseDocumentReviewSelections(reviewState, request.path, sourceBlocks, nextBlocks, start, end, replacementEnd);
  if (replacement.length) {
    reviewState.selections.push(...splitAbsoluteReviewRange(request.path, nextBlocks, start, replacementEnd, "accepted"));
  }
  for (const block of sourceBlocks.filter((block) => block.end > start && block.start < end)) {
    delete reviewState.paragraphs[request.path][block.id];
  }
  for (const block of nextBlocks.filter((block) => block.end > start && block.start < replacementEnd)) {
    delete reviewState.paragraphs[request.path][block.id];
  }
  const afterReview = reviewStateSnapshot(reviewState, request.path);
  await writeState(reviewState);
  await pushUndoAction({
    kind: "accept-proposal",
    label: `Accept proposal in ${path.basename(request.path)}`,
    path: request.path,
    beforeSource: source,
    afterSource: nextSource,
    afterEtag: sha(nextSource),
    beforeReview,
    afterReview,
    requestId: request.id,
    beforeRequest,
    afterRequest: structuredClone(request),
  });
  scheduleCompile();
  emit("document", { path: request.path, reason: "proposal-accepted" });
  emit("request", { id: request.id, path: request.path, status: "resolved" });
  await syncStructurePlanRequestState(request.id);
  return request;
}

async function undoLastAction() {
  const actions = await readUndoStack();
  const action = actions.at(-1);
  if (!action) throw new Error("Nothing to undo.");

  const state = await readState();
  const files = Array.isArray(action.files) && action.files.length
    ? action.files
    : [{
        path: action.path,
        beforeSource: action.beforeSource,
        afterSource: action.afterSource,
        afterEtag: action.afterEtag,
        beforeReview: action.beforeReview,
        afterReview: action.afterReview,
      }];
  for (const file of files) {
    const currentSource = await fs.readFile(resolveDocument(file.path), "utf8");
    if (file.afterEtag && sha(currentSource) !== file.afterEtag) {
      throw new Error(`${path.basename(file.path)} changed after this action. Undo was not applied.`);
    }
    const currentReview = reviewStateSnapshot(state, file.path);
    if (file.afterReview && !sameSnapshot(currentReview, file.afterReview)) {
      throw new Error(`The review state for ${path.basename(file.path)} changed after this action. Undo was not applied.`);
    }
  }

  if (action.requestId && action.afterRequest) {
    const stored = await readRewriteRequest(action.requestId);
    if (JSON.stringify(stored.value) !== JSON.stringify(action.afterRequest)) {
      throw new Error("The proposal changed after this action. Undo was not applied.");
    }
  }

  await assertSourcesWritable(files.filter((file) => typeof file.beforeSource === "string").map((file) => file.path));
  for (const file of files) {
    if (typeof file.beforeSource === "string") {
      await writeSource(file.path, file.beforeSource);
    }
    if (file.beforeReview) restoreReviewStateSnapshot(state, file.path, file.beforeReview);
  }
  if (files.some((file) => file.beforeReview)) {
    await writeState(state);
  }
  if (action.requestId && action.beforeRequest) {
    await atomicWrite(resolveRequestPath(action.requestId), `${JSON.stringify(action.beforeRequest, null, 2)}\n`);
  }

  actions.pop();
  await writeUndoStack(actions);
  if (files.some((file) => typeof file.beforeSource === "string")) scheduleCompile();
  for (const file of files) {
    emit("document", { path: file.path, reason: "undo" });
    emit("state", { path: file.path, reason: "undo" });
  }
  if (action.requestId) {
    emit("request", {
      id: action.requestId,
      path: action.path,
      reason: "undo",
      status: action.beforeRequest?.status || "proposed",
    });
    await syncStructurePlanRequestState(action.requestId);
  }
  const undo = await undoStatus();
  emit("undo", undo);
  return { undone: { id: action.id, kind: action.kind, label: action.label, path: action.path }, undo };
}

async function rejectRewriteProposal(body) {
  const { target, value: request } = await readRewriteRequest(body.id);
  if (request.status !== "proposed" || !request.proposal) throw new Error("This comment has no proposal waiting for confirmation.");
  request.proposalHistory ||= [];
  request.proposalHistory.push({ ...request.proposal, rejectedAt: new Date().toISOString() });
  delete request.proposal;
  request.status = "rejected";
  request.rejectedAt = new Date().toISOString();
  await atomicWrite(target, `${JSON.stringify(request, null, 2)}\n`);
  codexRuns.delete(request.id);
  await writeCodexRunJson(request.id, "STATUS.json", {
    taskId: request.id,
    state: "REJECTED",
    finishedAt: request.rejectedAt,
  });
  emit("request", { id: request.id, path: request.path, status: "rejected" });
  await syncStructurePlanRequestState(request.id);
  return request;
}

async function listRequests() {
  const entries = await fs.readdir(requestsRoot, { withFileTypes: true });
  const requests = [];
  const documentCache = new Map();
  const proposalReferences = await cachedProjectReferences();

  async function anchorFor(request) {
    if (!request?.path || !request?.selectedText) return { anchorValid: false };
    let document = documentCache.get(request.path);
    if (!document) {
      try {
        const source = await fs.readFile(resolveDocument(request.path), "utf8");
        document = { source, blocks: parseBlocks(source) };
      } catch {
        document = { source: "", blocks: [] };
      }
      documentCache.set(request.path, document);
    }
    const { match } = findSelectionAnchor(document.source, document.blocks, request);
    return match
      ? {
          anchorValid: true,
          resolvedBlockIndex: match.startBlock.index,
          resolvedEndBlockIndex: match.endBlock.index,
          resolvedStart: match.start,
          resolvedEnd: match.end,
          resolvedAbsoluteStart: match.absoluteStart,
          resolvedAbsoluteEnd: match.absoluteEnd,
        }
      : { anchorValid: false };
  }

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    try {
      const request = JSON.parse(await fs.readFile(path.join(requestsRoot, entry.name), "utf8"));
      // Preserve requests from superseded manuscripts on disk, but keep them
      // out of the active review surface for the configured source root.
      resolveDocument(request.path);
      if (request.proposal) {
        const linkedChanges = await Promise.all((request.proposal.linkedChanges || []).map(async (change) => ({
          ...change,
          originalDisplay: latexToDisplay(String(change.selectedText || ""), "paragraph", new Map(), proposalReferences).display,
          replacementDisplay: latexToDisplay(String(change.replacementText || ""), "paragraph", new Map(), proposalReferences).display,
          ...(await anchorFor({
            path: change.path,
            selectedText: change.selectedText,
            absoluteStart: change.absoluteStart,
            absoluteEnd: change.absoluteEnd,
            blockIndex: change.blockIndex,
            endBlockIndex: change.endBlockIndex,
          })),
        })));
        request.proposal = {
          ...request.proposal,
          originalDisplay: latexToDisplay(String(request.proposal.originalText || ""), "paragraph", new Map(), proposalReferences).display,
          replacementDisplay: latexToDisplay(String(request.proposal.replacementText || ""), "paragraph", new Map(), proposalReferences).display,
          reviewUnits: proposalReviewUnits(request, proposalReferences),
          linkedChanges,
        };
      }
      if (["pending", "proposed", "discussed"].includes(request.status)) Object.assign(request, await anchorFor(request));
      const agent = codexRuns.get(request.id) || await persistedCodexRunPayload(request);
      if (agent) {
        request.agentStatus = agent.status;
        if (agent.error) request.agentError = agent.error;
        // When the current state began; the page counts the seconds of a run from it.
        if (agent.updatedAt) request.agentUpdatedAt = agent.updatedAt;
      }
      requests.push(request);
    } catch {
      // Keep one malformed request from breaking the UI.
    }
  }
  return requests.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

// Content-Security-Policy for the app page. Scripts and styles come only from
// this server (KaTeX is served from /vendor); inline <script> blocks already in
// the page are allowed by hash, never by 'unsafe-inline'. Inline style
// attributes are needed by KaTeX. Frames may show the compiled PDF and the PDF
// of a cited paper on the web.
function pageSecurityPolicy(html) {
  const hashes = [];
  const inlineScript = /<script(?![^>]*\bsrc\s*=)[^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = inlineScript.exec(html)) !== null) {
    if (match[1].trim()) hashes.push(`'sha256-${createHash("sha256").update(match[1]).digest("base64")}'`);
  }
  return [
    "default-src 'none'",
    `script-src 'self'${hashes.length ? ` ${hashes.join(" ")}` : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "frame-src 'self' https: http:",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

async function serveStatic(requestPath, response) {
  let requested;
  try {
    requested = requestPath === "/" ? "index.html" : decodeURIComponent(requestPath).replace(/^\/+/, "");
  } catch {
    text(response, 400, "Bad request");
    return;
  }
  const absolute = path.resolve(publicRoot, requested);
  if (requested.includes("\0") || absolute === publicRoot || !isInside(publicRoot, absolute)) {
    text(response, 403, "Forbidden");
    return;
  }
  try {
    const contents = await fs.readFile(absolute);
    const extension = path.extname(absolute).toLowerCase();
    const types = {
      ".html": "text/html; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".js": "text/javascript; charset=utf-8",
      ".mjs": "text/javascript; charset=utf-8",
      ".json": "application/json; charset=utf-8",
      ".svg": "image/svg+xml; charset=utf-8",
      ".png": "image/png",
      ".ico": "image/x-icon",
      ".woff2": "font/woff2",
    };
    response.writeHead(200, {
      "Content-Type": types[extension] || "application/octet-stream",
      "Content-Length": contents.length,
      "Cache-Control": "no-cache",
      "X-Content-Type-Options": "nosniff",
      ...(extension === ".html"
        ? {
            "Content-Security-Policy": pageSecurityPolicy(contents.toString("utf8")),
            "X-Frame-Options": "DENY",
            "Referrer-Policy": "no-referrer",
          }
        : {}),
    });
    response.end(contents);
  } catch {
    text(response, 404, "Not found");
  }
}

async function serveAsset(relativePath, response) {
  const absolute = path.resolve(repoRoot, relativePath || "");
  const extension = path.extname(absolute).toLowerCase();
  const allowedAssets = new Set([".pdf", ".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"]);
  if (!insideSourceRoot(absolute) || !allowedAssets.has(extension)) {
    text(response, 403, "Forbidden");
    return;
  }
  const contents = await fs.readFile(absolute);
  const types = {
    ".pdf": "application/pdf", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
    ".gif": "image/gif", ".webp": "image/webp", ".svg": "image/svg+xml; charset=utf-8",
  };
  response.writeHead(200, {
    "Content-Type": types[extension] || "application/octet-stream",
    "Content-Length": contents.length,
    "Cache-Control": "no-cache",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
  });
  response.end(contents);
}

async function serveAssetPreview(relativePath, response) {
  const absolute = path.resolve(repoRoot, relativePath || "");
  if (!insideSourceRoot(absolute) || path.extname(absolute).toLowerCase() !== ".pdf") {
    text(response, 403, "Forbidden");
    return;
  }
  // A sibling `*_preview.png` is often a manually generated, older export.
  // Rendering it here made the inline image disagree with the source PDF that
  // opens on click. Cache only a rasterization of the exact current PDF bytes.
  const pdf = await fs.readFile(absolute);
  const previewRoot = path.join(reviewRoot, "cache", "asset-previews");
  await fs.mkdir(previewRoot, { recursive: true });
  const key = sha(Buffer.concat([Buffer.from(`exact-pdf-v2:${absolute}:`), pdf]));
  const prefix = path.join(previewRoot, key);
  const preview = `${prefix}.png`;
  if (!existsSync(preview)) {
    const result = existsSync("/usr/bin/sips")
      ? await execFilePromise("/usr/bin/sips", ["-s", "format", "png", "--resampleWidth", "1200", absolute, "--out", preview])
      : await execFilePromise("pdftoppm", ["-f", "1", "-singlefile", "-r", "220", "-png", absolute, prefix]);
    if (result.code !== 0 || !existsSync(preview)) {
      throw new HttpError(422, result.code === "ENOENT"
        ? "PDF figures need a rasteriser to be previewed inline: install poppler (pdftoppm). The figure still opens on click."
        : "Could not render the PDF figure preview.");
    }
  }
  const contents = await fs.readFile(preview);
  response.writeHead(200, {
    "Content-Type": "image/png",
    "Content-Length": contents.length,
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(contents);
}

async function serveKatex(requestPath, response) {
  const requested = requestPath.replace(/^\/vendor\/katex\//, "");
  // Resolve like Node does: in a packaged install npm hoists katex next to
  // Paper Pal instead of into its own node_modules.
  let root = path.join(appRoot, "node_modules/katex/dist");
  try {
    root = path.join(path.dirname(createRequire(import.meta.url).resolve("katex/package.json")), "dist");
  } catch {
    // Keep the conventional location; the request then answers 404.
  }
  const absolute = path.resolve(root, requested);
  const extension = path.extname(absolute).toLowerCase();
  if (absolute === root || !isInside(root, absolute) || !new Set([".js", ".css", ".woff", ".woff2", ".ttf"]).has(extension)) {
    text(response, 403, "Forbidden");
    return;
  }
  const contents = await fs.readFile(absolute);
  const contentTypes = {
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
    ".ttf": "font/ttf",
  };
  response.writeHead(200, {
    "Content-Type": contentTypes[extension],
    "Content-Length": contents.length,
    "Cache-Control": "public, max-age=86400",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(contents);
}

const server = createServer(async (request, response) => {
  try {
    assertAllowedHost(request);
    let url;
    try {
      // The Host header was validated above; the base only anchors the parse.
      url = new URL(request.url || "/", `http://127.0.0.1:${port}`);
    } catch {
      throw new HttpError(400, "Malformed request URL.");
    }
    const readOnly = request.method === "GET" || request.method === "HEAD";
    if (!readOnly) {
      assertLocalOrigin(request);
      const hasBody = Number(request.headers["content-length"]) > 0 || request.headers["transfer-encoding"];
      if (hasBody && !/^application\/json\b/i.test(String(request.headers["content-type"] || ""))) {
        throw new HttpError(415, "Request bodies must be sent as application/json.");
      }
    }

    if (request.method === "GET" && url.pathname === "/api/bootstrap") {
      json(response, 200, {
        title: config.title,
        projectLabel: config.projectLabel,
        // Names only: absolute paths carry the OS user name and are not needed
        // by the page.
        configPath: path.basename(configPath),
        repoRoot: path.basename(repoRoot),
        defaultDocument: config.defaultDocument,
        initialDocument: config.ui?.initialDocument || config.defaultDocument,
        documents: await listDocuments(),
        pdfExists: existsSync(path.resolve(repoRoot, config.pdf)),
        latex: { enabled: config.latex?.enabled !== false, available: latexAvailable() },
        compile: compileState,
        undo: await undoStatus(),
        git: await gitStatus(),
        chat: {
          enabled: config.agent?.enabled !== false,
          model: providerModel(defaultProvider, config, { chat: true }) || `${providerLabel(defaultProvider)} default`,
          reasoningEffort: config.codex?.chatReasoningEffort || "medium",
          concurrency: maxConcurrentChatTurns,
        },
        agent: {
          enabled: config.agent?.enabled !== false,
          provider: defaultProvider,
          allowOverride: config.agent?.allowOverride !== false,
          // id/label/model/models are the original contract; kind, available,
          // reason and capabilities were added with the API providers.
          providers: providerSummaries().map((entry) => ({
            id: entry.id,
            label: entry.label,
            model: providerModel(entry.id, config, { chat: true }) || `${entry.label} default`,
            models: providerModelChoices(entry.id),
            kind: entry.kind,
            available: entry.available,
            reason: entry.reason,
            capabilities: entry.capabilities,
          })),
        },
        structurePlan: await readStructurePlan({ publicOnly: true }),
      });
      return;
    }
    if (request.method === "GET" && url.pathname === "/api/health") {
      // For scripts, agents and the page: is the app up and what can it do?
      // No absolute paths and nothing secret.
      json(response, 200, {
        ok: true,
        name: APP_ID,
        version: appVersion(),
        project: { title: config.title, defaultDocument: config.defaultDocument },
        latex: { enabled: config.latex?.enabled !== false, available: latexAvailable() },
        providers: providerSummaries().map(({ id, label, kind, available, reason }) => ({ id, label, kind, available, reason })),
        defaultProvider,
      });
      return;
    }
    if (request.method === "GET" && url.pathname === "/api/document") {
      json(response, 200, await documentPayload(url.searchParams.get("path")));
      return;
    }
    if (request.method === "GET" && url.pathname === "/api/outline") {
      json(response, 200, await compiledOutline());
      return;
    }
    if (request.method === "POST" && url.pathname === "/api/document/review") {
      json(response, 200, await runSectionReview(await readJson(request)));
      return;
    }
    if (request.method === "POST" && url.pathname === "/api/document/review/accept") {
      const body = await readJson(request);
      json(response, 200, await withProjectLock(() => acceptReviewFinding(body)));
      return;
    }
    if (request.method === "GET" && url.pathname === "/api/structure") {
      json(response, 200, await paperStructure());
      return;
    }
    if (request.method === "GET" && url.pathname === "/api/structure/plan") {
      json(response, 200, await readStructurePlan({ publicOnly: true }));
      return;
    }
    if (request.method === "POST" && url.pathname === "/api/structure/confirm") {
      const body = await readJson(request);
      json(response, 201, await withProjectLock(() => confirmStructurePlan(body)));
      return;
    }
    if (request.method === "POST" && url.pathname === "/api/structure/section-rewrite") {
      const body = await readJson(request);
      json(response, 202, await withProjectLock(() => createStructureSectionRequests(body)));
      return;
    }
    if (request.method === "POST" && url.pathname === "/api/structure/mark-applied") {
      const body = await readJson(request);
      json(response, 200, await withProjectLock(() => markStructurePlanApplied(body)));
      return;
    }
    if (request.method === "POST" && url.pathname === "/api/structure/revert") {
      json(response, 200, await withProjectLock(() => revertStructurePlan()));
      return;
    }
    if (request.method === "GET" && url.pathname === "/api/undo") {
      json(response, 200, await undoStatus());
      return;
    }
    if (request.method === "POST" && url.pathname === "/api/undo") {
      json(response, 200, await withProjectLock(() => undoLastAction()));
      return;
    }
    if (request.method === "POST" && url.pathname === "/api/save") {
      const body = await readJson(request);
      json(response, 200, await withProjectLock(() => saveBlock(body)));
      return;
    }
    if (request.method === "POST" && url.pathname === "/api/tracked-change/resolve") {
      const body = await readJson(request);
      json(response, 200, await withProjectLock(() => resolveTrackedChange(body)));
      return;
    }
    if (request.method === "POST" && url.pathname === "/api/confirm") {
      const body = await readJson(request);
      json(response, 200, await withProjectLock(() => confirmSelection(body)));
      return;
    }
    if (request.method === "POST" && url.pathname === "/api/unconfirm") {
      const body = await readJson(request);
      json(response, 200, await withProjectLock(() => unconfirmSelection(body)));
      return;
    }
    if (request.method === "POST" && url.pathname === "/api/rewrite") {
      const body = await readJson(request);
      json(response, 201, await withProjectLock(() => createRewriteRequest(body)));
      return;
    }
    if (request.method === "POST" && url.pathname === "/api/request/accept") {
      const body = await readJson(request);
      json(response, 200, await withProjectLock(() => acceptRewriteProposal(body)));
      return;
    }
    if (request.method === "POST" && url.pathname === "/api/request/review-unit") {
      const body = await readJson(request);
      json(response, 200, await withProjectLock(() => reviewProposalUnit(body)));
      return;
    }
    if (request.method === "POST" && url.pathname === "/api/request/review-linked-change") {
      const body = await readJson(request);
      json(response, 200, await withProjectLock(() => reviewLinkedChange(body)));
      return;
    }
    if (request.method === "POST" && url.pathname === "/api/request/confirm-all-linked") {
      const body = await readJson(request);
      json(response, 200, await withProjectLock(() => confirmAllLinkedChanges(body)));
      return;
    }
    if (request.method === "POST" && url.pathname === "/api/request/apply-linked") {
      const body = await readJson(request);
      json(response, 200, await withProjectLock(() => applyLinkedChangeSet(body)));
      return;
    }
    if (request.method === "POST" && url.pathname === "/api/request/edit-unit") {
      const body = await readJson(request);
      json(response, 200, await withProjectLock(() => editProposalUnit(body)));
      return;
    }
    if (request.method === "POST" && url.pathname === "/api/request/reject") {
      const body = await readJson(request);
      json(response, 200, await withProjectLock(() => rejectRewriteProposal(body)));
      return;
    }
    if (request.method === "POST" && url.pathname === "/api/request/process") {
      const body = await readJson(request);
      json(response, 202, await withProjectLock(() => processRewriteRequest(body)));
      return;
    }
    if (request.method === "POST" && url.pathname === "/api/request/restore-unit-revision") {
      const body = await readJson(request);
      json(response, 200, await withProjectLock(() => restorePendingUnitRevision(body)));
      return;
    }
    if (request.method === "POST" && url.pathname === "/api/request/followup") {
      const body = await readJson(request);
      json(response, 202, await withProjectLock(() => followupRewriteRequest(body)));
      return;
    }
    if (request.method === "POST" && url.pathname === "/api/request/regenerate") {
      const body = await readJson(request);
      json(response, 202, await withProjectLock(() => regenerateRewriteRequest(body)));
      return;
    }
    if (request.method === "POST" && url.pathname === "/api/request/generate-proposal") {
      const body = await readJson(request);
      json(response, 202, await withProjectLock(() => generateProposalFromDiscussion(body)));
      return;
    }
    if (request.method === "POST" && url.pathname === "/api/request/delete") {
      const body = await readJson(request);
      json(response, 200, await withProjectLock(() => deleteRewriteRequest(body)));
      return;
    }
    if (request.method === "GET" && url.pathname === "/api/requests") {
      json(response, 200, await listRequests());
      return;
    }
    if (request.method === "GET" && url.pathname === "/api/chat") {
      // Reading a chat may normalise and rewrite it, so it takes the lock too.
      json(response, 200, await withProjectLock(() => readChatSession({ id: url.searchParams.get("id") || null })));
      return;
    }
    if (request.method === "GET" && url.pathname === "/api/chats") {
      json(response, 200, await withProjectLock(() => listChatSessions()));
      return;
    }
    if (request.method === "POST" && url.pathname === "/api/chat/message") {
      const body = await readJson(request);
      json(response, 202, await withProjectLock(() => sendChatMessage(body)));
      return;
    }
    if (request.method === "POST" && url.pathname === "/api/chat/new") {
      json(response, 201, await withProjectLock(() => newChatSession()));
      return;
    }
    if (request.method === "POST" && url.pathname === "/api/chat/select") {
      const body = await readJson(request);
      json(response, 200, await withProjectLock(() => selectChatSession(body)));
      return;
    }
    if (request.method === "POST" && url.pathname === "/api/chat/stop") {
      const body = await readJson(request);
      json(response, 200, await withProjectLock(() => stopChatTurn(body)));
      return;
    }
    if (request.method === "POST" && url.pathname === "/api/chat/create-proposal") {
      const body = await readJson(request);
      json(response, 202, await withProjectLock(() => createProposalFromChat(body)));
      return;
    }
    if (request.method === "POST" && url.pathname === "/api/compile") {
      await compilePdf();
      json(response, 202, compileState);
      return;
    }
    if (request.method === "GET" && url.pathname === "/api/compile") {
      json(response, 200, compileState);
      return;
    }
    if (request.method === "GET" && url.pathname === "/api/git") {
      json(response, 200, await gitStatus());
      return;
    }
    if (request.method === "GET" && url.pathname === "/api/pdf") {
      const pdfPath = path.resolve(repoRoot, config.pdf);
      if (!realPathInside(realRepoRoot, pdfPath)) throw new HttpError(403, "The configured PDF is outside the project.");
      const pdf = await fs.readFile(pdfPath);
      response.writeHead(200, {
        "Content-Type": "application/pdf",
        "Content-Length": pdf.length,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      });
      response.end(pdf);
      return;
    }
    if (request.method === "GET" && url.pathname === "/api/asset") {
      await serveAsset(url.searchParams.get("path"), response);
      return;
    }
    if (request.method === "GET" && url.pathname === "/api/asset-preview") {
      await serveAssetPreview(url.searchParams.get("path"), response);
      return;
    }
    if (request.method === "GET" && url.pathname.startsWith("/vendor/katex/")) {
      await serveKatex(url.pathname, response);
      return;
    }
    if (request.method === "GET" && url.pathname === "/api/events") {
      response.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Content-Type-Options": "nosniff",
      });
      response.write(`event: ready\ndata: ${JSON.stringify({ ok: true })}\n\n`);
      sseClients.add(response);
      request.on("close", () => sseClients.delete(response));
      return;
    }
    if (url.pathname.startsWith("/api/")) throw new HttpError(404, "Unknown API endpoint.");
    if (!readOnly) throw new HttpError(405, "Method not allowed.");
    await serveStatic(url.pathname, response);
  } catch (error) {
    // Once headers are out there is nothing valid left to send; answering again
    // would throw from inside this handler.
    if (response.headersSent) {
      response.destroy();
      return;
    }
    const { status, message } = errorResponse(error);
    try {
      json(response, status, { error: message });
    } catch {
      response.destroy();
    }
  }
});

// External-change detection. fs.watch gives prompt notice where it works, but
// recursive watching is not available everywhere and, on Linux, stops reporting
// a file once it has been replaced by rename (which is how this app and most
// editors save). A slow poll of modification times covers both gaps; the
// signature map keeps the two from reporting the same edit twice.
const watchedSourcePattern = /[.](?:tex|bib|md)$/i;

async function noteSourceChange(absolutePath) {
  const relativePath = relativeRepo(absolutePath);
  const signature = await fileSignature(absolutePath);
  if (signature === null) {
    sourceSignatures.delete(relativePath);
    return;
  }
  if (sourceSignatures.get(relativePath) === signature) return;
  sourceSignatures.set(relativePath, signature);
  if (Date.now() - (recentWrites.get(relativePath) || 0) < 2000) return;
  emit("document", { path: relativePath, reason: "external-change" });
}

async function pollSourceChanges({ silent = false } = {}) {
  for (const absolutePath of await walkSourceFiles((name) => watchedSourcePattern.test(name))) {
    if (silent) sourceSignatures.set(relativeRepo(absolutePath), await fileSignature(absolutePath));
    else await noteSourceChange(absolutePath);
  }
}

await pollSourceChanges({ silent: true });
let sourcePollRunning = false;
setInterval(() => {
  if (sourcePollRunning) return;
  sourcePollRunning = true;
  pollSourceChanges().catch(() => {}).finally(() => { sourcePollRunning = false; });
}, 1500).unref();

try {
  const watcher = watch(sourceRoot, { recursive: true }, (_event, filename) => {
    if (!filename || !watchedSourcePattern.test(String(filename))) return;
    // Same repository-relative path as the document list, also when
    // sourceRoot is "." (the default).
    void noteSourceChange(path.join(sourceRoot, String(filename))).catch(() => {});
  });
  watcher.on("error", () => {});
} catch {
  // File watching is an enhancement; the poll above and manual reload remain.
}

try {
  const requestWatcher = watch(requestsRoot, (_event, filename) => {
    if (!filename || !String(filename).endsWith(".json")) return;
    emit("request", { id: String(filename).replace(/[.]json$/, ""), reason: "request-file-changed" });
  });
  requestWatcher.on("error", () => {});
} catch {
  // The UI also refreshes requests after local actions.
}

server.on("error", (error) => {
  if (error?.code === "EADDRINUSE") {
    console.error(`Port ${port} is already in use. Stop the existing Paper Pal instance or start with --port <number>.`);
    process.exit(1);
  }
  console.error(`The server could not start: ${error?.message || error}`);
  process.exit(1);
});

// Last-resort guards, installed only once start-up (configuration, state
// directory) has succeeded: from here on a bug in one request must not take the
// local server, and any agent run in flight, down with it.
process.on("unhandledRejection", (reason) => {
  console.error("[unhandledRejection]", reason instanceof Error ? reason.stack || reason.message : reason);
});
process.on("uncaughtException", (error) => {
  console.error("[uncaughtException]", error instanceof Error ? error.stack || error.message : error);
});

server.listen(port, host, () => {
  const shownHost = host.includes(":") && !host.startsWith("[") ? `[${host}]` : host;
  const address = `http://${shownHost}:${server.address()?.port ?? port}`;
  const providerState = describeProvider(defaultProvider, config);
  console.log([
    `${APP_NAME} ${appVersion()} is running at ${address}`,
    `  Project:  ${config.title} (${config.defaultDocument})`,
    `  Folder:   ${repoRoot}`,
    `  Agent:    ${providerState.label} - ${providerState.available ? "ready" : `not ready. ${providerState.reason}`}`,
    ...(providerState.warning ? [`  WARNING:  ${providerState.warning}`] : []),
    `  PDF:      ${config.latex?.enabled === false ? "compilation disabled" : latexAvailable() ? `${config.latex.command} found` : `${config.latex.command} not found on PATH`}`,
    "  Press Ctrl+C to stop.",
  ].join("\n"));
  if (process.argv.includes("--open")) openBrowser(address.replace(/\/\/(0[.]0[.]0[.]0|\[?::\]?)(?=:)/, "//127.0.0.1"));
  if (!hostIsLoopback) {
    console.warn([
      "",
      "  ********************************************************************",
      `  WARNING: listening on ${host}, which is NOT a loopback address.`,
      "  This server has no authentication. Anyone who can reach this address",
      "  can read and edit the manuscript and start agent runs with your",
      `  credentials. Unset ${ENV.host} unless you really mean this.`,
      "  ********************************************************************",
      "",
    ].join("\n"));
  }
});

// Best effort: a missing opener is not an error, the URL is printed anyway.
function openBrowser(address) {
  const [command, args] = process.platform === "darwin"
    ? ["open", [address]]
    : process.platform === "win32"
      ? ["cmd.exe", ["/d", "/s", "/c", "start", "", address]]
      : ["xdg-open", [address]];
  try {
    const child = spawn(command, args, { stdio: "ignore", detached: true, env: childEnvironment() });
    child.on("error", () => console.log(`  (Could not open a browser automatically; open ${address} yourself.)`));
    child.unref();
  } catch {
    console.log(`  (Could not open a browser automatically; open ${address} yourself.)`);
  }
}

let shuttingDown = false;
function shutdown() {
  if (shuttingDown) process.exit(0);
  shuttingDown = true;
  const children = [activeCodexChild, activeReviewChild, ...[...activeChatRuns.values()].map((run) => run.child)]
    .filter((child) => child && child.exitCode === null && !child.signalCode);
  for (const child of children) terminateChild(child, 1500);
  for (const client of sseClients) client.end();
  server.close();
  server.closeAllConnections?.();
  // Give children a moment to exit (terminateChild escalates to SIGKILL), then
  // leave whether or not every connection has drained.
  const waitForChildren = Promise.all(children.map((child) => new Promise((resolve) => child.once("exit", resolve))));
  Promise.race([waitForChildren, new Promise((resolve) => setTimeout(resolve, 2500))]).then(() => process.exit(0));
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
