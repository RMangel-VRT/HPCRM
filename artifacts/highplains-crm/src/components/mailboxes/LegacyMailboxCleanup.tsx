import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { commitDuplicateSentCleanup, commitLegacyMailboxCleanup, listLegacyMailboxes,
  previewDuplicateSentCleanup, previewLegacyMailboxCleanup, type LegacyMailboxSummary,
  type LegacyMailboxReview, type DuplicateSentReview } from "@workspace/api-client-react";

type Target = { operation: "legacy"; mailbox: LegacyMailboxSummary } | { operation: "duplicates" };
type Report = LegacyMailboxReview | DuplicateSentReview;
const base = "/api/mailbox-accounts/cleanup";
const targetPath = (target: Target) => target.operation === "duplicates" ? `${base}/duplicates`
  : `${base}/legacy/${encodeURIComponent(target.mailbox.id)}`;

export default function LegacyMailboxCleanup({ companyId }: { companyId: string }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [target, setTarget] = useState<Target | null>(null);
  const [result, setResult] = useState<Report | null>(null);
  const [reviewAgain, setReviewAgain] = useState(false);
  const headers = { "X-Company-Id": companyId };
  const path = target ? targetPath(target) : "";
  const legacy = useQuery({ queryKey: [base, companyId, "legacy"],
    queryFn: ({ signal }) => listLegacyMailboxes({ headers, signal }) });
  const review = useQuery<Report>({ queryKey: [base, companyId, path],
    enabled: !!target && !result, gcTime: 0,
    queryFn: ({ signal }) => target?.operation === "legacy"
      ? previewLegacyMailboxCleanup(encodeURIComponent(target.mailbox.id), { headers, signal })
      : previewDuplicateSentCleanup({ headers, signal }) });
  const commit = useMutation({
    mutationFn: ({ target, reviewKey }: { target: Target; reviewKey: string }): Promise<Report> => {
      const confirmation = { confirm: true as const, reviewKey };
      return target.operation === "legacy"
        ? commitLegacyMailboxCleanup(encodeURIComponent(target.mailbox.id), confirmation, { headers })
        : commitDuplicateSentCleanup(confirmation, { headers });
    },
    onSuccess: async data => {
      setResult(data);
      await qc.invalidateQueries({ predicate: query => query.queryKey.some(key =>
        typeof key === "string" && (key.includes("/communications") || key.includes("/unsorted-emails") || key.includes("/mailbox-accounts"))) });
    },
    onError: error => {
      if ("status" in error && error.status === 409) {
        setReviewAgain(true);
        void review.refetch();
      }
    },
  });
  function open(next: Target | null) {
    if (commit.isPending) return;
    commit.reset();
    setResult(null);
    setReviewAgain(false);
    setTarget(next);
  }
  const report = result ?? review.data;
  const hasChanges = report && ("merged" in report.counts ? report.counts.merged > 0 : report.counts.mailboxes > 0);
  const title = t(target?.operation === "duplicates" ? "sharedMailbox.removeDuplicates" : "sharedMailbox.deleteLegacy");

  return <section className="space-y-4" data-testid="legacy-mailboxes">
    <div>
      <h2 className="text-base font-semibold">{t("sharedMailbox.legacy")}</h2>
      <p className="text-sm text-muted-foreground">{t("sharedMailbox.legacyDescription")}</p>
    </div>
    {legacy.isPending && <p className="text-sm text-muted-foreground">{t("sharedMailbox.loading")}</p>}
    {legacy.isError && <p role="alert" className="text-sm text-destructive">{t("sharedMailbox.loadError")}</p>}
    {legacy.data?.length === 0 && <p className="text-sm text-muted-foreground">{t("sharedMailbox.noLegacy")}</p>}
    {!!legacy.data?.length && <Card><CardContent className="p-4 space-y-3">
      {legacy.data.map(mailbox => <div key={mailbox.id} className="flex flex-wrap justify-between gap-2">
        <div>
          <p className="text-sm font-medium">{mailbox.displayName}</p>
          <p className="text-xs text-muted-foreground">{mailbox.emailAddress} · {t(mailbox.accountType === "personal"
            ? "sharedMailbox.personal" : "sharedMailbox.inactive")}</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => open({ operation: "legacy", mailbox })}
          data-testid={`review-legacy-mailbox-${mailbox.id}`}>{t("sharedMailbox.deleteLegacy")}</Button>
      </div>)}
    </CardContent></Card>}
    <Button variant="outline" size="sm" onClick={() => open({ operation: "duplicates" })}
      data-testid="review-duplicate-sent-copies">{t("sharedMailbox.removeDuplicates")}</Button>

    <Dialog open={!!target} onOpenChange={visible => { if (!visible) open(null); }}>
      <DialogContent data-testid="dialog-mailbox-cleanup">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{t(target?.operation === "duplicates"
            ? "sharedMailbox.duplicatesExplanation" : "sharedMailbox.purgeExplanation")}</DialogDescription>
        </DialogHeader>
        {target?.operation === "legacy" && <p className="text-sm font-medium">{target.mailbox.emailAddress}</p>}
        <p className="text-sm">{t("sharedMailbox.noProviderDeletion")}</p>
        {result && <p role="status" className="font-medium" data-testid="mailbox-cleanup-result">{t("sharedMailbox.completed")}</p>}
        {!result && review.isFetching && <p role="status" className="text-sm">{t("sharedMailbox.loading")}</p>}
        {!result && review.isError && <p role="alert" className="text-sm text-destructive">{t("sharedMailbox.loadError")}</p>}
        {!result && reviewAgain && <p role="alert" className="text-sm">{t("sharedMailbox.reviewAgain")}</p>}
        {!result && commit.isError && !reviewAgain && <p role="alert" className="text-sm text-destructive">{t("sharedMailbox.commitError")}</p>}
        {report && <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm" data-testid="mailbox-cleanup-counts">
          {Object.entries(report.counts).map(([key, count]) => <div key={key} className="contents">
            <dt>{t(`sharedMailbox.counts.${key}`)}</dt><dd className="tabular-nums">{count}</dd>
          </div>)}
        </dl>}
        <DialogFooter>
          <Button variant="outline" onClick={() => open(null)} disabled={commit.isPending} data-testid="close-mailbox-cleanup">
            {t(result || !hasChanges ? "sharedMailbox.close" : "sharedMailbox.cancel")}
          </Button>
          {!result && hasChanges && report && target && <Button variant="destructive"
            disabled={review.isFetching || review.isError || commit.isPending}
            data-testid="confirm-mailbox-cleanup"
            onClick={() => { setReviewAgain(false); commit.mutate({ target, reviewKey: report.reviewKey }); }}>
            {t(commit.isPending ? "sharedMailbox.working" : "sharedMailbox.confirm")}
          </Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </section>;
}
