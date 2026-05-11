import { and, asc, eq, inArray, or } from "drizzle-orm";
import {
  companyUsers,
  companies,
  crews,
  customers,
  db,
  hashPassword,
  pool,
  ticketTypeStatuses,
  ticketTypes,
  ticketWorkItems,
  tickets,
  users,
} from "@workspace/db";

const TEST_EMAIL = "mobile-test@highplainsprop.com";
const TEST_PASSWORD = "Soccer03";
const TEST_NAME = "Mobile Test Supervisor";
const CREW_NAME = "Test Crew";
const CUSTOMER_TAG = "mobile-test-seed";

// Primary company resolution: look up the existing High Plains admin user and
// use their default_company_id (per task spec — single source of truth tied to
// the well-known admin account documented in replit.md). Fall back to a
// slug/name lookup against the companies table only if that admin row is
// missing or has no default company set.
const ADMIN_LOOKUP_EMAIL = "mike@highplainsprop.com";
const COMPANY_SLUG_CANDIDATES = ["high-plains-property-maintenance", "high-plains"];
const COMPANY_NAME_CANDIDATES = ["High Plains Property Maintenance", "High Plains"];

interface SeedCustomer {
  customerNumber: string;
  name: string;
  street: string;
  city: string;
  state: string;
  zip: string;
}

const SEED_CUSTOMERS: SeedCustomer[] = [
  { customerNumber: "MTEST-001", name: "Pinecrest HOA",          street: "1420 Pinecrest Dr",  city: "Loveland",   state: "CO", zip: "80538" },
  { customerNumber: "MTEST-002", name: "Centennial Plaza",       street: "880 W 29th St",       city: "Loveland",   state: "CO", zip: "80538" },
  { customerNumber: "MTEST-003", name: "Aspen Ridge Apartments", street: "2310 Eagle Dr",       city: "Loveland",   state: "CO", zip: "80537" },
  { customerNumber: "MTEST-004", name: "Northfield Office Park", street: "555 Lincoln Ave",     city: "Fort Collins", state: "CO", zip: "80524" },
  { customerNumber: "MTEST-005", name: "Foothills Community",    street: "1701 Foothills Pkwy", city: "Fort Collins", state: "CO", zip: "80525" },
  { customerNumber: "MTEST-006", name: "River Oaks Estates",     street: "402 Riverbend Ln",    city: "Windsor",    state: "CO", zip: "80550" },
];

interface SeedWorkItem {
  label: string;
  isRequired?: boolean;
  photoRequired?: boolean;
}

interface SeedTicket {
  customerIdx: number;
  title: string;
  description: string;
  priority: "low" | "normal" | "high" | "urgent";
  routeOrder: number | null;
  mobileStatus: "not_started" | "in_progress" | "complete" | "skipped" | "flagged";
  hourOffset: number;
  minuteOffset: number;
  dayOffset: number;
  workItems: SeedWorkItem[];
}

