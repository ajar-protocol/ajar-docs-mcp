# Story 4 — Run record: a coding agent implements Ajar CORE from this server

Date: 2026-07-02. This is the v0.1 Definition-of-Done exercise from the README:
a coding agent with only this MCP server and an empty Next.js repo produces a
manifest and views that pass the conformance CORE suite.

## Setup

- Agent: OpenAI Codex (codex-cli 0.142.5), workspace-write sandbox.
- Workspace: a minimal Next.js 15 site (a fictional bookshop) with no Ajar
  code and no filesystem access to the `ajar` spec repo — isolation was
  physical, not instructional.
- Knowledge source: this server (`ajar-docs-mcp` v0.1) over stdio, configured
  as the agent's only MCP server.

## What happened

1. The agent's MCP **tool** calls (`get_checklist`, `scaffold_guidance`,
   `get_example`, `search_spec`, `explain_manifest`) were cancelled by the
   agent runtime's approval layer (a Codex configuration issue, not a server
   defect — the same tools answer correctly over a raw MCP session).
2. The agent fell back to MCP **resources** and completed the implementation
   from `ajar://schema/{manifest,view,common}`, `ajar://spec/{2.1,2.2,3,4,10}`,
   and four vectors — an unplanned but encouraging result: the resource layer
   alone was sufficient for Profile CORE.
3. The agent implemented the manifest route, a chunked view with ETag/304 and
   `Ajar-Content-Signature`, the view index, and Accept-header negotiation,
   and refused to guess anything it could not look up.

## Verified results

- Manifest and view validate with zero schema errors against the real spec
  schemas; `manifest_check` reports `manifest-ok`.
- Served through the reference Gateway (T1.1 reverse proxy), the site passes
  the executable conformance harness gateway-core mode: 10 pass, 0 fail,
  1 documented skip (the CORE error surface has no vector-backed probe yet).
- Demo source: https://github.com/ajar-protocol/ajar-examples/tree/main/story-4-bookshop
  (the agent's own run notes are in its `NOTES.md`).

## Findings

1. Two supervisor fixes were needed post-run: the Next.js negotiation rewrite
   must be `beforeFiles` (the prerendered `/` otherwise wins), and the agent
   could not runtime-test because its sandbox denied socket binds.
2. Server defect found: the resource list advertises example URIs (e.g.
   `ajar://example/manifests/blog-core`) that return not-found when read
   (issue #3).
3. Spec gap confirmed: the view index has no schema; the agent had to invent
   a shape (tracked in ajar issue #4).
4. The docs were sufficient for CORE without the curated checklists — the
   schemas plus spec sections 3, 4, and 10 carried the implementation.
