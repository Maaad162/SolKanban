// Run with: node tests/kanban.spec.cjs
// Requires Playwright and Chromium; start the static server on port 8000 first.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const baseURL = process.env.SOLKANBAN_TEST_URL || 'http://127.0.0.1:8000/';
const executablePath = process.env.SOLKANBAN_CHROMIUM || '/usr/bin/chromium';

(async () => {
  const browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox'] });
  try {
    const context = await browser.newContext({ colorScheme: 'dark', viewport: { width: 1440, height: 1000 } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(baseURL);
    await page.locator('.card').first().waitFor();
    const theme = () => page.locator('html').getAttribute('data-theme');
    assert.equal(await theme(), 'dark', 'Initial theme follows the system');
    assert.equal(await page.locator('#theme-select').inputValue(), 'dark');
    const requestsBefore = await page.evaluate(() => localStorage.getItem('solkanban.v1'));
    await page.getByRole('combobox', { name: 'Tema', exact: true }).selectOption('light');
    await page.reload();
    assert.equal(await theme(), 'light', 'Explicit light preference overrides the dark system after reload');
    assert.equal(await page.evaluate(() => localStorage.getItem('solkanban.v1')), requestsBefore, 'Theme changes preserve requests');
    await page.getByRole('combobox', { name: 'Tema', exact: true }).selectOption('dark');
    await page.reload();
    assert.equal(await theme(), 'dark');
    await page.waitForFunction(() => getComputedStyle(document.querySelector('.column')).backgroundColor === 'rgb(24, 33, 27)');
    await page.locator('#new-request').click();
    assert.equal(await page.locator('.field').first().evaluate(el => getComputedStyle(el).color), 'rgb(220, 232, 223)', 'Dark form labels remain readable');
    await page.locator('#cancel-dialog').click();
    assert.equal(await page.locator('.card').count(), 8);

    // Existing persisted requests can be deleted directly without opening the editor.
    const first = page.locator('.card').first();
    const id = await first.getAttribute('data-id');
    const title = await first.locator('.card-title').textContent();
    await first.getByRole('button', { name: `Excluir solicitação: ${title}`, exact: true }).click();
    assert.match(await page.locator('#confirm-description').textContent(), new RegExp(title));
    assert.equal(await page.locator('#confirm-dialog button[value="cancel"]').evaluate(el => el === document.activeElement), true);
    await page.locator('#confirm-dialog button[value="cancel"]').click();
    await page.waitForFunction(() => !document.querySelector('#confirm-dialog').open);
    assert.equal(await page.locator('.card').count(), 8, 'Cancel preserves requests');
    await page.locator(`[data-delete="${id}"]`).click();
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('.card').count(), 8, 'Escape cancels deletion');
    await page.locator(`[data-delete="${id}"]`).click();
    await page.locator('#confirm-dialog button[value="confirm"]').click();
    await page.locator(`.card[data-id="${id}"]`).waitFor({ state: 'detached' });
    assert.equal(await page.locator('#metric-total').textContent(), '7');
    await page.reload();
    assert.equal(await page.locator('.card').count(), 7);
    assert.equal(await page.locator(`[data-delete="${id}"]`).count(), 0, 'Deletion persists');

    // New user data and editor deletion share the same behavior.
    await page.locator('#new-request').click();
    await page.locator('#title').fill('Pedido criado pelo usuário');
    await page.locator('#status').selectOption('done');
    await page.locator('#save-request').click();
    assert.equal(await page.locator('#metric-done').textContent(), '2');
    await page.getByRole('button', { name: 'Editar Pedido criado pelo usuário', exact: true }).click();
    await page.locator('#delete-request').click();
    await page.locator('#confirm-dialog button[value="confirm"]').click();
    await page.waitForFunction(() => !document.querySelector('#request-dialog').open);
    assert.equal(await page.locator('#metric-done').textContent(), '1');

    // Themes synchronize between tabs and still render after filtering.
    const second = await context.newPage();
    await second.goto(baseURL);
    await page.locator('#theme-select').selectOption('light');
    await second.waitForFunction(() => document.documentElement.dataset.theme === 'light');
    await page.locator('#search').fill('Marina');
    assert.equal(await page.locator('.card').count(), 2);
    await page.locator('#theme-select').selectOption('dark');
    assert.equal(await page.locator('.card').count(), 2);
    await page.locator('#search').fill('');
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'No horizontal page overflow');
    await page.getByRole('combobox', { name: 'Tema', exact: true }).selectOption('light');
    await page.getByRole('combobox', { name: 'Tema', exact: true }).selectOption('dark');
    await page.locator('.card-delete').first().click();
    await page.locator('#confirm-dialog button[value="cancel"]').click();
    await page.waitForFunction(() => !document.querySelector('#confirm-dialog').open);

    // Inline preview: scripts allowed, storage unavailable, native forms disabled.
    const preview = await context.newPage();
    preview.on('pageerror', error => errors.push(error.message));
    await preview.setContent('<iframe id="preview" sandbox="allow-scripts" style="width:100%;height:900px"></iframe>');
    const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    await preview.evaluate(html => document.querySelector('iframe').srcdoc = html, html);
    const frame = preview.frameLocator('#preview');
    await frame.locator('.card').first().waitFor();
    assert.equal(await frame.locator('#storage-notice').isVisible(), true);
    await frame.locator('#theme-select').selectOption('light');
    assert.equal(await frame.locator('html').getAttribute('data-theme'), 'light');
    await frame.locator('#theme-select').selectOption('dark');
    assert.equal(await frame.locator('html').getAttribute('data-theme'), 'dark');
    await frame.locator('.card-delete').first().click();
    await frame.locator('#confirm-dialog button[value="confirm"]').click();
    await frame.locator('.card').nth(7).waitFor({ state: 'detached' });
    assert.equal(await frame.locator('.card').count(), 7);
    assert.deepEqual(errors, []);
    console.log('PASS: system/default theme, light/dark persistence, data preservation, cross-tab theme sync, card deletion/cancel/Escape, editor deletion, counters, mobile controls, sandboxed preview.');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
