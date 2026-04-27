import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { LayoutGrid, List as ListIcon } from "lucide-react";
import type { Customer } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { getDefaultCustomersRoute } from "@/lib/last-viewed-customer";

interface CustomersViewSwitcherProps {
  active: "detail" | "list";
}

export function CustomersViewSwitcher({ active }: CustomersViewSwitcherProps) {
  const [, navigate] = useLocation();
  const { data: customers = [] } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
  });

  const handleDetail = () => {
    navigate(getDefaultCustomersRoute(customers));
  };

  const handleList = () => {
    navigate("/dashboard/customers");
  };

  return (
    <div
      className="inline-flex items-center gap-0.5 rounded-md border bg-background p-0.5"
      role="tablist"
      aria-label="Customers view"
      data-testid="customers-view-switcher"
    >
      <Button
        type="button"
        size="sm"
        variant={active === "detail" ? "secondary" : "ghost"}
        onClick={handleDetail}
        role="tab"
        aria-selected={active === "detail"}
        data-testid="button-view-detail"
        className="gap-1.5"
      >
        <LayoutGrid className="w-3.5 h-3.5" />
        Detail
      </Button>
      <Button
        type="button"
        size="sm"
        variant={active === "list" ? "secondary" : "ghost"}
        onClick={handleList}
        role="tab"
        aria-selected={active === "list"}
        data-testid="button-view-list"
        className="gap-1.5"
      >
        <ListIcon className="w-3.5 h-3.5" />
        List
      </Button>
    </div>
  );
}