// Slice 8: realistic per-ticket descriptions and 3–5 work items per ticket
// (1–2 marked required) so the ticket-detail completion flow has something
// real to demonstrate. One ticket carries a `photoRequired` item so the
// photo-required UX can be exercised end-to-end.
const SEED_TICKETS: SeedTicket[] = [
  {
    customerIdx: 0,
    title: "Mow & trim front lawn",
    description: "Standard weekly mow on the front common area. Watch for the sprinkler heads near the entrance sign — one was nicked last week.",
    priority: "normal",
    routeOrder: 1,
    mobileStatus: "in_progress",
    hourOffset: 7,
    minuteOffset: 30,
    dayOffset: 0,
    workItems: [
      { label: "Mow front common area" },
      { label: "Trim around entrance sign and light poles", isRequired: true },
      { label: "Edge along curb and sidewalks" },
      { label: "Blow off all hardscape", isRequired: true },
    ],
  },
  {
    customerIdx: 1,
    title: "Weekly maintenance visit",
    description: "Full weekly service: mow, trim, edge, and blow off. Property manager has flagged the back planter — check irrigation while you're back there.",
    priority: "high",
    routeOrder: 2,
    mobileStatus: "not_started",
    hourOffset: 8,
    minuteOffset: 30,
    dayOffset: 0,
    workItems: [
      { label: "Mow all common areas (front + back)" },
      { label: "Trim along buildings A through D", isRequired: true },
      { label: "Edge sidewalks and tree rings" },
      { label: "Check back planter irrigation — photo of any damage", photoRequired: true, isRequired: true },
      { label: "Blow off all hardscape" },
    ],
  },
  {
    customerIdx: 2,
    title: "Trim hedges along walkway",
    description: "Hedges along the south walkway have been overgrowing into the path. Trim back roughly 6\" and clean up clippings.",
    priority: "low",
    routeOrder: 3,
    mobileStatus: "not_started",
    hourOffset: 9,
    minuteOffset: 30,
    dayOffset: 0,
    workItems: [
      { label: "Trim hedges 6\" off walkway", isRequired: true },
      { label: "Bag and haul clippings" },
      { label: "Sweep walkway clean" },
    ],
  },
  {
    customerIdx: 3,
    title: "Spray weeds in parking lot",
    description: "Spot-spray weeds coming up through cracks in the parking lot and along the loading dock. Use the post-emergent in the truck.",
    priority: "normal",
    routeOrder: 4,
    mobileStatus: "flagged",
    hourOffset: 10,
    minuteOffset: 30,
    dayOffset: 0,
    workItems: [
      { label: "Spot-spray cracks in main parking lot", isRequired: true },
      { label: "Spray weeds along loading dock curb" },
      { label: "Note any larger weed beds for follow-up" },
    ],
  },
  {
    customerIdx: 4,
    title: "Refill pet stations",
    description: "Restock all 4 pet waste stations on the property. Replace any torn or missing dispenser bags.",
    priority: "low",
    routeOrder: 5,
    mobileStatus: "not_started",
    hourOffset: 13,
    minuteOffset: 0,
    dayOffset: 0,
    workItems: [
      { label: "Refill bags at all 4 pet stations", isRequired: true },
      { label: "Empty pet station trash receptacles" },
      { label: "Photo-document any damaged station", photoRequired: true },
    ],
  },
  {
    customerIdx: 5,
    title: "Walk property w/ manager",
    description: "Quarterly walk-through with the on-site manager. Bring the clipboard — they'll want to discuss next month's chemical treatment schedule and the playground mulch refresh.",
    priority: "urgent",
    routeOrder: null,
    mobileStatus: "not_started",
    hourOffset: 14,
    minuteOffset: 0,
    dayOffset: 0,
    workItems: [
      { label: "Meet manager at the leasing office", isRequired: true },
      { label: "Walk all common areas" },
      { label: "Confirm chemical treatment schedule" },
      { label: "Note mulch refresh quantities for the playground" },
    ],
  },
  {
    customerIdx: 0,
    title: "Earlier completed visit",
    description: "Pre-dawn cleanup pass — leaves and debris from yesterday's wind. Logged before the regular morning route.",
    priority: "normal",
    routeOrder: 0,
    mobileStatus: "complete",
    hourOffset: 6,
    minuteOffset: 30,
    dayOffset: 0,
    workItems: [
      { label: "Walk perimeter and pick up debris", isRequired: true },
      { label: "Empty trash receptacles" },
      { label: "Blow off entrance sidewalk", isRequired: true },
      { label: "Photo entrance after cleanup", photoRequired: true },
    ],
  },
  {
    customerIdx: 1,
    title: "Yesterday's mowing pass",
    description: "Standard mowing pass that ran yesterday. Carried over for the week's records.",
    priority: "normal",
    routeOrder: 1,
    mobileStatus: "not_started",
    hourOffset: 8,
    minuteOffset: 30,
    dayOffset: -1,
    workItems: [
      { label: "Mow common areas", isRequired: true },
      { label: "Edge sidewalks" },
      { label: "Trim around buildings", isRequired: true },
      { label: "Blow off hardscape" },
    ],
  },
  {
    customerIdx: 2,
    title: "Tomorrow follow-up",
    description: "Follow-up on the hedge trim — check that no new growth has fallen into the walkway and pick up any straggler clippings.",
    priority: "normal",
    routeOrder: 1,
    mobileStatus: "not_started",
    hourOffset: 8,
    minuteOffset: 30,
    dayOffset: 1,
    workItems: [
      { label: "Re-walk south walkway", isRequired: true },
      { label: "Re-trim any new growth into the walkway" },
      { label: "Pick up any remaining clippings", isRequired: true },
    ],
  },
];

