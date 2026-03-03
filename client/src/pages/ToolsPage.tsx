import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, Camera, Calculator, ClipboardList, Map } from "lucide-react";
import { Link } from "wouter";

export default function ToolsPage() {
  const tools = [
    {
      title: "Contract Builder",
      description: "Create customized landscape maintenance contracts with automated variable substitution and PDF export",
      icon: FileText,
      href: "/dashboard/tools/contract-builder",
      available: true,
      testId: "card-contract-builder",
    },
    {
      title: "Proposal Maker",
      description: "Build and store proposal drafts with QB estimate PDFs, scope of work, and supporting images",
      icon: ClipboardList,
      href: "/dashboard/tools/proposals",
      available: true,
      testId: "card-proposal-maker",
    },
    {
      title: "Visual Scope Sheet",
      description: "Create satellite-based visual scopes for customer proposals using map capture or image upload",
      icon: Map,
      href: "/dashboard/tools/visual-scope",
      available: true,
      testId: "card-visual-scope",
    },
    {
      title: "Snow Damage Capture",
      description: "Document and track snow removal damage with photo capture, customer info, and PDF reports",
      icon: Camera,
      href: "/dashboard/tools/snow-damage",
      available: false,
      testId: "card-snow-damage",
    },
    {
      title: "Estimate Builder",
      description: "Generate professional service estimates with itemized pricing and customizable terms",
      icon: Calculator,
      href: "/dashboard/tools/estimate-builder",
      available: false,
      testId: "card-estimate-builder",
    },
  ];

  return (
    <div className="p-8">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-semibold tracking-tight mb-2" data-testid="text-page-title">
            Tools
          </h1>
          <p className="text-muted-foreground" data-testid="text-page-description">
            Streamline your workflow with specialized document creation and management tools
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {tools.map((tool) => (
            <Card key={tool.title} className="hover-elevate" data-testid={tool.testId}>
              <CardHeader>
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2 rounded-md bg-primary/10">
                    <tool.icon className="w-6 h-6 text-primary" />
                  </div>
                  {!tool.available && (
                    <span className="text-xs font-medium text-muted-foreground">
                      Coming Soon
                    </span>
                  )}
                </div>
                <CardTitle className="text-xl" data-testid={`text-${tool.testId}-title`}>
                  {tool.title}
                </CardTitle>
                <CardDescription data-testid={`text-${tool.testId}-description`}>
                  {tool.description}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {tool.available ? (
                  <Link href={tool.href}>
                    <Button 
                      className="w-full" 
                      data-testid={`button-open-${tool.testId}`}
                    >
                      Open Tool
                    </Button>
                  </Link>
                ) : (
                  <Button 
                    className="w-full" 
                    variant="secondary" 
                    disabled
                    data-testid={`button-${tool.testId}-disabled`}
                  >
                    Coming Soon
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
