import { useState } from "react";
import { useTranslation } from "react-i18next";
import { getGetRequiredSqlObjectsQueryKey, useGetRequiredSqlObjects } from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function RequiredSqlObjectsCard({ companyId, userId }: { companyId?: string | null; userId?: string }) {
  const { t } = useTranslation();
  const [copyFeedback, setCopyFeedback] = useState("");
  const status = useGetRequiredSqlObjects({
    query: {
      queryKey: [...getGetRequiredSqlObjectsQueryKey(), companyId, userId],
      enabled: Boolean(companyId && userId),
      staleTime: 30_000,
      retry: false,
    },
    request: { headers: companyId ? { "X-Company-Id": companyId } : undefined },
  });

  async function copySql(sql: string) {
    try {
      await navigator.clipboard.writeText(sql);
      setCopyFeedback(t("settings.sqlObjects.copied"));
    } catch {
      setCopyFeedback(t("settings.sqlObjects.copyFailed"));
    }
  }

  return (
    <Card data-testid="database-sql-objects">
      <CardHeader>
        <CardTitle>{t("settings.sqlObjects.title")}</CardTitle>
        <CardDescription>{t("settings.sqlObjects.description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {status.isPending && <p role="status">{t("common.loading")}</p>}
        {status.isError && <p role="alert">{t("settings.sqlObjects.error")}</p>}
        {!status.isError && status.data?.objects.map(object => (
          <div key={object.id} className="space-y-2 rounded-md border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium">{object.label}</span>
              <Badge variant={object.present ? "secondary" : "destructive"}>
                {t(object.present ? "settings.sqlObjects.present" : "settings.sqlObjects.missing")}
              </Badge>
            </div>
            {!object.present && object.remediationSql && (
              <>
                <p className="break-all text-sm text-muted-foreground">{object.sqlFile}</p>
                <p className="text-sm">{t("settings.sqlObjects.runbook")}</p>
                <details className="space-y-2">
                  <summary className="cursor-pointer text-sm">{t("settings.sqlObjects.viewSql")}</summary>
                  <pre className="max-h-72 overflow-auto rounded bg-muted p-3 text-xs">{object.remediationSql}</pre>
                </details>
                <Button type="button" size="sm" variant="outline" onClick={() => void copySql(object.remediationSql!)}>
                  {t("settings.sqlObjects.copySql")}
                </Button>
              </>
            )}
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" disabled={status.isFetching || !companyId}
          onClick={() => void status.refetch()}>
          {t("settings.sqlObjects.refresh")}
        </Button>
        <span className="block text-sm" role="status">{copyFeedback}</span>
      </CardContent>
    </Card>
  );
}
