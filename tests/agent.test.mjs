import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { api, apiOk, cleanupAll, commentOn, getDocument, makeProject, startServer, stateDirectory, waitFor, waitForRequest } from "./helpers.mjs";

const SECRET = "sk-test-DO-NOT-LEAK-0123456789";

async function lastRun(project) {
  return JSON.parse(await fs.readFile(path.join(project.root, ".fake-agent", "last-run.json"), "utf8"));
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

describe("agent timeouts", () => {
  after(cleanupAll);

  it("names the provider, fails the run, and kills a child that ignores SIGTERM", async () => {
    const project = await makeProject({ fakeAgent: true, config: { agent: { timeoutMs: 600 } } });
    const server = await startServer(project.root, { env: { FAKE_AGENT_SLEEP_MS: "60000", FAKE_AGENT_IGNORE_SIGTERM: "1" } });
    const created = await commentOn(server, "sections/01_introduction.tex", "Bright streets are also loud streets.", "Tighten.");
    await apiOk(server, "/api/request/process", { method: "POST", body: { id: created.id } });
    const failed = await waitFor(async () => {
      const request = (await apiOk(server, "/api/requests")).find((item) => item.id === created.id);
      return request?.agentStatus === "failed" ? request : null;
    }, { label: "timeout" });
    assert.match(failed.agentError, /Codex rewrite timed out after 600 ms/);
    const { pid } = await lastRun(project);
    const isAlive = () => {
      try {
        process.kill(pid, 0);
        return true;
      } catch {
        return false;
      }
    };
    assert.equal(isAlive(), true, "SIGTERM alone does not stop this child");
    await waitFor(() => !isAlive(), { timeoutMs: 9000, label: "SIGKILL escalation" });
  });
});

describe("agent process groups", { skip: process.platform === "win32" }, () => {
  after(cleanupAll);

  it("kills the helpers an agent started when the run times out", async () => {
    const project = await makeProject({ fakeAgent: true, config: { agent: { timeoutMs: 800 } } });
    const server = await startServer(project.root, { env: { FAKE_AGENT_SLEEP_MS: "60000", FAKE_AGENT_GRANDCHILD: "1" } });
    const created = await commentOn(server, "sections/01_introduction.tex", "Bright streets are also loud streets.", "Tighten.");
    await apiOk(server, "/api/request/process", { method: "POST", body: { id: created.id } });
    await waitFor(async () => {
      const request = (await apiOk(server, "/api/requests")).find((item) => item.id === created.id);
      return request?.agentStatus === "failed" ? request : null;
    }, { label: "timeout" });
    const { pid, grandchildPid } = await lastRun(project);
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
