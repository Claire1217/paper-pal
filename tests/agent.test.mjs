import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { api, apiOk, cleanupAll, commentOn, getDocument, makeProject, startServer, stateDirectory, trySymlink, waitFor, waitForRequest } from "./helpers.mjs";

const SECRET = "sk-test-DO-NOT-LEAK-0123456789";

async function lastRun(project) {
  return JSON.parse(await fs.readFile(path.join(project.root, ".fake-agent", "last-run.json"), "utf8"));
}

// The pids the fake agent records before it reads stdin. Tests that time a run
// out use this, not last-run.json, which a slow start may never reach.
async function startedRun(project) {
  return JSON.parse(await fs.readFile(path.join(project.root, ".fake-agent", "started.json"), "utf8"));
}

describe("comment → proposal → accept with a fake agent CLI", () => {
  let project;
  let server;

  before(async () => {
    // The directory name contains a space on purpose.
    project = await makeProject({ fakeAgent: true, directoryName: "my paper" });
    server = await startServer(project.root, {
      privateTmp: true,
      env: {
        OPENROUTER_API_KEY: SECRET, PAPER_PAL_TEST_KEY: SECRET, OPENAI_API_KEY: SECRET, ANTHROPIC_API_KEY: SECRET,
        DEEPSEEK_API_KEY: SECRET, PAPER_PAL_API_KEY: SECRET,
      },
    });
  });
  after(cleanupAll);

  it("runs the whole flow and changes only the selected source text", async () => {
    const file = path.join(project.root, "sections", "05_discussion.tex");
    const before = await fs.readFile(file, "utf8");
    const needle = "The saturation result matters for policy.";
    const created = await commentOn(server, "sections/05_discussion.tex", needle, `Make this louder. ${SECRET}`);
    assert.equal(created.status, "pending");
    await apiOk(server, "/api/request/process", { method: "POST", body: { id: created.id } });
    const proposed = await waitForRequest(server, created.id, (request) => request.status === "proposed", "proposal");
    assert.equal(proposed.proposal.replacementText, needle.toUpperCase());
    assert.equal(proposed.proposal.originalText, needle);
    assert.equal(await fs.readFile(file, "utf8"), before, "nothing is written before the author accepts");

    const accepted = await apiOk(server, "/api/request/accept", { method: "POST", body: { id: created.id } });
    assert.equal(accepted.status, "resolved");
    assert.equal(await fs.readFile(file, "utf8"), before.replace(needle, needle.toUpperCase()));

    const undone = await apiOk(server, "/api/undo", { method: "POST" });
    assert.equal(undone.undone.kind, "accept-proposal");
    assert.equal(await fs.readFile(file, "utf8"), before);
  });

  it("sends the prompt over stdin, never in argv, and keeps machine paths out of it", async () => {
    const run = await lastRun(project);
    assert.equal(run.promptInArgv, false);
    assert.equal(run.usesStdinMarker, true);
    assert.ok(run.stdinChars > 1000);
    assert.equal(run.repositoryRoot, ".");
    assert.ok(!run.promptHead.includes(project.root), "the absolute project path must not reach the model");
  });

  it("omits terminology instructions when no terminology file is configured", async () => {
    const run = await lastRun(project);
    assert.equal(run.hasTerminology, false);
    assert.equal(run.mentionsTerminology, false);
  });

  it("withholds API keys from the agent process and redacts them from traces", async () => {
    const run = await lastRun(project);
    assert.equal(run.openrouterKeyVisible, false);
    assert.equal(run.paperPalKeyVisible, false);
    assert.deepEqual(run.keyVariablesVisible, [], "no provider key of any kind reaches a CLI agent");
    const runsRoot = path.join(project.root, stateDirectory, "runs");
    const [runDirectory] = await fs.readdir(runsRoot);
    const trace = await fs.readFile(path.join(runsRoot, runDirectory, "TRACE.log"), "utf8");
    assert.match(trace, /fake-agent instruction: Make this louder\. \[redacted\]/);
    assert.ok(!trace.includes(SECRET));
  });

  it("sends a window, not the whole file, when the source is over the size limit", async () => {
    // ~300 KB of source: well past the 128 KB single-argument limit on Linux.
    const filler = Array.from({ length: 4000 }, (_, index) => `Filler sentence number ${index} keeps the file large enough to matter for this test.`).join("\n\n");
    const big = `\\section{Big}\nThe unique target sentence lives here.\n\n${filler}\n`;
    await fs.writeFile(path.join(project.root, "sections", "big.tex"), big, "utf8");
    assert.ok(Buffer.byteLength(big) > 250_000);
    const created = await commentOn(server, "sections/big.tex", "The unique target sentence lives here.", "Tighten.", { contextMode: "local" });
    await apiOk(server, "/api/request/process", { method: "POST", body: { id: created.id } });
    const proposed = await waitForRequest(server, created.id, (request) => request.status === "proposed", "big proposal");
    assert.equal(proposed.proposal.replacementText, "THE UNIQUE TARGET SENTENCE LIVES HERE.");
    const run = await lastRun(project);
    // The file is over the 120k-character task limit, so only a window around
    // the selection is sent.
    assert.ok(run.stdinBytes > 8_000 && run.stdinBytes < 60_000, `prompt was ${run.stdinBytes} bytes`);
    assert.ok(run.argvBytes < 2000);
  });

  it("carries a prompt larger than the argv limit through stdin (no E2BIG)", async () => {
    // Just under the 120,000-character limit for sending a whole file, with
    // some CJK text so the byte count is well above the character count.
    const sentences = [];
    for (let index = 0; sentences.join("\n\n").length < 112_000; index += 1) {
      sentences.push(`Filler sentence number ${index} 这一句话只是为了让文件足够大 keeps the file large enough to matter for this test.`);
    }
    const source = `\\section{Large}\nAnother unique target sentence.\n\n${sentences.join("\n\n")}\n`;
    assert.ok(source.length < 120_000 && source.length > 100_000, String(source.length));
    await fs.writeFile(path.join(project.root, "sections", "large.tex"), source, "utf8");
    const created = await commentOn(server, "sections/large.tex", "Another unique target sentence.", "Tighten.", { contextMode: "local" });
    await apiOk(server, "/api/request/process", { method: "POST", body: { id: created.id } });
    await waitForRequest(server, created.id, (request) => request.status === "proposed", "large proposal");
    const run = await lastRun(project);
    assert.ok(run.stdinBytes > 131_072, `prompt was ${run.stdinBytes} bytes; it must exceed the Linux per-argument limit`);
  });

  it("answers a discussion and a chat turn through the same adapter", async () => {
    const created = await commentOn(server, "sections/01_introduction.tex", "Bright streets are also loud streets.", "Is this too blunt?", { responseMode: "discuss" });
    await apiOk(server, "/api/request/process", { method: "POST", body: { id: created.id } });
    const discussed = await waitForRequest(server, created.id, (request) => request.status === "discussed", "discussion");
    assert.equal(discussed.discussion.answer, "fake answer");

    const session = await apiOk(server, "/api/chat/message", { method: "POST", body: { message: "What is this paper about?" } });
    const answered = await waitFor(async () => {
      const current = await apiOk(server, `/api/chat?id=${session.id}`);
      if (current.status === "failed") throw new Error(current.error);
      return current.status === "idle" && current.messages.length === 2 ? current : null;
    }, { label: "chat answer" });
    assert.match(answered.messages[1].content, /^fake chat answer/);
    const run = await lastRun(project);
    assert.doesNotMatch(run.promptHead, /Codex/);
    assert.ok(!run.promptHead.includes(project.root));
  });

  it("reviews a section and cleans up after itself", async () => {
    const review = await apiOk(server, "/api/document/review", { method: "POST", body: { path: "sections/02_related_work.tex" } });
    assert.equal(review.summary, "fake review");
    assert.equal(review.findings.length, 1);
    // The server has a temp directory of its own; every run so far is finished.
    assert.deepEqual(await fs.readdir(server.tmpDir), [], "no temp directory of any run is left behind");
    const run = await lastRun(project);
    assert.match(run.promptHead, /in English/);
  });
});

