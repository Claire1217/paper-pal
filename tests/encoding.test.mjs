import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { api, apiOk, cleanupAll, commentOn, getDocument, makeProject, saveBlock, startServer, stateDirectory, waitForRequest } from "./helpers.mjs";

after(cleanupAll);

const sha = (text) => createHash("sha256").update(text).digest("hex");
const NOT_UTF8 = /^This file is not UTF-8, so Paper Pal will not modify it\. Convert it to UTF-8 to edit: iconv -f latin1 -t utf-8 \S+\.tex > \S+\.utf8\.tex$/;

const MAIN = "\\documentclass{article}\n\\begin{document}\n\\input{sections/latin1}\n\\input{sections/utf8}\n\\input{sections/reencoded}\n\\end{document}\n";
// Windows-1252 / Latin-1 bytes with CRLF line ends: 0xE9 and 0xEF are not UTF-8.
const LATIN1_TEXT = "\\section{Caf\xe9}\r\n\r\nFirst paragraph with na\xefve text.\r\n\r\nSecond paragraph to edit here.\r\n\r\nTracked \\chadd{new}\\chdel{old} words.\r\n";
const LATIN1 = Buffer.from(LATIN1_TEXT, "latin1");
const UTF8_TEXT = "\\section{Método}\n\nThe first UTF-8 paragraph stays as it is.\n\nThe second UTF-8 paragraph is the one to change.\n";
const REENCODED_TEXT = "\\section{Re-encoded}\n\nA caf\xe9 paragraph that another program re-encodes later.\n";

async function snapshot(file) {
  const [bytes, stat] = await Promise.all([fs.readFile(file), fs.stat(file)]);
  return { bytes, mtimeMs: stat.mtimeMs, ino: stat.ino };
}

async function assertUntouched(file, expected, label) {
  const now = await snapshot(file);
  assert.ok(now.bytes.equals(expected.bytes), `${label}: the bytes on disk changed`);
  // An atomic write replaces the inode, so this also catches a write-then-rollback.
  assert.equal(now.ino, expected.ino, `${label}: the file was rewritten`);
  assert.equal(now.mtimeMs, expected.mtimeMs, `${label}: the file was rewritten`);
}

