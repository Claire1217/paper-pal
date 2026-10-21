#!/usr/bin/env node
// A stand-in for an agent CLI, used only by the test suite. It honours the
// Codex-shaped contract the server relies on: the prompt arrives on stdin and
// the final message is written to the file named by --output-last-message.
// No model is involved: the "rewrite" upper-cases the selected text.
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const argv = process.argv.slice(2);
const option = (name) => {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : null;
};

// FAKE_AGENT_STARTUP_DELAY_MS imitates a slow start (a loaded machine) before
// any of the setup below has run.
if (process.env.FAKE_AGENT_STARTUP_DELAY_MS) {
  await new Promise((resolve) => setTimeout(resolve, Number(process.env.FAKE_AGENT_STARTUP_DELAY_MS)));
}

if (process.env.FAKE_AGENT_IGNORE_SIGTERM) process.on("SIGTERM", () => {});

// Stands in for the helper processes a real agent CLI starts (shells, MCP
// servers): a long sleep that survives unless the whole process group is killed.
let grandchildPid = null;
if (process.env.FAKE_AGENT_GRANDCHILD) {
  const grandchild = spawn(process.execPath, ["-e", "process.on('SIGTERM', () => {}); setTimeout(() => {}, 120000)"], { stdio: "ignore" });
  grandchildPid = grandchild.pid;
}

// Written as soon as the SIGTERM handler and the helper exist, before stdin is
// read: a test that times the run out early still learns which processes to
// check, even if the kill arrives before last-run.json is written.
const logRoot = path.join(process.cwd(), ".fake-agent");
mkdirSync(logRoot, { recursive: true });
writeFileSync(path.join(logRoot, "started.json"), JSON.stringify({ pid: process.pid, grandchildPid }));

const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
const prompt = Buffer.concat(chunks).toString("utf8");
const outputPath = option("--output-last-message");
const schemaPath = option("--output-schema");

let task = null;
try {
  task = JSON.parse(prompt.slice(prompt.lastIndexOf("\n") + 1));
} catch {
  // Chat prompts do not end in a task object.
}

writeFileSync(path.join(logRoot, "last-run.json"), JSON.stringify({
  stdinChars: prompt.length,
  stdinBytes: Buffer.byteLength(prompt),
  argvBytes: Buffer.byteLength(argv.join(" ")),
  promptInArgv: argv.some((value) => value.length > 2000),
  usesStdinMarker: argv.at(-1) === "-",
  openrouterKeyVisible: Boolean(process.env.OPENROUTER_API_KEY),
  paperPalKeyVisible: Boolean(process.env.PAPER_PAL_TEST_KEY),
  keyVariablesVisible: Object.keys(process.env).filter((name) => /_API_KEY$|^PAPER_PAL_.*KEY$/.test(name)).sort(),
  readAllowed: task?.repository?.readAllowed ?? null,
  grandchildPid,
  repositoryRoot: task?.repository?.root ?? null,
  hasTerminology: Boolean(task?.terminology),
  mentionsTerminology: /task\.terminology/.test(prompt.slice(0, prompt.lastIndexOf("\n"))),
  promptHead: prompt.slice(0, 4000),
  taskType: task?.taskType ?? null,
  pid: process.pid,
}, null, 2));

// Echo the instruction so the test can check that traces are redacted.
// FAKE_AGENT_NO_ECHO=1 leaves it out, so FAKE_AGENT_STDERR is the whole trace.
if (!process.env.FAKE_AGENT_NO_ECHO) process.stderr.write(`fake-agent instruction: ${task?.instruction ?? ""}\n`);

// A real CLI traces on stderr: the echoed prompt, then timestamped log lines.
// FAKE_AGENT_STDERR_SPLIT=1 writes it in two parts, cut in the middle of its
// first line, so the server reads that line in two chunks.
if (process.env.FAKE_AGENT_STDERR && process.env.FAKE_AGENT_STDERR_SPLIT) {
  const text = `${process.env.FAKE_AGENT_STDERR}\n`;
  const cut = Math.max(1, Math.floor(text.indexOf("\n") / 2));
  process.stderr.write(text.slice(0, cut));
  await new Promise((resolve) => setTimeout(resolve, 150));
  process.stderr.write(text.slice(cut));
} else if (process.env.FAKE_AGENT_STDERR) process.stderr.write(`${process.env.FAKE_AGENT_STDERR}\n`);
// FAKE_AGENT_STDERR_FILL=<n> follows it with n characters of neutral log
// lines, so that the server's stderr cap cuts FAKE_AGENT_STDERR at a known point.
if (process.env.FAKE_AGENT_STDERR_FILL) {
  process.stderr.write("trace: idle\n".repeat(Number(process.env.FAKE_AGENT_STDERR_FILL) / 12 + 1).slice(0, Number(process.env.FAKE_AGENT_STDERR_FILL)));
}

// FAKE_AGENT_STDOUT is traced on stdout in two writes, cut inside its first
// multi-byte character, so the server reads that character in two chunks.
if (process.env.FAKE_AGENT_STDOUT) {
  const bytes = Buffer.from(process.env.FAKE_AGENT_STDOUT, "utf8");
  const cut = bytes.findIndex((byte) => byte >= 0x80) + 1 || 1;
  process.stdout.write(bytes.subarray(0, cut));
  await new Promise((resolve) => setTimeout(resolve, 150));
  process.stdout.write(bytes.subarray(cut));
}

if (process.env.FAKE_AGENT_SLEEP_MS) {
  await new Promise((resolve) => setTimeout(resolve, Number(process.env.FAKE_AGENT_SLEEP_MS)));
}

let answer;
if (!schemaPath) {
  answer = `fake chat answer (${prompt.length} prompt characters)`;
} else if (task?.taskType === "paper_section_review") {
  const anchor = task.document.source.match(/[A-Z][a-z]+(?: [a-z]+){4,}/)?.[0] || "";
  answer = JSON.stringify({
    summary: "fake review",
    findings: anchor ? [{ selectedText: anchor, level: "sentence", principle: "test", issue: "test issue", suggestion: "test suggestion" }] : [],
  });
} else if (task?.responseMode === "discuss") {
  answer = JSON.stringify({
    answer: "fake answer", recommendation: "fake recommendation", claimRisk: "low",
    options: [{ label: "A", wording: "first" }, { label: "B", wording: "second" }],
  });
} else if (task?.responseMode === "link") {
  answer = JSON.stringify({ summary: "nothing else is affected", targets: [] });
} else {
  answer = JSON.stringify({
    replacementText: String(task?.target?.selectedText ?? "").toUpperCase(),
    summary: `fake rewrite; stdin=${prompt.length}`,
    relatedChanges: [],
  });
}
// FAKE_AGENT_ANSWER replaces the final message (malformed or unexpected output).
if (process.env.FAKE_AGENT_ANSWER !== undefined) answer = process.env.FAKE_AGENT_ANSWER;
if (outputPath) writeFileSync(outputPath, answer);
else process.stdout.write(answer);
if (process.env.FAKE_AGENT_EXIT) process.exitCode = Number(process.env.FAKE_AGENT_EXIT);
