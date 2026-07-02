import { createRequire } from "node:module";
import type { AnySchema, ErrorObject } from "ajv/dist/2020.js";
import { join } from "node:path";
import { readFileSync, readdirSync } from "node:fs";
import type { ContentStore, Provenance } from "./types.js";
import { provenance } from "./content.js";

const require = createRequire(import.meta.url);
const Ajv2020 = require("ajv/dist/2020.js").default as typeof import("ajv/dist/2020.js").default;
const addFormats = require("ajv-formats") as typeof import("ajv-formats").default;

interface SchemaFinding {
  kind: "schema";
  path: string;
  message: string;
  schema_path: string;
  spec_section: string;
  provenance: Provenance;
}

interface SemanticFinding {
  kind: "semantic";
  code: string;
  path: string;
  message: string;
  spec_section: string;
  provenance: Provenance;
}

export interface ManifestExplanation {
  label: "explanatory; authoritative validation = conformance suite";
  valid: boolean;
  schema_findings: SchemaFinding[];
  semantic_findings: SemanticFinding[];
  field_report: Array<{ path: string; present: boolean; spec_section: string; provenance: Provenance }>;
  provenance: Provenance;
}

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function schemaPointer(error: ErrorObject): string {
  return error.schemaPath || "#";
}

function instancePath(error: ErrorObject): string {
  return error.instancePath.length > 0 ? error.instancePath : "$";
}

function compileManifestValidator(store: ContentStore): InstanceType<typeof Ajv2020> {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  const schemaRoot = join(store.root, "schemas");
  for (const file of readdirSync(schemaRoot).filter((name) => name.endsWith(".json")).sort()) {
    const schema = JSON.parse(readFileSync(join(schemaRoot, file), "utf8")) as AnySchema;
    ajv.addSchema(schema, file);
  }
  return ajv;
}

function parseDate(value: unknown): Date | undefined {
  return typeof value === "string" ? new Date(value) : undefined;
}

function riskValue(value: unknown): number {
  return value === "R3" ? 3 : value === "R2" ? 2 : value === "R1" ? 1 : value === "R0" ? 0 : -1;
}

