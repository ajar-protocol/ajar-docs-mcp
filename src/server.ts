import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult, GetPromptResult, ReadResourceResult, Resource } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { join } from "node:path";
import { readFileSync } from "node:fs";
import { loadContentStore, listJsonFiles, provenance, readText } from "./content.js";
import { explainManifest } from "./manifest-explain.js";
import { searchSpec } from "./search.js";
import type { ChecklistTarget, ContentStore, ExampleScenario, Provenance } from "./types.js";

const SCHEMA_SECTION: Record<string, string> = {
  action: "5-actions",
  common: "1-scope-design-rules",
  error: "10-http-surface-summary",
  mandate: "8.1-mandate-object",
  manifest: "3-the-capability-manifest",
  offer: "7-two-phase-execution",
  policy: "3-the-capability-manifest",
  receipt: "8.2-receipt-object",
  simulation: "6-simulate-the-rehearsal",
  view: "4-views",
};

const REGISTRY_SECTION: Record<string, string> = {
  scopes: "8.1-mandate-object",
  "error-codes": "10-http-surface-summary",
  "settlement-adapters": "8.3-payments-binding",
};

const DOC_SOURCES: Record<string, string> = {
  architecture: "docs/02-ARCHITECTURE.md",
  "security-model": "docs/04-SECURITY-MODEL.md",
  "owner-control": "docs/05-OWNER-CONTROL.md",
  glossary: "GLOSSARY.md",
  decisions: "DECISIONS.md",
  research: "docs/01-RESEARCH.md",
};

const CURATED_CHECKLISTS = new Set<ChecklistTarget>(["gateway-core", "manifest-author", "nextjs-site"]);

function jsonTool<T>(value: T): CallToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
  };
}

function textResource(uri: string, text: string, mimeType = "text/markdown"): ReadResourceResult {
  return { contents: [{ uri, mimeType, text }] };
}

function readContentText(store: ContentStore, relativePath: string): string {
  return readFileSync(join(store.root, relativePath), "utf8");
}

function notYetCurated(target: string, phase: string, sections: string[], store: ContentStore): object {
  return {
    ajar_version: store.manifest.ajar_version,
    pinned_commit: store.manifest.pinned_ajar_commit,
    status: "not_yet_curated",
    target,
    phase,
    spec_sections: sections,
    provenance: sections.map((sectionId) => provenance(store, "docs/03-PROTOCOL-SPEC.md", sectionId)),
  };
}

function sectionNumberFromSpecSection(value: string): string {
  const match = value.match(/^(\d+(?:\.\d+)*)/);
  return match ? match[1] : value;
}

function sectionIdForNumber(store: ContentStore, sectionNumber: string): string {
  return store.sections.find((section) => section.number === sectionNumber)?.id ?? sectionNumber;
}

function resourceList(resources: Resource[]): { resources: Resource[] } {
  return { resources };
}

