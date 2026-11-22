import { useEffect, useMemo, useRef, useState } from "react";
import { storedEmailDocument } from "./storedEmailDocument";

export function StoredEmailFrame({ html, title }: { html: string; title: string }) {
  const srcDoc = useMemo(() => storedEmailDocument(html), [html]);
  const frame = useRef<HTMLIFrameElement>(null);
  const observer = useRef<ResizeObserver | null>(null);
  const [height, setHeight] = useState(48);
  useEffect(() => () => observer.current?.disconnect(), []);
  function sizeToContent() {
    observer.current?.disconnect();
    const content = frame.current?.contentDocument?.getElementById("email-content");
    if (!content) return;
    const size = () => setHeight(Math.max(40, Math.min(8_000, Math.ceil(content.getBoundingClientRect().height) + 2)));
    size();
    if (typeof ResizeObserver !== "undefined") {
      observer.current = new ResizeObserver(size);
      observer.current.observe(content);
    }
  }
  return <iframe ref={frame} title={title} srcDoc={srcDoc} onLoad={sizeToContent}
    sandbox="allow-same-origin allow-popups" referrerPolicy="no-referrer"
    className="block w-full rounded-md border-0 bg-white" style={{ height }} />;
}
