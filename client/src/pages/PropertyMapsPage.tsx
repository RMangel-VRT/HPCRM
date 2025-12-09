import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Customer } from "@shared/schema";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search, MapPin, Layers, ChevronRight } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import LayerMapViewer from "@/components/LayerMapViewer";

interface CustomerWithLayers extends Customer {
  layerCount?: number;
}

export default function PropertyMapsPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);

  const { data: customers = [], isLoading } = useQuery<CustomerWithLayers[]>({
    queryKey: ["/api/customers"],
  });

  const getFullAddress = (c: CustomerWithLayers) => 
    `${c.street}, ${c.city}, ${c.state} ${c.zip}`;

  const filteredCustomers = customers.filter((customer) => {
    const searchLower = searchTerm.toLowerCase();
    return customer.name.toLowerCase().includes(searchLower) ||
      customer.street.toLowerCase().includes(searchLower) ||
      customer.city.toLowerCase().includes(searchLower);
  });

  if (selectedCustomerId) {
    return (
      <LayerMapViewer
        customerId={selectedCustomerId}
        fullScreen
        onClose={() => setSelectedCustomerId(null)}
      />
    );
  }

  return (
    <div className="space-y-4 max-w-2xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold">Property Maps</h1>
        <p className="text-sm text-muted-foreground">
          View service zones and routes for customer properties
        </p>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          data-testid="input-search-property"
          placeholder="Search by customer name or address..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10"
        />
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : filteredCustomers.length === 0 ? (
        <Card>
          <CardContent className="text-center py-8">
            <MapPin className="w-12 h-12 mx-auto text-muted-foreground mb-2" />
            <p className="text-muted-foreground">
              {searchTerm ? "No properties match your search" : "No customers found"}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filteredCustomers.map((customer) => (
            <Card
              key={customer.id}
              className="hover-elevate cursor-pointer"
              data-testid={`card-customer-map-${customer.id}`}
              onClick={() => setSelectedCustomerId(customer.id)}
            >
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <MapPin className="w-5 h-5 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium truncate" data-testid={`text-customer-name-${customer.id}`}>
                        {customer.name}
                      </p>
                      <p className="text-sm text-muted-foreground truncate">
                        {getFullAddress(customer)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Badge variant="secondary" className="flex items-center gap-1">
                      <Layers className="w-3 h-3" />
                      <span>Layers</span>
                    </Badge>
                    <ChevronRight className="w-5 h-5 text-muted-foreground" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
