# M9 — High Plains email polish verification

## Changes

| Area | Implementation |
| --- | --- |
| Branded layout | `outgoingEmail/layout.ts`, `markup.ts`, and `scripts/generate-email-footer-mountains.sh`: dark, opaque footer strip in a matching table cell; HTML-only preview padding and format-detection metadata. The plain internal footer and the slim M8 reply have no mountains. Conversations allowlists both exact public mountain image paths without broadening access to other same-origin assets. |
| Names and wording | `outgoingEmail/text.ts` and `wording.ts` normalize all wording substitutions and standard greetings. Estimate, Compose, documents, chemical, work-completed, and sample builders use the shared greeting. Documents stay generic for a group or no known name; M8 replies keep their first-name greeting and generic fallback. `customerSetup.ts` and `storage.ts` trim submitted names only, including standalone contacts. No billing or QuickBooks ownership changes. |
| Phone links | `outgoingEmail/companyPhone.ts` validates the configured number before creating a `tel:+1…` link. The footer uses quiet styling; filled body wording, the upcoming chemical notice's applicator card, and the slim reply signature use inherited color. Malformed settings remain escaped text; arbitrary numbers, typed body copy, quoted history, and plain text are not rewritten. |
| General message | `lib/db/src/emailWordingContracts.ts`, `wording.ts`, `serviceEmails.ts`, and `wordingPreview.ts`: `{subject}` is available for General message only, with an explicit editor sample. The default headline uses it and the new closing precedes one company sign-off. The Compose header keeps the actual typed subject, including punctuation and spacing. Saved wording overrides remain unchanged. |

No schema, migrations, historical name updates, recipients, provider settings,
Gmail threading, chemical photo or product label URLs, or production state
were changed. Nothing was published.

## Automated checks

- **153 targeted API tests across 16 suites passed**, including the two
  suites rerun after correcting fixture and preheader expectations. Integration
  tests used a private socket-only PostgreSQL instance restored from DB1's
  retained Development schema, with synthetic records and fake transports.
  Coverage includes wizard and standard customer/contact writes, omitted
  names retaining legacy spaces, `Joe Woods ` in Compose and chemical
  notices, invalid phone settings and exact matching, safe escaping,
  missing values, preheader padding, all 14 wording previews and validation,
  legacy overrides, and exact Compose preview and send payloads including the
  MIME subject. Existing M8 checks passed for reply target, quote, thread
  headers, retry behavior, and revised estimate threads with PDF attachments.
- **1 CRM rendered test passed** for stored branded email, including both
  exact same-origin mountain PNGs and rejection of image URLs with query
  strings or private paths.
- **Root `pnpm run typecheck`:** exit 2 before and after. **595 → 595**
  existing API diagnostics; no additions or removals by file, mapped line,
  column, and error code. Five existing messages reordered inferred
  properties without changing the reported issues. The root command stops
  after the API failure; this is not a clean workspace typecheck.
- Both Development asset URLs returned HTTP 200 with `image/png`; the
  served bytes matched the checked-in files. The original `mountains.png`
  still has SHA-256
  `5f3be388341f9917162746be4aca0bb11d48f2b24bb11612b2dca001f4eb0f72`.
  The new 1200 × 218 asset is 32,020 bytes and uses `#27312C` and line
  shades up to `#5E6C64`. The API health endpoint passed after restart.

## Browser preview evidence (not received mail)

Chromium rendered the actual server-generated estimate, Compose, and upcoming
chemical HTML using the Development asset URLs. The images loaded at 600 px
on desktop and 366 px in the 390 px Compose preview, with matching RGB
`39, 49, 44` strip and footer cells and a 0 px gap. The rendered greetings
and phone links matched, the hidden preheader contained exactly 90 padding
sequences, and the Compose headline preserved the typed hyphen and question
mark. Screenshots are `estimate-browser.png`, `compose-browser.png`, and
`chemical-browser.png` in the workspace's M9 verification output.

## Development delivery and remaining received-mail checks

| Example | Delivery evidence |
| --- | --- |
| Upcoming chemical notice | SendGrid accepted one synthetic notice for Randy's approved test address only (no CC or BCC). The subject starts `Upcoming M9 DEVELOPMENT TEST (no visit)`. The app send log was written only to the disposable database. Provider acceptance does not verify inbox placement or client rendering. |
| Estimate, revised estimate, general message, M8 reply, documents | Not sent: Development had no connected, active, sync-enabled shared Gmail mailbox with authorization. The test-only original estimate thread and its actual M8 reply target couldn't be verified against Gmail. No production mailbox or alternate recipient was used. |

To finish received-mail acceptance, use a dedicated Development Gmail mailbox
and only the approved test address. Review every actual To, CC and BCC before
each send. In the synthetic estimate thread, confirm the revision stays in
the original thread and verify the resolved M8 reply target before sending.
Randy's mailbox and device access or screenshots are still needed:

- **Gmail web and Spark:** verify inbox snippets, the dark strip, clickable
  phone, a single sign-off, and the estimate/revision/reply thread.
- **iPhone Mail in dark mode:** verify no white strip or default blue phone
  styling. Check the inbox and, when available, lock-screen snippet.
- **Outlook, if available:** inspect the transition from image to footer for
  a seam.

No customer received a Development email.
