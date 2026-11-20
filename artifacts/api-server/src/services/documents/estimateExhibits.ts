import { escapeHtml as e, quantity, tableHead } from "./layout";
import { safeExhibitImage } from "./exhibitImage";

export interface EstimateDocumentExhibits {
  plants: { quantity: string; name: string; botanicalName: string | null; size: string | null; dataUri: string | null }[];
  photos: { caption: string | null; dataUri: string }[];
}

export function estimatePlantsFragment(rows: EstimateDocumentExhibits["plants"]) {
  if (!rows.length) return "";
  const withThumbnails = rows.some(row => safeExhibitImage(row.dataUri));
  return `<section class="estimate-plants"><h2>Plants</h2><table>${tableHead(withThumbnails ? ["", "Qty", "Plant", "Size"] : ["Qty", "Plant", "Size"],
    withThumbnails ? [16, 9, 56, 19] : [12, 66, 22])}<tbody>${rows.map(row => {
      const image = safeExhibitImage(row.dataUri);
      return `<tr>${withThumbnails ? `<td>${image ? `<img alt="" src="${image}">` : ""}</td>` : ""}<td>${quantity(row.quantity)}</td><td><strong>${e(row.name)}</strong>${row.botanicalName ? `<div class="secondary botanical">${e(row.botanicalName)}</div>` : ""}</td><td>${e(row.size)}</td></tr>`;
    }).join("")}</tbody></table></section>`;
}

export function estimatePhotosFragment(photos: EstimateDocumentExhibits["photos"]) {
  return Array.from({ length: Math.ceil(photos.length / 2) }, (_, page) =>
    `<section class="content estimate-photo-page"><h2>${page ? "Photos (continued)" : "Photos"}</h2>${photos.slice(page * 2, page * 2 + 2).map(photo =>
      `<figure class="keep">${photo.caption ? `<figcaption>${e(photo.caption.replace(/\s+/g, " "))}</figcaption>` : ""}<img alt="" src="${safeExhibitImage(photo.dataUri) ?? ""}"></figure>`).join("")}</section>`).join("");
}

export const estimateExhibitCss = `<style>
  .estimate-plants{margin-top:28px}.estimate-plants h2{break-after:avoid}
  .estimate-plants tr{break-inside:avoid}.estimate-plants th{text-align:left}
  .estimate-plants td{vertical-align:middle;padding-top:5px;padding-bottom:5px}
  .estimate-plants img{display:block;width:84px;height:62px;object-fit:cover;border-radius:3px}
  .estimate-plants .botanical{font-style:italic}
  .estimate-photo-page{break-before:page}
  .estimate-photo-page figure{height:375px;margin:0 0 18px;display:flex;flex-direction:column}
  .estimate-photo-page figcaption{margin-bottom:8px;overflow-wrap:anywhere;flex:none}
  .estimate-photo-page img{display:block;width:100%;object-fit:contain;min-height:0;flex:1;height:0}
</style>`;
