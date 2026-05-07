import { useCallback, useRef, useState } from "react";

export interface UseFileDropZoneOptions {
  /** Called with the dropped File list. Return value is ignored. */
  onFiles: (files: File[]) => void;
  /** Whether dropping is allowed. When false, drag UI never engages. */
  enabled?: boolean;
  /** File extensions to accept (without dots). Defaults to common image formats. */
  acceptedExtensions?: string[];
}

export interface UseFileDropZoneResult {
  isDraggingOver: boolean;
  bind: {
    onDragEnter: (e: React.DragEvent<HTMLElement>) => void;
    onDragLeave: (e: React.DragEvent<HTMLElement>) => void;
    onDragOver: (e: React.DragEvent<HTMLElement>) => void;
    onDrop: (e: React.DragEvent<HTMLElement>) => void;
  };
}

const DEFAULT_EXTENSIONS = ["jpg", "jpeg", "png", "webp", "heic", "heif"];

function looksLikeImage(file: File, exts: string[]): boolean {
  if (file.type && file.type.startsWith("image/")) return true;
  const name = file.name.toLowerCase();
  return exts.some((ext) => name.endsWith(`.${ext}`));
}

/**
 * Native HTML5 drag-and-drop file zone hook.
 *
 * Uses an enter/leave counter to prevent flicker when dragging over child
 * elements, and signals drop intent via dropEffect="copy". Filters dropped
 * files to image-like content (by MIME or filename extension).
 */
export function useFileDropZone({
  onFiles,
  enabled = true,
  acceptedExtensions = DEFAULT_EXTENSIONS,
}: UseFileDropZoneOptions): UseFileDropZoneResult {
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  // Counter is required because child elements fire enter/leave events as the
  // drag moves between them — we only want to clear isDraggingOver when the
  // drag truly leaves the entire zone.
  const dragCounter = useRef(0);

  const onDragEnter = useCallback(
    (e: React.DragEvent<HTMLElement>) => {
      if (!enabled) return;
      e.preventDefault();
      e.stopPropagation();
      dragCounter.current += 1;
      const hasFiles = Array.from(e.dataTransfer?.types || []).includes("Files");
      if (hasFiles) setIsDraggingOver(true);
    },
    [enabled],
  );

  const onDragLeave = useCallback(
    (e: React.DragEvent<HTMLElement>) => {
      if (!enabled) return;
      e.preventDefault();
      e.stopPropagation();
      dragCounter.current -= 1;
      if (dragCounter.current <= 0) {
        dragCounter.current = 0;
        setIsDraggingOver(false);
      }
    },
    [enabled],
  );

  const onDragOver = useCallback(
    (e: React.DragEvent<HTMLElement>) => {
      if (!enabled) return;
      // preventDefault is required so the browser allows a drop here.
      e.preventDefault();
      e.stopPropagation();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
    },
    [enabled],
  );

  const onDrop = useCallback(
    (e: React.DragEvent<HTMLElement>) => {
      if (!enabled) return;
      e.preventDefault();
      e.stopPropagation();
      dragCounter.current = 0;
      setIsDraggingOver(false);
      const incoming: File[] = e.dataTransfer?.files
        ? Array.from(e.dataTransfer.files)
        : [];
      const filtered = incoming.filter((f) => looksLikeImage(f, acceptedExtensions));
      if (filtered.length > 0) onFiles(filtered);
    },
    [enabled, onFiles, acceptedExtensions],
  );

  return {
    isDraggingOver,
    bind: { onDragEnter, onDragLeave, onDragOver, onDrop },
  };
}
