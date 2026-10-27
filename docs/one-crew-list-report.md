Randy has N planner columns and M campaign teams to connect on the setup card after publishing.

**Current production N and M are unverified.** The read-only production query was attempted on October 28, 2026 but the production database rejected access with “Production database access requires an authenticated user.” No development rows are presented as current production evidence. An authorized read-only inventory is needed before substituting counts into the sentence above; no production write, automatic link, or publish was performed.

The last *dated* production audit (`docs/data-ownership-audit.md`, October 19, 2026) reported 0 standing crews, 5 unlinked planner columns (Hugo Crew, Luciano Crew, Manuel Crew, Rolando, Sergio Crew), 224 blocks in total, 2 unlinked campaign teams (Hugo and Luciano), and 1 worksheet. The audit did not break down blocks by column or indicate whether both teams were on active campaigns. Its worksheet count does not establish the present-day count lacking `crew_id`. These historical values **are not** the requested current production inventory.

To complete the read-only inventory using authorized production access, select only:

```sql
SELECT name, is_active, display_order FROM crews ORDER BY display_order NULLS LAST, name;
SELECT m.name, m.crew_id IS NOT NULL AS linked, count(b.id)::int AS placements
FROM maintenance_crews m LEFT JOIN schedule_blocks b ON b.crew_id = m.id
GROUP BY m.id, m.name, m.crew_id ORDER BY m.name;
SELECT t.name, c.title AS campaign, t.crew_id IS NOT NULL AS linked
FROM campaign_crews t JOIN campaigns c ON c.id = t.campaign_id
WHERE c.status = 'active' ORDER BY c.title, t.name;
SELECT count(*)::int AS worksheets_without_crew_id
FROM crew_worksheets WHERE crew_id IS NULL;
```

Until Publish adds `crew_worksheets.crew_id` to production, the final query cannot run; use the schema metadata to confirm this first. Avoid customer names and addresses in the report.

**Ownership:** `crews` owns standing identity. Planner columns and campaign teams retain their IDs, relationships and frozen compatibility display values for unlinked rows. Campaign leaders/members remain campaign-specific. Worksheet label/lead and ticket execution staff are snapshots; ticket crew ID remains the visit-sync mirror. No owner or schedule-block FK changed. The only DDL is a nullable worksheet FK and campaign-pair partial unique index. P3-1's marker is recorded on manual selections, not reset or rerun.

**Migration numbering:** Both `0050_hardscape_catalog.sql` and `0050_term_line_form.sql` are unchanged and have not been renamed. O1 uses the next free number, `0051_one_crew_owner.sql`. The runner (`scripts/src/migrate.ts`) tracks migrations by the **full filename**, not the numeric prefix: `_applied_sql_migrations.filename` is its primary key, and each filename is recorded with a content checksum. It lists and sorts the full `.sql` filenames, so both existing 0050 files are independently tracked.

**Standing crew deletion:** `DELETE /api/crews/:id` now returns `409 CREW_IN_USE` with linked planner columns (including placement counts) and teams on active campaigns. The response message lists those dependencies; Settings offers **Deactivate instead**, preserving every link and placement. A planner link blocks deletion even when empty. A team on a completed campaign alone does not block the existing delete behavior; its nullable crew link is cleared by the existing FK. The company and owner are locked while checking links and deleting. No additional migration is needed for this guard.

**Preview:** Both services restarted successfully; API health returned 200 and the CRM sign-in page rendered without a fatal browser error. The signed-in browser pass could not proceed: the documented development test account is absent from the connected development database. No account was created or existing record modified to work around this. The new signed-in setup and planner UI is therefore covered by component/integration checks, not a completed end-to-end browser pass.

**Touched call sites:** Settings Crews setup; planner CRUD and its storage list/detail projection; WeeklyScheduler, ScheduleViewer, SchedulePreview, CustomerSchedulingSection; campaign team CRUD/list/detail and extra-billable batch display; draft worksheet update and selector; schema copies and migration. Extra-billable ticket generation still reads leader and members from campaign team membership, not standing supervisor or copied labels.

**Baseline and verification:** Initial workspace typecheck reported 735 TypeScript errors and stopped at the API package; targeted API typecheck after the changes also reported 735 (delta 0). The frontend typecheck was not reached by that initial workspace check, so a whole-package baseline-relative frontend delta cannot be established; a separate final frontend typecheck reports 221 errors, none in the edited crew screens or new components. Both counts remain unchanged after the standing-crew deletion addition. Initial broad API Vitest run reported 17 failed, 1548 passed and 46 skipped tests across its suite (unrelated baseline failures). Focused crew-link integration: **25 passed** after the addition, covering linked deletion with 61 placements, zero-placement planner links, active-team-only links, deactivation preserving links, no-link deletion, completed-team fallback and company scoping. API campaign-ticket, mobile company-day, visit sync and link-guard regressions: 55 passed in the previous run (unaffected by this addition). Crews settings tests: 7 passed. The unrelated crew assignment-board suite still reports 2 failures in its existing reducer assertions; no board reducer was changed. Development migration 0051 applied and schema-drift check passed. No production data was touched.
