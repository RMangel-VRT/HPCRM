import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Edit, Plus, Building2, Users, FileText, MessageSquare } from "lucide-react";
import StatusBadge from "@/components/StatusBadge";
import { Link } from "wouter";

export default function CustomerDetail() {
  const [activeTab, setActiveTab] = useState("overview");

  const customer = {
    id: "1",
    name: "Riverside Homeowners Association",
    status: "active" as const,
    qboLinked: true,
    tags: ["HOA", "High-Value", "Annual Contract"],
  };

  const properties = [
    { id: "1", name: "Main Entrance", address: "1234 River Road", acres: 2.5 },
    { id: "2", name: "Community Park", address: "1240 River Road", acres: 5.0 },
    { id: "3", name: "Pool Area", address: "1250 River Road", acres: 1.2 },
  ];

  const contacts = [
    { id: "1", name: "Sarah Johnson", title: "HOA President", phone: "(555) 123-4567", preferred: true },
    { id: "2", name: "Mike Chen", title: "Property Manager", phone: "(555) 987-6543", preferred: false },
  ];

  const notes = [
    { id: "1", user: "John Doe", date: "2024-03-10", body: "Discussed spring cleanup schedule. They want to start week of April 1st." },
    { id: "2", user: "Jane Smith", date: "2024-03-05", body: "Annual contract renewal approved by board. Will send updated agreement." },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-3xl font-semibold tracking-tight" data-testid="text-customer-name">
              {customer.name}
            </h1>
            <StatusBadge status={customer.status} />
            {customer.qboLinked && (
              <Badge variant="secondary" className="text-xs">
                QuickBooks Linked
              </Badge>
            )}
          </div>
          <div className="flex gap-2 flex-wrap">
            {customer.tags.map((tag) => (
              <Badge key={tag} variant="outline" className="text-xs">
                {tag}
              </Badge>
            ))}
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" data-testid="button-add-property">
            <Building2 className="w-4 h-4 mr-2" />
            Add Property
          </Button>
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
          <TabsTrigger value="properties" data-testid="tab-properties">
            Properties ({properties.length})
          </TabsTrigger>
          <TabsTrigger value="contacts" data-testid="tab-contacts">
            Contacts ({contacts.length})
          </TabsTrigger>
          <TabsTrigger value="notes" data-testid="tab-notes">
            Notes ({notes.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Recent Properties</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {properties.slice(0, 3).map((property) => (
                  <div key={property.id} className="flex justify-between items-start">
                    <div>
                      <p className="font-medium">{property.name}</p>
                      <p className="text-sm text-muted-foreground">{property.address}</p>
                    </div>
                    <span className="text-sm text-muted-foreground">{property.acres} ac</span>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Recent Activity</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="text-sm">
                  <p className="font-medium">Contract Renewed</p>
                  <p className="text-muted-foreground">March 10, 2024</p>
                </div>
                <Separator />
                <div className="text-sm">
                  <p className="font-medium">Property Added</p>
                  <p className="text-muted-foreground">March 5, 2024</p>
                </div>
                <Separator />
                <div className="text-sm">
                  <p className="font-medium">Note Added</p>
                  <p className="text-muted-foreground">March 1, 2024</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="properties" className="space-y-4">
          <div className="flex justify-end">
            <Button size="sm" data-testid="button-add-property-tab">
              <Plus className="w-4 h-4 mr-2" />
              Add Property
            </Button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {properties.map((property) => (
              <Card key={property.id} className="hover-elevate" data-testid={`card-property-${property.id}`}>
                <CardHeader>
                  <CardTitle className="text-base">{property.name}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground mb-2">{property.address}</p>
                  <p className="text-sm">
                    <span className="font-medium">{property.acres}</span> acres
                  </p>
                  <Button variant="outline" size="sm" className="w-full mt-4" asChild>
                    <Link href={`/properties/${property.id}`}>View Details</Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="contacts" className="space-y-4">
          <div className="flex justify-end">
            <Button size="sm" data-testid="button-add-contact">
              <Plus className="w-4 h-4 mr-2" />
              Add Contact
            </Button>
          </div>
          <div className="space-y-3">
            {contacts.map((contact) => (
              <Card key={contact.id} data-testid={`card-contact-${contact.id}`}>
                <CardContent className="flex items-center justify-between p-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{contact.name}</p>
                      {contact.preferred && (
                        <Badge variant="secondary" className="text-xs">Preferred</Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">{contact.title}</p>
                    <p className="text-sm text-muted-foreground">{contact.phone}</p>
                  </div>
                  <Button variant="ghost" size="icon">
                    <Edit className="w-4 h-4" />
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="notes" className="space-y-4">
          <div className="flex justify-end">
            <Button size="sm" data-testid="button-add-note-tab">
              <Plus className="w-4 h-4 mr-2" />
              Add Note
            </Button>
          </div>
          <div className="space-y-3">
            {notes.map((note) => (
              <Card key={note.id} data-testid={`card-note-${note.id}`}>
                <CardContent className="p-4">
                  <div className="flex justify-between items-start mb-2">
                    <p className="text-sm font-medium">{note.user}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(note.date).toLocaleDateString()}
                    </p>
                  </div>
                  <p className="text-sm">{note.body}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
