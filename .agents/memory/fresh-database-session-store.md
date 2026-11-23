---
name: Fresh sign-in test databases
description: A scratch database can authenticate credentials correctly but fail to save the resulting session.
---

When testing real sign-in against a disposable PostgreSQL database, check that
the standard PostgreSQL session store table already exists.

**Why:** The bundled session driver can try to open its package SQL file next
to the API bundle when no table exists. A missing build asset then causes a
login 500 independently of user or company fixture correctness. After that
failure the running process can retain the failed initialization promise.

**How to apply:** Check whether the disposable schema export already created
`public.session`. Install the driver's standard SQL only if the table is absent,
then start or restart the API with the fixture database override. Do not create
the table this way in shared or production databases.