describe("a source file that is not UTF-8 is read-only", () => {
  let project;
  let server;
  let latin1File;
  let utf8File;
  let latin1Before;

  before(async () => {
    project = await makeProject({
      fakeAgent: true,
      files: {
        "main.tex": MAIN,
        "sections/latin1.tex": LATIN1,
        "sections/utf8.tex": UTF8_TEXT,
        "sections/reencoded.tex": REENCODED_TEXT,
      },
    });
    latin1File = path.join(project.root, "sections", "latin1.tex");
    utf8File = path.join(project.root, "sections", "utf8.tex");
    assert.ok((await fs.readFile(latin1File)).equals(LATIN1), "the fixture must reach the disk as Latin-1 bytes");
    server = await startServer(project.root);
    latin1Before = await snapshot(latin1File);
  });

  it("flags the file and every block in the document API, and still shows it", async () => {
    const document = await getDocument(server, "sections/latin1.tex");
    assert.equal(document.encoding.valid, false);
    assert.match(document.encoding.reason, /^Line 1 contains bytes that are not valid UTF-8\.$/);
    assert.match(document.encoding.message, NOT_UTF8);
    assert.equal(document.readOnly, true);
    assert.ok(document.blocks.length >= 4);
    assert.ok(document.blocks.every((block) => block.editable === false));
    assert.ok(document.blocks.some((block) => block.raw.startsWith("Second paragraph")), "the lossy text is still readable");

    const valid = await getDocument(server, "sections/utf8.tex");
    assert.deepEqual(valid.encoding, { valid: true });
    assert.equal(valid.readOnly, false);
    assert.ok(valid.blocks.every((block) => block.editable === true));
  });

  it("reports the line of the first bad byte", async () => {
    const file = path.join(project.root, "sections", "late.tex");
    await fs.writeFile(file, Buffer.concat([Buffer.from("\\section{Fine}\n\nAll good: é 中 😀.\n\nBroken "), Buffer.from([0xe9]), Buffer.from(" here.\n")]));
    const document = await getDocument(server, "sections/late.tex");
    assert.equal(document.encoding.valid, false);
    assert.match(document.encoding.reason, /^Line 5 /);
  });

  it("refuses a manual save and leaves the bytes alone", async () => {
    const document = await getDocument(server, "sections/latin1.tex");
    const block = document.blocks.find((item) => item.raw.startsWith("Second paragraph"));
    for (const force of [false, true]) {
      const result = await api(server, "/api/save", {
        method: "POST",
        body: {
          path: document.path, etag: document.etag, blockIndex: block.index, blockId: block.id, blockKind: block.kind,
          baseText: block.raw, text: block.raw.replace("edit", "EDIT"), force,
        },
      });
      assert.equal(result.status, 409);
      assert.match(result.value.error, NOT_UTF8);
    }
    await assertUntouched(latin1File, latin1Before, "save");
  });

  it("refuses to resolve a tracked change", async () => {
    const document = await getDocument(server, "sections/latin1.tex");
    const block = document.blocks.find((item) => item.raw.includes("\\chadd"));
    const result = await api(server, "/api/tracked-change/resolve", {
      method: "POST",
      body: { path: document.path, blockIndex: block.index, blockId: block.id, groupIndex: 0, action: "accept" },
    });
    assert.equal(result.status, 409);
    assert.match(result.value.error, NOT_UTF8);
    await assertUntouched(latin1File, latin1Before, "tracked change");
  });

  it("refuses a new rewrite request for the file", async () => {
    const document = await getDocument(server, "sections/latin1.tex");
    const block = document.blocks.find((item) => item.raw.startsWith("Second paragraph"));
    const result = await api(server, "/api/rewrite", {
      method: "POST",
      body: { path: document.path, etag: document.etag, blockIndex: block.index, blockId: block.id, start: 0, end: 6, comment: "Rewrite this." },
    });
    assert.equal(result.status, 409);
    assert.match(result.value.error, NOT_UTF8);
    assert.deepEqual(await apiOk(server, "/api/requests"), []);
    await assertUntouched(latin1File, latin1Before, "rewrite");
  });

  it("refuses to accept a proposal when the file stopped being UTF-8 after the proposal was made", async () => {
    const file = path.join(project.root, "sections", "reencoded.tex");
    const needle = "another program re-encodes later";
    const created = await commentOn(server, "sections/reencoded.tex", needle, "Make this louder.");
    await apiOk(server, "/api/request/process", { method: "POST", body: { id: created.id } });
    await waitForRequest(server, created.id, (request) => request.status === "proposed", "proposal");
    await fs.writeFile(file, Buffer.from(REENCODED_TEXT, "latin1"));
    const reencoded = await snapshot(file);

    const result = await api(server, "/api/request/accept", { method: "POST", body: { id: created.id } });
    assert.equal(result.status, 409);
    assert.match(result.value.error, NOT_UTF8);
    await assertUntouched(file, reencoded, "accept");
    const [request] = (await apiOk(server, "/api/requests")).filter((item) => item.id === created.id);
    assert.equal(request.status, "proposed", "a refused accept does not resolve the proposal");
    await apiOk(server, "/api/request/reject", { method: "POST", body: { id: created.id } });
  });

  it("refuses a linked change set as a whole when one target is not UTF-8", async () => {
    const needle = "The first UTF-8 paragraph stays as it is.";
    const created = await commentOn(server, "sections/utf8.tex", needle, "Make this louder.");
    await apiOk(server, "/api/request/process", { method: "POST", body: { id: created.id } });
    await waitForRequest(server, created.id, (request) => request.status === "proposed", "proposal");

    // The fake agent finds no linked targets, so the confirmed set is written
    // into the stored request, as the link search would have left it.
    const latin1 = await getDocument(server, "sections/latin1.tex");
    const selectedText = "Second paragraph to edit here.";
    const absoluteStart = latin1.source.indexOf(selectedText);
    const requestFile = path.join(project.root, stateDirectory, "requests", `${created.id}.json`);
    const stored = JSON.parse(await fs.readFile(requestFile, "utf8"));
    stored.proposal.primaryReviewStatus = "confirmed";
    stored.proposal.linkedChanges = [{
      id: "linked_1", path: "sections/latin1.tex", status: "confirmed", required: true,
      sourceEtag: latin1.etag, absoluteStart, absoluteEnd: absoluteStart + selectedText.length,
      selectedText, replacementText: "Second paragraph, edited.", summary: "test",
    }];
    await fs.writeFile(requestFile, JSON.stringify(stored), "utf8");
    const utf8Before = await snapshot(utf8File);

    const result = await api(server, "/api/request/apply-linked", { method: "POST", body: { id: created.id } });
    assert.equal(result.status, 409);
    assert.match(result.value.error, NOT_UTF8);
    await assertUntouched(latin1File, latin1Before, "linked apply (Latin-1 target)");
    await assertUntouched(utf8File, utf8Before, "linked apply (UTF-8 target of the same set)");
    assert.equal((await apiOk(server, "/api/undo")).available, false, "a refused set leaves nothing to undo");
    await apiOk(server, "/api/request/reject", { method: "POST", body: { id: created.id } });
  });

  it("refuses an undo that would restore a file that is not UTF-8, for every file of the action", async () => {
    const latin1 = await getDocument(server, "sections/latin1.tex");
    const utf8Before = await snapshot(utf8File);
    const undoFile = path.join(project.root, stateDirectory, "undo.json");
    await fs.writeFile(undoFile, JSON.stringify({
      version: 1,
      actions: [{
        id: "undo_1_test", kind: "linked-change-set", label: "test", path: "sections/utf8.tex",
        files: [
          { path: "sections/utf8.tex", beforeSource: "\\section{Older}\n", afterSource: UTF8_TEXT, afterEtag: sha(UTF8_TEXT) },
          { path: "sections/latin1.tex", beforeSource: "\\section{Older}\n", afterSource: latin1.source, afterEtag: latin1.etag },
        ],
      }],
    }), "utf8");

    const result = await api(server, "/api/undo", { method: "POST" });
    assert.equal(result.status, 409);
    assert.match(result.value.error, NOT_UTF8);
    await assertUntouched(latin1File, latin1Before, "undo (Latin-1 file)");
    await assertUntouched(utf8File, utf8Before, "undo (UTF-8 file of the same action)");
    await fs.rm(undoFile);
  });

  it("keeps working for the UTF-8 files of the same project", async () => {
    assert.equal((await api(server, "/api/outline")).status, 200);
    const document = await getDocument(server, "sections/utf8.tex");
    const block = document.blocks.find((item) => item.raw.startsWith("The second UTF-8 paragraph"));
    const saved = await saveBlock(server, document, block, block.raw.replace("to change", "that changed"));
    assert.equal(saved.encoding.valid, true);
    assert.equal(await fs.readFile(utf8File, "utf8"), UTF8_TEXT.replace("to change", "that changed"));
    await apiOk(server, "/api/undo", { method: "POST" });
    assert.ok((await fs.readFile(utf8File)).equals(Buffer.from(UTF8_TEXT)));
    await assertUntouched(latin1File, latin1Before, "after all attempts");
  });
});