describe("state files under concurrency", () => {
  let project;
  let server;
  before(async () => {
    project = await makeProject();
    server = await startServer(project.root);
  });
  after(cleanupAll);

  it("keeps every one of many simultaneous confirmations", async () => {
    const document = await getDocument(server, "sections/05_discussion.tex");
    const blocks = document.blocks.filter((block) => block.kind === "paragraph" && !block.hidden);
    const jobs = [];
    for (let index = 0; index < 24; index += 1) {
      const block = blocks[index % blocks.length];
      const start = index;
      jobs.push(api(server, "/api/confirm", {
        method: "POST",
        body: { path: document.path, etag: document.etag, blockIndex: block.index, blockId: block.id, start, end: start + 5 },
      }));
    }
    const results = await Promise.all(jobs);
    assert.deepEqual(results.map((result) => result.status), Array(24).fill(200), JSON.stringify(results.find((result) => !result.ok)?.value));
    const state = JSON.parse(await fs.readFile(path.join(project.root, stateDirectory, "state.json"), "utf8"));
    assert.equal(state.selections.length, 24);
    const undo = await apiOk(server, "/api/undo");
    assert.equal(undo.depth, 24);
    const leftovers = (await fs.readdir(path.join(project.root, stateDirectory))).filter((name) => name.endsWith(".tmp"));
    assert.deepEqual(leftovers, []);
  });

  it("keeps every one of many simultaneous comments and deletes", async () => {
    const document = await getDocument(server, "sections/01_introduction.tex");
    const block = document.blocks.find((item) => item.kind === "paragraph");
    const created = await Promise.all(Array.from({ length: 10 }, (_, index) => api(server, "/api/rewrite", {
      method: "POST",
      body: { path: document.path, etag: document.etag, blockIndex: block.index, blockId: block.id, start: index, end: index + 8, comment: `comment ${index}` },
    })));
    assert.ok(created.every((result) => result.status === 201));
    const deleted = await Promise.all(created.map((result) => api(server, "/api/request/delete", { method: "POST", body: { id: result.value.id } })));
    assert.ok(deleted.every((result) => result.status === 200));
    const requests = await apiOk(server, "/api/requests");
    assert.equal(requests.filter((request) => request.status === "deleted").length, 10);
  });
});

