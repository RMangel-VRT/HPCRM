import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, Search, Eye, Edit } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import EmptyState from "@/components/EmptyState";
import emptyPropertiesImage from "@assets/generated_images/Empty_properties_state_illustration_c417b181.png";
import { Link } from "wouter";

const mockProperties = [
  {
    id: "1",
    name: "Main Entrance",
    customer: "Riverside HOA",
    address: "1234 River Road",
    acres: 2.5,
    complexity: 3,
    active: true,
  },
  {
    id: "2",
    name: "Corporate Campus",
    customer: "Greenfield Corp",
    address: "789 Business Pkwy",
    acres: 12.0,
    complexity: 5,
    active: true,
  },
  {
    id: "3",
    name: "Community Park",
    customer: "Riverside HOA",
    address: "1240 River Road",
    acres: 5.0,
    complexity: 4,
    active: true,
  },
];

export default function PropertiesList() {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const [properties] = useState(mockProperties);

  const filteredProperties = properties.filter((property) => {
    return (
      property.name.toLowerCase().includes(search.toLowerCase()) ||
      property.customer.toLowerCase().includes(search.toLowerCase()) ||
      property.address.toLowerCase().includes(search.toLowerCase())
    );
  });

  const getComplexityColor = (complexity: number) => {
    if (complexity <= 2) return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400";
    if (complexity <= 3) return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400";
    return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400";
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight" data-testid="text-page-title">
            {t("propertiesList.title")}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t("propertiesList.manage")}
          </p>
        </div>
        <Button data-testid="button-add-property">
          <Plus className="w-4 h-4 mr-2" />
          {t("propertiesList.addProperty")}
        </Button>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder={t("propertiesList.searchPlaceholder")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
          data-testid="input-search"
        />
      </div>

      {filteredProperties.length === 0 ? (
        <EmptyState
          image={emptyPropertiesImage}
          title={t("propertiesList.noProperties")}
          description=""
          actionLabel={t("propertiesList.addProperty")}
          onAction={() => console.log("Add property")}
        />
      ) : (
        <div className="border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("propertiesList.propertyName")}</TableHead>
                <TableHead>{t("customers.title")}</TableHead>
                <TableHead>{t("common.address")}</TableHead>
                <TableHead>{t("common.acres")}</TableHead>
                <TableHead>{t("common.complexity")}</TableHead>
                <TableHead className="text-right">{t("common.actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredProperties.map((property) => (
                <TableRow key={property.id} data-testid={`row-property-${property.id}`}>
                  <TableCell className="font-medium">{property.name}</TableCell>
                  <TableCell>{property.customer}</TableCell>
                  <TableCell className="text-muted-foreground">{property.address}</TableCell>
                  <TableCell>{property.acres}</TableCell>
                  <TableCell>
                    <Badge
                      variant="secondary"
                      className={getComplexityColor(property.complexity)}
                    >
                      {property.complexity}/5
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button variant="ghost" size="icon" asChild data-testid={`button-view-${property.id}`}>
                        <Link href={`/properties/${property.id}`}>
                          <Eye className="w-4 h-4" />
                        </Link>
                      </Button>
                      <Button variant="ghost" size="icon" data-testid={`button-edit-${property.id}`}>
                        <Edit className="w-4 h-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