describe("a UTF-8 file changes only in the edited span", () => {
  // BOM, CRLF, a tab, trailing spaces, CJK, an emoji (a surrogate pair), a
  // decomposed accent (NFD, which NFC would change), a precomposed one, a
  // lone CR, and no newline at the end of the file.
  const BOM = "\uFEFF";
  const TRICKY = `${BOM}\\section{方法 Méthode}\r\n\r\n`
    + "First paragraph: cafe\u0301 (NFD), café (NFC), 中文字符, emoji 😀🎉.  \r\n\tA tab-indented line with trailing spaces.   \r\n\r\n"
    + "Second paragraph is the one to edit 😀 here.\r\n\r\n\r\n"
    + "% a comment with 日本語\r\n"
    + "Third paragraph, mixed\nline\rends, ends without a newline 🎓";
  let project;
  let server;
  let file;

  before(async () => {
    project = await makeProject({
      fakeAgent: true,
      files: {
        "main.tex": "\\documentclass{article}\n\\begin{document}\n\\input{tricky}\n\\end{document}\n",
        "tricky.tex": TRICKY,
      },
    });
    server = await startServer(project.root);
    file = path.join(project.root, "tricky.tex");
  });

  async function reset() {
    await fs.writeFile(file, TRICKY, "utf8");
    const bytes = await fs.readFile(file);
    assert.deepEqual([...bytes.subarray(0, 3)], [0xef, 0xbb, 0xbf], "the fixture starts with a BOM");
    return bytes;
  }

  // The bytes before and after the edit must be the original bytes, whatever they are.
  function assertOnlySpanChanged(beforeBytes, afterBytes, oldText, newText) {
    const at = beforeBytes.indexOf(Buffer.from(oldText));
    assert.ok(at >= 0);
    const expected = Buffer.concat([beforeBytes.subarray(0, at), Buffer.from(newText), beforeBytes.subarray(at + Buffer.byteLength(oldText))]);
    assert.ok(afterBytes.equals(expected), `only "${oldText}" may change\nexpected ${expected.toString("hex")}\nactual   ${afterBytes.toString("hex")}`);
  }

  it("is valid UTF-8 and every block maps to its exact source offsets, BOM included", async () => {
    await reset();
    const document = await getDocument(server, "tricky.tex");
    assert.deepEqual(document.encoding, { valid: true });
    assert.equal(document.source, TRICKY);
    assert.equal(document.blocks[0].raw[0], BOM, "the BOM belongs to the first block, so it is written back");
    let cursor = 0;
    for (const block of document.blocks) {
      assert.ok(block.start >= cursor);
      assert.equal(TRICKY.slice(block.start, block.end), block.raw);
      cursor = block.end;
    }
  });

  for (const [label, oldText, newText] of [
    ["a middle block", "the one to edit", "the one that was edited (编辑) 🚀"],
    ["the first block, right after the BOM", "方法 Méthode", "方法"],
    ["next to an emoji and an NFD accent", "(NFD), café", "(NFD) and café"],
    ["the last block, which has no final newline", "without a newline", "with no newline"],
  ]) {
    it(`saves ${label} byte-exactly`, async () => {
      const beforeBytes = await reset();
      const document = await getDocument(server, "tricky.tex");
      const block = document.blocks.find((item) => item.raw.includes(oldText));
      assert.ok(block, `no block contains ${oldText}`);
      await saveBlock(server, document, block, block.raw.replace(oldText, newText));
      assertOnlySpanChanged(beforeBytes, await fs.readFile(file), oldText, newText);
      await apiOk(server, "/api/undo", { method: "POST" });
      assert.ok((await fs.readFile(file)).equals(beforeBytes), "undo restores the exact bytes");
    });
  }

  it("accepts a proposal byte-exactly and undoes it byte-exactly", async () => {
    const beforeBytes = await reset();
    const needle = "the one to edit 😀 here";
    const created = await commentOn(server, "tricky.tex", needle, "Make this louder.");
    await apiOk(server, "/api/request/process", { method: "POST", body: { id: created.id } });
    await waitForRequest(server, created.id, (request) => request.status === "proposed", "proposal");
    await apiOk(server, "/api/request/accept", { method: "POST", body: { id: created.id } });
    assertOnlySpanChanged(beforeBytes, await fs.readFile(file), needle, needle.toUpperCase());
    await apiOk(server, "/api/undo", { method: "POST" });
    assert.ok((await fs.readFile(file)).equals(beforeBytes), "undo restores the exact bytes");
  });

  it("refuses text with half of a surrogate pair instead of writing U+FFFD", async () => {
    const beforeBytes = await reset();
    const document = await getDocument(server, "tricky.tex");
    const block = document.blocks.find((item) => item.raw.includes("the one to edit"));
    const result = await api(server, "/api/save", {
      method: "POST",
      body: {
        path: document.path, etag: document.etag, blockIndex: block.index, blockId: block.id, blockKind: block.kind,
        baseText: block.raw, text: block.raw.replace("😀", "\ud83d"),
      },
    });
    assert.equal(result.status, 422);
    assert.ok((await fs.readFile(file)).equals(beforeBytes));
  });
});

