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

interface SeedTicket {
  customerIdx: number;
  title: string;
  priority: "low" | "normal" | "high" | "urgent";
  routeOrder: number | null;
  mobileStatus: "not_started" | "in_progress" | "complete" | "skipped" | "flagged";
  hourOffset: number;
  dayOffset: number;
}

const SEED_TICKETS: SeedTicket[] = [
  { customerIdx: 0, title: "Mow & trim front lawn",      priority: "normal", routeOrder: 1,    mobileStatus: "in_progress", hourOffset: 8,  dayOffset: 0 },
  { customerIdx: 1, title: "Weekly maintenance visit",   priority: "high",   routeOrder: 2,    mobileStatus: "not_started", hourOffset: 9,  dayOffset: 0 },
  { customerIdx: 2, title: "Trim hedges along walkway",  priority: "low",    routeOrder: 3,    mobileStatus: "not_started", hourOffset: 10, dayOffset: 0 },
  { customerIdx: 3, title: "Spray weeds in parking lot", priority: "normal", routeOrder: 4,    mobileStatus: "flagged",     hourOffset: 11, dayOffset: 0 },
  { customerIdx: 4, title: "Refill pet stations",        priority: "low",    routeOrder: 5,    mobileStatus: "not_started", hourOffset: 13, dayOffset: 0 },
  { customerIdx: 5, title: "Walk property w/ manager",   priority: "urgent", routeOrder: null, mobileStatus: "not_started", hourOffset: 14, dayOffset: 0 },
  { customerIdx: 0, title: "Earlier completed visit",    priority: "normal", routeOrder: 0,    mobileStatus: "complete",    hourOffset: 7,  dayOffset: 0 },
  { customerIdx: 1, title: "Yesterday's mowing pass",    priority: "normal", routeOrder: 1,    mobileStatus: "not_started", hourOffset: 9,  dayOffset: -1 },
  { customerIdx: 2, title: "Tomorrow follow-up",         priority: "normal", routeOrder: 1,    mobileStatus: "not_started", hourOffset: 9,  dayOffset: 1 },
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
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

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
      dueDate.setHours(seed.hourOffset, 0, 0, 0);

      await tx.insert(tickets).values({
        companyId,
        customerId: customerIds[seed.customerIdx],
        ticketTypeId: todoType.id,
        currentStatusId: openStatus.id,
        title: seed.title,
        description: "Seeded by seed-mobile-test-user.ts for the mobile field-crew demo.",
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
      });
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
