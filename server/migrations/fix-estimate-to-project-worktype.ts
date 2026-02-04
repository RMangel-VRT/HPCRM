import { db } from "../db";
import { tickets, ticketTypeStatuses, ticketTypes } from "@shared/schema";
import { eq, and, inArray } from "drizzle-orm";

/**
 * Migration: Fix Estimate Request to Project Work Type
 * 
 * This migration updates existing tickets that:
 * 1. Have work_type = 'estimate_request'
 * 2. Are currently in an approved/execution status (Ready to Schedule, Work Completed, Ready for Billing, Invoicing)
 * 
 * These tickets should have their work_type changed to 'project' since they've been approved
 * and are no longer pending estimates.
 * 
 * Run with: npx tsx server/migrations/fix-estimate-to-project-worktype.ts
 */

async function migrate() {
  console.log("Starting migration: Fix Estimate Request to Project Work Type");

  // Get the Project ticket type to find its statuses
  const projectTicketType = await db
    .select()
    .from(ticketTypes)
    .where(eq(ticketTypes.name, "Project"))
    .limit(1);

  if (!projectTicketType.length) {
    console.error("Project ticket type not found!");
    process.exit(1);
  }

  const projectTypeId = projectTicketType[0].id;
  console.log(`Found Project ticket type: ${projectTypeId}`);

  // Get the approved-path statuses for Project workflow
  const approvedStatusNames = [
    "Ready to Schedule",
    "Work Completed",
    "Ready for Billing",
    "Invoicing"
  ];

  const approvedStatuses = await db
    .select()
    .from(ticketTypeStatuses)
    .where(
      and(
        eq(ticketTypeStatuses.ticketTypeId, projectTypeId),
        inArray(ticketTypeStatuses.name, approvedStatusNames)
      )
    );

  const approvedStatusIds = approvedStatuses.map(s => s.id);
  console.log(`Found ${approvedStatuses.length} approved-path statuses:`, approvedStatuses.map(s => s.name));

  // Find tickets that need to be updated
  const ticketsToUpdate = await db
    .select({
      id: tickets.id,
      title: tickets.title,
      workType: tickets.workType
    })
    .from(tickets)
    .where(
      and(
        eq(tickets.workType, "estimate_request"),
        inArray(tickets.currentStatusId, approvedStatusIds)
      )
    );

  console.log(`Found ${ticketsToUpdate.length} tickets to update:`);
  ticketsToUpdate.forEach(t => {
    console.log(`  - ${t.id}: ${t.title}`);
  });

  if (ticketsToUpdate.length === 0) {
    console.log("No tickets need to be updated. Migration complete.");
    process.exit(0);
  }

  // Update the tickets
  const ticketIds = ticketsToUpdate.map(t => t.id);
  
  const result = await db
    .update(tickets)
    .set({ workType: "project" })
    .where(inArray(tickets.id, ticketIds));

  console.log(`Successfully updated ${ticketsToUpdate.length} tickets from 'estimate_request' to 'project' work type.`);
  process.exit(0);
}

migrate().catch(err => {
  console.error("Migration failed:", err);
  process.exit(1);
});
