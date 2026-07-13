import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertTriangle, CheckCircle2, Clock, Loader2, Play, RotateCcw, XCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface MigrationFileResult {
  filename: string;
  status: "applied" | "already_applied" | "failed" | "drifted";
  appliedAt?: string;
  error?: string;
  checksum: string;
}

interface MigrationListResponse {
  migrationsDir: string;
  files: MigrationFileResult[];
  drifted: string[];
  pendingCount: number;
  applyLocked: boolean;
}

interface AuditRow {
  id: string;
  runAt: string;
  runByEmail: string;
  filesApplied: string[];
  filesFailed: string[];
  filesDrifted: string[];
}

function StatusBadge({ status }: { status: MigrationFileResult["status"] }) {
  const { t } = useTranslation();
  if (status === "already_applied") {
    return (
      <Badge variant="secondary" className="gap-1 text-xs">
        <CheckCircle2 className="w-3 h-3 text-green-600" />
        {t("migrations.statusApplied")}
      </Badge>
    );
  }
  if (status === "applied") {
    return (
      <Badge variant="outline" className="gap-1 text-xs border-amber-400 text-amber-700 dark:text-amber-400">
        <Clock className="w-3 h-3" />
        {t("migrations.statusPending")}
      </Badge>
    );
  }
  if (status === "drifted") {
    return (
      <Badge variant="outline" className="gap-1 text-xs border-orange-400 text-orange-700 dark:text-orange-400">
        <AlertTriangle className="w-3 h-3" />
        {t("migrations.statusDrifted")}
      </Badge>
    );
  }
  if (status === "failed") {
    return (
      <Badge variant="destructive" className="gap-1 text-xs">
        <XCircle className="w-3 h-3" />
        {t("migrations.statusFailed")}
      </Badge>
    );
  }
  return null;
}