describe("agent answers that need care", () => {
  after(cleanupAll);

  it("drops words the agent echoed from just outside the selection", async () => {
    // Selection "loud streets" inside "…are also loud streets." A model tends to
    // return the word before it and the full stop after it as well.
    const project = await makeProject({ fakeAgent: true });
    const answer = JSON.stringify({ replacementText: "also noisy streets.", summary: "plainer", relatedChanges: [] });
    const server = await startServer(project.root, { env: { FAKE_AGENT_ANSWER: answer } });
    const file = path.join(project.root, "sections/01_introduction.tex");
    const before = await fs.readFile(file, "utf8");
    const created = await commentOn(server, "sections/01_introduction.tex", "loud streets", "Plainer.");
    await apiOk(server, "/api/request/process", { method: "POST", body: { id: created.id } });
    const proposed = await waitForRequest(server, created.id, (request) => request.status === "proposed", "proposal");
    assert.equal(proposed.proposal.replacementText, "noisy streets");
    await apiOk(server, "/api/request/accept", { method: "POST", body: { id: created.id } });
    assert.equal(await fs.readFile(file, "utf8"), before.replace("are also loud streets.", "are also noisy streets."));
  });

  it("keeps non-ASCII characters intact when the agent's output splits them across writes", async () => {
    const project = await makeProject({ fakeAgent: true });
    const server = await startServer(project.root, { env: { FAKE_AGENT_STDOUT: "trace: Café résumé\n" } });
    const created = await commentOn(server, "sections/01_introduction.tex", "loud streets", "Plainer.");
    await apiOk(server, "/api/request/process", { method: "POST", body: { id: created.id } });
    await waitForRequest(server, created.id, (request) => request.status === "proposed", "proposal");
    const runsRoot = path.join(project.root, stateDirectory, "runs");
    const [runDirectory] = await fs.readdir(runsRoot);
    const trace = await fs.readFile(path.join(runsRoot, runDirectory, "TRACE.log"), "utf8");
    assert.match(trace, /trace: Café résumé/);
    assert.doesNotMatch(trace, /�/);
  });

  it("keeps a word the replacement means to double", async () => {
    // The word before the selection opens the replacement, but the rest does
    // not line up with the selection, so it is not an echo of that word.
    const main = "\\documentclass{article}\n\\begin{document}\nHe argued that this claim was wrong from the start. The data we had collected were noisy.\n\\end{document}\n";
    for (const [needle, replacementText] of [["this claim was wrong", "that claim was overstated"], ["collected were noisy", "had to be cleaned"]]) {
      const project = await makeProject({ files: { "main.tex": main }, fakeAgent: true });
      const answer = JSON.stringify({ replacementText, summary: "reworded", relatedChanges: [] });
      const server = await startServer(project.root, { env: { FAKE_AGENT_ANSWER: answer } });
      const created = await commentOn(server, "main.tex", needle, "Reword.");
      await apiOk(server, "/api/request/process", { method: "POST", body: { id: created.id } });
      const proposed = await waitForRequest(server, created.id, (request) => request.status === "proposed", "proposal");
      assert.equal(proposed.proposal.replacementText, replacementText);
      await server.stop();
    }
  });

  it("still drops an echoed word when the replacement rewords the start of the selection", async () => {
    const main = "\\documentclass{article}\n\\begin{document}\nOverall this is very good work overall. We use the old approach here.\n\\end{document}\n";
    for (const [needle, replacementText, expected] of [["very good work", "is excellent work", "excellent work"], ["old approach", "the new method", "new method"]]) {
      const project = await makeProject({ files: { "main.tex": main }, fakeAgent: true });
      const answer = JSON.stringify({ replacementText, summary: "reworded", relatedChanges: [] });
      const server = await startServer(project.root, { env: { FAKE_AGENT_ANSWER: answer } });
      const created = await commentOn(server, "main.tex", needle, "Reword.");
      await apiOk(server, "/api/request/process", { method: "POST", body: { id: created.id } });
      const proposed = await waitForRequest(server, created.id, (request) => request.status === "proposed", "proposal");
      assert.equal(proposed.proposal.replacementText, expected);
      await server.stop();
    }
  });
});

describe("review progress after an accepted proposal", () => {
  after(cleanupAll);

  it("counts a block whose whole text was accepted as fully reviewed", async () => {
    // The abstract block starts with the newline after \begin{abstract}; that
    // character can never be selected and must not hold the section at 99%.
    const project = await makeProject({ fakeAgent: true });
    // A short abstract: in a long one the missing character is rounded away.
    const main = path.join(project.root, "main.tex");
    const source = await fs.readFile(main, "utf8");
    await fs.writeFile(main, source.replace(/(\\begin\{abstract\}\n)[\s\S]*?(\n\\end\{abstract\})/, "$1Urban songbirds are widely reported to sing early.$2"));
    const server = await startServer(project.root);
    const document = await getDocument(server, "main.tex");
    const block = document.blocks.find((item) => item.raw.includes("Urban songbirds are widely reported"));
    assert.match(block.raw, /^\s/, "the fixture's abstract block begins with white space");
    const created = await commentOn(server, "main.tex", block.raw.trim(), "Louder.");
    await apiOk(server, "/api/request/process", { method: "POST", body: { id: created.id } });
    await waitForRequest(server, created.id, (request) => request.status === "proposed", "proposal");
    await apiOk(server, "/api/request/accept", { method: "POST", body: { id: created.id } });
    const outline = await apiOk(server, "/api/outline");
    assert.equal(outline.items.find((item) => item.title === "Abstract").reviewedPercent, 100);
  });
});

describe("agent answers that change nothing", () => {
  after(cleanupAll);

  it("keeps the agent's reason when it returns the rest of the sentence and no change", async () => {
    // Half a sentence is selected; the agent answers with the whole, unchanged
    // sentence. Accepting that as written would repeat the second half.
    const project = await makeProject({ fakeAgent: true });
    const answer = JSON.stringify({ replacementText: "Bright streets are also loud streets.", summary: "The sentence is already fine.", relatedChanges: [] });
    const server = await startServer(project.root, { env: { FAKE_AGENT_ANSWER: answer } });
    const created = await commentOn(server, "sections/01_introduction.tex", "Bright streets are", "Is this fine?");
    await apiOk(server, "/api/request/process", { method: "POST", body: { id: created.id } });
    const failed = await waitFor(async () => {
      const request = (await apiOk(server, "/api/requests")).find((item) => item.id === created.id);
      return request?.agentStatus === "failed" ? request : null;
    }, { label: "no-change answer" });
    assert.equal(failed.status, "pending", "no proposal that would duplicate text is offered");
    assert.match(failed.agentError, /proposed no change: The sentence is already fine\./);
  });
});

