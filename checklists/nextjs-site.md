# Next.js Site Checklist

1. MUST implement a route handler for `/.well-known/ajar.json`. Cites `2.1-location`.
2. MUST build the manifest from typed source data and sign the final canonical object at build time. Cites `2.4-canonicalization-and-signatures`.
3. MUST serve the same content URL with browser HTML, `application/ajar+json`, or `text/markdown` based on `Accept`. Cites `4-views`.
4. MUST generate stable view chunk IDs from source MDX headings or explicit frontmatter IDs. Cites `4-views`.
5. MUST attach hashes to every chunk and an ETag to the view. Cites `4-views`.
6. MUST tag all chunks as origin data, never instructions. Cites `4-views`.
7. MUST keep `llms.txt` or similar crawler affordances parallel to, not a replacement for, Ajar discovery. Cites `9-fallback-interaction`.
8. MUST return RFC 9457 problem+json with `Ajar-Error-Code` when Ajar-specific requests fail. Cites `10-http-surface-summary`.
