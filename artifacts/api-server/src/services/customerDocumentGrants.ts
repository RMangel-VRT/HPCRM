import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod/v4";
import { CustomerDocumentError } from "./customerDocumentContent";

const grantSchema = z.object({
  id: z.string().uuid(), companyId: z.string(), customerId: z.string(), userId: z.string(),
  path: z.string(), filename: z.string(), expires: z.number(),
}).strict();
export type CustomerDocumentGrant = z.infer<typeof grantSchema>;
function mac(payload: string, sessionId: string) {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("Session signing is not configured");
  return createHmac("sha256", secret).update(`${sessionId}:${payload}`).digest("base64url");
}
/** Stateless signatures prevent lost grants from parallel upload-url requests
 * racing on express-session's whole-session last-write-wins persistence.
 */
export function signDocumentGrant(grant: CustomerDocumentGrant, sessionId: string) {
  const payload = Buffer.from(JSON.stringify(grant)).toString("base64url");
  return `${payload}.${mac(payload, sessionId)}`;
}
export function readDocumentGrant(token: string, sessionId: string) {
  try {
    const [payload, signature, extra] = token.split(".");
    if (!payload || !signature || extra || token.length > 4096) throw new Error();
    const expected = Buffer.from(mac(payload, sessionId)), actual = Buffer.from(signature);
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) throw new Error();
    return grantSchema.parse(JSON.parse(Buffer.from(payload, "base64url").toString()));
  } catch { throw new CustomerDocumentError(404, "DOCUMENT_UPLOAD_EXPIRED"); }
}
