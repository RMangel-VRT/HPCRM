---
name: Customer pages direction
description: Customer-page ownership, sequential integration, snow rollout gates, and display rules.
---

Read `attached_assets/Pasted--Customer-pages-slice-pack-For-Randy-paste-into-the-Rep_1793920482888.txt` before planning customer-page work. Account-manager ownership precedes correctness, navigation, header/dashboard and layout work. Overlapping customer-page changes must be integrated sequentially; use current task state rather than treating the overview as an implementation authorization.

**Why:** All slices touch the same customer-page files, so parallel implementation would conflict. Uploading this reference does not authorize implementation or publishing.

**How to apply:** Read the detailed slice briefs and current task state before planning. Migration numbers and baseline statements are dated hints, not reserved numbers or current implementation evidence.

Contract Center owns customer contract figures and snow coverage. Missing snow triggers are reported to the assigned account manager. Before enabling contract-owned snow routing, compare production contract coverage with the previous manual snow settings and resolve coverage gaps.

**Why:** The user requires contract-owned coverage to be checked before snow-event rollout; silently switching ownership with incomplete contracts risks missing service.

**How to apply:** Keep the production comparison and gap resolution as an explicit release gate. Do not execute production writes or publish merely because this overview was uploaded.

Parent customers share the customer-page frame and add Branches. Preserve old links through redirects. The Services “owed vs done” view waits for campaigns generated from contract scope. Edit-page archive/delete requires separate approval. Operational role changes and customer assignment are not authorized by reference intake alone.

**Why:** The pack separates the page redesign from campaign fulfillment and destructive customer lifecycle decisions.

**How to apply:** Preserve these boundaries when scoping subsequent slices; do not add archive/delete or invent fulfillment figures.

The Contract chip and This season KPI must support multiple in-effect terms from the actual contract-summary interface. Sum annual amounts of priced terms, show the term labels and combined lines, and describe time-and-materials snow without fabricating an amount. The Contract chip links to Contracts.

**Why:** Separate landscape and snow agreements can be in effect simultaneously; selecting one term would omit coverage or understate the priced total.

**How to apply:** Consume the current contract-summary interface, not an assumed singular-term model. Cover multiple priced terms and mixed priced/T&M terms in both displays while preserving existing null, inheritance and permission rules.

The user confirmed that the summary must expose multiple concurrent terms, rather than a singular current term. Preserve agreement identity for current, upcoming and previous selections; billing and rate views select an individual agreement/term.

**Why:** The original correctness brief's singular response cannot represent separate concurrent landscape and snow agreements without dropping commercial facts.

**How to apply:** Keep priced-term aggregation limited to the agreed owner KPI. Never infer a branch allocation or treat unpriced/T&M terms as zero.
