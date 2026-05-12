import { useTranslation } from "react-i18next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, Camera, Calculator, ClipboardList, Map, HardHat } from "lucide-react";
import { Link } from "wouter";

export default function ToolsPage() {
  const { t } = useTranslation();

  const tools = [
    {
      title: t("tools.contractBuilder"),
      description: t("tools.contractBuilderDesc"),
      icon: FileText,
      href: "/dashboard/tools/contract-builder",
      available: true,
      testId: "card-contract-builder",
    },
    {
      title: t("tools.proposalMaker"),
      description: t("tools.proposalMakerDesc"),
      icon: ClipboardList,
      href: "/dashboard/tools/proposals",
      available: true,
      testId: "card-proposal-maker",
    },
    {
      title: t("tools.crewWorksheets"),
      description: t("tools.crewWorksheetsDesc"),
      icon: ClipboardList,
      iconBg: "bg-amber-100 dark:bg-amber-950/40",
      iconFg: "text-amber-700 dark:text-amber-300",
      href: "/dashboard/tools/crew-worksheets",
      available: true,
      testId: "card-crew-worksheets",
    },
    {
      title: t("tools.visualScope"),
      description: t("tools.visualScopeDesc"),
      icon: Map,
      href: "/dashboard/tools/visual-scope",
      available: true,
      testId: "card-visual-scope",
    },
    {
      title: t("tools.snowDamage"),
      description: t("tools.snowDamageDesc"),
      icon: Camera,
      href: "/dashboard/tools/snow-damage",
      available: false,
      testId: "card-snow-damage",
    },
    {
      title: t("tools.estimateBuilder"),
      description: t("tools.estimateBuilderDesc"),
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
            {t("tools.title")}
          </h1>
          <p className="text-muted-foreground" data-testid="text-page-description">
            {t("tools.description")}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {tools.map((tool) => (
            <Card key={tool.title} className="hover-elevate" data-testid={tool.testId}>
              <CardHeader>
                <div className="flex items-center gap-3 mb-2">
                  <div className={`p-2 rounded-md ${tool.iconBg ?? "bg-primary/10"}`}>
                    <tool.icon className={`w-6 h-6 ${tool.iconFg ?? "text-primary"}`} />
                  </div>
                  {!tool.available && (
                    <span className="text-xs font-medium text-muted-foreground">
                      {t("tools.comingSoon")}
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
                      {t("tools.openTool")}
                    </Button>
                  </Link>
                ) : (
                  <Button 
                    className="w-full" 
                    variant="secondary" 
                    disabled
                    data-testid={`button-${tool.testId}-disabled`}
                  >
                    {t("tools.comingSoon")}
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
