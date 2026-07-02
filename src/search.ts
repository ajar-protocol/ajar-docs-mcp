import type { ContentStore, SearchResult } from "./types.js";
import { provenance } from "./content.js";

function queryTokens(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[^a-z0-9.]+/)
    .map((token) => token.replace(/^\.+|\.+$/g, ""))
    .filter((token) => token.length >= 2);
}

function excerptFor(markdown: string, tokens: string[]): string {
  const lower = markdown.toLowerCase();
  const first = tokens
    .map((token) => lower.indexOf(token.toLowerCase()))
    .filter((index) => index >= 0)
    .sort((left, right) => left - right)[0];
  const start = first === undefined ? 0 : Math.max(0, first - 80);
  const excerpt = markdown.slice(start, start + 300).replace(/\s+/g, " ").trim();
  return start > 0 ? `...${excerpt}` : excerpt;
}

export function searchSpec(store: ContentStore, query: string, limit: number): SearchResult[] {
  const tokens = [...new Set(queryTokens(query))];
  const scores = new Map<string, number>();
  for (const token of tokens) {
    const postings = store.searchIndex.tokens[token] ?? [];
    const idf = Math.log((1 + store.searchIndex.document_count) / (1 + postings.length)) + 1;
    for (const posting of postings) {
      scores.set(posting.section_id, (scores.get(posting.section_id) ?? 0) + posting.tf * idf);
    }
  }
  const phrase = query.trim().toLowerCase();
  for (const section of store.sections) {
    if (phrase.length > 0 && `${section.heading}\n${section.markdown}`.toLowerCase().includes(phrase)) {
      scores.set(section.id, (scores.get(section.id) ?? 0) + 8);
    }
  }
  return [...scores.entries()]
    .map(([sectionId, score]) => {
      const section = store.sectionById.get(sectionId);
      if (!section) {
        throw new Error(`Search index references missing section ${sectionId}`);
      }
      return {
        section_id: section.id,
        heading: section.heading,
        excerpt: excerptFor(section.markdown, tokens),
        score: Number(score.toFixed(6)),
        provenance: provenance(store, section.source_file, section.id),
      };
    })
    .sort((left, right) => right.score - left.score || left.section_id.localeCompare(right.section_id))
    .slice(0, Math.max(1, Math.min(limit, 20)));
}
