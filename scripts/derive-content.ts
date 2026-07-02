import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const PACKAGE_ROOT = dirname(SCRIPT_PATH).replace(/\/scripts$/, "");
const AJAR_DIR = process.env.AJAR_DIR ?? join(PACKAGE_ROOT, "..", "ajar");
const CONTENT_DIR = join(PACKAGE_ROOT, "content");
const TOOL_VERSION = "ajar-docs-mcp@0.1.0";
const SPEC_SOURCE = "docs/03-PROTOCOL-SPEC.md";
const GENERATED_BY = "scripts/derive-content.ts";

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

interface SourceFile {
  source_path: string;
  content_path: string;
  bytes: number;
}

interface SpecSection {
  id: string;
  number: string;
  heading: string;
  level: number;
  markdown: string;
  source_file: string;
  source_line: number;
}

interface SearchEntry {
  section_id: string;
  tf: number;
}

interface SearchIndex {
  generated_by: string;
  source_file: string;
  document_count: number;
  tokens: Record<string, SearchEntry[]>;
}

interface VectorIndexEntry {
  id: string;
  source_file: string;
  spec_section: string;
  kind: string;
  vector: JsonValue;
}

function stableJson(value: JsonValue): string {
  return `${stringifyStable(value, 0)}\n`;
}

function stringifyStable(value: JsonValue, indent: number): string {
  const space = "  ".repeat(indent);
  const next = "  ".repeat(indent + 1);
  if (value === null || typeof value === "boolean" || typeof value === "number" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    return `[\n${value.map((item) => `${next}${stringifyStable(item, indent + 1)}`).join(",\n")}\n${space}]`;
  }
  const entries = Object.entries(value).sort(([left], [right]) => left.localeCompare(right));
  if (entries.length === 0) return "{}";
  return `{\n${entries
    .map(([key, item]) => `${next}${JSON.stringify(key)}: ${stringifyStable(item, indent + 1)}`)
    .join(",\n")}\n${space}}`;
}

function readUtf8(path: string): string {
  return readFileSync(path, "utf8");
}

function writeJson(path: string, value: JsonValue): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, stableJson(value), "utf8");
}

function writeText(path: string, value: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, value.endsWith("\n") ? value : `${value}\n`, "utf8");
}

function copyFileTracked(sourceRelative: string, destinationRelative: string, files: SourceFile[]): void {
  const sourcePath = join(AJAR_DIR, sourceRelative);
  const destinationPath = join(CONTENT_DIR, destinationRelative);
  const body = readUtf8(sourcePath);
  writeText(destinationPath, body);
  files.push({
    source_path: sourceRelative,
    content_path: destinationRelative,
    bytes: Buffer.byteLength(body),
  });
}

function copyTreeTracked(sourceRelative: string, destinationRelative: string, files: SourceFile[]): void {
  const sourcePath = join(AJAR_DIR, sourceRelative);
  for (const name of readdirSync(sourcePath).sort()) {
    const childSourceRelative = `${sourceRelative}/${name}`;
    const childDestinationRelative = `${destinationRelative}/${name}`;
    const childPath = join(AJAR_DIR, childSourceRelative);
    if (statSync(childPath).isDirectory()) {
      copyTreeTracked(childSourceRelative, childDestinationRelative, files);
    } else {
      copyFileTracked(childSourceRelative, childDestinationRelative, files);
    }
  }
}

