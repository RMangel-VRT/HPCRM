export const colors = {
  band: "#37443D", lime: "#8CC640", limeText: "#4d7a1c", paleLime: "#EEF6E3",
  ink: "#1f2a24", muted: "#5c665f", line: "#e4e6e2", page: "#f1f2ef",
  footer: "#27312C", copy: "#3d4842", soft: "#f7f8f5", white: "#ffffff",
};
export const font = "font-family:'Helvetica Neue',Helvetica,Arial,sans-serif";
export const formatDetectionMeta = '<meta name="format-detection" content="telephone=no,date=no,address=no,email=no">';
export const escape = (value: string) => value.replace(/[&<>"']/g, char => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[char]!));
export const multiline = (value: string) => escape(value).replace(/\r\n?|\n/g, "<br>");
export const table = (rows: string, style = "", bg?: string, width = "100%") =>
  `<table role="presentation" width="${width}" cellpadding="0" cellspacing="0"${bg ? ` bgcolor="${bg}"` : ""}${style ? ` style="${style}"` : ""}>${rows}</table>`;
export const spacer = (height: number) =>
  `<tr><td height="${height}" style="height:${height}px;line-height:${height}px;font-size:0">&nbsp;</td></tr>`;
export const label = (text: string, color = colors.muted, render = escape) =>
  `<div style="${font};font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:${color};margin:0 0 6px">${render(text)}</div>`;
export const paragraph = (text: string, size: number, color: string, render = multiline) => text
  ? `<p style="margin:0 0 14px;${font};font-size:${size}px;line-height:1.6;color:${color}">${render(text)}</p>` : "";
export function httpUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return (url.protocol === "https:" || url.protocol === "http:") && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}
