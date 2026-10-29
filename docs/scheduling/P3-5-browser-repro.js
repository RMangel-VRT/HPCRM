/*
 * Reproducible P3-5 presentation check for the managed Playwright notebook.
 * This workspace has no locally resolvable Playwright npm package; the runner
 * supplies newBrowserContext and REPLIT_DEV_DOMAIN. Paste/evaluate this file
 * there, then call: await runP35PresentationRepro()
 * Every /api/** route is intercepted locally. The script never calls a live API.
 */
async function runP35PresentationRepro() {
  const ctx = await newBrowserContext({
    baseURL: `https://${REPLIT_DEV_DOMAIN}`,
    viewport: { width: 1440, height: 900 },
    timezoneId: 'UTC',
  });
  const page = await ctx.newPage();
  const fixture = {
    crews: 5, visits: [], defer: true, pending: [], requests: [],
    queue: [{ id: 'q1', title: 'P3-5 queue task', typeKey: 'task', typeName: 'Task',
      priority: 'normal', scheduleBy: null, serviceType: 'mowing',
      customer: { id: 'cu1', name: 'Fixture Customer', city: 'Denver' },
      followUpDate: null, createdAt: '2026-10-01' }],
  };
  const fail = (condition, message) => { if (!condition) throw new Error(message); };
  const waitForWrite = async () => {
    for (let i = 0; i < 80 && fixture.pending.length === 0; i++)
      await new Promise(resolve => setTimeout(resolve, 25));
    fail(fixture.pending.length === 1, 'Expected exactly one held local write');
    return fixture.pending[0];
  };
  const settle = async (status, json) => {
    const held = await waitForWrite();
    await held.route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(json) });
    fixture.pending.shift();
  };

  await page.route('**/api/**', async route => {
    const req = route.request(), u = new URL(req.url()), p = u.pathname, method = req.method();
    fixture.requests.push({ method, url: p + u.search, body: req.postData() });
    // Important: intercept all writes before path-specific GET matching.
    if (method !== 'GET' && fixture.defer) {
      fixture.pending.push({ route, method, url: p + u.search, body: req.postData() });
      return;
    }
    let json = {};
    if (p === '/api/auth/me') json = { id: 'u1', username: 'p35-admin', activeCompanyId: 'c1',
      activeRole: 'admin', isSuperAdminBool: false, activeCompany: { id: 'c1', name: 'Fixture Company' } };
    else if (p === '/api/customers') json = { customers: [], total: 0 };
    else if (p === '/api/scheduling/queue') json = { needsScheduling: fixture.queue, slipped: [] };
    else if (p === '/api/crews/board') json = Array.from({ length: fixture.crews }, (_, i) => ({
      id: `k${i+1}`, name: `Crew ${i+1}`, color: ['#ef4444','#3b82f6','#22c55e','#a855f7','#f59e0b'][i%5],
      defaultHoursPerDay: 8, supervisorName: `Lead ${i+1}`,
    }));
    else if (p === '/api/visits/summary') json = [];
    else if (p === '/api/visits') json = fixture.visits;
    else if (p === '/api/flags/unread-count') json = { count: 0 };
    else if (p === '/api/unsorted-emails' || p === '/api/notifications' || p === '/api/pending-invoices') json = [];
    else if (method !== 'GET') json = { ok: true };
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(json) });
  });

  await page.goto('/dashboard/scheduling?week=2026-10-26', { waitUntil: 'domcontentloaded' });
  await page.getByTestId('board-grid').waitFor({ state: 'visible', timeout: 10000 });
  const empty = await page.evaluate(() => {
    const b = document.querySelector('[data-testid="board-scroll"]');
    const g = document.querySelector('[data-testid="board-grid"]');
    const h = document.querySelector('[data-testid="header-day-2026-10-29"]');
    const s = getComputedStyle(g);
    const lane = Number.parseFloat(g.style.getPropertyValue('--lane-h'));
    const raw = (b.clientHeight - h.getBoundingClientRect().height - 5*parseFloat(s.rowGap) - parseFloat(s.paddingBottom))/5;
    return { pane: b.clientHeight, header: h.getBoundingClientRect().height, gap: parseFloat(s.rowGap),
      paddingBottom: parseFloat(s.paddingBottom), lane, raw, hints: document.querySelectorAll('[data-testid^="empty-cell-"]').length };
  });
  fail(Math.abs(empty.lane - Math.min(220, Math.max(120, empty.raw))) < 0.2, 'Five-crew lane formula mismatch');
  fail(empty.hints === 0, 'Idle board unexpectedly has drag hints');

  // Real pointer drag with forced pane resize (viewport resize can emit pointercancel).
  const src = await page.getByTestId('card-queue-q1').boundingBox();
  const dst = await page.getByTestId('cell-k3-2026-10-29').boundingBox();
  await page.mouse.move(src.x + 38, src.y + 30); await page.mouse.down();
  await page.mouse.move(dst.x + dst.width/2, dst.y + dst.height/2, { steps: 12 });
  const beforeFreeze = await page.locator('[data-testid="board-grid"]').evaluate(g => g.style.getPropertyValue('--lane-h'));
  await page.getByTestId('board-scroll').evaluate(el => { el.style.flex = 'none'; el.style.height = '600px'; });
  const during = await page.evaluate(() => ({
    lane: document.querySelector('[data-testid="board-grid"]').style.getPropertyValue('--lane-h'),
    hints: document.querySelectorAll('[data-testid^="empty-cell-"]').length,
    described: document.querySelectorAll('.sb-cell[aria-describedby]').length,
  }));
  fail(during.lane === beforeFreeze && during.hints === 30 && during.described === 30, 'Drag geometry/hints changed during pane resize');
  await page.mouse.up();
  const pending = await waitForWrite();
  fail(pending.url === '/api/visits' && pending.body === '{"ticketId":"q1","crewId":"k3","visitDate":"2026-10-29"}', 'Unexpected pointer-drop payload');
  fail(await page.locator('.sb-pending').count() === 1, 'Missing pending drop copy');
  await settle(500, { error: 'fixture failure', message: 'Fixture write failed' });
  await page.locator('.sb-pending').waitFor({ state: 'detached', timeout: 5000 });
  const failedHeight = await page.locator('[data-testid="board-grid"]').evaluate(g => g.style.getPropertyValue('--lane-h'));
  fail(failedHeight === '120px', 'Failed settle did not recompute to min lane height');
  await page.getByTestId('board-scroll').evaluate(el => { el.style.removeProperty('flex'); el.style.removeProperty('height'); });

  // Queue keyboard placement: Space -> ArrowRight -> ArrowRight -> Space.
  await page.getByTestId('card-queue-q1').focus();
  await page.keyboard.press('Space'); await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight'); await page.keyboard.press('Space');
  const keyboard = await waitForWrite();
  fail(keyboard.url === '/api/visits' && keyboard.body === '{"ticketId":"q1","crewId":"k2","visitDate":"2026-10-27"}', 'Unexpected keyboard placement payload');
  await settle(200, { ok: true, ticketSync: { statusChanged: false } });
  await page.locator('.sb-pending').waitFor({ state: 'detached', timeout: 5000 });

  // Eight-stop fixture, seven-day row geometry, then mobile viewport.
  fixture.visits = Array.from({ length: 8 }, (_, i) => ({
    id: `v${i+1}`, crewId: 'k1', visitDate: '2026-10-29', sourceType: 'ticket', ticketId: `t${i+1}`,
    customerId: 'cu', title: null, routeOrder: i+1, startTime: null, estimatedHours: 1,
    status: 'planned', notes: null, serviceKey: 'mowing',
    ticket: { id: `t${i+1}`, title: `Fixture stop ${i+1}`, typeKey: 'task', typeName: 'Task',
      statusKey: 'scheduled', statusName: 'Scheduled', priority: 'normal', scheduleBy: null },
    customer: { id: 'cu', name: 'Fixture Property' }, crew: { id: 'k1', name: 'Crew 1', color: '#ef4444' },
  }));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByTestId('card-visit-v8').waitFor({ state: 'visible', timeout: 10000 });
  await page.getByTestId('toggle-sunday').check();
  const tall = await page.evaluate(() => {
    const g = document.querySelector('[data-testid="board-grid"]');
    const h = id => document.querySelector(`[data-testid="${id}"]`).getBoundingClientRect().height;
    return { k1: [...g.querySelectorAll('[data-testid^="cell-k1-"]')].map(x => x.getBoundingClientRect().height),
      k2: [...g.querySelectorAll('[data-testid^="cell-k2-"]')].map(x => x.getBoundingClientRect().height),
      lane: parseFloat(g.style.getPropertyValue('--lane-h')) };
  });
  fail(tall.k1.length === 7 && tall.k1.every(h => h === tall.k1[0]) && tall.k1[0] > tall.lane,
    'Seven K1 day cells did not share the expanded eight-stop row height');
  fail(tall.k2.every(h => Math.abs(h - tall.lane) < 0.2), 'Other crew cells left min lane height');
  await page.setViewportSize({ width: 390, height: 844 });
  const mobile = await page.evaluate(() => {
    const b = document.querySelector('[data-testid="board-scroll"]');
    return { height: b.getBoundingClientRect().height, scrollHeight: b.scrollHeight,
      clientHeight: b.clientHeight, documentWidth: document.documentElement.scrollWidth };
  });
  fail(Math.abs(mobile.height - 590.8) < 0.2 && mobile.documentWidth === 390, 'Mobile 70vh/no-horizontal-overflow check failed');
  return { empty, during, failedHeight, keyboardWrite: keyboard.body, tall, mobile, requests: fixture.requests };
}