describe("agent timeouts", () => {
  after(cleanupAll);

  it("reports a failed run as a short message, not as the tail of the CLI's trace", async () => {
    const reconnect = (n) => `2026-01-01T00:00:0${n}.000000Z ERROR codex_api::endpoint: failed to connect to websocket: URL error\nERROR: Reconnecting... ${n}/5`;
    const noise = [`user\n${"prompt echo ".repeat(400)}`, ...[1, 2, 3, 4, 5].map(reconnect), "ERROR: Reconnecting... waiting for network"].join("\n");
    const project = await makeProject({ fakeAgent: true, config: { agent: { timeoutMs: 1500 } } });
    const server = await startServer(project.root, { env: { FAKE_AGENT_SLEEP_MS: "60000", FAKE_AGENT_STDERR: noise } });
    const created = await commentOn(server, "sections/01_introduction.tex", "Bright streets are also loud streets.", "Tighten.");
    await apiOk(server, "/api/request/process", { method: "POST", body: { id: created.id } });
    const failed = await waitFor(async () => {
      const request = (await apiOk(server, "/api/requests")).find((item) => item.id === created.id);
      return request?.agentStatus === "failed" ? request : null;
    }, { label: "noisy timeout" });
    assert.match(failed.agentError, /^Codex rewrite timed out after 2 s\./, "the message leads with the timeout");
    assert.match(failed.agentError, /waiting for network/);
    assert.match(failed.agentError, /check the network connection or proxy, then Retry\.$/);
    assert.ok(failed.agentError.length < 900, `short enough to read (${failed.agentError.length})`);
    assert.equal(failed.agentError.match(/failed to connect to websocket/g).length, 1, "repeated log lines are shown once");
    assert.doesNotMatch(failed.agentError, /prompt echo|2026-01-01T/);
  });

  it("says what to do when the CLI is not signed in", async () => {
    const project = await makeProject({ fakeAgent: true });
    const server = await startServer(project.root, { env: { FAKE_AGENT_STDERR: "ERROR: unexpected status 401 Unauthorized: Missing bearer", FAKE_AGENT_EXIT: "1" } });
    const created = await commentOn(server, "sections/01_introduction.tex", "Bright streets are also loud streets.", "Tighten.");
    await apiOk(server, "/api/request/process", { method: "POST", body: { id: created.id } });
    const failed = await waitFor(async () => {
      const request = (await apiOk(server, "/api/requests")).find((item) => item.id === created.id);
      return request?.agentStatus === "failed" ? request : null;
    }, { label: "auth failure" });
    assert.match(failed.agentError, /401 Unauthorized/);
    assert.match(failed.agentError, /not signed in: sign in to its CLI/);
  });

  it("says to update a CLI that refuses one of the options", async () => {
    const project = await makeProject({ fakeAgent: true });
    const stderr = "error: unexpected argument '--ephemeral' found\n\nUsage: codex exec [OPTIONS] [PROMPT]\n\nFor more information, try '--help'.";
    const server = await startServer(project.root, { env: { FAKE_AGENT_STDERR: stderr, FAKE_AGENT_EXIT: "2" } });
    const created = await commentOn(server, "sections/01_introduction.tex", "Bright streets are also loud streets.", "Tighten.");
    await apiOk(server, "/api/request/process", { method: "POST", body: { id: created.id } });
    const failed = await waitFor(async () => {
      const request = (await apiOk(server, "/api/requests")).find((item) => item.id === created.id);
      return request?.agentStatus === "failed" ? request : null;
    }, { label: "argument failure" });
    assert.match(failed.agentError, /unexpected argument '--ephemeral'/);
    assert.match(failed.agentError, /update the CLI to its current version/);
  });

  it("names the provider, fails the run, and kills a child that ignores SIGTERM", async () => {
    // The timeout leaves a loaded machine time to start Node and install the
    // SIGTERM handler; the 60 s sleep stays far above it.
    const project = await makeProject({ fakeAgent: true, config: { agent: { timeoutMs: 2000 } } });
    const server = await startServer(project.root, { env: { FAKE_AGENT_SLEEP_MS: "60000", FAKE_AGENT_IGNORE_SIGTERM: "1" } });
    const created = await commentOn(server, "sections/01_introduction.tex", "Bright streets are also loud streets.", "Tighten.");
    await apiOk(server, "/api/request/process", { method: "POST", body: { id: created.id } });
    const failed = await waitFor(async () => {
      const request = (await apiOk(server, "/api/requests")).find((item) => item.id === created.id);
      return request?.agentStatus === "failed" ? request : null;
    }, { label: "timeout" });
    assert.match(failed.agentError, /Codex rewrite timed out after 2 s/);
    const { pid } = await startedRun(project);
    const isAlive = () => {
      try {
        process.kill(pid, 0);
        return true;
      } catch {
        return false;
      }
    };
    if (process.platform === "win32") {
      // Windows has no SIGTERM to ignore and no escalation: kill() ends the
      // server's direct child at once. Here that child is the cmd.exe behind
      // the .cmd shim, and the server signals nothing below it (see
      // useProcessGroups in server.mjs), so the fake agent itself is not
      // expected to be gone. End it, so it does not hold the temp folder open.
      try {
        process.kill(pid);
      } catch {
        // Already gone.
      }
      return;
    }
    assert.equal(isAlive(), true, "SIGTERM alone does not stop this child");
    await waitFor(() => !isAlive(), { timeoutMs: 9000, label: "SIGKILL escalation" });
  });
});

