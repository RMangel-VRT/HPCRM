# SQL-only database objects

Publish does not carry PostgreSQL functions or triggers. The CRM and schema
validation only check that the required objects exist. They never install them.

## Routes customer retirement

An owner runs this once, after reviewing the Publish preview and confirming
that it does not propose any unexpected schema changes:

1. In Replit, open **Database**, switch to **Production**, and open the SQL
   console. Verify that the target says Production.
2. Paste the entire
   [`0062-routes-customer-retirement.sql`](./0062-routes-customer-retirement.sql)
   file and run it. It is transactional and can be rerun. It adds only the
   function and guarded trigger; it does not run the rest of migration 0062.
   If the console reports an error, stop and save the error for review.
3. In the published CRM, open **Settings → Database** as an admin and refresh
   **Database objects Publish can't carry**. Both Routes entries should say
   **Present**. If either is missing, do not change other schema objects.
4. On the next eligible nightly fill, check Routes or Scheduling for newly
   filled visits. The scheduler checks once a minute while the API is running,
   starting at **2:00 a.m. Colorado time** (3:00 a.m. on spring-forward day).
   If the day's fill has not run and the trigger goes live after 2:00 a.m.,
   the next check may run it the same day. The default window is today
   through **21 calendar days ahead**, subject to eligibility and route dates.