function stripParentheticals(title: string): string {
  return title.replace(/\s*\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
}

export function sectionIdFromHeading(heading: string): string {
  const normalized = heading.replace(/^#+\s+/, "").trim();
  const match = normalized.match(/^(\d+(?:\.\d+)*)\.?\s+(.+)$/);
  if (!match) {
    throw new Error(`Cannot derive section id for unnumbered heading: ${heading}`);
  }
  const number = match[1];
  const title = stripParentheticals(match[2])
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 4)
    .join("-");
  return title.length > 0 ? `${number}-${title}` : number;
}

function headingNumber(heading: string): string {
  const match = heading.replace(/^#+\s+/, "").trim().match(/^(\d+(?:\.\d+)*)/);
  if (!match) {
    throw new Error(`Cannot derive section number for heading: ${heading}`);
  }
  return match[1];
}

function deriveSections(specMarkdown: string): SpecSection[] {
  const lines = specMarkdown.split(/\n/);
  const headings: Array<{ lineIndex: number; level: number; heading: string }> = [];
  for (const [lineIndex, line] of lines.entries()) {
    const match = line.match(/^(#{2,6})\s+(.+)$/);
    if (match && /^\d+(?:\.\d+)*/.test(match[2])) {
      headings.push({ lineIndex, level: match[1].length, heading: match[2].trim() });
    }
  }
  return headings.map((heading, index) => {
    const next = headings.find((candidate, candidateIndex) => candidateIndex > index && candidate.level <= heading.level);
    const endLine = next?.lineIndex ?? lines.length;
    const markdown = lines.slice(heading.lineIndex, endLine).join("\n").trim();
    return {
      id: sectionIdFromHeading(heading.heading),
      number: headingNumber(heading.heading),
      heading: heading.heading,
      level: heading.level,
      markdown,
      source_file: SPEC_SOURCE,
      source_line: heading.lineIndex + 1,
    };
  });
}

function tokensFor(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/`[^`]+`/g, " ")
    .split(/[^a-z0-9.]+/)
    .map((token) => token.replace(/^\.+|\.+$/g, ""))
    .filter((token) => token.length >= 2);
}

function deriveSearchIndex(sections: SpecSection[]): SearchIndex {
  const tokenDocs = new Map<string, Map<string, number>>();
  for (const section of sections) {
    const counts = new Map<string, number>();
    for (const token of tokensFor(`${section.heading}\n${section.markdown}`)) {
      counts.set(token, (counts.get(token) ?? 0) + 1);
    }
    for (const [token, count] of counts) {
      const postings = tokenDocs.get(token) ?? new Map<string, number>();
      postings.set(section.id, count);
      tokenDocs.set(token, postings);
    }
  }
  const tokens: Record<string, SearchEntry[]> = {};
  for (const [token, postings] of [...tokenDocs.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    tokens[token] = [...postings.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([section_id, tf]) => ({ section_id, tf }));
  }
  return {
    generated_by: GENERATED_BY,
    source_file: SPEC_SOURCE,
    document_count: sections.length,
    tokens,
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function jsonFromSource(sourceRelative: string): unknown {
  return JSON.parse(readUtf8(join(AJAR_DIR, sourceRelative)));
}

function deriveVectorIndex(): VectorIndexEntry[] {
  const vectorFiles = [
    "test-vectors/core-vectors.json",
    "test-vectors/crypto-signing.json",
    "test-vectors/extension-vectors.json",
    "test-vectors/http-request.json",
    "test-vectors/http-signature-vectors.json",
    "test-vectors/manifest-check-vectors.json",
    "test-vectors/runtime-vectors.json",
    "test-vectors/scope-vectors.json",
  ];
  const entries: VectorIndexEntry[] = [];
  for (const sourceFile of vectorFiles) {
    const root = asRecord(jsonFromSource(sourceFile));
    const vectors = Array.isArray(root.vectors) ? root.vectors : [];
    for (const vector of vectors) {
      const record = asRecord(vector);
      const id = typeof record.id === "string" ? record.id : `${basename(sourceFile, ".json")}-${entries.length + 1}`;
      const specSection =
        typeof record.spec_section === "string"
          ? record.spec_section
          : sourceFile.endsWith("scope-vectors.json")
            ? "8.1"
            : "";
      entries.push({
        id,
        source_file: sourceFile,
        spec_section: specSection,
        kind: basename(sourceFile, ".json"),
        vector: vector as JsonValue,
      });
    }
  }
  const coverage = asRecord(jsonFromSource("test-vectors/must-coverage.json"));
  const requirements = Array.isArray(coverage.requirements) ? coverage.requirements : [];
  for (const requirement of requirements) {
    const record = asRecord(requirement);
    const id = typeof record.id === "string" ? record.id : `must-coverage-${entries.length + 1}`;
    entries.push({
      id,
      source_file: "test-vectors/must-coverage.json",
      spec_section: typeof record.section === "string" ? record.section : "",
      kind: "must-coverage",
      vector: requirement as JsonValue,
    });
  }
  return entries.sort((left, right) => left.spec_section.localeCompare(right.spec_section) || left.id.localeCompare(right.id));
}

function main(): void {
  const ajarCommit = execFileSync("git", ["-C", AJAR_DIR, "rev-parse", "HEAD"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();

  rmSync(CONTENT_DIR, { recursive: true, force: true });
  mkdirSync(CONTENT_DIR, { recursive: true });

  const files: SourceFile[] = [];
  const specMarkdown = readUtf8(join(AJAR_DIR, SPEC_SOURCE));
  const sections = deriveSections(specMarkdown);

  writeJson(join(CONTENT_DIR, "spec", "sections.json"), sections as unknown as JsonValue);
  writeJson(join(CONTENT_DIR, "search-index.json"), deriveSearchIndex(sections) as unknown as JsonValue);
  writeJson(join(CONTENT_DIR, "vectors", "index.json"), deriveVectorIndex() as unknown as JsonValue);

  files.push(
    { source_path: SPEC_SOURCE, content_path: "spec/sections.json", bytes: Buffer.byteLength(specMarkdown) },
    { source_path: SPEC_SOURCE, content_path: "search-index.json", bytes: Buffer.byteLength(specMarkdown) },
    { source_path: "test-vectors/*.json", content_path: "vectors/index.json", bytes: 0 },
  );

  copyTreeTracked("schemas", "schemas", files);
  copyTreeTracked("examples", "examples", files);
  copyTreeTracked("registries", "registries", files);
  copyTreeTracked("test-vectors", "vectors/raw", files);
  for (const [source, destination] of [
    ["docs/01-RESEARCH.md", "docs/research.md"],
    ["docs/02-ARCHITECTURE.md", "docs/architecture.md"],
    ["docs/04-SECURITY-MODEL.md", "docs/security-model.md"],
    ["docs/05-OWNER-CONTROL.md", "docs/owner-control.md"],
    ["GLOSSARY.md", "docs/glossary.md"],
    ["DECISIONS.md", "docs/decisions.md"],
  ]) {
    copyFileTracked(source, destination, files);
  }

  const manifest = {
    generated_by: GENERATED_BY,
    tool_version: TOOL_VERSION,
    derive_timestamp: new Date().toISOString(),
    ajar_commit: ajarCommit,
    pinned_ajar_commit: ajarCommit,
    ajar_version: "0.1",
    heading_id_rule: {
      summary:
        "Keep numeric prefix including dots; drop parenthetical tags; lowercase title; replace non-alphanumerics with hyphens; keep roughly first four title words.",
      examples: {
        "## 5. Actions (Profile ACT)": "5-actions",
        "### 5.1 Risk classes (normative taxonomy)": "5.1-risk-classes",
      },
      documented_at: "docs/HEADING-IDS.md",
    },
    source_files: files.sort((left, right) => left.content_path.localeCompare(right.content_path)),
    resource_counts: {
      docs: 6,
      examples: files.filter((file) => file.content_path.startsWith("examples/") && file.content_path.endsWith(".json")).length,
      registries: files.filter((file) => file.content_path.startsWith("registries/") && file.content_path.endsWith(".md")).length,
      schemas: files.filter((file) => file.content_path.startsWith("schemas/") && file.content_path.endsWith(".json")).length,
      spec_sections: sections.length,
      vectors: deriveVectorIndex().length,
    },
  };
  writeJson(join(CONTENT_DIR, "manifest.json"), manifest as unknown as JsonValue);
  writeText(
    join(CONTENT_DIR, "README.generated.md"),
    `# Generated Content\n\nGenerated by ${GENERATED_BY} from ajar commit ${ajarCommit}.\nDo not hand-edit files under content/; rerun npm run derive.\n`,
  );

  const relativeContent = relative(PACKAGE_ROOT, CONTENT_DIR);
  process.stderr.write(`Derived ${sections.length} spec sections into ${relativeContent} from ${ajarCommit}\n`);
}

if (process.argv[1] === SCRIPT_PATH) {
  main();
}