describe("agent process groups", { skip: process.platform === "win32" }, () => {
  after(cleanupAll);

  it("kills the helpers an agent started when the run times out", async () => {
    const project = await makeProject({ fakeAgent: true, config: { agent: { timeoutMs: 2000 } } });
    const server = await startServer(project.root, { env: { FAKE_AGENT_SLEEP_MS: "60000", FAKE_AGENT_GRANDCHILD: "1" } });
    const created = await commentOn(server, "sections/01_introduction.tex", "Bright streets are also loud streets.", "Tighten.");
    await apiOk(server, "/api/request/process", { method: "POST", body: { id: created.id } });
    await waitFor(async () => {
      const request = (await apiOk(server, "/api/requests")).find((item) => item.id === created.id);
      return request?.agentStatus === "failed" ? request : null;
    }, { label: "timeout" });
    const { pid, grandchildPid } = await startedRun(project);
    assert.ok(Number.isInteger(grandchildPid) && grandchildPid !== pid);
    const isAlive = (target) => {
      try {
        process.kill(target, 0);
        return true;
      } catch {
        return false;
      }
    };
    await waitFor(() => !isAlive(pid) && !isAlive(grandchildPid), { timeoutMs: 9000, label: "the agent and its grandchild to be gone" });
  });

  it("kills the helpers when the comment is deleted mid-run", async () => {
    const project = await makeProject({ fakeAgent: true });
    const server = await startServer(project.root, { env: { FAKE_AGENT_SLEEP_MS: "60000", FAKE_AGENT_GRANDCHILD: "1" } });
    const created = await commentOn(server, "sections/01_introduction.tex", "Bright streets are also loud streets.", "Tighten.");
    await apiOk(server, "/api/request/process", { method: "POST", body: { id: created.id } });
    const run = await waitFor(() => lastRun(project).catch(() => null), { label: "agent start" });
    await apiOk(server, "/api/request/delete", { method: "POST", body: { id: created.id } });
    const isAlive = (target) => {
      try {
        process.kill(target, 0);
        return true;
      } catch {
        return false;
      }
    };
    await waitFor(() => !isAlive(run.pid) && !isAlive(run.grandchildPid), { timeoutMs: 9000, label: "cancelled agent and grandchild to be gone" });
  });
});

describe("agent switch and terminology", () => {
  after(cleanupAll);

  it("honours agent.enabled and the legacy codex.enabled alias for every provider", async () => {
    for (const config of [{ agent: { enabled: false, provider: "claude" } }, { agent: { provider: "openrouter" }, codex: { enabled: false } }]) {
      const project = await makeProject({ config });
      const server = await startServer(project.root);
      const bootstrap = await apiOk(server, "/api/bootstrap");
      assert.equal(bootstrap.chat.enabled, false);
      assert.equal(bootstrap.agent.enabled, false);
      const chat = await api(server, "/api/chat/message", { method: "POST", body: { message: "hello" } });
      assert.equal(chat.status, 409);
      assert.match(chat.value.error, /agents are disabled/i);
      assert.doesNotMatch(chat.value.error, /Codex/);
      await server.stop();
    }
  });

  it("sends configured terminology files and only then mentions them", async () => {
    const project = await makeProject({ fakeAgent: true, config: { agent: { terminologyFiles: ["GLOSSARY.md"], reviewLanguage: "German" } } });
    await fs.writeFile(path.join(project.root, "GLOSSARY.md"), "Say \"dawn chorus\", never \"morning song\".\n", "utf8");
    const server = await startServer(project.root);
    const created = await commentOn(server, "sections/01_introduction.tex", "Bright streets are also loud streets.", "Tighten.");
    await apiOk(server, "/api/request/process", { method: "POST", body: { id: created.id } });
    await waitForRequest(server, created.id, (request) => request.status === "proposed", "proposal");
    let run = await lastRun(project);
    assert.equal(run.hasTerminology, true);
    assert.equal(run.mentionsTerminology, true);
    await apiOk(server, "/api/document/review", { method: "POST", body: { path: "sections/02_related_work.tex" } });
    run = await lastRun(project);
    assert.match(run.promptHead, /suggestion in German/);
  });
});

