import { useState } from "react";
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
          New Contract
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Create a new service contract with monthly billing breakdown
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Contract Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="property">Property *</Label>
              <Select>
                <SelectTrigger id="property" data-testid="select-property">
                  <SelectValue placeholder="Select property" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Main Entrance - Riverside HOA</SelectItem>
                  <SelectItem value="2">Corporate Campus - Greenfield Corp</SelectItem>
                  <SelectItem value="3">Community Park - Riverside HOA</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="serviceType">Service Type *</Label>
              <Select>
                <SelectTrigger id="serviceType" data-testid="select-service-type">
                  <SelectValue placeholder="Select service type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="maintenance">Maintenance</SelectItem>
                  <SelectItem value="chemical">Chemical Application</SelectItem>
                  <SelectItem value="snow">Snow Removal</SelectItem>
                  <SelectItem value="irrigation">Irrigation</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="billingSchedule">Billing Schedule *</Label>
              <Select>
                <SelectTrigger id="billingSchedule" data-testid="select-billing-schedule">
                  <SelectValue placeholder="Select billing schedule" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="seasonal">Seasonal</SelectItem>
                  <SelectItem value="12of12">12 of 12</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="poNumber">PO Number</Label>
              <Input
                id="poNumber"
                placeholder="PO-12345"
                data-testid="input-po-number"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="startDate">Start Date *</Label>
              <Input
                id="startDate"
                type="date"
                data-testid="input-start-date"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="endDate">End Date *</Label>
              <Input
                id="endDate"
                type="date"
                data-testid="input-end-date"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              placeholder="Additional contract notes..."
              rows={3}
              data-testid="input-notes"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Monthly Amounts</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Month</TableHead>
                  <TableHead className="text-right">Amount ($)</TableHead>
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
              <span className="text-lg font-semibold">Total Annual Value</span>
              <span className="text-2xl font-bold" data-testid="text-total-annual">
                ${totalAnnual.toFixed(2)}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-4">
        <Button variant="outline" data-testid="button-cancel">
          Cancel
        </Button>
        <Button data-testid="button-save">
          Create Contract
        </Button>
      </div>
    </div>
  );
}
