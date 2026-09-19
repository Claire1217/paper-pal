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

if (process.env.FAKE_AGENT_IGNORE_SIGTERM) process.on("SIGTERM", () => {});

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

// Stands in for the helper processes a real agent CLI starts (shells, MCP
// servers): a long sleep that survives unless the whole process group is killed.
let grandchildPid = null;
if (process.env.FAKE_AGENT_GRANDCHILD) {
  const grandchild = spawn(process.execPath, ["-e", "process.on('SIGTERM', () => {}); setTimeout(() => {}, 120000)"], { stdio: "ignore" });
  grandchildPid = grandchild.pid;
}

const logRoot = path.join(process.cwd(), ".fake-agent");
mkdirSync(logRoot, { recursive: true });
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
process.stderr.write(`fake-agent instruction: ${task?.instruction ?? ""}\n`);

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
if (outputPath) writeFileSync(outputPath, answer);
else process.stdout.write(answer);
