# Manifest Author Checklist

1. MUST set `ajar_version` and include it in `supported_versions`. Cites `3-the-capability-manifest`.
2. MUST declare honest profiles; include `actions` for `ACT` and `metering` for `PAY`. Cites `3-the-capability-manifest`.
3. MUST include site identity, owner key, views, policy summary, timestamps, sequence, and signature. Cites `3-the-capability-manifest`.
4. MUST cap `expires_at` to no more than 180 days after `issued_at`. Cites `3-the-capability-manifest`.
5. MUST use monotonically increasing `sequence` values for rollback protection. Cites `3-the-capability-manifest`.
6. MUST classify actions with the risk taxonomy and never lower the required controls. Cites `5.1-risk-classes`.
7. MUST use private extension prefixes for private fields, adapters, and scopes. Cites `13-version-and-extension-policy`.
8. MUST ignore compatible unknown fields only where schemas allow them. Cites `13-version-and-extension-policy`.
