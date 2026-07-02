# Stable Heading IDs

Generated spec section IDs are derived from headings in `docs/03-PROTOCOL-SPEC.md`.

Rule:

1. Keep the numeric heading prefix verbatim, including dots.
2. Drop parenthetical profile or explanatory tags from the title.
3. Lowercase the title.
4. Replace non-alphanumeric runs with hyphens.
5. Keep roughly the first four title words after the number.
6. Join the numeric prefix and title slug with one hyphen.

Examples:

- `## 5. Actions (Profile ACT)` becomes `5-actions`.
- `### 5.1 Risk classes (normative taxonomy)` becomes `5.1-risk-classes`.

The README example `ajar://spec/5.1-risk-classes` maps to the actual v0.1 heading `### 5.1 Risk classes (normative taxonomy)`.