function asStringVariable(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function getSpecSection(store: ContentStore, sectionId: string): object {
  const section = store.sectionById.get(sectionId);
  if (!section) {
    throw new Error(`Unknown spec section: ${sectionId}`);
  }
  return {
    id: section.id,
    heading: section.heading,
    ajar_version: store.manifest.ajar_version,
    markdown: section.markdown,
    source: {
      file: section.source_file,
      line: section.source_line,
      section_id: section.id,
      pinned_commit: store.manifest.pinned_ajar_commit,
    },
    provenance: provenance(store, section.source_file, section.id),
  };
}

function exampleFilesForScenario(scenario: ExampleScenario): Array<{ path: string; note: string }> {
  if (scenario === "blog") {
    return [{ path: "examples/manifests/blog-core.json", note: "CORE manifest for a read-only blog site." }];
  }
  if (scenario === "docs") {
    return [{ path: "examples/manifests/docs-core-pay.json", note: "CORE+PAY manifest for metered documentation access." }];
  }
  if (scenario === "commerce") {
    return [
      { path: "examples/manifests/commerce-core-act-pay.json", note: "CORE+ACT+PAY commerce manifest with a purchase action." },
      { path: "examples/scenario-tickets/offer.json", note: "Signed offer in the two-phase purchase flow." },
      { path: "examples/scenario-tickets/receipt.json", note: "Dual-signed receipt for the committed purchase." },
      { path: "examples/scenario-tickets/simulation.json", note: "SIMULATE response for the action before propose/commit." },
    ];
  }
  return [{ path: "examples/scenario-tickets/mandate.json", note: "Mandate granting scoped authority for the ticket purchase flow." }];
}

function createResources(server: McpServer, store: ContentStore): void {
  server.registerResource(
    "spec",
    new ResourceTemplate("ajar://spec/{section}", {
      list: () =>
        resourceList(
          store.sections.map((section) => ({
            uri: `ajar://spec/${section.id}`,
            name: section.id,
            title: section.heading,
            mimeType: "application/json",
          })),
        ),
      complete: { section: (value) => store.sections.map((section) => section.id).filter((id) => id.startsWith(value)) },
    }),
    { title: "Ajar spec section", description: "Normative Ajar protocol spec sections" },
    (uri, variables) => {
      const section = asStringVariable(variables.section);
      return textResource(uri.toString(), JSON.stringify(getSpecSection(store, section), null, 2), "application/json");
    },
  );

  server.registerResource(
    "schema",
    new ResourceTemplate("ajar://schema/{object}", {
      list: () =>
        resourceList(
          Object.keys(SCHEMA_SECTION).map((name) => ({
            uri: `ajar://schema/${name}`,
            name,
            title: `${name}.schema.json`,
            mimeType: "application/json",
          })),
        ),
      complete: { object: (value) => Object.keys(SCHEMA_SECTION).filter((name) => name.startsWith(value)) },
    }),
    { title: "Ajar schema", description: "JSON Schemas copied from the pinned Ajar source" },
    (uri, variables) => {
      const objectName = asStringVariable(variables.object);
      const sectionId = SCHEMA_SECTION[objectName];
      if (!sectionId) throw new Error(`Unknown schema object: ${objectName}`);
      const body = JSON.parse(readContentText(store, `schemas/${objectName}.schema.json`)) as unknown;
      return textResource(
        uri.toString(),
        JSON.stringify(
          {
            ajar_version: store.manifest.ajar_version,
            object: objectName,
            schema: body,
            provenance: provenance(store, `schemas/${objectName}.schema.json`, sectionId),
          },
          null,
          2,
        ),
        "application/json",
      );
    },
  );

  server.registerResource(
    "example",
    new ResourceTemplate("ajar://example/{name}", {
      list: () =>
        resourceList(
          listJsonFiles(join(store.root, "examples")).map((file) => {
            const name = file.replace(/\.json$/, "");
            return { uri: `ajar://example/${name}`, name, title: file, mimeType: "application/json" };
          }),
        ),
      complete: { name: (value) => listJsonFiles(join(store.root, "examples")).map((file) => file.replace(/\.json$/, "")).filter((name) => name.startsWith(value)) },
    }),
    { title: "Ajar example", description: "Valid and invalid examples with provenance" },
    (uri, variables) => {
      const name = asStringVariable(variables.name);
      const path = `examples/${name}.json`;
      const body = JSON.parse(readContentText(store, path)) as unknown;
      return textResource(
        uri.toString(),
        JSON.stringify(
          {
            ajar_version: store.manifest.ajar_version,
            name,
            example: body,
            provenance: provenance(store, path, "3-the-capability-manifest"),
          },
          null,
          2,
        ),
        "application/json",
      );
    },
  );

  server.registerResource(
    "registry",
    new ResourceTemplate("ajar://registry/{name}", {
      list: () =>
        resourceList(
          Object.keys(REGISTRY_SECTION).map((name) => ({
            uri: `ajar://registry/${name}`,
            name,
            title: `${name}.md`,
            mimeType: "text/markdown",
          })),
        ),
      complete: { name: (value) => Object.keys(REGISTRY_SECTION).filter((name) => name.startsWith(value)) },
    }),
    { title: "Ajar registry", description: "Scopes, error codes, and settlement adapters" },
    (uri, variables) => {
      const name = asStringVariable(variables.name);
      const sectionId = REGISTRY_SECTION[name];
      if (!sectionId) throw new Error(`Unknown registry: ${name}`);
      const markdown = readContentText(store, `registries/${name}.md`);
      return textResource(
        uri.toString(),
        JSON.stringify(
          {
            ajar_version: store.manifest.ajar_version,
            name,
            markdown,
            provenance: provenance(store, `registries/${name}.md`, sectionId),
          },
          null,
          2,
        ),
        "application/json",
      );
    },
  );

  server.registerResource(
    "vector",
    new ResourceTemplate("ajar://vector/{id}", {
      list: () =>
        resourceList(
          store.vectors.map((vector) => ({
            uri: `ajar://vector/${vector.id}`,
            name: vector.id,
            title: `${vector.kind}: ${vector.id}`,
            mimeType: "application/json",
          })),
        ),
      complete: { id: (value) => store.vectors.map((vector) => vector.id).filter((id) => id.startsWith(value)) },
    }),
    { title: "Ajar conformance vector", description: "Derived vector index entries" },
    (uri, variables) => {
      const id = asStringVariable(variables.id);
      const vector = store.vectors.find((entry) => entry.id === id);
      if (!vector) throw new Error(`Unknown vector: ${id}`);
      const sectionId = sectionIdForNumber(store, vector.spec_section);
      return textResource(
        uri.toString(),
        JSON.stringify(
          {
            ajar_version: store.manifest.ajar_version,
            ...vector,
            provenance: provenance(store, vector.source_file, sectionId),
          },
          null,
          2,
        ),
        "application/json",
      );
    },
  );

  server.registerResource(
    "doc",
    new ResourceTemplate("ajar://doc/{name}", {
      list: () =>
        resourceList(
          Object.keys(DOC_SOURCES).map((name) => ({
            uri: `ajar://doc/${name}`,
            name,
            title: DOC_SOURCES[name],
            mimeType: "application/json",
          })),
        ),
      complete: { name: (value) => Object.keys(DOC_SOURCES).filter((name) => name.startsWith(value)) },
    }),
    { title: "Ajar supporting doc", description: "Architecture, security, owner control, glossary, decisions, and research" },
    (uri, variables) => {
      const name = asStringVariable(variables.name);
      const source = DOC_SOURCES[name];
      if (!source) throw new Error(`Unknown doc: ${name}`);
      const markdown = readContentText(store, `docs/${name}.md`);
      return textResource(
        uri.toString(),
        JSON.stringify(
          {
            ajar_version: store.manifest.ajar_version,
            name,
            markdown,
            provenance: provenance(store, source, "doc"),
          },
          null,
          2,
        ),
        "application/json",
      );
    },
  );
}

function createTools(server: McpServer, store: ContentStore): void {
  server.registerTool(
    "search_spec",
    {
      title: "Search Ajar spec",
      description: "Deterministic lexical search over derived spec sections.",
      inputSchema: { query: z.string().min(1), limit: z.number().int().min(1).max(20).default(5) },
    },
    ({ query, limit }) => jsonTool({ ajar_version: store.manifest.ajar_version, pinned_commit: store.manifest.pinned_ajar_commit, results: searchSpec(store, query, limit) }),
  );

  server.registerTool(
    "get_section",
    {
      title: "Get spec section",
      description: "Return a full normative spec section by stable heading ID.",
      inputSchema: { section_id: z.string().min(1) },
    },
    ({ section_id }) => jsonTool(getSpecSection(store, section_id)),
  );

  server.registerTool(
    "get_vectors",
    {
      title: "Get vectors",
      description: "Return vectors whose spec_section matches the section number prefix plus must-coverage mappings.",
      inputSchema: { spec_section: z.string().min(1) },
    },
    ({ spec_section }) => {
      const prefix = sectionNumberFromSpecSection(spec_section);
      const entries = store.vectors
        .filter((vector) => vector.spec_section === prefix || vector.spec_section.startsWith(`${prefix}.`))
        .map((vector) => ({
          ...vector,
          provenance: provenance(store, vector.source_file, sectionIdForNumber(store, vector.spec_section)),
        }));
      return jsonTool({ ajar_version: store.manifest.ajar_version, pinned_commit: store.manifest.pinned_ajar_commit, spec_section, vectors: entries });
    },
  );

  server.registerTool(
    "get_example",
    {
      title: "Get golden example",
      description: "Return curated example bundles for common scenarios.",
      inputSchema: { scenario: z.enum(["blog", "docs", "commerce", "mandate-chain"]) },
    },
    ({ scenario }) => {
      const examples = exampleFilesForScenario(scenario).map((entry) => ({
        name: entry.path.replace(/^examples\//, "").replace(/\.json$/, ""),
        note: entry.note,
        json: JSON.parse(readContentText(store, entry.path)) as unknown,
        provenance: provenance(store, entry.path, entry.path.includes("mandate") ? "8.1-mandate-object" : "3-the-capability-manifest"),
      }));
      return jsonTool({ ajar_version: store.manifest.ajar_version, pinned_commit: store.manifest.pinned_ajar_commit, scenario, examples });
    },
  );

  server.registerTool(
    "explain_manifest",
    {
      title: "Explain manifest",
      description: "Explanatory schema and semantic manifest validation report; authoritative validation is the conformance suite.",
      inputSchema: { manifest: z.record(z.string(), z.unknown()), served_path: z.string().optional() },
    },
    ({ manifest, served_path }) => jsonTool(explainManifest(store, manifest, served_path)),
  );

  server.registerTool(
    "get_checklist",
    {
      title: "Get checklist",
      description: "Return curated MUST checklist for v0.1 targets, or structured not-yet-curated response.",
      inputSchema: { target: z.enum(["gateway-core", "gateway-act", "client", "manifest-author", "wordpress-plugin", "nextjs-site"]) },
    },
    ({ target }) => {
      if (CURATED_CHECKLISTS.has(target)) {
        const markdown = readText(`checklists/${target}.md`);
        const citations = [...markdown.matchAll(/Cites `([^`]+)`/g)].map((match) => ({
          section_id: match[1],
          provenance: provenance(store, "docs/03-PROTOCOL-SPEC.md", match[1] ?? ""),
        }));
        return jsonTool({ ajar_version: store.manifest.ajar_version, pinned_commit: store.manifest.pinned_ajar_commit, target, markdown, citations });
      }
      return jsonTool(notYetCurated(target, "D4 later checklist expansion", ["5.1-risk-classes", "6-simulate-the-rehearsal", "8.1-mandate-object"], store));
    },
  );

  server.registerTool(
    "scaffold_guidance",
    {
      title: "Scaffold guidance",
      description: "Return curated stack guidance for Next.js, or structured not-yet-curated response.",
      inputSchema: { stack: z.string().min(1) },
    },
    ({ stack }) => {
      const normalized = stack.toLowerCase();
      if (normalized === "nextjs" || normalized === "next.js") {
        return jsonTool({
          ajar_version: store.manifest.ajar_version,
          pinned_commit: store.manifest.pinned_ajar_commit,
          stack: "nextjs",
          markdown: readText("guidance/nextjs.md"),
          provenance: provenance(store, "guidance/nextjs.md", "2.1-location"),
        });
      }
      return jsonTool(notYetCurated(stack, "D6 later stack guidance expansion", ["2.1-location", "4-views", "10-http-surface-summary"], store));
    },
  );
}

function promptResult(description: string, text: string): GetPromptResult {
  return {
    description,
    messages: [{ role: "user", content: { type: "text", text } }],
  };
}

function createPrompts(server: McpServer, store: ContentStore): void {
  const versionLine = `Use Ajar ${store.manifest.ajar_version} at pinned commit ${store.manifest.pinned_ajar_commit}.`;
  server.registerPrompt(
    "implement-core-profile",
    {
      title: "Implement CORE profile",
      description: "Start a CORE gateway implementation with real section IDs and tool calls.",
      argsSchema: { framework: z.string().optional() },
    },
    ({ framework }) =>
      promptResult(
        "Implement Ajar CORE profile",
        `${versionLine}\nTarget framework: ${framework ?? "unspecified"}.\nFirst call get_checklist({target:"gateway-core"}), then get_section for 2.1-location, 3-the-capability-manifest, and 4-views. Implement manifest discovery, view negotiation, stable chunk IDs, and provenance-preserving chunks.`,
      ),
  );
  server.registerPrompt(
    "author-first-manifest",
    {
      title: "Author first manifest",
      description: "Guide manifest authoring using schema and examples.",
      argsSchema: { site_name: z.string().optional(), profiles: z.string().optional() },
    },
    ({ site_name, profiles }) =>
      promptResult(
        "Author first Ajar manifest",
        `${versionLine}\nSite: ${site_name ?? "unspecified"}; profiles: ${profiles ?? "CORE"}.\nCall get_checklist({target:"manifest-author"}), get_example({scenario:"blog"}), and get_section({section_id:"3-the-capability-manifest"}). Validate drafts with explain_manifest and treat it as explanatory only.`,
      ),
  );
  server.registerPrompt(
    "add-simulate-to-action",
    {
      title: "Add SIMULATE to action",
      description: "Guide ACT action rehearsal and two-phase flow.",
      argsSchema: { action_id: z.string().optional(), risk: z.string().optional() },
    },
    ({ action_id, risk }) =>
      promptResult(
        "Add SIMULATE to Ajar action",
        `${versionLine}\nAction: ${action_id ?? "unspecified"}; risk: ${risk ?? "R1+"}.\nCall get_section for 5.1-risk-classes, 6-simulate-the-rehearsal, and 7-two-phase-execution. Call get_vectors({spec_section:"6"}) before tests. Ensure R1+ has idempotency and simulate; R2/R3 has two_phase and mandate scopes.`,
      ),
  );
  server.registerPrompt(
    "review-my-policy",
    {
      title: "Review owner policy",
      description: "Review owner control and policy summary against the spec.",
      argsSchema: { policy_focus: z.string().optional() },
    },
    ({ policy_focus }) =>
      promptResult(
        "Review Ajar policy",
        `${versionLine}\nFocus: ${policy_focus ?? "overall owner policy"}.\nCall ajar://doc/owner-control, get_section({section_id:"3-the-capability-manifest"}), get_section({section_id:"5.1-risk-classes"}), and get_section({section_id:"8.4-liability-resolution"}). Check that policy raises but never lowers risk requirements.`,
      ),
  );
}

export function createServer(store: ContentStore = loadContentStore()): McpServer {
  const server = new McpServer({ name: "ajar-docs-mcp", version: "0.1.0" });
  createResources(server, store);
  createTools(server, store);
  createPrompts(server, store);
  return server;
}
