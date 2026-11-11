import { AsyncLocalStorage } from "node:async_hooks";
import type { UserWithContext } from "../auth";

/** Carries the initiating actor into existing storage calls without rewriting
 * legacy chemical/checklist side effects. Never stored on a mutable session. */
export const campaignRoundActor = new AsyncLocalStorage<UserWithContext>();
