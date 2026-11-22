import assert from "node:assert/strict";
import { test } from "node:test";
import { preserveRepeatedUniqueConstraints } from "./replay-declaration-sql";

test("retains separately named equivalent UNIQUE constraints before dependent foreign keys", () => {
  const schema = `CREATE TABLE "a" (
\t"id" text NOT NULL,
\t"label" text,
\tCONSTRAINT "ordered_key" UNIQUE("id","label"),
\tCONSTRAINT "reversed_key" UNIQUE("label","id"),
\tCONSTRAINT "legacy_key" UNIQUE("id","label")
);

ALTER TABLE "b" ADD CONSTRAINT "b_id_fk" FOREIGN KEY ("id","label") REFERENCES "public"."a"("id","label");`;
  const output = preserveRepeatedUniqueConstraints(schema);
  assert.match(output, /CONSTRAINT "ordered_key" UNIQUE\("id","label"\),/);
  assert.match(output, /CONSTRAINT "reversed_key" UNIQUE\("label","id"\)\n\);/);
  const moved = 'ALTER TABLE "a" ADD CONSTRAINT "legacy_key" UNIQUE("id","label");';
  assert.ok(output.indexOf(moved) > output.indexOf("\n);"));
  assert.ok(output.indexOf(moved) < output.indexOf('ALTER TABLE "b"'));
});

test("returns a schema with no equivalent unique constraints unchanged", () => {
  const schema = `CREATE TABLE "a" (
\t"id" text NOT NULL,
\tCONSTRAINT "a_id_unique" UNIQUE("id")
);`;
  assert.equal(preserveRepeatedUniqueConstraints(schema), schema);
});