describe("agent queue and chat runs that overlap", () => {
  after(cleanupAll);

  it("runs a follow-up sent during a run again, without showing the first answer", async () => {
    const project = await makeProject({ fakeAgent: true });
    const server = await startServer(project.root, { env: { FAKE_AGENT_SLEEP_MS: "2000" } });
    const created = await commentOn(server, "sections/01_introduction.tex", "Bright streets are also loud streets.", "Make it bolder.");
    await apiOk(server, "/api/request/process", { method: "POST", body: { id: created.id } });
    const first = await waitFor(() => lastRun(project).catch(() => null), { label: "first run to start" });
    const followup = await api(server, "/api/request/followup", { method: "POST", body: { id: created.id, message: "Make it shorter instead." } });
    assert.equal(followup.status, 202);
    // The second run starts only after the first has ended; by then the first
    // answer must not have been attached to the comment.
    await waitFor(async () => (await lastRun(project).catch(() => first)).pid !== first.pid, { label: "second run to start" });
    const between = (await apiOk(server, "/api/requests")).find((item) => item.id === created.id);
    assert.equal(between.status, "pending");
    assert.deepEqual(between.conversation.map((message) => message.role), ["user", "user"]);
    // Wait for the end state itself: the proposal is attached one write before
    // the assistant message (status "proposed", agent "validating" in between).
    const proposed = await waitForRequest(server, created.id, (request) => request.status === "proposed" &&
      request.agentStatus === "complete", "proposal for the follow-up");
    assert.deepEqual(proposed.conversation.map((message) => message.role), ["user", "user", "assistant"]);
    const task = JSON.parse(await fs.readFile(path.join(project.root, stateDirectory, "runs", created.id, "TASK.json"), "utf8"));
    assert.deepEqual(task.conversation.map((message) => message.content), ["Make it bolder.", "Make it shorter instead."]);
  });

  it("answers a chat message sent right after Stop with a run of its own", async () => {
    // With FAKE_AGENT_IGNORE_SIGTERM the stopped child lives on and answers;
    // without it, it dies and leaves its stderr. Neither may reach the chat.
    for (const ignoreSigterm of [false, true]) {
      const project = await makeProject({ fakeAgent: true });
      const env = { FAKE_AGENT_SLEEP_MS: "2500", ...(ignoreSigterm ? { FAKE_AGENT_IGNORE_SIGTERM: "1" } : {}) };
      const server = await startServer(project.root, { env });
      const session = await apiOk(server, "/api/chat/message", { method: "POST", body: { message: "first question" } });
      const first = await waitFor(() => lastRun(project).catch(() => null), { label: "first chat run to start" });
      await apiOk(server, "/api/chat/stop", { method: "POST", body: { sessionId: session.id } });
      await apiOk(server, "/api/chat/message", { method: "POST", body: { sessionId: session.id, message: "second question" } });
      // chatConcurrency is 1: the new run starts only once the stopped child is gone.
      await waitFor(async () => (await lastRun(project).catch(() => first)).pid !== first.pid, { label: "second chat run to start" });
      if (process.platform !== "win32") {
        assert.throws(() => process.kill(first.pid, 0), "the stopped child exited before the next run started");
      }
      const answered = await waitFor(async () => {
        const current = await apiOk(server, `/api/chat?id=${session.id}`);
        return ["idle", "failed"].includes(current.status) ? current : null;
      }, { label: "chat to settle" });
      assert.equal(answered.status, "idle", answered.error);
      assert.deepEqual(answered.messages.map((message) => message.role), ["user", "user", "assistant"]);
      const second = await lastRun(project);
      assert.notEqual(second.pid, first.pid, "the second message got a run of its own");
      assert.equal(answered.messages[2].content, `fake chat answer (${second.stdinChars} prompt characters)`);
      await server.stop();
    }
  });

  it("lists a chat that finished after it was selected as finished", async () => {
    const project = await makeProject({ fakeAgent: true });
    const server = await startServer(project.root, { env: { FAKE_AGENT_SLEEP_MS: "1500" } });
    const first = await apiOk(server, "/api/chat/message", { method: "POST", body: { message: "question in the first chat" } });
    await waitFor(() => lastRun(project).catch(() => null), { label: "chat run to start" });
    // Opening another chat archives the running one; selecting it again
    // brings it back while its run is still going.
    await apiOk(server, "/api/chat/new", { method: "POST" });
    await apiOk(server, "/api/chat/select", { method: "POST", body: { id: first.id } });
    await waitFor(async () => {
      const current = await apiOk(server, `/api/chat?id=${first.id}`);
      if (current.status === "failed") throw new Error(current.error);
      return current.status === "idle" && current.messages.length === 2;
    }, { label: "chat answer" });
    for (let index = 0; index < 2; index += 1) {
      const listed = (await apiOk(server, "/api/chats")).find((item) => item.id === first.id);
      assert.equal(listed.status, "idle");
      assert.equal(listed.messageCount, 2);
    }
  });

  it("updates or adds linked comments when the link search runs again", async () => {
    const target = "Traffic noise peaks during the morning rush";
    const linkAnswer = (comment) => JSON.stringify({ summary: "one other place", targets: [{ path: "sections/01_introduction.tex", selectedText: target, comment, reason: "It repeats the claim." }] });
    const project = await makeProject({ fakeAgent: true });
    // A fixed answer per server: restarting it lets each search return a new instruction.
    const search = async (comment, action) => {
      const server = await startServer(project.root, { env: { FAKE_AGENT_ANSWER: linkAnswer(comment) } });
      const searches = (request) => (request?.conversation || []).filter((message) => message.kind === "link").length;
      const before = searches((await apiOk(server, "/api/requests")).find((item) => item.id === source?.id));
      await action(server);
      const searched = await waitForRequest(server, source.id, (request) => request.status === "discussed" && searches(request) === before + 1, "link search");
      const linked = (await apiOk(server, "/api/requests")).filter((item) => item.origin?.type === "linked-comment" && item.status === "pending");
      return { server, searched, linked };
    };
    let source = null;
    let { server, searched, linked } = await search("Check this too.", async (current) => {
      source = await commentOn(current, "sections/01_introduction.tex", "Bright streets are also loud streets.", "Remove this claim.", { responseMode: "link" });
      await apiOk(current, "/api/request/process", { method: "POST", body: { id: source.id } });
    });
    assert.equal(linked.length, 1);
    const firstLink = linked[0];
    await server.stop();

    // Not worked on yet: the same comment takes the new instruction.
    ({ server, searched, linked } = await search("Delete the sentence.", (current) =>
      apiOk(current, "/api/request/followup", { method: "POST", body: { id: source.id, message: "Look again." } })));
    assert.deepEqual(linked.map((item) => [item.id, item.comment]), [[firstLink.id, "Delete the sentence."]]);
    assert.deepEqual(searched.links, [firstLink.id]);
    assert.deepEqual(searched.linkSearch.located.map((item) => item.id), [firstLink.id]);
    // The author follows up on the linked comment; the agent (answering with
    // the link-search JSON) fails, but the thread now carries the author's words.
    await apiOk(server, "/api/request/followup", { method: "POST", body: { id: firstLink.id, message: "Only the second half." } });
    await waitFor(async () => (await apiOk(server, "/api/requests")).find((item) => item.id === firstLink.id)?.agentStatus === "failed", { label: "linked comment run" });
    await server.stop();

    // Worked on: it keeps its thread, and the new instruction gets its own comment.
    ({ server, searched, linked } = await search("Move it to the discussion.", (current) =>
      apiOk(current, "/api/request/followup", { method: "POST", body: { id: source.id, message: "Once more." } })));
    const kept = linked.find((item) => item.id === firstLink.id);
    assert.equal(kept.comment, "Delete the sentence.");
    assert.equal(kept.conversation.at(-1).content, "Only the second half.");
    const added = linked.find((item) => item.id !== firstLink.id);
    assert.equal(added.comment, "Move it to the discussion.");
    assert.equal(added.selectedText, target);
    assert.deepEqual(searched.links, [firstLink.id, added.id]);
    assert.deepEqual(searched.linkSearch.located.map((item) => item.id), [added.id]);
  });

  it("answers a plain follow-up sent during a unit revision with the whole new answer", async () => {
    const project = await makeProject({ fakeAgent: true });
    let server = await startServer(project.root);
    const needle = "Bright streets are also loud streets.";
    const created = await commentOn(server, "sections/01_introduction.tex", needle, "Louder.");
    await apiOk(server, "/api/request/process", { method: "POST", body: { id: created.id } });
    await waitForRequest(server, created.id, (request) => request.status === "proposed", "proposal");
    await server.stop();
    // Make it a grouped (structure) proposal of two units, as a structure plan would.
    const requestFile = path.join(project.root, stateDirectory, "requests", `${created.id}.json`);
    const stored = JSON.parse(await fs.readFile(requestFile, "utf8"));
    stored.origin = { type: "structure" };
    stored.proposal.replacementText = "First unit.\n\nSecond unit.";
    await fs.writeFile(requestFile, `${JSON.stringify(stored, null, 2)}\n`);
    server = await startServer(project.root, { env: { FAKE_AGENT_SLEEP_MS: "1500" } });
    const grouped = (await apiOk(server, "/api/requests")).find((item) => item.id === created.id);
    assert.equal(grouped.proposal.reviewUnits.length, 2);
    const before = await lastRun(project);
    await apiOk(server, "/api/request/followup", { method: "POST", body: { id: created.id, unitId: grouped.proposal.reviewUnits[0].id, message: "Shorter." } });
    await waitFor(async () => (await lastRun(project).catch(() => before)).pid !== before.pid, { label: "unit revision to start" });
    await apiOk(server, "/api/request/followup", { method: "POST", body: { id: created.id, message: "Start again from the source." } });
    const proposed = await waitForRequest(server, created.id, (request) => request.status === "proposed" &&
      request.conversation.at(-1).role === "assistant", "proposal for the plain follow-up");
    // The agent upper-cases the selection: a whole answer, not one unit spliced into the old two.
    assert.equal(proposed.proposal.replacementText, needle.toUpperCase());
    assert.equal(proposed.pendingUnitRevision, undefined);
  });

  it("leaves no temp directory behind when a run fails before the agent starts", async () => {
    const project = await makeProject({ fakeAgent: true });
    const server = await startServer(project.root, { privateTmp: true });
    const needle = "Bright streets are also loud streets.";
    const created = await commentOn(server, "sections/01_introduction.tex", needle, "Tighten.");
    // The passage is gone by the time the run reads the request.
    const file = path.join(project.root, "sections", "01_introduction.tex");
    await fs.writeFile(file, (await fs.readFile(file, "utf8")).replace(needle, "Rewritten elsewhere."));
    await apiOk(server, "/api/request/process", { method: "POST", body: { id: created.id } });
    await waitFor(async () => (await apiOk(server, "/api/requests")).find((item) => item.id === created.id)?.agentStatus === "failed", { label: "failed run" });
    assert.deepEqual(await fs.readdir(server.tmpDir), []);
  });
});

