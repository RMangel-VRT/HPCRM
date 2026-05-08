export const REQUIRED_EXTENSIONS = ["pg_trgm"] as const;

export type RequiredExtension = (typeof REQUIRED_EXTENSIONS)[number];

export const OPERATOR_CLASS_TO_EXTENSION: Record<string, RequiredExtension> = {
  gin_trgm_ops: "pg_trgm",
  gist_trgm_ops: "pg_trgm",
};
