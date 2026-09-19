export function buildRelatedCommentContext(request, candidates, contextMode = "smart") {
  // Comments the author explicitly linked to this one. They are deliberate
  // cross-file assertions, so they bypass the same-file and local-mode filters.
  const linkedIds = new Set(Array.isArray(request.links) ? request.links : []);
  const isLinked = (candidate) =>
    linkedIds.has(candidate.id)
    || (Array.isArray(candidate.links) && candidate.links.includes(request.id));
  const active = candidates.filter((candidate) =>
    candidate.id !== request.id &&
    (candidate.path === request.path || isLinked(candidate)) &&
    ["pending", "proposed"].includes(candidate.status) &&
    candidate.anchorValid !== false
  );
  const ranked = active
    .map((candidate) => ({
      candidate,
      linked: isLinked(candidate),
      sameBlock: candidate.path === request.path
        && (candidate.blockId === request.blockId || candidate.blockIndex === request.blockIndex),
    }))
    .filter(({ sameBlock, linked }) => contextMode !== "local" || sameBlock || linked)
    .sort((left, right) =>
      Number(right.linked) - Number(left.linked) ||
      Number(right.sameBlock) - Number(left.sameBlock) ||
      String(left.candidate.createdAt).localeCompare(String(right.candidate.createdAt))
    )
    .slice(0, 12);
  return ranked.map(({ candidate, sameBlock, linked }) => ({
    id: candidate.id,
    path: candidate.path,
    relationship: linked ? "linked-location" : sameBlock ? "same-paragraph" : "same-source-file",
    status: candidate.status,
    selectedText: candidate.selectedText,
    prefix: candidate.prefix,
    suffix: candidate.suffix,
    instruction: candidate.comment,
    rewriteScope: candidate.rewriteScope || "selection",
    conversation: Array.isArray(candidate.conversation) ? candidate.conversation : [],
    currentProposal: candidate.proposal
      ? {
          replacementText: candidate.proposal.replacementText,
          summary: candidate.proposal.summary,
        }
      : null,
    recentProposalHistory: Array.isArray(candidate.proposalHistory)
      ? candidate.proposalHistory.slice(-2).map((proposal) => ({
          replacementText: proposal.replacementText,
          summary: proposal.summary,
          rejectedAt: proposal.rejectedAt,
          supersededAt: proposal.supersededAt,
          regeneratedAt: proposal.regeneratedAt,
        }))
      : [],
  }));
}
