import { useState } from "react";

export type ServiceTypeFilter = "all" | "maintenance" | "chemical";
export type StatusFilter = "all" | "active" | "inactive";

export interface RevenueFilters {
  year: number;
  month: number;
  searchQuery: string;
  serviceType: ServiceTypeFilter;
  statusFilter: StatusFilter;
  activeOnly: boolean;
  showIssuesOnly: boolean;
}

export interface RevenueFilterSetters {
  setYear: (year: number) => void;
  setMonth: (month: number) => void;
  setSearchQuery: (query: string) => void;
  setServiceType: (serviceType: ServiceTypeFilter) => void;
  setStatusFilter: (status: StatusFilter) => void;
  setActiveOnly: (activeOnly: boolean) => void;
  setShowIssuesOnly: (showIssuesOnly: boolean) => void;
}

export function useRevenueFilters(): RevenueFilters & RevenueFilterSetters {
  const currentDate = new Date();
  const [year, setYear] = useState(currentDate.getFullYear());
  const [month, setMonth] = useState(currentDate.getMonth() + 1);
  const [searchQuery, setSearchQuery] = useState("");
  const [serviceType, setServiceType] = useState<ServiceTypeFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [activeOnly, setActiveOnly] = useState(false);
  const [showIssuesOnly, setShowIssuesOnly] = useState(false);

  return {
    year,
    month,
    searchQuery,
    serviceType,
    statusFilter,
    activeOnly,
    showIssuesOnly,
    setYear,
    setMonth,
    setSearchQuery,
    setServiceType,
    setStatusFilter,
    setActiveOnly,
    setShowIssuesOnly,
  };
}
