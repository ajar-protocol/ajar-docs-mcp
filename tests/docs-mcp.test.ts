import { spawn } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterAll, describe, expect, test } from "vitest";
import { createServer } from "../src/server.js";
import { loadContentStore } from "../src/content.js";
import { explainManifest } from "../src/manifest-explain.js";
import { searchSpec } from "../src/search.js";
import { sectionIdFromHeading } from "../scripts/derive-content.js";

const store = loadContentStore();

function parseToolJson(result: unknown): unknown {
  const record = typeof result === "object" && result !== null ? (result as { content?: unknown }) : {};
  const content = Array.isArray(record.content) ? record.content : [];
  const text = content
    .map((item) => (typeof item === "object" && item !== null ? (item as { type?: unknown; text?: unknown }) : {}))
    .find((item) => item.type === "text" && typeof item.text === "string")?.text;
  if (typeof text !== "string") throw new Error("missing text tool result");
  return JSON.parse(text);
}

function withoutTimestamp(path: string): string {
  const parsed = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  delete parsed.derive_timestamp;
  return JSON.stringify(parsed);
}

function walkFiles(root: string, base = root): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
    const full = join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkFiles(full, base));
    } else {
      files.push(relative(base, full));
    }
  }
  return files;
}

describe("heading IDs", () => {
  test("derives stable documented heading IDs", () => {
    expect(sectionIdFromHeading("## 5. Actions (Profile ACT)")).toBe("5-actions");
    expect(sectionIdFromHeading("### 5.1 Risk classes (normative taxonomy)")).toBe("5.1-risk-classes");
    expect(store.sectionById.has("5.1-risk-classes")).toBe(true);
  });
});

describe("search and tools", () => {
  test("search returns risk classes for risk classes query", () => {
    const results = searchSpec(store, "risk classes", 5);
    expect(results[0]?.section_id).toBe("5.1-risk-classes");
    expect(results[0]?.provenance.pinned_commit).toBe(store.manifest.pinned_ajar_commit);
  });

  test("get_vectors for 8.1 returns scope and mandate vectors", async () => {
    const server = createServer(store);
    const client = new Client({ name: "vitest", version: "0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    const result = await client.callTool({ name: "get_vectors", arguments: { spec_section: "8.1" } });
    const body = parseToolJson(result) as { vectors: Array<{ id: string; kind: string }> };
    expect(body.vectors.some((vector) => vector.id === "mandate-valid-ticket-purchase")).toBe(true);
    expect(body.vectors.some((vector) => vector.kind === "scope-vectors")).toBe(true);
    await client.close();
    await server.close();
  });

  test("resource enumeration lists all six resource families", async () => {
    const server = createServer(store);
    const client = new Client({ name: "vitest", version: "0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    const result = await client.listResources();
    const uris = result.resources.map((resource) => resource.uri);
    expect(uris.some((uri) => uri.startsWith("ajar://spec/"))).toBe(true);
    expect(uris.some((uri) => uri.startsWith("ajar://schema/"))).toBe(true);
    expect(uris.some((uri) => uri.startsWith("ajar://example/"))).toBe(true);
    expect(uris.some((uri) => uri.startsWith("ajar://registry/"))).toBe(true);
    expect(uris.some((uri) => uri.startsWith("ajar://vector/"))).toBe(true);
    expect(uris.some((uri) => uri.startsWith("ajar://doc/"))).toBe(true);
    await client.close();
    await server.close();
  });
});

describe("manifest explanation", () => {
  test("passes the blog golden example", () => {
    const manifest = JSON.parse(readFileSync(join(store.root, "examples/manifests/blog-core.json"), "utf8")) as unknown;
    const report = explainManifest(store, manifest, "/.well-known/ajar.json");
    expect(report.valid).toBe(true);
    expect(report.label).toBe("explanatory; authoritative validation = conformance suite");
  });

  test("flags a manifest lifetime over 180 days", () => {
    const manifest = JSON.parse(readFileSync(join(store.root, "examples/manifests/blog-core.json"), "utf8")) as Record<string, unknown>;
    manifest.issued_at = "2026-01-01T00:00:00Z";
    manifest.expires_at = "2026-07-02T00:00:01Z";
    const report = explainManifest(store, manifest, "/.well-known/ajar.json");
    expect(report.valid).toBe(false);
    expect(report.semantic_findings.some((finding) => finding.code === "AJAR-VERIFY-EXPIRED")).toBe(true);
  });
});

describe("derive idempotency", () => {
  test("running derive twice is byte-stable except manifest timestamp", async () => {
    const run = async (): Promise<void> => {
      const { execFileSync } = await import("node:child_process");
      execFileSync("npm", ["run", "derive"], { cwd: join(store.root, ".."), env: { ...process.env, AJAR_DIR: join(store.root, "..", "..", "ajar") } });
    };
    await run();
    const firstFiles = walkFiles(store.root).sort();
    const firstSnapshot = new Map(
      firstFiles.map((file) => [
        file,
        file === "manifest.json" ? withoutTimestamp(join(store.root, file)) : readFileSync(join(store.root, file), "utf8"),
      ]),
    );
    await run();
    const secondFiles = walkFiles(store.root).sort();
    expect(secondFiles).toEqual(firstFiles);
    for (const file of secondFiles) {
      const content = file === "manifest.json" ? withoutTimestamp(join(store.root, file)) : readFileSync(join(store.root, file), "utf8");
      expect(content).toBe(firstSnapshot.get(file));
    }
  });
});

describe("stdio transport", () => {
  let child: ReturnType<typeof spawn> | undefined;

  afterAll(() => {
    child?.kill();
  });

  test("dist cli responds to initialize and tools/list", async () => {
    const cliPath = join(store.root, "..", "dist", "src", "cli.js");
    expect(statSync(cliPath, { throwIfNoEntry: false }), "dist/src/cli.js must exist — run npm run build first").toBeTruthy();
    child = spawn(process.execPath, [cliPath], { cwd: join(store.root, ".."), stdio: ["pipe", "pipe", "pipe"] });
    const responses: string[] = [];
    child.stdout?.on("data", (chunk: Buffer) => {
      responses.push(...chunk.toString("utf8").split(/\n/).filter(Boolean));
    });
    const send = (message: object): void => {
      child?.stdin?.write(`${JSON.stringify(message)}\n`);
    };
    send({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "vitest", version: "0" } } });
    await new Promise((resolve) => setTimeout(resolve, 300));
    send({ jsonrpc: "2.0", method: "notifications/initialized", params: {} });
    send({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
    await new Promise((resolve) => setTimeout(resolve, 600));
    const parsed = responses.map((line) => JSON.parse(line) as { id?: number; result?: { tools?: Array<{ name: string }> } });
    expect(parsed.some((message) => message.id === 1 && message.result)).toBe(true);
    expect(parsed.some((message) => message.id === 2 && message.result?.tools?.some((tool) => tool.name === "search_spec"))).toBe(true);
  });
});