describe("structure plans and files that are not UTF-8", () => {
  let project;
  let server;
  let latin1File;
  let utf8File;
  let latin1Before;

  before(async () => {
    project = await makeProject({
      fakeAgent: true,
      files: {
        "main.tex": "\\documentclass{article}\n\\begin{document}\n\\input{sections/latin1}\n\\input{sections/utf8}\n\\end{document}\n",
        "sections/latin1.tex": LATIN1,
        "sections/utf8.tex": UTF8_TEXT,
      },
    });
    latin1File = path.join(project.root, "sections", "latin1.tex");
    utf8File = path.join(project.root, "sections", "utf8.tex");
    server = await startServer(project.root);
    latin1Before = await snapshot(latin1File);
  });

  async function confirmPlan() {
    const structure = await apiOk(server, "/api/structure");
    assert.equal(structure.sections.length, 2);
    const plan = await apiOk(server, "/api/structure/confirm", {
      method: "POST",
      body: {
        proposal: {
          summary: "test plan",
          sections: structure.sections.map((section) => ({
            sectionId: section.id, title: `${section.title} (planned)`, reason: "test",
            nodes: [{ title: "Only node", kind: "paragraph", change: "rewrite" }],
          })),
        },
      },
    });
    assert.deepEqual(plan.sources.map((source) => source.path).sort(), ["sections/latin1.tex", "sections/utf8.tex"]);
    return { structure, plan };
  }

  it("refuses a section rewrite for the file, and reverts the plan without writing it", async () => {
    const { structure } = await confirmPlan();
    const latin1Section = structure.sections.find((section) => section.sources.some((source) => source.path === "sections/latin1.tex"));
    const refused = await api(server, "/api/structure/section-rewrite", { method: "POST", body: { sectionId: latin1Section.id, autoProcess: false } });
    assert.equal(refused.status, 409);
    assert.match(refused.value.error, NOT_UTF8);

    const document = await getDocument(server, "sections/utf8.tex");
    const block = document.blocks.find((item) => item.raw.startsWith("The second UTF-8 paragraph"));
    await saveBlock(server, document, block, block.raw.replace("to change", "that changed"));
    const reverted = await apiOk(server, "/api/structure/revert", { method: "POST" });
    assert.equal(reverted.status, "reverted");
    assert.ok((await fs.readFile(utf8File)).equals(Buffer.from(UTF8_TEXT)), "the UTF-8 file is restored");
    await assertUntouched(latin1File, latin1Before, "structure revert");
  });

  it("refuses the whole revert when a changed file is no longer UTF-8", async () => {
    await fs.writeFile(latin1File, LATIN1_TEXT, "utf8");
    await confirmPlan();
    const document = await getDocument(server, "sections/utf8.tex");
    const block = document.blocks.find((item) => item.raw.startsWith("The second UTF-8 paragraph"));
    await saveBlock(server, document, block, block.raw.replace("to change", "that changed"));
    await fs.writeFile(latin1File, LATIN1);
    const reencoded = await snapshot(latin1File);
    const utf8Edited = await snapshot(utf8File);

    const result = await api(server, "/api/structure/revert", { method: "POST" });
    assert.equal(result.status, 409);
    assert.match(result.value.error, NOT_UTF8);
    await assertUntouched(latin1File, reencoded, "refused revert (Latin-1 file)");
    await assertUntouched(utf8File, utf8Edited, "refused revert (UTF-8 file of the same plan)");
  });
});
