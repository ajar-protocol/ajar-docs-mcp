# Next.js Scaffold Guidance

## Manifest route

Create `app/.well-known/ajar.json/route.ts` and return the signed manifest with `content-type: application/json`. Generate the manifest at build time from typed data, canonicalize with JCS, and sign with a build-only signer process. The web runtime should only read the signed artifact.

## Content negotiation

Use middleware or per-route handlers to inspect `Accept`. Browsers continue to receive HTML. Agents requesting `application/ajar+json` receive the signed View object, and callers requesting `text/markdown` receive a plain markdown view.

## Stable chunks

For MDX, derive chunk IDs from explicit frontmatter IDs or stable heading IDs. Never use array positions or generated React keys as public chunk IDs. Keep each chunk hash stable by hashing the normalized chunk content.

## Signing separation

Keep owner keys offline. Use operational content-signing keys for views and a separate manifest signing process for release artifacts. The app server should not hold root signing material.

## llms.txt

Publish `llms.txt` or similar crawler guidance in parallel for current crawlers, but do not treat it as an Ajar substitute. Ajar discovery remains the `/.well-known/ajar.json` manifest and negotiated views.