describe("linked change sets with several changes in one file", () => {
  const MAIN = "\\documentclass{article}\n\\begin{document}\n\\input{sec}\n\\input{other}\nMain body paragraph here.\n\\end{document}\n";
  const SEC = "Alpha opens the study.\n\nBeta opens the result.\n\nGamma paragraph to edit by link.\n";
  const OTHER = "Other paragraph to change.\n";
  let project;
  let server;

  before(async () => {
    project = await makeProject({ files: { "main.tex": MAIN, "sec.tex": SEC, "other.tex": OTHER }, fakeAgent: true });
    server = await startServer(project.root);
  });
  after(cleanupAll);

  async function resetSources() {
    await Promise.all([["main.tex", MAIN], ["sec.tex", SEC], ["other.tex", OTHER]]
      .map(([name, text]) => fs.writeFile(path.join(project.root, name), text, "utf8")));
  }

  // The agent attaches at most one related change per file, so a set with
  // several changes in one file is written into the stored request, as an
  // older request or two spellings of one file can leave it.
  async function proposeSet(primary, changes) {
    const created = await commentOn(server, primary.path, primary.selectedText, "Shorten this.");
    await apiOk(server, "/api/request/process", { method: "POST", body: { id: created.id } });
    await waitForRequest(server, created.id, (request) => request.status === "proposed", "proposal");
    const requestFile = path.join(project.root, stateDirectory, "requests", `${created.id}.json`);
    const stored = JSON.parse(await fs.readFile(requestFile, "utf8"));
    stored.proposal.replacementText = primary.replacementText;
    stored.proposal.primaryReviewStatus = "confirmed";
    stored.proposal.linkedChanges = [];
    for (const [index, change] of changes.entries()) {
      const document = await getDocument(server, change.path);
      const absoluteStart = document.source.indexOf(change.selectedText);
      assert.ok(absoluteStart >= 0, `${change.path} contains ${change.selectedText}`);
      stored.proposal.linkedChanges.push({
        id: `linked_${index + 1}`, path: change.path, status: "confirmed", required: true, summary: "test", reason: "test",
        sourceEtag: document.etag, absoluteStart, absoluteEnd: absoluteStart + change.selectedText.length,
        selectedText: change.selectedText, replacementText: change.replacementText,
      });
    }
    await fs.writeFile(requestFile, JSON.stringify(stored), "utf8");
    return created.id;
  }

  const read = (name) => fs.readFile(path.join(project.root, name), "utf8");

  for (const scenario of [
    {
      name: "two changes in one file and a primary in another",
      primary: { path: "main.tex", selectedText: "Main body paragraph here.", replacementText: "Main." },
      changes: [
        { path: "sec.tex", selectedText: "Gamma paragraph to edit by link.", replacementText: "G." },
        { path: "sec.tex", selectedText: "Alpha opens the study.", replacementText: "A." },
      ],
      expected: { "sec.tex": "A.\n\nBeta opens the result.\n\nG.\n", "main.tex": MAIN.replace("Main body paragraph here.", "Main.") },
    },
    {
      name: "three changes in one file and one in a second file",
      primary: { path: "sec.tex", selectedText: "Beta opens the result.", replacementText: "B." },
      changes: [
        { path: "sec.tex", selectedText: "Gamma paragraph to edit by link.", replacementText: "G." },
        { path: "other.tex", selectedText: "Other paragraph to change.", replacementText: "O." },
        { path: "sec.tex", selectedText: "Alpha opens the study.", replacementText: "A." },
      ],
      expected: { "sec.tex": "A.\n\nB.\n\nG.\n", "other.tex": "O.\n" },
    },
  ]) {
    it(`applies every change of a set with ${scenario.name}, and Undo restores every file`, async () => {
      await resetSources();
      const id = await proposeSet(scenario.primary, scenario.changes);
      const applied = await api(server, "/api/request/apply-linked", { method: "POST", body: { id } });
      assert.equal(applied.status, 200, applied.value?.error);
      for (const [name, text] of Object.entries(scenario.expected)) assert.equal(await read(name), text, name);
      assert.equal((await apiOk(server, "/api/undo")).available, true);

      const undone = await api(server, "/api/undo", { method: "POST" });
      assert.equal(undone.status, 200, undone.value?.error);
      assert.equal(await read("main.tex"), MAIN);
      assert.equal(await read("sec.tex"), SEC);
      assert.equal(await read("other.tex"), OTHER);
      const request = (await apiOk(server, "/api/requests")).find((item) => item.id === id);
      assert.equal(request.status, "proposed");
      await apiOk(server, "/api/request/reject", { method: "POST", body: { id } });
    });
  }

  it("applies a set whose changes name one file by two spellings", async (t) => {
    await resetSources();
    if (!(await trySymlink("sec.tex", path.join(project.root, "alias.tex"), "file"))) {
      t.skip("symlinks are not available here");
      return;
    }
    try {
      const id = await proposeSet(
        { path: "sec.tex", selectedText: "Beta opens the result.", replacementText: "B." },
        [{ path: "alias.tex", selectedText: "Gamma paragraph to edit by link.", replacementText: "G." }],
      );
      const applied = await api(server, "/api/request/apply-linked", { method: "POST", body: { id } });
      assert.equal(applied.status, 200, applied.value?.error);
      assert.equal(await read("sec.tex"), "Alpha opens the study.\n\nB.\n\nG.\n");
      const undone = await api(server, "/api/undo", { method: "POST" });
      assert.equal(undone.status, 200, undone.value?.error);
      assert.equal(await read("sec.tex"), SEC);
      await apiOk(server, "/api/request/reject", { method: "POST", body: { id } });
    } finally {
      await fs.rm(path.join(project.root, "alias.tex"), { force: true });
    }
  });

  it("refuses a set whose changes in one file overlap, and writes nothing", async () => {
    await resetSources();
    const id = await proposeSet(
      { path: "sec.tex", selectedText: "Beta opens the result.", replacementText: "B." },
      [
        { path: "other.tex", selectedText: "Other paragraph to change.", replacementText: "O." },
        { path: "sec.tex", selectedText: "opens the result.", replacementText: "ends." },
      ],
    );
    const applied = await api(server, "/api/request/apply-linked", { method: "POST", body: { id } });
    assert.equal(applied.status, 400);
    assert.match(applied.value.error, /overlap/);
    assert.equal(await read("sec.tex"), SEC);
    assert.equal(await read("other.tex"), OTHER);
    assert.equal((await apiOk(server, "/api/undo")).available, false);
    await apiOk(server, "/api/request/reject", { method: "POST", body: { id } });
  });

  it("does not attach a related change that reaches the commented file through a symlink", async (t) => {
    const aliased = await makeProject({ files: { "main.tex": MAIN, "sec.tex": SEC, "other.tex": OTHER }, fakeAgent: true });
    if (!(await trySymlink("sec.tex", path.join(aliased.root, "alias.tex"), "file"))) {
      t.skip("symlinks are not available here");
      return;
    }
    const answer = JSON.stringify({
      replacementText: "B.",
      summary: "test",
      relatedChanges: [{ path: "alias.tex", selectedText: "Gamma paragraph to edit by link.", replacementText: "G.", summary: "test", reason: "test", required: true }],
    });
    const aliasedServer = await startServer(aliased.root, { env: { FAKE_AGENT_ANSWER: answer } });
    const created = await commentOn(aliasedServer, "sec.tex", "Beta opens the result.", "Shorten this.");
    await apiOk(aliasedServer, "/api/request/process", { method: "POST", body: { id: created.id } });
    const proposed = await waitForRequest(aliasedServer, created.id, (request) => request.status === "proposed", "proposal");
    assert.deepEqual(proposed.proposal.linkedChanges ?? [], []);
    assert.match(proposed.proposal.linkedWarnings.join("\n"), /different file/);
  });
});
