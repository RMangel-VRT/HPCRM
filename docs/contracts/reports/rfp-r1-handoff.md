# RFP workflow handoff to the ticket-page slice

**Release R1 and R2 together.** R1 archives the old Decision Received step. Until R2 adds Mark lost to the ticket page, an RFP without a linked contract has no working Lost action there.

## Lookup keys

Use the keyed type `rfp_request` and resolve statuses within that ticket's type. The ordered keys are `new`, `reviewing`, `waiting_info`, `site_visit`, `proposal_draft`, `proposal_sent`, `awarded`, `onboarding`, `closed_won`, and `closed_lost`. Waiting on info is a side state off Reviewing. Site walk is optional; Won and Lost are final.

Find the six Onboarding fields by `field_key`: `customer_setup`, `maps_created`, `board_contacts_collected`, `kickoff_date`, `kickoff_notes`, and `handoff_notes`. Use their current IDs for answers. Legacy fields left behind were detached, not deleted; in particular, do not use `decision_outcome` as a current RFP action. Estimate Request still uses `decision_received`.

## Contract ownership and guards

- Sending a linked contract advances an earlier RFP to Submitted. Signing before Awarded records Awarded and then Onboarding; signing at Awarded records only Onboarding. A verbal Awarded does not require a signed contract.
- With linked seasons and none signed, ticket PATCH rejects Onboarding and later non-Lost steps with: “Mark the contract signed in the Contract Center; the RFP moves to Onboarding on its own.”
- If any linked season is draft or sent, ticket PATCH rejects Lost with: “Use Mark lost so its contract is marked lost too.” R2 should call the existing `applyRfpDecisionLost` operation under the RFP lock in the same transaction. It uses the ordinary Contract Center lifecycle to mark draft and sent seasons lost; it leaves signed seasons alone.
- Automatic contract sync does not rewind or reopen an RFP, advance a ladder missing Onboarding, or close an all-cancelled set unless at least one linked season is lost.

The startup conversion is DML-only. It verifies retiring statuses have no remaining references, including references outside the owning RFP type, before removing those status rows. An unexpected reference aborts the entire conversion instead of stripping a history edge or deleting an answer.

## Verification

- Disposable PostgreSQL: 27 legacy tickets moved across three keyed RFP types and two companies. All existing history and answer rows were preserved. Exactly one qualified CRM setup answer was added with the services capture actor. An unexpected cross-type history reference rolled back the entire conversion, and concurrent reruns made no duplicate changes.
- API: 184 checks passed across the workflow conversion, RFP contract lifecycle, both boards, dashboard, and status keys. The bundled API also started on disposable PostgreSQL, ran the conversion, and enforced the guard messages through real ticket PATCH requests.
- CRM: the changed Bids rendering passed in English and Spanish. The combined board and RFP checks had the same nine unrelated Estimate failures as the unchanged branch.
- Typecheck diagnostic counts were unchanged (API: 595; CRM: 183). No schema changes, managed data exercises, or publication were performed.
