# RFP ticket page on the R1 workflow — verification

**Release gate:** R1 and R2 are one release. R1 is already merged into the
branch used for this verification. Neither slice was published here, and no
production data was modified. R2 adds no schema or workflow migration.

## What was verified

- The rendered ticket page uses the actual seeded keys for Reviewing, Waiting
  on info, Site walk, and Drafting proposal. Both skip paths open the standard
  field dialog and send `Site walk skipped.` through ticket PATCH. Stepping
  back from Site walk targets Reviewing.
- The rendered stepper uses the current status and both history edges to
  determine whether Waiting on info appears. The Lost and Won branches are
  filtered by key rather than display label.
- The Mark lost dialog requires a current Lost option, warns about linked
  contracts, and refreshes ticket and Contract Center queries. PostgreSQL
  cases verified admin and office access, company scoping, the no-contract
  path, draft and sent seasons, and 409 responses for ineligible tickets.
  An injected failure on the second season rolled back the first season,
  contract history, ticket closure and history, and both loss answers.
- The Onboarding card uses the status's ordered fields. Rendered checks
  covered segmented choices, a date, notes saved on blur, a failed answer
  save, and the required-field check before Won. A required answer shows
  Done only after a successful write.
- On local disposable PostgreSQL, the real ticket PATCH and field-value
  handlers and the Contract Center took a seeded RFP from Reviewing through
  Waiting on info, skipped Site walk, sent the contract, recorded Awarded,
  rejected unsigned Onboarding, then signed the contract and completed the
  checklist and Won. The stored history included the exact skip note.
  The unchanged Estimate Request approval and denial check passed.

## Check results

| Check | Unchanged baseline | R2 |
| --- | --- | --- |
| CRM rendered and Estimate decision suites | 133 passed, 8 failed | 150 passed, same 8 failed |
| API billing suite | 57 passed, 62 failed | 57 passed, same 62 failed |
| Other API suites in this run | — | 238 passed |
| Shared libraries typecheck | Passed | Passed |
| API TypeScript diagnostics | 595 | 595 |
| CRM TypeScript diagnostics | 183 | 183 |

The unchanged failures are the Estimate board rendering cases in the shared
Bids board suite and the existing ticket billing test harness failures.
The Estimate Request decision tests were not changed. Both managed
development workflows started; the proxied health endpoint and transformed
Ticket Detail module returned HTTP 200. The authenticated interactions
were verified using rendered and disposable API fixtures, not live data.
