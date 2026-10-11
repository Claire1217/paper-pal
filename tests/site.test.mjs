import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, promises as fs } from "node:fs";
import path from "node:path";
import { after, describe, it } from "node:test";
import { appRoot, cleanupAll, makeTempDir } from "./helpers.mjs";
import { faqProblems, jsonLd, withVersion } from "../scripts/pages.mjs";

after(cleanupAll);

const read = (relative) => fs.readFile(path.join(appRoot, relative), "utf8");

describe("landing page", () => {
  it("builds with the package version, parseable JSON-LD and every file it references", async () => {
    const out = path.join(await makeTempDir(), "site");
    const result = spawnSync(process.execPath, [path.join(appRoot, "scripts", "pages.mjs"), out], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    const pkg = JSON.parse(await read("package.json"));
    const html = await fs.readFile(path.join(out, "index.html"), "utf8");
    const software = jsonLd(html).find((item) => [].concat(item["@type"]).includes("SoftwareApplication"));
    assert.equal(software.softwareVersion, pkg.version);
    assert.equal(software.name, "Paper Pal");
    assert.ok(jsonLd(html).some((item) => item["@type"] === "FAQPage"));
    for (const name of ["llms.txt", "robots.txt", "sitemap.xml", "docs/images/social-preview.png", "fonts/LICENSE-Inter.txt"]) {
      assert.ok(existsSync(path.join(out, name)), name);
    }
  });

  it("takes its version from package.json, in the JSON-LD and on the page", async () => {
    const html = withVersion(await read("site/index.html"), "9.8.7");
    const software = jsonLd(html).find((item) => [].concat(item["@type"]).includes("SoftwareApplication"));
    assert.equal(software.softwareVersion, "9.8.7");
    assert.ok(html.includes('<span class="version">9.8.7</span>'));
    assert.doesNotMatch(html, /<span class="version">(?!9[.]8[.]7<)/);
  });

  it("refuses a FAQ that no longer says what the README says", async () => {
    const html = await read("site/index.html");
    const readme = await read("README.md");
    assert.deepEqual(faqProblems(html, readme), []);
    const changed = readme.replace("WSL is the safer choice for now.", "WSL is recommended.");
    assert.equal(faqProblems(html, changed).length, 2, "both the visible FAQ and the JSON-LD are compared");
  });
});
