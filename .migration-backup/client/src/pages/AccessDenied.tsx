import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ShieldAlert } from "lucide-react";
import { Link } from "wouter";

export default function AccessDenied() {
  const { t } = useTranslation();
  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center space-y-4">
          <div className="flex justify-center">
            <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center">
              <ShieldAlert className="w-8 h-8 text-destructive" />
            </div>
          </div>
          <div>
            <CardTitle className="text-2xl">{t("accessDenied.title")}</CardTitle>
            <CardDescription>
              {t("accessDenied.description")}
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="text-center">
          <p className="text-sm text-muted-foreground mb-6">
            {t("accessDenied.details")}
          </p>
          <Button asChild data-testid="button-back-dashboard">
            <Link href="/dashboard">{t("accessDenied.returnToDashboard")}</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
