# ajar-docs-mcp - Ajar Spec Access for Coding Agents

An MCP server for the Ajar spec, schemas, examples, checklists, and conformance vectors. It lets a coding agent answer implementation questions from the repo instead of guessing from a copied prompt.

Status: v0.1 buildable now. The spec baseline is frozen, so implementation can start against pinned `ajar` versions; see ADR-017.

---

## 1. Why this exists

Developers will still read the spec, but many implementations will start inside coding-agent sessions. This server gives those agents the exact manifest fields, risk-class rules, examples, and conformance vectors they need while they work in a project repo.

It also keeps Ajar's MCP integration honest: we use MCP to serve the Ajar documentation that implementers need.

## 2. What it serves (data source: the `ajar` spec repo)

Resources:
- `ajar://spec/{section}`: spec sections by stable heading ID, for example `ajar://spec/5.1-risk-classes`
- `ajar://schema/{object}`: JSON Schemas for manifests, actions, mandates, offers, receipts, and policy
- `ajar://example/{name}`: valid and invalid examples, with the rule each invalid example breaks
- `ajar://registry/{name}`: scopes, error codes, settlement adapters
- `ajar://vector/{id}`: conformance test vectors
- `ajar://doc/{name}`: architecture, security model, owner-control, glossary

Tools:

| Tool | Input → Output | Typical caller intent |
|---|---|---|
| `search_spec` | query → ranked sections with IDs + excerpts | "how do offers expire?" |
| `get_section` | section ID → full normative text | precise implementation |
| `get_checklist` | target (`gateway-core`, `gateway-act`, `client`, `manifest-author`, `wordpress-plugin`, `nextjs-site`) → ordered MUST-checklist with spec citations | "make this site Ajar-compatible" |
| `explain_manifest` | a manifest JSON → field-by-field validation report against schema + spec clauses (explanation only; authoritative validation = conformance suite) | debugging |
| `get_example` | scenario (`blog`, `docs`, `commerce`, `mandate-chain`) → golden example + commentary | imitation |
| `get_vectors` | spec section → conformance vectors implementers must pass | test-first implementation |
| `scaffold_guidance` | stack (`nextjs`, `wordpress`, `express`, `django`, ...) → stack-specific implementation notes (curated MD, not generated code) | "where do I put the well-known route in Next.js?" |

Prompts: `implement-core-profile`, `author-first-manifest`, `add-simulate-to-action`, `review-my-policy`. These are parameterized starting prompts for common implementation tasks.

## 3. Design rules

1. The spec repo is the source of truth. This server indexes `ajar` at pinned spec versions and reports the served `ajar_version` in every response.
2. Stable addressing starts in the spec. Headings need stable IDs, each section should cover one concept, and MUST clauses must be citable. ADR-017 covers this.
3. Retrieval must be deterministic. Tools return curated text and structured reports; they do not rewrite normative language.
4. It must run locally and hosted: stdio for local coding agents, Streamable HTTP for hosted use, public spec content without auth, and no telemetry.
5. Distribution includes an MCP Registry listing, short install docs for coding agents, and links from each repo's AGENTS.md.

## 4. Backlog (converted to issues at Phase-0 exit)

- D1: Section-ID extraction pipeline from the spec repo (build-time index; re-run on spec tags)
- D2: Resource layer (spec/schema/example/registry/vector/doc)
- D3: `search_spec` (lexical first; embeddings optional later)
- D4: Checklists: author the six target checklists as curated Markdown in this repo, reviewed against the spec
- D5: `explain_manifest` report format (cites schema path + spec clause per finding)
- D6: `scaffold_guidance` notes for: Next.js, WordPress, Express, Django, Rails, static-site generators
- D7: Prompts; D8: packaging (stdio + HTTP), registry listing; D9: version pinning & multi-version serving

Definition of done for v0.1: a coding agent with only this MCP server and an empty Next.js repo produces a manifest and views that pass the conformance CORE suite. The run is recorded and published as Demo/Story 4.

## 5. Relationship to other repos

Reads: [`ajar`](https://github.com/ajar-protocol/ajar) for content and [`conformance`](https://github.com/ajar-protocol/conformance) for vectors. Feeds: contributors working in every integration repo. The same content will also be served over Ajar at ajarprotocol.org: MCP for coding agents in editors, Ajar Views for browsing agents.

## License

Apache-2.0. See `LICENSE`.
