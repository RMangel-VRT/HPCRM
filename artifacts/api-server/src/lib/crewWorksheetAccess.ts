import { accessRole } from "../../../../lib/db/src/accessRole";

const readRoles = new Set([
  "admin", "office", "field_manager", "crew_supervisor", "landscape_supervisor",
  "field", "chemical_manager", "irrigation_manager", "shop_manager", "mapping",
]);
const writeRoles = new Set(["admin", "office", "field_manager", "crew_supervisor", "landscape_supervisor"]);
export const canReadCrewWorksheets = (role: string) => readRoles.has(accessRole(role));
export const canWriteCrewWorksheets = (role: string) => writeRoles.has(accessRole(role));