export default function MigrationsAdmin() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [applyResults, setApplyResults] = useState<MigrationFileResult[] | null>(null);

  const { data, isLoading, error, refetch } = useQuery<MigrationListResponse>({
    queryKey: ["/api/admin/migrations"],
    refetchOnWindowFocus: false,
  });

  const { data: auditLog = [] } = useQuery<AuditRow[]>({
    queryKey: ["/api/admin/migrations/audit"],
    refetchOnWindowFocus: false,
  });

  const applyMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/migrations/apply");
      return res.json() as Promise<{ files: MigrationFileResult[]; appliedCount: number; pendingCount: number }>;
    },
    onSuccess: (result) => {
      setApplyResults(result.files);
      setConfirmOpen(false);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/migrations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/migrations/audit"] });
      const failed = result.files.filter((f) => f.status === "failed");
      if (failed.length > 0) {
        toast({
          title: t("migrations.applyPartial"),
          description: t("migrations.applyPartialDesc", { applied: result.appliedCount, failed: failed.length }),
          variant: "destructive",
        });
      } else {
        toast({
          title: t("migrations.applySuccess"),
          description: t("migrations.applySuccessDesc", { count: result.appliedCount }),
        });
      }
    },
    onError: (err: Error) => {
      setConfirmOpen(false);
      toast({
        title: t("migrations.applyFailed"),
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const pendingFiles = data?.files.filter((f) => f.status === "applied") ?? [];
  const driftedFiles = data?.files.filter((f) => f.status === "drifted") ?? [];
  const isLocked = data?.applyLocked || applyMutation.isPending;

  function formatTs(ts: string) {
    return new Date(ts).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  return (
    <div className="space-y-6">
      {/* Main migration status card */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4 flex-wrap">
          <div>
            <CardTitle>{t("migrations.title")}</CardTitle>
            <CardDescription>{t("migrations.description")}</CardDescription>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isLoading}
              data-testid="button-migrations-refresh"
            >
              <RotateCcw className={`w-4 h-4 mr-1 ${isLoading ? "animate-spin" : ""}`} />
              {t("migrations.refresh")}
            </Button>
            <Button
              size="sm"
              onClick={() => setConfirmOpen(true)}
              disabled={isLocked || pendingFiles.length === 0 || isLoading}
              data-testid="button-apply-migrations"
            >
              {isLocked ? (
                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
              ) : (
                <Play className="w-4 h-4 mr-1" />
              )}
              {isLocked ? t("migrations.applying") : t("migrations.applyPending")}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground justify-center">
              <Loader2 className="w-4 h-4 animate-spin" />
              {t("common.loading")}
            </div>
          ) : error ? (
            <div className="flex items-center gap-2 py-4 text-sm text-destructive">
              <XCircle className="w-4 h-4" />
              {t("migrations.loadError")}
            </div>
          ) : !data || data.files.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">{t("migrations.noFiles")}</p>
          ) : (
            <div className="space-y-4">
              {/* Summary row */}
              <div className="flex gap-4 flex-wrap text-sm">
                <span className="flex items-center gap-1 text-green-700 dark:text-green-400">
                  <CheckCircle2 className="w-3 h-3" />
                  {data.files.filter((f) => f.status === "already_applied").length} {t("migrations.applied")}
                </span>
                {pendingFiles.length > 0 && (
                  <span className="flex items-center gap-1 text-amber-700 dark:text-amber-400">
                    <Clock className="w-3 h-3" />
                    {pendingFiles.length} {t("migrations.pending")}
                  </span>
                )}
                {driftedFiles.length > 0 && (
                  <span className="flex items-center gap-1 text-orange-700 dark:text-orange-400">
                    <AlertTriangle className="w-3 h-3" />
                    {driftedFiles.length} {t("migrations.drifted")}
                  </span>
                )}
              </div>

              {/* Drift warning */}
              {driftedFiles.length > 0 && (
                <div className="flex items-start gap-2 rounded-md border border-orange-200 bg-orange-50 dark:border-orange-800 dark:bg-orange-950/30 p-3 text-sm">
                  <AlertTriangle className="w-4 h-4 text-orange-600 dark:text-orange-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-orange-800 dark:text-orange-300">{t("migrations.driftWarningTitle")}</p>
                    <p className="text-orange-700 dark:text-orange-400 mt-0.5">{t("migrations.driftWarningDesc")}</p>
                    <ul className="mt-1 space-y-0.5">
                      {driftedFiles.map((f) => (
                        <li key={f.filename} className="font-mono text-xs">{f.filename}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}

              {/* File table */}
              <div className="rounded-md border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("migrations.colFile")}</TableHead>
                      <TableHead className="w-[130px]">{t("migrations.colStatus")}</TableHead>
                      <TableHead className="w-[160px] hidden sm:table-cell">{t("migrations.colAppliedAt")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.files.map((file) => (
                      <TableRow
                        key={file.filename}
                        className={file.status === "applied" ? "bg-amber-50/50 dark:bg-amber-950/20" : undefined}
                        data-testid={`row-migration-${file.filename}`}
                      >
                        <TableCell className="font-mono text-xs py-2">{file.filename}</TableCell>
                        <TableCell className="py-2">
                          <StatusBadge status={file.status} />
                          {file.error && (
                            <p className="text-xs text-destructive mt-1 break-all">{file.error}</p>
                          )}
                        </TableCell>
                        <TableCell className="py-2 text-xs text-muted-foreground hidden sm:table-cell">
                          {file.appliedAt ? formatTs(file.appliedAt) : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Apply results (shown after a run) */}
      {applyResults && (
        <Card>
          <CardHeader>
            <CardTitle>{t("migrations.runResultsTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("migrations.colFile")}</TableHead>
                    <TableHead className="w-[130px]">{t("migrations.colResult")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {applyResults.map((file) => (
                    <TableRow key={file.filename}>
                      <TableCell className="font-mono text-xs py-2">{file.filename}</TableCell>
                      <TableCell className="py-2">
                        <StatusBadge status={file.status} />
                        {file.error && (
                          <p className="text-xs text-destructive mt-1 break-all">{file.error}</p>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Audit log */}
      {auditLog.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{t("migrations.auditTitle")}</CardTitle>
            <CardDescription>{t("migrations.auditDesc")}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {auditLog.map((row) => (
                <div
                  key={row.id}
                  className="rounded-md border p-3 text-sm space-y-1"
                  data-testid={`row-audit-${row.id}`}
                >
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="font-medium">{row.runByEmail}</span>
                    <span className="text-xs text-muted-foreground">{formatTs(row.runAt)}</span>
                  </div>
                  {row.filesApplied.length > 0 && (
                    <div className="text-xs text-muted-foreground">
                      <span className="text-green-700 dark:text-green-400 font-medium">{t("migrations.applied")}: </span>
                      {row.filesApplied.join(", ")}
                    </div>
                  )}
                  {row.filesFailed.length > 0 && (
                    <div className="text-xs text-destructive">
                      <span className="font-medium">{t("migrations.statusFailed")}: </span>
                      {row.filesFailed.join(", ")}
                    </div>
                  )}
                  {row.filesApplied.length === 0 && row.filesFailed.length === 0 && (
                    <div className="text-xs text-muted-foreground">{t("migrations.nothingApplied")}</div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Confirm dialog */}
      <Dialog open={confirmOpen} onOpenChange={(open) => { if (!open) setConfirmOpen(false); }}>
        <DialogContent data-testid="dialog-apply-migrations">
          <DialogHeader>
            <DialogTitle>{t("migrations.confirmTitle")}</DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-3">
                <p>
                  {t("migrations.confirmSafetyNotice", { count: pendingFiles.length })}
                </p>
                {pendingFiles.length > 0 && (
                  <ul className="space-y-1 pl-4 list-disc text-sm">
                    {pendingFiles.map((f) => (
                      <li key={f.filename} className="font-mono text-xs">{f.filename}</li>
                    ))}
                  </ul>
                )}
                <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive dark:text-red-400">
                  {t("migrations.confirmWarning")}
                </div>
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmOpen(false)}
              disabled={applyMutation.isPending}
              data-testid="button-cancel-apply"
            >
              {t("common.cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={() => applyMutation.mutate()}
              disabled={applyMutation.isPending}
              data-testid="button-confirm-apply"
            >
              {applyMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                  {t("migrations.applying")}
                </>
              ) : (
                t("migrations.confirmApply")
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