function semanticFindings(store: ContentStore, manifest: JsonRecord, servedPath?: string): SemanticFinding[] {
  const findings: SemanticFinding[] = [];
  const add = (code: string, path: string, message: string, sectionId: string): void => {
    findings.push({
      kind: "semantic",
      code,
      path,
      message,
      spec_section: sectionId,
      provenance: provenance(store, "docs/03-PROTOCOL-SPEC.md", sectionId),
    });
  };

  if (servedPath !== undefined && servedPath !== "/.well-known/ajar.json") {
    add("AJAR-MANIFEST-LOCATION", "served_path", "manifest must be served at /.well-known/ajar.json", "2.1-location");
  }

  const version = manifest.ajar_version;
  const supported = Array.isArray(manifest.supported_versions) ? manifest.supported_versions : [];
  if (typeof version === "string" && !supported.includes(version)) {
    add("AJAR-VERSION-UNSUPPORTED", "/ajar_version", "ajar_version must appear in supported_versions", "3-the-capability-manifest");
  }

  const profiles = new Set(Array.isArray(manifest.profiles) ? manifest.profiles : []);
  if (!profiles.has("CORE")) {
    add("AJAR-MANIFEST-PROFILE", "/profiles", "manifests should include CORE for readable Views", "3-the-capability-manifest");
  }
  if (profiles.has("ACT") && !Array.isArray(manifest.actions)) {
    add("AJAR-MANIFEST-PROFILE", "/actions", "ACT profile requires at least one Action", "3-the-capability-manifest");
  }
  if (profiles.has("PAY") && !isRecord(manifest.metering)) {
    add("AJAR-MANIFEST-PROFILE", "/metering", "PAY profile requires metering", "3-the-capability-manifest");
  }
  if (profiles.has("FED") && !isRecord(manifest.federation)) {
    add("AJAR-MANIFEST-PROFILE", "/federation", "FED profile requires federation", "3-the-capability-manifest");
  }

  const issued = parseDate(manifest.issued_at);
  const expires = parseDate(manifest.expires_at);
  if (issued && expires && Number.isFinite(issued.getTime()) && Number.isFinite(expires.getTime())) {
    if (expires <= issued) {
      add("AJAR-VERIFY-EXPIRED", "/expires_at", "expires_at must be after issued_at", "3-the-capability-manifest");
    }
    if (expires.getTime() - issued.getTime() > 180 * 24 * 60 * 60 * 1000) {
      add("AJAR-VERIFY-EXPIRED", "/expires_at", "manifest lifetime must not exceed 180 days", "3-the-capability-manifest");
    }
  }

  if (typeof manifest.sequence === "number" && manifest.sequence < 0) {
    add("AJAR-VERIFY-ROLLBACK", "/sequence", "sequence must be greater than or equal to 0", "3-the-capability-manifest");
  }

  const actionIds = new Map<string, number>();
  if (Array.isArray(manifest.actions)) {
    manifest.actions.forEach((action, index) => {
      if (!isRecord(action)) return;
      const id = typeof action.id === "string" ? action.id : undefined;
      if (id) actionIds.set(id, (actionIds.get(id) ?? 0) + 1);
      const risk = riskValue(action.risk);
      if (risk >= 1) {
        if (action.simulate !== true) {
          add("AJAR-ACTION-RISK-FLOOR", `/actions/${index}/simulate`, "R1+ actions require simulate: true", "5.1-risk-classes");
        }
        if (action.idempotency !== "required") {
          add("AJAR-ACTION-RISK-FLOOR", `/actions/${index}/idempotency`, "R1+ actions require idempotency: required", "5.1-risk-classes");
        }
      }
      if (risk >= 2) {
        if (action.execution !== "two_phase") {
          add("AJAR-ACTION-RISK-FLOOR", `/actions/${index}/execution`, "R2+ actions require two_phase execution", "5.1-risk-classes");
        }
        const requires = isRecord(action.requires) ? action.requires : {};
        const scopes = Array.isArray(requires.mandate_scopes) ? requires.mandate_scopes : [];
        if (scopes.length === 0) {
          add("AJAR-ACTION-RISK-FLOOR", `/actions/${index}/requires/mandate_scopes`, "R2+ actions require mandate scopes", "5.1-risk-classes");
        }
      }
    });
  }
  for (const [id, count] of actionIds) {
    if (count > 1) {
      add("AJAR-ACTION-DUPLICATE", "/actions", `duplicate action id ${id}`, "5-actions");
    }
  }

  return findings;
}

export function explainManifest(store: ContentStore, manifest: unknown, servedPath?: string): ManifestExplanation {
  const ajv = compileManifestValidator(store);
  const validator = ajv.getSchema("manifest.schema.json");
  if (!validator) {
    throw new Error("manifest.schema.json was not loaded");
  }
  const validSchema = validator(manifest);
  const schemaErrors: ErrorObject[] = validSchema ? [] : validator.errors ?? [];
  const schema_findings: SchemaFinding[] = schemaErrors.map((error) => ({
    kind: "schema",
    path: instancePath(error),
    message: error.message ?? "schema validation failed",
    schema_path: schemaPointer(error),
    spec_section: "3-the-capability-manifest",
    provenance: provenance(store, "schemas/manifest.schema.json", "3-the-capability-manifest"),
  }));

  const semantic_findings = schema_findings.length === 0 && isRecord(manifest) ? semanticFindings(store, manifest, servedPath) : [];
  const fields = ["ajar_version", "supported_versions", "profiles", "site", "keys", "views", "actions", "policy_summary", "metering", "issued_at", "expires_at", "sequence", "signature"];
  const record = isRecord(manifest) ? manifest : {};
  return {
    label: "explanatory; authoritative validation = conformance suite",
    valid: schema_findings.length === 0 && semantic_findings.length === 0,
    schema_findings,
    semantic_findings,
    field_report: fields.map((field) => ({
      path: `/${field}`,
      present: Object.hasOwn(record, field),
      spec_section: "3-the-capability-manifest",
      provenance: provenance(store, "docs/03-PROTOCOL-SPEC.md", "3-the-capability-manifest"),
    })),
    provenance: provenance(store, "schemas/manifest.schema.json", "3-the-capability-manifest"),
  };
}
