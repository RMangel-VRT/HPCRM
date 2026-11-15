export * from "./generated/api";
export * from "./generated/types";
// Orval uses this name for both the path validator and query type. Resolve the
// barrel explicitly while keeping the query type available under a clear name.
export { GetCustomerServicesParams } from "./generated/api";
export type { GetCustomerServicesParams as CustomerServicesQuery } from "./generated/types/getCustomerServicesParams";
export { GetCustomerContractedServicesPdfParams } from "./generated/api";
export type { GetCustomerContractedServicesPdfParams as ContractedServicesPdfQuery } from "./generated/types/getCustomerContractedServicesPdfParams";
export { CustomerContractedServicesTargetsParams } from "./generated/api";
export type { CustomerContractedServicesTargetsParams as ContractedServicesTargetsQuery } from "./generated/types/customerContractedServicesTargetsParams";
