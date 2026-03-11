import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const months = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

export default function ContractForm() {
  const { t } = useTranslation();
  const [monthlyAmounts, setMonthlyAmounts] = useState<Record<number, string>>(
    Object.fromEntries(months.map((_, i) => [i + 1, "0.00"]))
  );

  const handleMonthlyAmountChange = (month: number, value: string) => {
    setMonthlyAmounts((prev) => ({ ...prev, [month]: value }));
  };

  const totalAnnual = Object.values(monthlyAmounts).reduce(
    (sum, val) => sum + (parseFloat(val) || 0),
    0
  );

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight" data-testid="text-page-title">
          {t("contracts.newContract")}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {t("contracts.createContract")}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("common.details")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="property">{t("common.property")} *</Label>
              <Select>
                <SelectTrigger id="property" data-testid="select-property">
                  <SelectValue placeholder={t("contracts.selectProperty")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Main Entrance - Riverside HOA</SelectItem>
                  <SelectItem value="2">Corporate Campus - Greenfield Corp</SelectItem>
                  <SelectItem value="3">Community Park - Riverside HOA</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="serviceType">{t("contracts.serviceType")} *</Label>
              <Select>
                <SelectTrigger id="serviceType" data-testid="select-service-type">
                  <SelectValue placeholder={t("contracts.serviceType")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="maintenance">{t("serviceTypes.maintenance")}</SelectItem>
                  <SelectItem value="chemical">{t("serviceTypes.chemical")}</SelectItem>
                  <SelectItem value="snow">{t("serviceTypes.snow")}</SelectItem>
                  <SelectItem value="irrigation">{t("serviceTypes.irrigation")}</SelectItem>
                  <SelectItem value="other">{t("serviceTypes.other")}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="billingSchedule">{t("contracts.billingSchedule")} *</Label>
              <Select>
                <SelectTrigger id="billingSchedule" data-testid="select-billing-schedule">
                  <SelectValue placeholder={t("contracts.billingSchedule")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">{t("contracts.monthly")}</SelectItem>
                  <SelectItem value="seasonal">{t("contracts.seasonal")}</SelectItem>
                  <SelectItem value="12of12">{t("contracts.twelveOfTwelve")}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="poNumber">{t("contracts.poNumber")}</Label>
              <Input
                id="poNumber"
                placeholder="PO-12345"
                data-testid="input-po-number"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="startDate">{t("contracts.startDate")} *</Label>
              <Input
                id="startDate"
                type="date"
                data-testid="input-start-date"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="endDate">{t("contracts.endDate")} *</Label>
              <Input
                id="endDate"
                type="date"
                data-testid="input-end-date"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">{t("common.notes")}</Label>
            <Textarea
              id="notes"
              placeholder={t("contracts.additionalNotes")}
              rows={3}
              data-testid="input-notes"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("contracts.month")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("contracts.month")}</TableHead>
                  <TableHead className="text-right">{t("contracts.amount")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {months.map((month, index) => (
                  <TableRow key={month}>
                    <TableCell className="font-medium">{month}</TableCell>
                    <TableCell className="text-right">
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={monthlyAmounts[index + 1]}
                        onChange={(e) => handleMonthlyAmountChange(index + 1, e.target.value)}
                        className="text-right max-w-[150px] ml-auto"
                        data-testid={`input-month-${index + 1}`}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="mt-4 p-4 bg-muted rounded-lg">
            <div className="flex items-center justify-between">
              <span className="text-lg font-semibold">{t("contracts.totalAnnualValue")}</span>
              <span className="text-2xl font-bold" data-testid="text-total-annual">
                ${totalAnnual.toFixed(2)}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-4">
        <Button variant="outline" data-testid="button-cancel">
          {t("common.cancel")}
        </Button>
        <Button data-testid="button-save">
          {t("contracts.newContract")}
        </Button>
      </div>
    </div>
  );
}
