import { useTranslation } from "react-i18next";
import { Mail } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";

export default function EmptyMailboxCallout() {
  const { t } = useTranslation();
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center py-10 gap-3 text-center">
        <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
          <Mail className="w-6 h-6 text-muted-foreground" />
        </div>
        <div>
          <p className="font-medium text-sm">{t("sharedMailbox.noConnected")}</p>
          <p className="text-sm text-muted-foreground mt-1 max-w-xs">
            {t("sharedMailbox.noConnectedDescription")}
          </p>
        </div>
        <Button asChild size="sm" variant="outline">
          <Link href="/dashboard/settings/shared-mailboxes">{t("sharedMailbox.openSettings")}</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
