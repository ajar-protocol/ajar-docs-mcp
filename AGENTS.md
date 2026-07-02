# AGENTS.md - Docs MCP Architecture Contract

The org-wide `.github/AGENTS.md` and `.github/ENGINEERING.md` bind fully here.
This file adds the Ajar Docs MCP architecture contract.

## Mission

Serve the frozen Ajar spec baseline to coding agents.
Correct citation is the product.
An answer that cannot cite its source is a bug.

## Architecture

The derivation pipeline and the MCP runtime are separate systems.
The derivation pipeline reads the `ajar` spec repo at a pinned commit.
The derivation pipeline generates indexes, content snapshots, resource metadata, and checklist data.
The MCP runtime serves generated data.
The MCP runtime MUST NOT derive, rewrite, fetch, mutate, or refresh content at serve time.

Generated data is never hand-edited.
Regenerate from source or do nothing.
Generated files MUST record their generator and source commit.
The `ajar` source pin is recorded in one place.
Changing the pin is a deliberate content update with review evidence.

Resource URIs are a public API.
- `ajar://spec/{section}`
- `ajar://schema/{object}`
- `ajar://example/{name}`
- `ajar://registry/{name}`
- `ajar://vector/{id}`
- `ajar://doc/{name}`

IDs are stable.
Evolution is additive by default.
Renaming or removing a URI is a breaking API change and requires a migration note.
Do not derive URI ids from unstable heading text unless the generated metadata preserves the old id.

## Provenance

Every response MUST carry provenance:

- source file
- heading or object id
- repo commit

Search results MUST include provenance for each hit.
Tool responses MUST include provenance for each cited rule.
Validation explanations MUST cite schema paths and spec clauses.
Checklist items MUST cite the exact source section.
If served content and provenance disagree, fail the response instead of guessing.

## Runtime rules

No network at serve time.
Content ships with the server.
Do not answer from model memory instead of served content.
Do not call remote docs, search engines, GitHub, package registries, or hosted embeddings from a request path.
Hosted and stdio transports MUST serve the same content for the same pinned baseline.
Runtime state MUST NOT mutate derived content.

## Quality rules

If the implementation is TypeScript, TypeScript strict mode is mandatory.
Public signatures MUST use concrete types.
Zero `any` in public signatures.
MCP tool inputs MUST be schema-validated before use.
Invalid tool inputs fail closed with typed errors.
Errors MUST identify the tool and input field without leaking internals.
Tests MUST prove citation presence for every resource and tool.
Tests MUST prove the runtime can run without network.
Tests MUST prove generated data is reproducible from the pinned source.

## Scope boundaries

This repo serves Ajar documentation, schemas, examples, registries, vectors, checklists, and reviewed scaffold guidance.
It is not a general web proxy.
It is not a general documentation crawler.
It is not a model-answering service.

## Never do this

- Never answer from model memory.
- Never hand-edit generated data.
- Never mutate derived data at runtime.
- Never fetch source content at serve time.
- Never rewrite normative language.
- Never expand into a general web or docs proxy.
- Never add telemetry.
