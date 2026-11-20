import { useEffect, useState } from "react";
import { previewEstimateEmail, type EstimateEmailPreview } from "@workspace/api-client-react";
import { companyHeaders } from "@/lib/hardscapeCatalog";

export function useEstimateEmailPreview({
  companyId, estimateId, versionId, updatedAt, enabled, subject, note,
}: {
  companyId: string; estimateId: string; versionId: string; updatedAt: string;
  enabled: boolean; subject: string | undefined; note: string;
}) {
  const [retry, setRetry] = useState(0);
  const key = JSON.stringify([companyId, estimateId, versionId, updatedAt, enabled, subject, note, retry]);
  const [state, setState] = useState<{ key: string; result?: EstimateEmailPreview; failed?: true }>();
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      void previewEstimateEmail(encodeURIComponent(estimateId), encodeURIComponent(versionId),
        { subject, note }, { headers: companyHeaders(companyId), signal: controller.signal })
        .then(result => {
          if (!controller.signal.aborted) setState({ key, result });
        }, () => {
          if (!controller.signal.aborted) setState({ key, failed: true });
        });
    }, 400);
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [companyId, enabled, estimateId, key, note, subject, versionId]);
  // Do not show (or enable send from) a previous preview during the debounce.
  const current = enabled && state?.key === key ? state : undefined;
  return { result: current?.result, failed: current?.failed, retry: () => setRetry(value => value + 1) };
}
