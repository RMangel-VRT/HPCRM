# CP5 frontend verification (CRM)

## Baseline BEFORE editing (frontend predecessor + maps)

Command: `npx vitest run --config vitest.config.ts src/components/customer src/pages/CustomerDetail src/components/customer/page/__tests__`
(covers CP1, CP2, CP3, CP4, CQ7 rendered suites, CustomerSubNav, header, badges, Services; the
Property/maps page is exercised inside CustomerDetail.cp1/cp2/cp3/cq7 with LayerMapViewer stubbed)

- Result: 16 files, 171 tests, all passed.
- `tsc --noEmit -p artifacts/highplains-crm`: 210 pre-existing errors (152 in src/shared/schema.ts,
  27 ProposalDraft.tsx, 6 ScheduleSummary.tsx, remainder scattered). None in customer page files.

## After CP5 frontend

- Same command plus `src/components/customer/documents`: 17 files, 186 tests, all passed
  (171 baseline + 15 new in `documents/__tests__/cp5.documents.rendered.test.tsx`).
- The only change to an existing test: CustomerSubNav.test.tsx expected page orders now include `documents` after `notes` (regular and parent).
- tsc: 210 errors, the same as baseline. No new errors.

New rendered coverage: rail position and label in EN/ES (regular, field role, parent; Branches stays second);
the empty state and its privileged-only hint; batch upload with per-file XHR progress, a client type
rejection, a server code error (DOCUMENT_INVALID_CONTENT), a network failure, the finalize body
(filename default, map category, opaque token, X-Company-Id), and the metadata sheet PATCHing only
changed fields; the per-user category preference and blocked storage; sorting with maps pinned,
category chips, name/note search and no-match; unknown uploader/size/MIME shown as unknown; a PDF
opening in a new tab; the image lightbox with next/prev/arrow keys; the privileged menu (rename,
delete confirmation, cleanup failure kept and retried); the field-role menu (no edit/delete,
no upload, no contract chip or request); From contracts as read-only, with the six kinds localized
EN/ES and a Contract Center `/dashboard/contracts/:agreementId#term-:termId` link; parent own docs;
and the Property Map PDFs card (up to 5, ?category=map, All documents link, ES empty state).

Main-agent integration: DTOs/constants now import the driver-free shared contract instead of
maintaining a frontend type copy. The integrated 17-file/186-test run still passes after this change.
Two added rendered tests now explicitly rerender during the pending upload-url request with a
changed company or user and verify no PUT/finalization is sent. The CP5 test file is now 17/17,
bringing the effective customer-page total to 188 passing tests. The former scope-change coverage
gap is closed. A separate final frontend leaf typecheck remains at the same 210 baseline errors.
