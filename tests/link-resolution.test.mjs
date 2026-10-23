import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { api, apiOk, cleanupAll, commentOn, makeProject, startServer, stateDirectory, waitForRequest } from "./helpers.mjs";

const INTRO = "sections/01_introduction.tex";
const DISCUSSION = "sections/05_discussion.tex";
const PASSAGE = "Bright streets are also loud streets.";
const RELATED = "The saturation result matters for policy.";

describe("resolving a completed Find linked search", () => {
  let project;
  let server;
  let emptyProject;
  let emptyServer;
  const requestPath = (root, id) => path.join(root, stateDirectory, "requests", `${id}.json`);

  before(async () => {
    // makeProject copies examples/sample-paper; all source anchors come from it.
    project = await makeProject({ fakeAgent: true });
    server = await startServer(project.root, {
      env: { FAKE_AGENT_ANSWER: JSON.stringify({
        summary: "One other passage needs review.",
        targets: [{ path: DISCUSSION, selectedText: RELATED, comment: "Check the lighting-policy claim here too.", reason: "Review the policy implication of the light effect." }],
      }) },
    });
    emptyProject = await makeProject({ fakeAgent: true });
    emptyServer = await startServer(emptyProject.root);
  });
  after(cleanupAll);

  it("preserves the example sources, search history and linked comments when closing only the search", async () => {
    const sources = await Promise.all([INTRO, DISCUSSION].map((file) => fs.readFile(path.join(project.root, file), "utf8")));
    const created = await commentOn(server, INTRO, PASSAGE, "Find related passages to review.", { responseMode: "link" });
    await apiOk(server, "/api/request/process", { method: "POST", body: { id: created.id } });
    const completed = await waitForRequest(server, created.id, (request) => request.status === "discussed", "linked search");
    assert.equal(completed.links.length, 1);
    const childFile = requestPath(project.root, completed.links[0]);
    const childBefore = await fs.readFile(childFile, "utf8");
    assert.equal(JSON.parse(childBefore).status, "pending");
    const resolved = await apiOk(server, "/api/request/resolve-link", { method: "POST", body: { id: created.id } });
    assert.equal(resolved.status, "resolved");
    assert.ok(Number.isFinite(Date.parse(resolved.resolvedAt)));
    for (const key of ["comment", "selectedText", "linkSearch", "links", "conversation"]) {
      assert.deepEqual(resolved[key], completed[key], key);
    }
    assert.deepEqual(await Promise.all([INTRO, DISCUSSION].map((file) => fs.readFile(path.join(project.root, file), "utf8"))), sources);
    assert.equal(await fs.readFile(childFile, "utf8"), childBefore);
    assert.equal(JSON.parse(await fs.readFile(requestPath(project.root, created.id), "utf8")).status, "resolved");
    assert.equal((await apiOk(server, "/api/requests")).find((request) => request.id === created.id).status, "resolved");
    assert.equal((await api(server, "/api/request/resolve-link", { method: "POST", body: { id: created.id } })).status, 409);
  });

  it("can resolve a completed search that found no other locations", async () => {
    const created = await commentOn(emptyServer, INTRO, PASSAGE, "Find other locations.", { responseMode: "link" });
    await apiOk(emptyServer, "/api/request/process", { method: "POST", body: { id: created.id } });
    const completed = await waitForRequest(emptyServer, created.id, (request) => request.status === "discussed", "empty search");
    assert.deepEqual(completed.links, []);
    const resolved = await apiOk(emptyServer, "/api/request/resolve-link", { method: "POST", body: { id: created.id } });
    assert.equal(resolved.status, "resolved");
    assert.deepEqual(resolved.linkSearch, completed.linkSearch);
  });

  it("refuses an unfinished search without changing it", async () => {
    const created = await commentOn(server, INTRO, PASSAGE, "Search later.", { responseMode: "link" });
    const file = requestPath(project.root, created.id);
    const before = await fs.readFile(file, "utf8");
    assert.equal((await api(server, "/api/request/resolve-link", { method: "POST", body: { id: created.id } })).status, 409);
    assert.equal(await fs.readFile(file, "utf8"), before);
  });

  for (const [responseMode, status] of [["rewrite", "proposed"], ["discuss", "discussed"]]) {
    it(`refuses an ordinary ${responseMode} without changing it`, async () => {
      const created = await commentOn(emptyServer, INTRO, PASSAGE, "Review this passage.", { responseMode });
      await apiOk(emptyServer, "/api/request/process", { method: "POST", body: { id: created.id } });
      await waitForRequest(emptyServer, created.id, (request) => request.status === status, responseMode);
      const file = requestPath(emptyProject.root, created.id);
      const before = await fs.readFile(file, "utf8");
      assert.equal((await api(emptyServer, "/api/request/resolve-link", { method: "POST", body: { id: created.id } })).status, 409);
      assert.equal(await fs.readFile(file, "utf8"), before);
    });
  }

  it("rejects invalid request paths", async () => {
    const result = await api(server, "/api/request/resolve-link", { method: "POST", body: { id: "../../main.tex" } });
    assert.equal(result.status, 400);
  });
});
