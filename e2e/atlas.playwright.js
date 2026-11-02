import { mkdirSync } from 'node:fs';

export async function runAtlasChecks(page) {
  const check = async (condition, message) => { if (!condition) throw new Error(`Flow Atlas browser check failed: ${message}`); };
  const browserErrors = [];
  page.on('pageerror', (error) => browserErrors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') browserErrors.push(message.text()); });
  await page.goto('http://127.0.0.1:4317/');
  await page.getByTestId('graph-canvas').waitFor();
  await page.locator('.react-flow__edge').first().waitFor();
  await check(await page.locator('[data-node-id]').count() === 5, 'default E-commerce preset renders');
  await page.getByRole('button', { name: 'Event-driven' }).click();
  await check(await page.locator('[data-node-id]').count() === 5, 'Event-driven preset loads');
  await page.getByRole('button', { name: 'E-commerce' }).click();
  mkdirSync('docs/screenshots', { recursive: true });
  await page.screenshot({ path: 'docs/screenshots/manual-graph.png', fullPage: true });
  const viewport = page.locator('.react-flow__viewport');
  const initialViewport = await viewport.getAttribute('style');
  await page.locator('[data-action="zoom-in"]').click();
  await page.waitForFunction((previous) => document.querySelector('.react-flow__viewport')?.getAttribute('style') !== previous, initialViewport);
  await check(await viewport.getAttribute('style') !== initialViewport, 'zoom control changes the viewport');
  await page.locator('[data-action="fit"]').click();
  const nodeWrapper = page.locator('.react-flow__node').filter({ has: page.locator('[data-node-id="orders"]') }).first();
  const originalPosition = await nodeWrapper.getAttribute('style');
  await nodeWrapper.dragTo(nodeWrapper, { targetPosition: { x: 32, y: 24 } });
  await check(await nodeWrapper.getAttribute('style') !== originalPosition, 'node drag changes its canvas position');
  const canvas = page.locator('.react-flow__pane');
  const beforePan = await viewport.getAttribute('style');
  await canvas.dragTo(canvas, { targetPosition: { x: 140, y: 120 } });
  await check(await viewport.getAttribute('style') !== beforePan, 'background drag pans the graph');
  page.once('dialog', (dialog) => dialog.accept('service'));
  await page.getByTestId('add-node').click();
  await check(await page.locator('[data-node-id]').count() === 6, 'manual node add works');
  await page.getByTestId('connect-mode').click();
  await page.getByTestId('connect-source').selectOption('web');
  const initialEdgeCount = await page.locator('.react-flow__edge').count();
  await page.getByTestId('connect-target').selectOption('web');
  await page.getByTestId('connect-protocol').selectOption('https');
  await page.getByRole('button', { name: 'Create directed edge' }).click();
  await check((await page.locator('#toast').textContent())?.includes('different nodes'), 'invalid same-node connect gives safe feedback');
  await check(await page.locator('.react-flow__edge').count() === initialEdgeCount, 'invalid same-node connect leaves edges unchanged');
  await check(browserErrors.length === 0, `invalid connect causes no page error: ${browserErrors.join(' | ')}`);
  await page.getByTestId('connect-target').selectOption('orders');
  await page.getByRole('button', { name: 'Create directed edge' }).click();
  await page.locator('[data-edge-id]').nth(4).waitFor();
  await check(await page.locator('[data-edge-id]').count() === 5, 'directed connection is added');
  await page.locator('[data-node-id="orders"]').click();
  const selectedId = await page.locator('[data-node-id="orders"]').getAttribute('data-node-id');
  const labelInput = page.getByTestId('edit-node-label');
  const focusedInput = await labelInput.elementHandle();
  if (!focusedInput) throw new Error('Inspector label input did not render');
  const initialFrame = await page.getByTestId('simulation-tick').textContent();
  const initialValue = await labelInput.inputValue();
  await labelInput.focus();
  await page.waitForFunction((previous) => document.querySelector('[data-testid="simulation-tick"]')?.textContent !== previous, initialFrame);
  await check(await focusedInput.evaluate((input) => input.isConnected), 'live simulation frame keeps the inspector input connected');
  await check(await focusedInput.evaluate((input) => document.activeElement === input), 'live simulation frame preserves inspector input focus');
  await check(await focusedInput.evaluate((input, expected) => input instanceof HTMLInputElement && input.value === expected, initialValue), 'live simulation frame preserves input value');
  await focusedInput.fill('Order API');
  await focusedInput.press('Tab');
  await check((await page.locator(`[data-node-id="${selectedId}"] .node-title`).textContent()) === 'Order API', 'node label edit succeeds after a simulation frame');
  await page.getByTestId('fail-node').click();
  await check((await page.getByTestId('metric-health').textContent()) !== 'Healthy', 'failure affects live health');
  await page.getByTestId('recover-node').click();
  await check((await page.getByTestId('metric-health').textContent()) === 'Healthy', 'recovery restores healthy metrics');
  await page.getByTestId('intensity').fill('8');
  await check((await page.locator('#intensity-label').textContent()).includes('8'), 'intensity control updates');
  await page.waitForFunction(() => [...document.querySelectorAll('.react-flow__edge.animated .react-flow__edge-path')]
    .some((path) => getComputedStyle(path).animationName !== 'none'));
  await check(await page.locator('.react-flow__edge.animated').count() > 0, 'active traffic uses an animated graph edge');
  await page.getByTestId('pause-simulation').click();
  await check((await page.getByTestId('pause-simulation').textContent()).includes('Resume'), 'simulation pauses');
  await page.waitForFunction(() => document.querySelectorAll('.react-flow__edge.animated').length === 0);
  await check(await page.locator('.react-flow__edge.animated').count() === 0, 'pause stops traffic animation');
  await page.getByTestId('retry-toggle').click();
  await check((await page.getByTestId('retry-toggle').textContent()).includes('Retries off'), 'retry control disables retries');
  await page.getByTestId('retry-toggle').click();
  await page.getByTestId('open-discovery').click();
  await page.getByTestId('run-discovery').click();
  await page.getByText('Architecture discovered').waitFor({ timeout: 10000 });
  await check(await page.locator('[data-node-id]').count() > 0, 'allowlisted discovery replaces graph');
  const discoveredCards = await page.locator('.node-card').evaluateAll((cards) => cards.map((card) => ({
    title: card.querySelector('.node-title')?.textContent?.trim(), id: card.getAttribute('data-node-id'),
  })));
  await check(discoveredCards.some(({ title, id }) => (title === 'orders' || title === 'catalog') && title !== id), 'discovered cards show readable service names instead of hashed IDs');
  const repoChipForReplacement = page.locator('[data-action="filter"][data-category="repositories"]').first();
  if (await repoChipForReplacement.count()) {
    await repoChipForReplacement.click();
    await page.getByRole('button', { name: 'E-commerce' }).click();
    await check(await page.locator('[data-node-id]').count() === 5, 'loading a preset clears stale discovery repository filters');
    await page.getByTestId('open-discovery').click();
    await page.getByTestId('run-discovery').click();
    await page.getByText('Architecture discovered').waitFor({ timeout: 10000 });
  }
  const httpFilter = page.locator('[data-action="filter"][data-category="protocols"][data-value="HTTP"]');
  const edgeCount = await page.locator('[data-edge-id]').count();
  if (await httpFilter.count()) {
    await httpFilter.click();
    await check(await page.locator('[data-edge-id]').count() < edgeCount, 'protocol filter narrows visible edges');
    await httpFilter.click();
  }
  const confidenceFilter = page.locator('[data-action="filter"][data-category="confidences"][data-value="MEDIUM"]');
  if (await confidenceFilter.count()) {
    const beforeConfidence = await page.locator('[data-edge-id]').count();
    await confidenceFilter.click();
    await check(await page.locator('[data-edge-id]').count() < beforeConfidence, 'confidence filter narrows visible edges');
    await confidenceFilter.click();
  }
  const repositoryFilter = page.locator('[data-action="filter"][data-category="repositories"]').first();
  if (await repositoryFilter.count()) {
    const beforeRepository = await page.locator('[data-node-id]').count();
    await repositoryFilter.click();
    await check(await page.locator('[data-node-id]').count() < beforeRepository, 'repository filter narrows visible nodes');
    await repositoryFilter.click();
  }
  await page.locator('.edge-protocol').first().click();
  await check(await page.locator('[data-testid="evidence-item"]').count() > 0, 'discovered edge exposes evidence');
  await check((await page.locator('[data-testid="evidence-item"]').first().textContent()).match(/:\d+/), 'source evidence includes its file and line');
  await check(await page.getByTestId('inspector-kind').textContent() === 'Dependency inspector', 'evidence screenshot shows a selected discovered edge');
  await page.screenshot({ path: 'docs/screenshots/discovered-graph.png', fullPage: true });
  const download = page.waitForEvent('download');
  await page.getByTestId('export-graph').click();
  await check((await download).suggestedFilename() === 'flow-atlas-graph.json', 'JSON export downloads');
  await page.getByRole('button', { name: 'Import', exact: true }).click();
  await page.getByTestId('import-json').fill('{"invalid":true}');
  await page.getByRole('button', { name: 'Validate and import' }).click();
  await check(await page.locator('[data-testid="import-modal"]').count() === 1, 'invalid import preserves map and stays open');
  await page.getByRole('button', { name: 'Cancel' }).click();
  await check((await page.getByTestId('pause-simulation').textContent()).includes('Resume'), 'simulation remains paused before graph reconciliation');
  await page.getByRole('button', { name: 'Import', exact: true }).click();
  await page.getByTestId('import-json').fill('{"version":1,"nodes":[],"edges":[]}');
  await page.getByRole('button', { name: 'Validate and import' }).click();
  await check(await page.locator('[data-node-id]').count() === 0, 'valid empty graph import replaces the canvas');
  await check(Number.parseInt(await page.getByTestId('metric-rps').innerText(), 10) === 0, 'paused empty-graph import clears stale throughput');
  await check(await page.locator('.node-metric').count() === 0, 'paused empty-graph import has no stale node metrics');
  await check((await page.getByTestId('pause-simulation').textContent()).includes('Resume'), 'empty-graph import preserves paused state');
  await page.getByRole('button', { name: 'Event-driven' }).click();
  await check(Number.parseInt(await page.getByTestId('metric-rps').innerText(), 10) > 0, 'paused preset load reconciles throughput for the new graph');
  await page.getByRole('button', { name: 'Import', exact: true }).click();
  await page.getByTestId('import-json').fill('{"version":1,"nodes":[{"id":"imported","type":"service","position":{"x":0,"y":0},"data":{"label":"Imported"}}],"edges":[]}');
  await page.getByRole('button', { name: 'Validate and import' }).click();
  await check(await page.locator('[data-node-id="imported"]').count() === 1, 'paused valid import loads its node');
  await check(Number.parseInt(await page.getByTestId('metric-rps').innerText(), 10) > 0, 'paused valid import reconciles metrics to its graph');
  await check(browserErrors.length === 0, `page and console errors: ${browserErrors.join(' | ')}`);
}
