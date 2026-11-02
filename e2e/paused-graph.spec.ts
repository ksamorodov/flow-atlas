import { expect, test } from '@playwright/test';

test('paused import and preset updates derive metrics from the replacement graph', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('graph-canvas').waitFor();
  await page.getByTestId('pause-simulation').click();
  await expect(page.getByTestId('pause-simulation')).toContainText('Resume');

  await page.getByRole('button', { name: 'Import', exact: true }).click();
  await page.getByTestId('import-json').fill('{"version":1,"nodes":[],"edges":[]}');
  await page.getByRole('button', { name: 'Validate and import' }).click();
  await expect(page.locator('[data-node-id]')).toHaveCount(0);
  await expect(page.getByTestId('metric-rps')).toContainText('0 req/s');
  await expect(page.locator('.node-metric')).toHaveCount(0);
  await expect(page.getByTestId('pause-simulation')).toContainText('Resume');

  await page.getByRole('button', { name: 'Event-driven' }).click();
  await expect(page.locator('[data-node-id]')).toHaveCount(5);
  await expect.poll(async () => Number.parseInt(await page.getByTestId('metric-rps').innerText(), 10)).toBeGreaterThan(0);
  await expect(page.getByTestId('pause-simulation')).toContainText('Resume');

  await page.getByRole('button', { name: 'Import', exact: true }).click();
  await page.getByTestId('import-json').fill('{"version":1,"nodes":[{"id":"imported","type":"service","position":{"x":0,"y":0},"data":{"label":"Imported"}}],"edges":[]}');
  await page.getByRole('button', { name: 'Validate and import' }).click();
  await expect(page.locator('[data-node-id="imported"]')).toBeAttached();
  await expect.poll(async () => Number.parseInt(await page.getByTestId('metric-rps').innerText(), 10)).toBeGreaterThan(0);
  await expect(page.getByTestId('pause-simulation')).toContainText('Resume');
});
