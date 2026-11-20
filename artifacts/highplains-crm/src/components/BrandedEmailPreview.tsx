import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";

type Preview = { subject: string; html: string; text: string };

export function useBrandedEmailPreview(companyId: string | undefined, endpoint: string, payload: object | undefined) {
  const [revision, setRevision] = useState(0);
  const body = payload ? JSON.stringify(payload) : undefined;
  const key = JSON.stringify([companyId, endpoint, body, revision]);
  const [state, setState] = useState<{ key: string; result?: Preview; failed?: true }>();
  useEffect(() => {
    if (!companyId || !body) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void apiRequest("POST", endpoint, JSON.parse(body), { headers: { "X-Company-Id": companyId }, signal: controller.signal })
        .then(res => res.json()).then(result => {
          if (!controller.signal.aborted) setState({ key, result });
        }).catch(() => {
          if (!controller.signal.aborted) setState({ key, failed: true });
        });
    }, 400);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [companyId, endpoint, body, key]);
  const current = body && state?.key === key ? state : undefined;
  return { result: current?.result, failed: current?.failed, retry: () => setRevision(n => n + 1) };
}

export function BrandedEmailPreview({ preview, ready }: {
  preview: ReturnType<typeof useBrandedEmailPreview>; ready: boolean;
}) {
  const { t } = useTranslation();
  return <section className="min-w-0 space-y-2" aria-label={t("emailPreview.title")}>
    <h3 className="text-sm font-semibold">{t("emailPreview.title")}</h3>
    {preview.result ? <>
      <p className="break-words text-sm"><strong>{t("companyDocuments.email.subject")}: </strong>{preview.result.subject}</p>
      <iframe sandbox="" referrerPolicy="no-referrer" srcDoc={preview.result.html} title={t("emailPreview.title")}
        className="h-[min(52dvh,560px)] min-h-[340px] w-full rounded-md border bg-[#f1f2ef]" />
    </> : <div className="rounded-md border bg-muted/30 p-3 text-sm">
      {preview.failed && ready ? <div role="alert">{t("emailPreview.failed")}{" "}
        <Button type="button" variant="ghost" onClick={preview.retry}>{t("companyDocuments.actions.retry")}</Button>
      </div> : <p role="status">{t(ready ? "emailPreview.loading" : "emailPreview.notReady")}</p>}
    </div>}
  </section>;
}
