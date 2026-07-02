# Contributing to ajar-docs-mcp

Start with the org-wide [CONTRIBUTING.md](https://github.com/ajar-protocol/.github/blob/main/CONTRIBUTING.md) and [AGENTS.md](https://github.com/ajar-protocol/.github/blob/main/AGENTS.md). They apply fully here.

This repo exposes the Ajar spec, schemas, examples, registries, and conformance vectors to coding agents. The v0.1 server is buildable now because the spec baseline is frozen.

Use the org-wide [TESTING.md](https://github.com/ajar-protocol/.github/blob/main/TESTING.md) for validation, fixture, and conformance-vector contribution rules.

## Wanted now

- Deterministic indexing from the `ajar` spec repo at pinned versions.
- Resource and tool interfaces that cite spec sections precisely.
- Checklists, examples, and scaffold guidance derived from reviewed spec content.
- Packaging and local run instructions for stdio and Streamable HTTP.

## Gated work

- Do not invent normative content ahead of the spec.
- Hosted behavior waits until local deterministic behavior is stable.
- Embeddings are optional later; lexical and structured lookup come first.

## How work is tracked

Open issues in this repo. Tasks are aggregated on the org Project board, [Ajar Roadmap](https://github.com/orgs/ajar-protocol/projects).

Use task IDs in titles when one exists. One task is one PR. Keep generated indexes, source changes, and docs together when the DoD binds them.

The DoD is binding. A PR should show the indexed source version, command output, or tool response that proves the change.

## Content rules

- The `ajar` spec repo is the source of truth.
- Tools return curated text and structured reports; they do not rewrite normative language.
- Derived data is reproducible from source inputs.
- No telemetry.
