import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, sep } from "node:path";
import { fileURLToPath } from "node:url";
import type { ContentStore, ManifestContent, SearchIndex, SpecSection, VectorIndexEntry, Provenance } from "./types.js";

const MODULE_DIR = dirname(fileURLToPath(import.meta.url));
export const PACKAGE_ROOT = MODULE_DIR.endsWith(`${sep}dist${sep}src`) ? join(MODULE_DIR, "..", "..") : join(MODULE_DIR, "..");
export const CONTENT_ROOT = join(PACKAGE_ROOT, "content");

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

export function readText(relativePath: string): string {
  return readFileSync(join(PACKAGE_ROOT, relativePath), "utf8");
}

export function loadContentStore(root = CONTENT_ROOT): ContentStore {
  const manifest = readJson<ManifestContent>(join(root, "manifest.json"));
  const sections = readJson<SpecSection[]>(join(root, "spec", "sections.json"));
  const searchIndex = readJson<SearchIndex>(join(root, "search-index.json"));
  const vectors = readJson<VectorIndexEntry[]>(join(root, "vectors", "index.json"));
  return {
    root,
    manifest,
    sections,
    sectionById: new Map(sections.map((section) => [section.id, section])),
    searchIndex,
    vectors,
  };
}

export function provenance(store: ContentStore, sourceFile: string, sectionId: string): Provenance {
  return {
    ajar_version: store.manifest.ajar_version,
    source_file: sourceFile,
    section_id: sectionId,
    pinned_commit: store.manifest.pinned_ajar_commit,
  };
}

export function listJsonFiles(root: string, prefix = ""): string[] {
  const entries = readdirSync(root, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name));
  const files: string[] = [];
  for (const entry of entries) {
    const nextPrefix = prefix.length > 0 ? `${prefix}/${entry.name}` : entry.name;
    const fullPath = join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...listJsonFiles(fullPath, nextPrefix));
    } else if (entry.name.endsWith(".json")) {
      files.push(nextPrefix);
    }
  }
  return files;
}
