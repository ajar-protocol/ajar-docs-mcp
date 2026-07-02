export interface Provenance {
  ajar_version: string;
  source_file: string;
  section_id: string;
  pinned_commit: string;
}

export interface ManifestContent {
  generated_by: string;
  tool_version: string;
  derive_timestamp: string;
  ajar_commit: string;
  pinned_ajar_commit: string;
  ajar_version: string;
  heading_id_rule: {
    summary: string;
    examples: Record<string, string>;
    documented_at: string;
  };
  resource_counts: Record<string, number>;
  source_files: Array<{
    source_path: string;
    content_path: string;
    bytes: number;
  }>;
}

export interface SpecSection {
  id: string;
  number: string;
  heading: string;
  level: number;
  markdown: string;
  source_file: string;
  source_line: number;
}

export interface SearchIndex {
  generated_by: string;
  source_file: string;
  document_count: number;
  tokens: Record<string, Array<{ section_id: string; tf: number }>>;
}

export interface VectorIndexEntry {
  id: string;
  source_file: string;
  spec_section: string;
  kind: string;
  vector: unknown;
}

export interface ContentStore {
  root: string;
  manifest: ManifestContent;
  sections: SpecSection[];
  sectionById: Map<string, SpecSection>;
  searchIndex: SearchIndex;
  vectors: VectorIndexEntry[];
}

export interface SearchResult {
  section_id: string;
  heading: string;
  excerpt: string;
  score: number;
  provenance: Provenance;
}

export interface ToolEnvelope<T> {
  ajar_version: string;
  pinned_commit: string;
  result: T;
}

export type ChecklistTarget =
  | "gateway-core"
  | "gateway-act"
  | "client"
  | "manifest-author"
  | "wordpress-plugin"
  | "nextjs-site";

export type ExampleScenario = "blog" | "docs" | "commerce" | "mandate-chain";
