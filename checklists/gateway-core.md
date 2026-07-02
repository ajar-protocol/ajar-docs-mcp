# Gateway CORE Checklist

1. MUST serve the manifest at `/.well-known/ajar.json`. Cites `2.1-location`.
2. MUST publish owner key material that can be bound to the domain. Cites `2.2-owner-keys`.
3. MUST sign durable artifacts using the canonical JSON signing profile. Cites `2.4-canonicalization-and-signatures`.
4. MUST include `CORE` in `profiles` and expose readable views. Cites `3-the-capability-manifest`.
5. MUST negotiate Ajar views with `Accept: application/ajar+json` or `Accept: text/markdown`. Cites `4-views`.
6. MUST keep stable chunk IDs and hashes across view re-renders. Cites `4-views`.
7. MUST reject manifests whose lifetime exceeds 180 days. Cites `3-the-capability-manifest`.
8. MUST return problem+json errors with registered Ajar error codes. Cites `10-http-surface-summary`.
