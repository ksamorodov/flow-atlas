import { test } from '@playwright/test';
import { runAtlasChecks } from './atlas.playwright.js';

test('full atlas editing, discovery, evidence, export, and validation flow', async ({ page }) => {
  await runAtlasChecks(page);
});
