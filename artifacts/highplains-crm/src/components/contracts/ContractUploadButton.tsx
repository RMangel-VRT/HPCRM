import { forwardRef, useRef, useState } from "react";
import type { InputHTMLAttributes, ReactNode } from "react";
import { Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { uploadContractFile, validateContractFile } from "@/lib/contractUpload";
import type { ContractUploadOptions } from "@/lib/contractUpload";
import { errorText } from "./contractFormat";

export const TERM_UPLOAD_OPTIONS: ContractUploadOptions = {
  allowedTypes: [
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "image/png",
    "image/jpeg",
  ],
};

/** Shared picker UI; the legacy page retains its existing replace confirmation and upload feedback. */
export const ContractFileInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function ContractFileInput(props, ref) {
    return <input type="file" className="hidden" {...props} ref={ref} />;
  },
);

/** Reusable "pick a file and send it through signed-URL upload" button. */
export function ContractUploadButton(props: {
  label: ReactNode;
  uploadUrlPath: string;
  registerPath: string;
  extraBody?: Record<string, unknown>;
  options?: ContractUploadOptions;
  accept?: string;
  disabled?: boolean;
  testId: string;
  onUploaded: (result: unknown) => void | Promise<void>;
  onError: (message: string) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function pick() {
    const file = input.current?.files?.[0];
    if (!file) return;
    const problem = validateContractFile(file, props.options);
    if (problem) {
      props.onError(problem === "type" ? "That file type is not accepted." : "File is too large (20 MB maximum).");
      if (input.current) input.current.value = "";
      return;
    }
    setBusy(true);
    try {
      const result = await uploadContractFile({
        file, uploadUrlPath: props.uploadUrlPath, registerPath: props.registerPath,
        extraBody: props.extraBody, options: { ...props.options, putContentType: file.type || "application/octet-stream" },
      });
      await props.onUploaded(result);
    } catch (e) {
      props.onError(errorText(e) || "Upload failed");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <>
      <ContractFileInput ref={input} accept={props.accept} onChange={pick} data-testid={`input-${props.testId}`} />
      <Button type="button" size="sm" variant="outline" disabled={props.disabled || busy}
        onClick={() => input.current?.click()} data-testid={`button-${props.testId}`}>
        {busy ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Upload className="w-3 h-3 mr-1" />}
        {props.label}
      </Button>
    </>
  );
}