async function main(): Promise<void> {
  const databaseUrl = process.env["DATABASE_URL"];
  if (!databaseUrl) {
    throw new Error("DATABASE_URL must be set");
  }

  // Production safety guard: this script is dev-only by design (per task
  // spec). Replit production deployments set REPLIT_DEPLOYMENT=1; refuse to
  // run there unless the operator explicitly opts in with ALLOW_PROD_SEED=1.
  const isProdEnv =
    process.env["REPLIT_DEPLOYMENT"] === "1" ||
    process.env["NODE_ENV"] === "production";
  if (isProdEnv && process.env["ALLOW_PROD_SEED"] !== "1") {
    throw new Error(
      "Refusing to run seed script in a production-like environment " +
        "(REPLIT_DEPLOYMENT=1 or NODE_ENV=production). " +
        "Set ALLOW_PROD_SEED=1 to override (you almost certainly do not want to).",
    );
  }

  const passwordHash = await hashPassword(TEST_PASSWORD);

  const summary = await db.transaction(async (tx) => {
    // Primary path: resolve via the well-known admin user's default_company_id
    // (per task spec). Fallback: slug/name lookup if that admin row is gone or
    // has no defaultCompanyId. Either path requires a unique match.
    let companyId: string | null = null;
    let companyName: string | null = null;
    let resolvedVia = "";

    const [admin] = await tx
      .select()
      .from(users)
      .where(eq(users.email, ADMIN_LOOKUP_EMAIL));
    if (admin?.defaultCompanyId) {
      const [adminCompany] = await tx
        .select()
        .from(companies)
        .where(eq(companies.id, admin.defaultCompanyId));
      if (adminCompany) {
        companyId = adminCompany.id;
        companyName = adminCompany.name;
        resolvedVia = `${ADMIN_LOOKUP_EMAIL} → default_company_id`;
      }
    }

    if (!companyId) {
      const matches = await tx
        .select()
        .from(companies)
        .where(
          or(
            inArray(companies.slug, COMPANY_SLUG_CANDIDATES),
            inArray(companies.name, COMPANY_NAME_CANDIDATES),
          ),
        );
      if (matches.length === 0) {
        throw new Error(
          `Could not find High Plains company: admin "${ADMIN_LOOKUP_EMAIL}" was missing or had no defaultCompanyId, ` +
            `and no companies matched slug ${JSON.stringify(COMPANY_SLUG_CANDIDATES)} ` +
            `or name ${JSON.stringify(COMPANY_NAME_CANDIDATES)}.`,
        );
      }
      if (matches.length > 1) {
        throw new Error(
          `Ambiguous fallback company match (${matches.length} rows): ${matches
            .map((c) => `${c.name} [${c.slug}]`)
            .join(", ")}. Refusing to seed.`,
        );
      }
      companyId = matches[0].id;
      companyName = matches[0].name;
      resolvedVia = `slug/name fallback (${matches[0].slug})`;
    }
    // eslint-disable-next-line no-console
    console.log(`Resolved company "${companyName}" via ${resolvedVia}.`);

    const [todoType] = await tx
      .select()
      .from(ticketTypes)
      .where(and(eq(ticketTypes.companyId, companyId), eq(ticketTypes.name, "To-Do")));
    if (!todoType) {
      throw new Error(`No "To-Do" ticket type found for company ${companyId}`);
    }
    const [openStatus] = await tx
      .select()
      .from(ticketTypeStatuses)
      .where(eq(ticketTypeStatuses.ticketTypeId, todoType.id))
      .orderBy(asc(ticketTypeStatuses.displayOrder));
    if (!openStatus) {
      throw new Error(`Ticket type "${todoType.name}" has no statuses`);
    }

    let user = (
      await tx.select().from(users).where(eq(users.email, TEST_EMAIL))
    )[0];
    if (!user) {
      [user] = await tx
        .insert(users)
        .values({
          email: TEST_EMAIL,
          passwordHash,
          name: TEST_NAME,
          isSuperAdmin: "false",
          defaultCompanyId: companyId,
          language: "en",
        })
        .returning();
    } else {
      [user] = await tx
        .update(users)
        .set({ passwordHash, name: TEST_NAME, defaultCompanyId: companyId })
        .where(eq(users.id, user.id))
        .returning();
    }

    const [membership] = await tx
      .select()
      .from(companyUsers)
      .where(and(eq(companyUsers.userId, user.id), eq(companyUsers.companyId, companyId)));
    if (!membership) {
      await tx.insert(companyUsers).values({
        userId: user.id,
        companyId,
        role: "crew_supervisor",
        status: "active",
        tags: [],
        joinedAt: new Date(),
      });
    } else {
      await tx
        .update(companyUsers)
        .set({ role: "crew_supervisor", status: "active" })
        .where(eq(companyUsers.id, membership.id));
    }

    let crew = (
      await tx
        .select()
        .from(crews)
        .where(and(eq(crews.companyId, companyId), eq(crews.name, CREW_NAME)))
    )[0];
    if (!crew) {
      [crew] = await tx
        .insert(crews)
        .values({
          companyId,
          name: CREW_NAME,
          supervisorUserId: user.id,
          isActive: true,
        })
        .returning();
    } else {
      [crew] = await tx
        .update(crews)
        .set({ supervisorUserId: user.id, isActive: true })
        .where(eq(crews.id, crew.id))
        .returning();
    }

    const customerIds: string[] = [];
    for (const seed of SEED_CUSTOMERS) {
      const [existing] = await tx
        .select()
        .from(customers)
        .where(
          and(
            eq(customers.companyId, companyId),
            eq(customers.customerNumber, seed.customerNumber),
          ),
        );
      if (existing) {
        const [updated] = await tx
          .update(customers)
          .set({
            name: seed.name,
            street: seed.street,
            city: seed.city,
            state: seed.state,
            zip: seed.zip,
            tags: [CUSTOMER_TAG],
            status: "active",
            active: "true",
          })
          .where(eq(customers.id, existing.id))
          .returning();
        customerIds.push(updated.id);
      } else {
        const [inserted] = await tx
          .insert(customers)
          .values({
            companyId,
            name: seed.name,
            customerNumber: seed.customerNumber,
            street: seed.street,
            city: seed.city,
            state: seed.state,
            zip: seed.zip,
            status: "active",
            active: "true",
            tags: [CUSTOMER_TAG],
            customerType: "commercial",
          })
          .returning();
        customerIds.push(inserted.id);
      }
    }

    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);

    // Refresh seeded tickets only (matched by deterministic title list) so
    // re-running keeps counts stable without disturbing any ad-hoc demo
    // tickets a developer may have manually attached to this crew.
    await tx
      .delete(tickets)
      .where(
        and(
          eq(tickets.companyId, companyId),
          eq(tickets.crewId, crew.id),
          inArray(tickets.title, SEED_TICKETS.map((t) => t.title)),
        ),
      );

    let insertedCount = 0;
    for (const seed of SEED_TICKETS) {
      const dueDate = new Date(dayStart);
      dueDate.setDate(dueDate.getDate() + seed.dayOffset);
      dueDate.setHours(seed.hourOffset, seed.minuteOffset, 0, 0);

      const [insertedTicket] = await tx.insert(tickets).values({
        companyId,
        customerId: customerIds[seed.customerIdx],
        ticketTypeId: todoType.id,
        currentStatusId: openStatus.id,
        title: seed.title,
        description: seed.description,
        priority: seed.priority,
        workType: "contract",
        billingBehavior: "no_invoice",
        crewId: crew.id,
        routeOrder: seed.routeOrder,
        mobileStatus: seed.mobileStatus,
        dueDate,
        createdById: user.id,
        ...(seed.mobileStatus === "in_progress"
          ? { startedAt: new Date(dueDate.getTime() - 10 * 60 * 1000) }
          : {}),
        ...(seed.mobileStatus === "complete"
          ? {
              startedAt: new Date(dueDate.getTime() - 30 * 60 * 1000),
              completedAt: new Date(dueDate.getTime() + 5 * 60 * 1000),
            }
          : {}),
      }).returning({ id: tickets.id });

      // Slice 8: seed work items so the ticket-detail completion UX has
      // something realistic to drive. The earlier ticket delete cascades
      // through `ticket_work_items.ticket_id` (onDelete: cascade), so re-runs
      // refresh these alongside the parent ticket.
      if (insertedTicket && seed.workItems.length > 0) {
        await tx.insert(ticketWorkItems).values(
          seed.workItems.map((wi, idx) => ({
            ticketId: insertedTicket.id,
            label: wi.label,
            sortOrder: idx,
            isRequired: wi.isRequired ?? false,
            photoRequired: wi.photoRequired ?? false,
            isComplete: false,
          })),
        );
      }
      insertedCount += 1;
    }

    const todayCount = SEED_TICKETS.filter(
      (t) => t.dayOffset === 0 && t.mobileStatus !== "complete",
    ).length;

    return {
      companyId,
      companyName,
      crewId: crew.id,
      insertedCount,
      todayCount,
    };
  });

  // Derive a fully-qualified mobile login URL from the environment so the
  // operator can copy/paste it directly. Prefer the published domain if set,
  // then the dev domain, then fall back to localhost (the shared proxy port).
  const publishedDomain = (process.env["REPLIT_DOMAINS"] ?? "").split(",")[0]?.trim();
  const devDomain = process.env["REPLIT_DEV_DOMAIN"]?.trim();
  const baseUrl = publishedDomain
    ? `https://${publishedDomain}`
    : devDomain
      ? `https://${devDomain}`
      : "http://localhost:80";
  const loginUrl = `${baseUrl}/api/m/auth/login`;
  const expoDomain = process.env["REPLIT_EXPO_DEV_DOMAIN"]?.trim();
  const mobileAppUrl = expoDomain ? `https://${expoDomain}` : null;

  // eslint-disable-next-line no-console
  console.log(
    [
      "",
      "Mobile test supervisor seeded successfully.",
      "─────────────────────────────────────────────",
      `Email:        ${TEST_EMAIL}`,
      `Password:     ${TEST_PASSWORD}`,
      `Name:         ${TEST_NAME}`,
      `Role:         crew_supervisor`,
      `Company:      ${summary.companyName} (${summary.companyId})`,
      `Crew:         ${CREW_NAME} (${summary.crewId})`,
      `Customers:    ${SEED_CUSTOMERS.length}`,
      `Tickets seeded total: ${summary.insertedCount}`,
      `Today tab will show: ${summary.todayCount} stops`,
      "",
      "How to sign in on the mobile app:",
      mobileAppUrl
        ? `  1. Open the High Plains Mobile app: ${mobileAppUrl}`
        : "  1. Open the High Plains Mobile app (artifacts/highplains-mobile preview).",
      `  2. Enter email "${TEST_EMAIL}" and password "${TEST_PASSWORD}" on the login screen.`,
      "  3. The Today tab should populate with the seeded stops.",
      "",
      "Equivalent direct API call:",
      `  curl -X POST ${loginUrl} \\`,
      `    -H "Content-Type: application/json" \\`,
      `    -d '{"username":"${TEST_EMAIL}","password":"${TEST_PASSWORD}"}'`,
      "",
    ].join("\n"),
  );
}

main()
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error("Seed failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
