import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Search, Building2, MapPin, Map, Navigation } from "lucide-react";
import type { Customer } from "@shared/schema";

function getFullAddress(c: Customer): string {
  return [c.street, c.city, c.state, c.zip].filter(Boolean).join(", ");
}

function getNavigationLink(address: string): string {
  const encoded = encodeURIComponent(address);
  return `https://maps.google.com/?q=${encoded}`;
}

export default function FieldCustomerList() {
  const { t } = useTranslation();
  const [searchTerm, setSearchTerm] = useState("");

  const { data: customersResp, isLoading } = useQuery<{ customers: Customer[]; total: number }>({
    queryKey: ["/api/customers"],
  });
  const customers = customersResp?.customers ?? [];

  const activeCustomers = customers
    .filter((c) => c.active === "true")
    .filter((c) => {
      if (!searchTerm.trim()) return true;
      const lower = searchTerm.toLowerCase();
      const fullAddress = getFullAddress(c).toLowerCase();
      return c.name.toLowerCase().includes(lower) || fullAddress.includes(lower);
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="space-y-4 pb-20">
      <div>
        <h1
          className="text-2xl font-semibold tracking-tight"
          data-testid="text-page-title"
        >
          {t("fieldLayout.customers")}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t("fieldCustomers.subtitle", "Active customers and quick navigation")}
        </p>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          data-testid="input-search-customers"
          placeholder={t("fieldCustomers.searchPlaceholder", "Search by name or address...")}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10"
        />
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-28 w-full rounded-lg" />
          ))}
        </div>
      ) : activeCustomers.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-10 gap-3 text-center">
            <Building2 className="w-10 h-10 text-muted-foreground opacity-50" />
            <p className="font-medium text-muted-foreground">
              {searchTerm
                ? t("fieldCustomers.noResults", "No customers match your search")
                : t("fieldCustomers.noCustomers", "No active customers found")}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {activeCustomers.map((customer) => {
            const address = getFullAddress(customer);
            return (
              <Card
                key={customer.id}
                data-testid={`card-customer-${customer.id}`}
              >
                <CardContent className="p-4 space-y-3">
                  <div>
                    <p
                      className="font-medium"
                      data-testid={`text-customer-name-${customer.id}`}
                    >
                      {customer.name}
                    </p>
                    <p
                      className="text-sm text-muted-foreground"
                      data-testid={`text-customer-address-${customer.id}`}
                    >
                      {address}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      asChild
                      data-testid={`button-route-map-${customer.id}`}
                    >
                      <Link href="/dashboard/customers/map">
                        <MapPin className="w-3.5 h-3.5 mr-1.5" />
                        {t("fieldCustomers.routeMap", "Route Map")}
                      </Link>
                    </Button>

                    <Button
                      variant="outline"
                      size="sm"
                      asChild
                      data-testid={`button-property-map-${customer.id}`}
                    >
                      <Link href={`/dashboard/maps?customerId=${customer.id}`}>
                        <Map className="w-3.5 h-3.5 mr-1.5" />
                        {t("fieldCustomers.propertyMap", "Property Map")}
                      </Link>
                    </Button>

                    <Button
                      variant="outline"
                      size="sm"
                      asChild
                      data-testid={`button-navigate-${customer.id}`}
                    >
                      <a
                        href={getNavigationLink(address)}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <Navigation className="w-3.5 h-3.5 mr-1.5" />
                        {t("fieldCustomers.navigate", "Navigate")}
                      </a>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
