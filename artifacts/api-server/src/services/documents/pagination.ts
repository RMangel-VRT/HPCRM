/**
 * Trusted, renderer-owned DOM measurement. Page scripts remain disabled.
 * Measure actual embedded-font table geometry at the print width, then emit
 * explicit page segments. Never infer row height from character counts.
 */
export const paginatePricing = String.raw`(() => {
  const source = document.querySelector('table[data-pricing]');
  const totals = document.querySelector('[data-totals]');
  if (!source || !totals) return;
  const pageHeight = 1056, bottom = 76, laterTop = 96;
  const capacity = pageHeight - laterTop - bottom;
  const firstCapacity = pageHeight - bottom - source.getBoundingClientRect().top;
  const remit = totals.querySelector('.remit');
  if (remit && remit.scrollWidth > remit.clientWidth + 1) throw new Error('DOCUMENT_REMIT_TOO_WIDE');
  const groups = Array.from(source.tBodies);
  const items = groups.flatMap((body, group) =>
    Array.from(body.querySelectorAll('tr[data-line]')).map(row => ({ row, group })));
  const probe = document.createElement('div');
  probe.style.cssText = 'position:absolute;left:64px;top:0;width:' + source.getBoundingClientRect().width + 'px;visibility:hidden;display:flow-root';
  document.body.append(probe);
  function tableFor(rows) {
    const table = source.cloneNode(false);
    table.removeAttribute('data-pricing');
    table.append(source.tHead.cloneNode(true));
    let previous = -1, body;
    for (const item of rows) {
      const first = previous !== item.group;
      if (first) {
        body = document.createElement('tbody');
        table.append(body);
        const context = groups[item.group].querySelector('tr.section');
        if (context) {
          const heading = context.cloneNode(true);
          // Context repeats; commercial subtotals do not. Determine this from
          // the original row identity so measurement probes are deterministic.
          if (item.row !== groups[item.group].querySelector('tr[data-line]')) {
            heading.cells[0].textContent += ' (continued)';
            heading.cells[heading.cells.length - 1].textContent = '';
          }
          body.append(heading);
        }
      }
      const row = item.row.cloneNode(true);
      if (first && row.hasAttribute('data-category')) row.cells[0].textContent = row.getAttribute('data-category');
      body.append(row);
      previous = item.group;
    }
    return table;
  }
  function height(rows, withTotals) {
    probe.replaceChildren(tableFor(rows));
    if (withTotals) probe.append(totals.cloneNode(true));
    return probe.getBoundingClientRect().height;
  }
  const segments = [];
  let rows = [], available = firstCapacity, continuation = false;
  const tailCount = Math.min(3, items.length);
  const prefix = items.slice(0, items.length - tailCount);
  const tail = items.slice(items.length - tailCount);
  function nextPage() {
    if (rows.length) segments.push({ rows, continuation });
    rows = [];
    available = capacity;
    continuation = true;
  }
  for (const item of prefix) {
    if (height([...rows, item], false) > available) nextPage();
    if (height([item], false) > available) throw new Error('DOCUMENT_ROW_TOO_LARGE');
    rows.push(item);
  }
  if (height([...rows, ...tail], true) > available) nextPage();
  if (height([...rows, ...tail], true) > available) throw new Error('DOCUMENT_TOTALS_GROUP_TOO_LARGE');
  rows.push(...tail);
  segments.push({ rows, continuation, totals: true });
  probe.remove();
  const fragment = document.createDocumentFragment();
  for (const segment of segments) {
    const wrapper = document.createElement('div');
    wrapper.className = 'table-page' + (segment.continuation ? ' continuation' : '');
    wrapper.append(tableFor(segment.rows));
    if (segment.totals) wrapper.append(totals);
    fragment.append(wrapper);
  }
  source.replaceWith(fragment);
})()`;
