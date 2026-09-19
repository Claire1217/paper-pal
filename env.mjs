// A small .env reader. Paper Pal loads exactly one file, <appRoot>/.env, at the
// start of the server, doctor and setup. The project directory is never
// searched: a manuscript repository is often shared, and keys do not belong
// in it.
//
// Supported syntax: KEY=VALUE, optional "export " prefix, single or double
// quotes (double quotes understand \n, \r, \t, \\ and \"), blank lines, full
// line "# comments" and trailing " # comments" after an unquoted value.
// Variables already present in the environment are never overridden.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const linePattern = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_.-]*)\s*=\s*(.*)$/;

export function parseEnv(text) {
  const values = {};
  for (const rawLine of String(text ?? "").replace(/^\uFEFF/, "").split(/\r?\n/)) {
    if (!rawLine.trim() || rawLine.trimStart().startsWith("#")) continue;
    const match = rawLine.match(linePattern);
    if (!match) continue;
    const [, name, rest] = match;
    let value = rest.trim();
    if (value.startsWith('"')) {
      const closing = value.match(/^"((?:[^"\\]|\\.)*)"/);
      value = closing
        ? closing[1].replace(/\\([nrt"\\])/g, (_all, character) => ({ n: "\n", r: "\r", t: "\t", '"': '"', "\\": "\\" })[character])
        : value.slice(1);
    } else if (value.startsWith("'")) {
      const closing = value.match(/^'([^']*)'/);
      value = closing ? closing[1] : value.slice(1);
    } else {
      value = value.replace(/\s+#.*$/, "").trim();
    }
    values[name] = value;
  }
  return values;
}

/**
 * Load <appRoot>/.env into `env` without overriding anything already set.
 * Returns { path, loaded: [names applied], skipped: [names already set] }.
 * A missing file is not an error.
 */
export function loadEnvFile(appRoot, env = process.env) {
  // PAPER_PAL_ENV_FILE (shell only): another file, or "none" to load nothing.
  const override = String(env.PAPER_PAL_ENV_FILE || "").trim();
  const target = override && override.toLowerCase() !== "none" ? path.resolve(override) : path.join(appRoot, ".env");
  const report = { path: target, exists: false, loaded: [], skipped: [] };
  if (override.toLowerCase() === "none" || !existsSync(target)) return report;
  report.exists = true;
  let parsed;
  try {
    parsed = parseEnv(readFileSync(target, "utf8"));
  } catch (error) {
    report.error = error.message;
    return report;
  }
  for (const [name, value] of Object.entries(parsed)) {
    if (env[name] !== undefined && env[name] !== "") {
      report.skipped.push(name);
      continue;
    }
    if (value === "") continue;
    env[name] = value;
    report.loaded.push(name);
  }
  return report;
}
