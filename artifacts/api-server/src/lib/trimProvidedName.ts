/** Normalize only a name being saved, never a legacy value omitted from a patch. */
export function trimProvidedName<T extends object>(fields: T): T {
  return "name" in fields && typeof fields.name === "string" ? { ...fields, name: fields.name.trim() } : fields;
}
