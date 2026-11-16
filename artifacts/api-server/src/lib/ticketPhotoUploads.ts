import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod/v4";

const photoGrant = z.object({
  path: z.string().regex(/^\/objects\/uploads\/[0-9a-f-]{36}$/i),
  companyId: z.string(), userId: z.string(), expires: z.number(),
}).strict();
const additionsSchema = z.array(z.object({ path: z.string(), uploadToken: z.string().max(4096) }).strict()).min(1).max(20);
type Scope = { companyId: string; userId: string };

function signature(payload: string, sessionId: string) {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("Session signing is not configured");
  return createHmac("sha256", secret).update(`ticket-photo:${sessionId}:${payload}`).digest("base64url");
}

export function signTicketPhotoUpload(path: string, scope: Scope, sessionId: string, now = Date.now()) {
  const payload = Buffer.from(JSON.stringify(photoGrant.parse({ path, ...scope, expires: now + 60 * 60 * 1000 }))).toString("base64url");
  return `${payload}.${signature(payload, sessionId)}`;
}

/** Validate all grants before changing storage ACLs or attaching any photo. */
export function ticketPhotoAdditions(value: unknown, scope: Scope, sessionId: string, now = Date.now()): string[] {
  return [...new Set(additionsSchema.parse(value).map(({ path, uploadToken }) => {
    const [payload, signed, extra] = uploadToken.split(".");
    if (!payload || !signed || extra) throw new Error("Invalid photo upload");
    const expected = Buffer.from(signature(payload, sessionId)), actual = Buffer.from(signed);
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) throw new Error("Invalid photo upload");
    const grant = photoGrant.parse(JSON.parse(Buffer.from(payload, "base64url").toString()));
    if (grant.path !== path || grant.companyId !== scope.companyId || grant.userId !== scope.userId || grant.expires <= now) {
      throw new Error("Photo upload expired or belongs to another session/company");
    }
    return path;
  }))];
}
