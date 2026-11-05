// Preserve existing server imports while browser previews use the same pure resolver.
export {
  billsThroughParent, completeAddress, resolveBillTo,
  type BillingCustomer, type BillingManagementCompany, type Addr, type BillTo,
  type BillingProblem, type BillingContext,
} from "@workspace/customer-billing";
