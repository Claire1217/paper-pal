import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { api, apiOk, cleanupAll, getDocument, makeProject, makeTempDir, rawRequest, startServer, stateDirectory, trySymlink } from "./helpers.mjs";

describe("HTTP hardening", () => {
  let project;
  let server;
  let outsideDirectory;
  let linksCreated = false;

  before(async () => {
    project = await makeProject({
      files: {
        "main.tex": "\\section{Introduction}\nA paragraph that cites \\citep{evil2024}.\n",
        "refs.bib": [
          "@article{evil2024,",
          "  author = {Mallory, Eve},",
          "  title = {A Hostile Entry},",
          "  year = {2024},",
          "  url = {javascript:alert(document.domain)//x.pdf},",
          "  doi = {javascript:alert(1)}",
          "}",
          "@article{fine2024,",
          "  author = {Good, Alice},",
          "  title = {A Normal Entry},",
          "  year = {2024},",
          "  url = {https://arxiv.org/abs/2401.00001},",
          "  doi = {https://doi.org/10.1234/abc.def}",
          "}",
          "",
        ].join("\n"),
      },
    });
    outsideDirectory = await makeTempDir("paper-pal-outside-");
    await fs.writeFile(path.join(outsideDirectory, "secret.tex"), "TOP SECRET OUTSIDE CONTENT\n", "utf8");
    await fs.writeFile(path.join(outsideDirectory, "secret.png"), "not really a png", "utf8");
    linksCreated = (await Promise.all([
      trySymlink(path.join(outsideDirectory, "secret.tex"), path.join(project.root, "link.tex"), "file"),
      trySymlink(path.join(outsideDirectory, "secret.png"), path.join(project.root, "link.png"), "file"),
      trySymlink(outsideDirectory, path.join(project.root, "linked-dir"), "dir"),
    ])).every(Boolean);
    server = await startServer(project.root);
  });

  after(cleanupAll);

  it("survives a request whose URL cannot be parsed (GET //)", async () => {
    const response = await rawRequest(server, { path: "//", headers: { Host: `127.0.0.1:${server.port}` } });
    assert.ok([200, 400, 404].includes(response.status), `unexpected status ${response.status}`);
    const weird = await rawRequest(server, { path: "//[", headers: { Host: `127.0.0.1:${server.port}` } });
    assert.equal(weird.status, 400);
    assert.ok(server.alive(), "server process must still be running");
    assert.equal((await api(server, "/api/bootstrap")).status, 200);
  });

  it("rejects requests addressed to a foreign Host (DNS rebinding)", async () => {
    const evil = await rawRequest(server, { path: "/api/bootstrap", headers: { Host: `evil.example:${server.port}` } });
    assert.equal(evil.status, 421);
    assert.doesNotMatch(evil.body, /Introduction|documents/);
    const wrongPort = await rawRequest(server, { path: "/api/bootstrap", headers: { Host: "127.0.0.1:1" } });
    assert.equal(wrongPort.status, 421);
    for (const name of ["127.0.0.1", "localhost", "[::1]"]) {
      const ok = await rawRequest(server, { path: "/api/bootstrap", headers: { Host: `${name}:${server.port}` } });
      assert.equal(ok.status, 200, name);
    }
  });

  it("requires a matching Origin or the X-Paper-Pal header on state-changing requests", async () => {
    const host = `127.0.0.1:${server.port}`;
    const body = JSON.stringify({});
    const json = { "Content-Type": "application/json", Host: host };
    const bare = await rawRequest(server, { method: "POST", path: "/api/chat/new", headers: json, body });
    assert.equal(bare.status, 403, "no Origin and no custom header");
    const foreign = await rawRequest(server, { method: "POST", path: "/api/chat/new", headers: { ...json, Origin: "http://evil.example", "X-Paper-Pal": "1" }, body });
    assert.equal(foreign.status, 403, "foreign Origin wins over the header");
    const sameOrigin = await rawRequest(server, { method: "POST", path: "/api/chat/new", headers: { ...json, Origin: `http://${host}` }, body });
    assert.equal(sameOrigin.status, 201);
    const withHeader = await rawRequest(server, { method: "POST", path: "/api/chat/new", headers: { ...json, "X-Paper-Pal": "1" }, body });
    assert.equal(withHeader.status, 201);
    const formPost = await rawRequest(server, {
      method: "POST",
      path: "/api/chat/new",
      headers: { Host: host, "X-Paper-Pal": "1", "Content-Type": "text/plain" },
      body,
    });
    assert.equal(formPost.status, 415, "a body must be application/json");
  });

  it("does not follow symlinks out of the source root", async (t) => {
    if (!linksCreated) return t.skip("this Windows account may not create symbolic links");
    const bootstrap = await apiOk(server, "/api/bootstrap");
    const listed = bootstrap.documents.map((item) => item.path);
    assert.ok(listed.includes("main.tex"));
    assert.ok(!listed.some((item) => item.includes("link")), `symlinks must not be listed: ${listed}`);
    for (const target of ["link.tex", "linked-dir/secret.tex", "../outside.tex"]) {
      const response = await api(server, `/api/document?path=${encodeURIComponent(target)}`);
      assert.equal(response.status, 403, target);
      assert.doesNotMatch(JSON.stringify(response.value), /TOP SECRET/);
    }
    const asset = await rawRequest(server, { path: "/api/asset?path=link.png", headers: { Host: `127.0.0.1:${server.port}` } });
    assert.equal(asset.status, 403);
    const save = await api(server, "/api/save", { method: "POST", body: { path: "link.tex", etag: "x", blockIndex: 0, text: "overwritten" } });
    assert.equal(save.status, 403);
    assert.equal(await fs.readFile(path.join(outsideDirectory, "secret.tex"), "utf8"), "TOP SECRET OUTSIDE CONTENT\n");
  });

  it("distinguishes 400, 404 and 500 and keeps absolute paths out of responses", async () => {
    const missing = await api(server, "/api/document?path=nope.tex");
    assert.equal(missing.status, 404);
    assert.ok(!JSON.stringify(missing.value).includes(project.root));
    const invalid = await api(server, "/api/document?path=main.exe");
    assert.equal(invalid.status, 400);
    const unknown = await api(server, "/api/does-not-exist");
    assert.equal(unknown.status, 404);
    const badJson = await rawRequest(server, {
      method: "POST",
      path: "/api/save",
      headers: { Host: `127.0.0.1:${server.port}`, "X-Paper-Pal": "1", "Content-Type": "application/json" },
      body: "{not json",
    });
    assert.equal(badJson.status, 400);
    const bootstrap = await apiOk(server, "/api/bootstrap");
    assert.ok(!JSON.stringify(bootstrap).includes(project.root), "bootstrap must not leak the absolute project path");
  });

  it("sends nosniff everywhere and a CSP on the page", async () => {
    const host = { Host: `127.0.0.1:${server.port}` };
    const page = await rawRequest(server, { path: "/", headers: host });
    assert.equal(page.status, 200);
    assert.equal(page.headers["x-content-type-options"], "nosniff");
    const csp = page.headers["content-security-policy"] || "";
    assert.match(csp, /default-src 'none'/);
    assert.match(csp, /script-src 'self'/);
    assert.doesNotMatch(csp.match(/script-src[^;]*/)[0], /unsafe-inline|unsafe-eval/);
    assert.match(csp, /frame-ancestors 'none'/);
    for (const target of ["/api/bootstrap", "/app.js", "/styles.css", "/vendor/katex/katex.min.js", "/api/nope"]) {
      const response = await rawRequest(server, { path: target, headers: host });
      assert.equal(response.headers["x-content-type-options"], "nosniff", target);
    }
  });

  it("passes only http(s) links through from the bibliography", async () => {
    const document = await getDocument(server, "main.tex");
    const evil = document.references.citations.find((item) => item.key === "evil2024");
    assert.ok(evil, "the entry itself is still listed");
    assert.equal(evil.url, "");
    assert.equal(evil.pdfUrl, undefined);
    assert.equal(evil.doi, "");
    assert.doesNotMatch(JSON.stringify(document.references), /javascript:/i);
    const fine = document.references.citations.find((item) => item.key === "fine2024");
    assert.equal(fine.url, "https://arxiv.org/abs/2401.00001");
    assert.equal(fine.pdfUrl, "https://arxiv.org/pdf/2401.00001.pdf");
    assert.equal(fine.doi, "10.1234/abc.def");
  });

  it("creates an ignore-everything .gitignore inside the state directory", async () => {
    // setup wrote one; remove it and check that the server restores it on start.
    const ignorePath = path.join(project.root, stateDirectory, ".gitignore");
    await server.stop();
    await fs.rm(ignorePath, { force: true });
    server = await startServer(project.root);
    assert.match(await fs.readFile(ignorePath, "utf8"), /^\*$/m);
  });
});
