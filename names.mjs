// Every name Paper Pal puts on disk or reads from the environment lives here,
// together with the fallbacks to the names used before the project was renamed
// (it started life as "draft-review"). New names always win; an old name is
// used only when the new one is absent, so existing projects keep working
// without a migration step. Setup writes only the new names.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const APP_ROOT = path.dirname(fileURLToPath(import.meta.url));
export const APP_ID = "paper-pal";
export const APP_NAME = "Paper Pal";
export const APP_URL = "https://github.com/claire1217/paper-pal";

// Project configuration file (usually committed with the manuscript).
export const CONFIG_NAME = ".paper-pal.json";
export const LEGACY_CONFIG_NAME = ".draft-review.json";
// Per-project state directory (never committed).
export const STATE_DIR_NAME = ".paper-pal";
export const LEGACY_STATE_DIR_NAME = ".draft-review";
// App-local pointer to the project remembered by setup.
export const LOCAL_POINTER_NAME = "paper-pal.local.json";
export const LEGACY_LOCAL_POINTER_NAME = "review.local.json";
// Prefix of every temporary file and directory.
export const TEMP_PREFIX = "paper-pal-";

export const ENV = {
  host: "PAPER_PAL_HOST",
  legacyHost: "DRAFT_REVIEW_HOST",
  port: "PAPER_PAL_PORT",
  customBaseUrl: "PAPER_PAL_API_BASE_URL",
  customKey: "PAPER_PAL_API_KEY",
  allowCustomLatex: "PAPER_PAL_ALLOW_CUSTOM_LATEX",
  allowCustomCommands: "PAPER_PAL_ALLOW_CUSTOM_COMMANDS",
};

/** Path of the project configuration: the new name, else the old one if only that exists. */
export function resolveConfigPath(repoRoot) {
  const current = path.join(repoRoot, CONFIG_NAME);
  if (existsSync(current)) return current;
  const legacy = path.join(repoRoot, LEGACY_CONFIG_NAME);
  return existsSync(legacy) ? legacy : current;
}

/** State directory: the new name, unless only the old directory exists. */
export function resolveStateDir(repoRoot) {
  const current = path.join(repoRoot, STATE_DIR_NAME);
  if (existsSync(current)) return current;
  const legacy = path.join(repoRoot, LEGACY_STATE_DIR_NAME);
  return existsSync(legacy) ? legacy : current;
}

/** Remembered-project pointer in the app checkout, or null when there is none. */
export function resolveLocalPointer(appRoot = APP_ROOT) {
  for (const name of [LOCAL_POINTER_NAME, LEGACY_LOCAL_POINTER_NAME]) {
    const target = path.join(appRoot, name);
    if (existsSync(target)) return target;
  }
  return null;
}

/** Bind address. Only app-specific variables count; a generic HOST is ignored. */
export function hostFromEnvironment(env = process.env) {
  return env[ENV.host] || env[ENV.legacyHost] || "127.0.0.1";
}

export function truthyEnv(value) {
  return /^(1|true|yes|on)$/i.test(String(value || "").trim());
}

let cachedVersion = null;
export function appVersion() {
  if (cachedVersion) return cachedVersion;
  try {
    cachedVersion = String(JSON.parse(readFileSync(path.join(APP_ROOT, "package.json"), "utf8")).version || "0.0.0");
  } catch {
    cachedVersion = "0.0.0";
  }
  return cachedVersion;
}
