import { useTranslation } from "react-i18next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Building2, Users, Settings } from "lucide-react";

export default function SuperAdminHome() {
  const { t } = useTranslation();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">{t("superAdmin.portal")}</h1>
        <p className="text-muted-foreground mt-2">
          {t("superAdmin.platformAdmin")}
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card>
          <CardHeader>
            <Building2 className="h-8 w-8 mb-2 text-primary" />
            <CardTitle>{t("superAdmin.companies")}</CardTitle>
            <CardDescription>
              {t("superAdmin.manageCompanies")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              {t("superAdmin.comingSoon")}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <Users className="h-8 w-8 mb-2 text-primary" />
            <CardTitle>{t("superAdmin.users")}</CardTitle>
            <CardDescription>
              {t("superAdmin.crossCompanyUsers")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              {t("superAdmin.comingSoon")}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <Settings className="h-8 w-8 mb-2 text-primary" />
            <CardTitle>{t("superAdmin.platformSettings")}</CardTitle>
            <CardDescription>
              {t("superAdmin.systemConfig")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              {t("superAdmin.comingSoon")}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("superAdmin.welcome")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {t("superAdmin.platformAdmin")}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
