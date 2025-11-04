import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRoute } from "wouter";
import type { Customer, Contact, Note, Contract } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Edit, Plus, Users, FileText, MessageSquare, MapPin, BarChart3 } from "lucide-react";
import StatusBadge from "@/components/StatusBadge";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";

export default function CustomerDetail() {
  const [, params] = useRoute("/customers/:id");
  const id = params?.id;
  const [activeTab, setActiveTab] = useState("overview");

  const { data: customer, isLoading: isLoadingCustomer } = useQuery<Customer>({
    queryKey: ["/api/customers", id],
    enabled: !!id,
  });

  const { data: contacts = [], isLoading: isLoadingContacts } = useQuery<Contact[]>({
    queryKey: ["/api/customers", id, "contacts"],
    enabled: !!id,
  });

  const { data: notes = [], isLoading: isLoadingNotes } = useQuery<Note[]>({
    queryKey: ["/api/customers", id, "notes"],
    enabled: !!id,
  });

  const { data: contracts = [], isLoading: isLoadingContracts } = useQuery<Contract[]>({
    queryKey: ["/api/customers", id, "contracts"],
    enabled: !!id,
  });

  if (isLoadingCustomer) {
    return (
      <div className="space-y-6">
        <div className="space-y-3">
          <Skeleton className="h-10 w-2/3" />
          <Skeleton className="h-6 w-1/3" />
        </div>
        <Skeleton className="h-[400px] w-full" />
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="flex items-center justify-center h-96">
        <p className="text-muted-foreground">Customer not found</p>
      </div>
    );
  }

  const sortedNotes = [...notes].sort((a, b) => 
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-3xl font-semibold tracking-tight" data-testid="text-customer-name">
              {customer.name}
            </h1>
            <StatusBadge status={customer.status} />
          </div>
          <div className="flex gap-2 flex-wrap">
            {customer.tags?.map((tag) => (
              <Badge key={tag} variant="outline" className="text-xs">
                {tag}
              </Badge>
            ))}
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" data-testid="button-add-note">
            <MessageSquare className="w-4 h-4 mr-2" />
            Add Note
          </Button>
          <Button data-testid="button-edit-customer">
            <Edit className="w-4 h-4 mr-2" />
            Edit
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview" data-testid="tab-overview">Overview</TabsTrigger>
          <TabsTrigger value="contacts" data-testid="tab-contacts">
            Contacts ({contacts.length})
          </TabsTrigger>
          <TabsTrigger value="notes" data-testid="tab-notes">
            Notes ({notes.length})
          </TabsTrigger>
          <TabsTrigger value="contracts" data-testid="tab-contracts">
            Contracts ({contracts.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Customer Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Address</p>
                  <div className="flex items-start gap-1.5 mt-1">
                    <MapPin className="w-4 h-4 mt-0.5 text-muted-foreground" />
                    <div>
                      <p className="text-sm" data-testid="text-customer-address">
                        {customer.street}
                      </p>
                      <p className="text-sm">
                        {customer.city}, {customer.state} {customer.zip}
                      </p>
                    </div>
                  </div>
                </div>
                <Separator />
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Acres</p>
                    <p className="text-sm mt-1" data-testid="text-customer-acres">
                      {customer.acres || "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Complexity</p>
                    <p className="text-sm mt-1" data-testid="text-customer-complexity">
                      {customer.complexityScore ? `Level ${customer.complexityScore}` : "—"}
                    </p>
                  </div>
                </div>
                <Separator />
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Tags</p>
                  <div className="flex gap-2 flex-wrap mt-1">
                    {customer.tags && customer.tags.length > 0 ? (
                      customer.tags.map((tag) => (
                        <Badge key={tag} variant="outline" className="text-xs" data-testid={`badge-tag-${tag}`}>
                          {tag}
                        </Badge>
                      ))
                    ) : (
                      <p className="text-sm text-muted-foreground">No tags</p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Quick Stats</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm">Contacts</span>
                  </div>
                  <span className="text-sm font-medium" data-testid="text-contacts-count">
                    {contacts.length}
                  </span>
                </div>
                <Separator />
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm">Active Contracts</span>
                  </div>
                  <span className="text-sm font-medium" data-testid="text-contracts-count">
                    {contracts.filter(c => c.status === "active").length}
                  </span>
                </div>
                <Separator />
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <MessageSquare className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm">Notes</span>
                  </div>
                  <span className="text-sm font-medium" data-testid="text-notes-count">
                    {notes.length}
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="contacts" className="space-y-4">
          <div className="flex justify-end">
            <Button size="sm" data-testid="button-add-contact">
              <Plus className="w-4 h-4 mr-2" />
              Add Contact
            </Button>
          </div>
          {isLoadingContacts ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-24 w-full" />
              ))}
            </div>
          ) : contacts.length === 0 ? (
            <Card>
              <CardContent className="flex items-center justify-center p-12">
                <div className="text-center">
                  <Users className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
                  <p className="text-sm text-muted-foreground">No contacts yet</p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {contacts.map((contact) => (
                <Card key={contact.id} data-testid={`card-contact-${contact.id}`}>
                  <CardContent className="flex items-center justify-between p-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{contact.name}</p>
                        {contact.isPrimary === "true" && (
                          <Badge variant="secondary" className="text-xs">Primary</Badge>
                        )}
                      </div>
                      {contact.role && (
                        <p className="text-sm text-muted-foreground">{contact.role}</p>
                      )}
                      {contact.phone && (
                        <p className="text-sm text-muted-foreground">{contact.phone}</p>
                      )}
                      {contact.email && (
                        <p className="text-sm text-muted-foreground">{contact.email}</p>
                      )}
                    </div>
                    <Button variant="ghost" size="icon" data-testid={`button-edit-contact-${contact.id}`}>
                      <Edit className="w-4 h-4" />
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="notes" className="space-y-4">
          <div className="flex justify-end">
            <Button size="sm" data-testid="button-add-note-tab">
              <Plus className="w-4 h-4 mr-2" />
              Add Note
            </Button>
          </div>
          {isLoadingNotes ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-32 w-full" />
              ))}
            </div>
          ) : sortedNotes.length === 0 ? (
            <Card>
              <CardContent className="flex items-center justify-center p-12">
                <div className="text-center">
                  <MessageSquare className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
                  <p className="text-sm text-muted-foreground">No notes yet</p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {sortedNotes.map((note) => (
                <Card key={note.id} data-testid={`card-note-${note.id}`}>
                  <CardContent className="p-4">
                    <div className="flex justify-between items-start mb-2">
                      <p className="text-sm font-medium">Note</p>
                      <p className="text-xs text-muted-foreground" data-testid={`text-note-date-${note.id}`}>
                        {format(new Date(note.createdAt), "MMM d, yyyy")}
                      </p>
                    </div>
                    <p className="text-sm" data-testid={`text-note-body-${note.id}`}>{note.body}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="contracts" className="space-y-4">
          {isLoadingContracts ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-32 w-full" />
              ))}
            </div>
          ) : contracts.length === 0 ? (
            <Card>
              <CardContent className="flex items-center justify-center p-12">
                <div className="text-center">
                  <FileText className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
                  <p className="text-sm text-muted-foreground">No contracts yet</p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {contracts.map((contract) => (
                <Card key={contract.id} data-testid={`card-contract-${contract.id}`}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <p className="font-medium" data-testid={`text-contract-service-${contract.id}`}>
                          {contract.serviceType}
                        </p>
                        <p className="text-sm text-muted-foreground" data-testid={`text-contract-billing-${contract.id}`}>
                          {contract.billingPattern}
                        </p>
                      </div>
                      <StatusBadge status={contract.status} />
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <p className="text-muted-foreground">Start Date</p>
                        <p data-testid={`text-contract-start-${contract.id}`}>
                          {format(new Date(contract.startDate), "MMM d, yyyy")}
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">End Date</p>
                        <p data-testid={`text-contract-end-${contract.id}`}>
                          {contract.endDate ? format(new Date(contract.endDate), "MMM d, yyyy") : "Ongoing"}
                        </p>
                      </div>
                    </div>
                    {contract.po && (
                      <div className="mt-3 text-sm">
                        <p className="text-muted-foreground">PO Number</p>
                        <p data-testid={`text-contract-po-${contract.id}`}>{contract.po}</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
