// Run with the static server available: node tests/columns-details.spec.cjs
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const baseURL = process.env.SOLKANBAN_TEST_URL || 'http://127.0.0.1:8000/';
const executablePath = process.env.SOLKANBAN_CHROMIUM || '/usr/bin/chromium';

(async () => {
  const browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox'] });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: 'dark' });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(baseURL);
    await page.locator('.card').first().waitFor();
    const state = () => page.evaluate(() => JSON.parse(localStorage.getItem('solkanban.v1')));
    const longDescription = 'Descrição completa da solicitação.\n'.repeat(35) + '<img src=x onerror="alert(1)">\nÚltima linha visível.';
    await page.locator('#new-request').click();
    await page.locator('#code').fill('7001');
    await page.locator('#description').fill(longDescription);
    await page.locator('#project').fill('Obra de teste & expansão');
    await page.locator('#assignee').fill('Responsável com nome completo');
    await page.locator('#priority').selectOption('high');
    await page.locator('#status').selectOption('progress');
    await page.locator('#due').fill('2020-01-02');
    await page.locator('#save-request').click();
    const requestId = (await state()).requests.find(request => request.code === 7001).id;
    await page.getByRole('button', { name: 'Expandir solicitação: Código 7001', exact: true }).click();
    assert.equal(await page.locator('#detail-description').textContent(), longDescription);
    assert.equal(await page.locator('#detail-description').evaluate(el => getComputedStyle(el).whiteSpace), 'pre-wrap');
    assert.equal(await page.locator('#details-dialog img').count(), 0, 'Description is text, never injected HTML');
    assert.equal(await page.locator('#detail-code').textContent(), '7001');
    assert.equal(await page.locator('#detail-column').textContent(), 'Em andamento');
    assert.equal(await page.locator('#detail-project').textContent(), 'Obra de teste & expansão');
    assert.equal(await page.locator('#detail-assignee').textContent(), 'Responsável com nome completo');
    assert.equal(await page.locator('#detail-priority').textContent(), 'Alta');
    assert.match(await page.locator('#detail-due').textContent(), /2020/);
    await page.locator('#details-edit').click();
    assert.equal(await page.locator('#request-id').inputValue(), requestId);
    assert.equal(await page.locator('#description').inputValue(), longDescription);
    await page.locator('#cancel-dialog').click();

    await page.locator('[data-column-edit="review"]').click();
    await page.locator('#column-name').fill('Aprovação <obras>');
    await page.locator('#column-kind').selectOption('progress');
    await page.locator('#save-column').click();
    assert.equal(await page.locator('.column[data-status="review"] h3').textContent(), 'Aprovação <obras>');
    assert.equal(await page.locator('#metric-progress').textContent(), '5', 'Column classification drives counters');
    assert.equal((await state()).requests.filter(request => request.status === 'review').length, 2);
    await page.reload();
    assert.equal(await page.locator('.column[data-status="review"] h3').textContent(), 'Aprovação <obras>');

    await page.locator('#new-column').click();
    await page.locator('#column-name').fill('   ');
    await page.locator('#save-column').click();
    assert.equal(await page.locator('#column-dialog').evaluate(el => el.open), true);
    await page.locator('#column-name').fill('CONCLUÍDAS');
    await page.locator('#save-column').click();
    assert.equal(await page.locator('#column-dialog').evaluate(el => el.open), true, 'Duplicate names are rejected');
    await page.locator('#column-name').fill('Aguardando financeiro');
    await page.locator('#column-name').press('Enter');
    const customId = (await state()).columns.find(column => column.name === 'Aguardando financeiro').id;
    assert.equal(await page.locator('.column').count(), 5);
    await page.getByRole('button', { name: 'Editar Código 7001', exact: true }).click();
    assert.equal(await page.locator('#status option').count(), 5);
    await page.locator('#status').selectOption(customId);
    await page.locator('#save-request').click();
    const dragged = (await state()).requests.find(request => request.status === 'new');
    await page.locator(`.card[data-id="${dragged.id}"]`).dragTo(page.locator(`.column[data-status="${customId}"] .column-heading`));
    assert.equal((await state()).requests.filter(request => request.status === customId).length, 2, 'Drag works with custom columns');

    // Filtered-out cards must still be transferred when a populated column is deleted.
    await page.locator('#search').fill('7001');
    await page.locator(`[data-column-delete="${customId}"]`).click();
    assert.match(await page.locator('#delete-column-description').textContent(), /2 solicitação/);
    await page.locator('#confirm-delete-column').click();
    assert.equal(await page.locator('#delete-column-dialog').evaluate(el => el.open), true, 'Destination is required');
    assert.equal((await state()).columns.length, 5);
    await page.locator('#column-destination').selectOption('done');
    await page.locator('#confirm-delete-column').click();
    assert.equal((await state()).requests.length, 9);
    assert.equal((await state()).requests.filter(request => request.status === customId).length, 0);
    assert.equal(await page.locator('#metric-done').textContent(), '3');
    await page.reload();
    assert.equal(await page.locator('.column').count(), 4);
    await page.getByRole('button', { name: 'Expandir solicitação: Código 7001', exact: true }).click();
    assert.equal(await page.locator('#detail-column').textContent(), 'Concluídas');
    assert.equal(await page.locator('#detail-description').textContent(), longDescription);
    await page.locator('#close-details').click();

    await page.locator('#new-column').click();
    await page.locator('#column-name').fill('Coluna vazia');
    await page.locator('#save-column').click();
    const emptyId = (await state()).columns.find(column => column.name === 'Coluna vazia').id;
    await page.locator(`[data-column-delete="${emptyId}"]`).click();
    assert.equal(await page.locator('#column-destination-field').isVisible(), false);
    await page.locator('#cancel-delete-column').click();
    assert.equal((await state()).columns.length, 5, 'Cancel preserves the column');
    await page.locator(`[data-column-delete="${emptyId}"]`).click();
    await page.locator('#confirm-delete-column').click();
    assert.equal((await state()).columns.length, 4);

    // Keep one valid destination, even after all three original active stages are removed.
    for (const column of (await state()).columns.filter(column => column.id !== 'done')) {
      await page.locator(`[data-column-delete="${column.id}"]`).click();
      if (await page.locator('#column-destination-field').isVisible()) await page.locator('#column-destination').selectOption('done');
      await page.locator('#confirm-delete-column').click();
    }
    assert.equal((await state()).columns.length, 1);
    assert.equal((await state()).requests.length, 9);
    assert.equal(await page.locator('[data-column-delete="done"]').isDisabled(), true);
    assert.equal(await page.locator('#metric-done').textContent(), '9');
    await page.locator('#new-request').click();
    assert.equal(await page.locator('#status').inputValue(), 'done', 'New requests choose an existing column after the original first stage is deleted');
    await page.locator('#cancel-dialog').click();

    const second = await context.newPage();
    await second.goto(baseURL);
    await page.getByRole('button', { name: 'Expandir solicitação: Código 7001', exact: true }).click();
    await second.locator('[data-column-edit="done"]').click();
    await second.locator('#column-name').fill('Entregues');
    await second.locator('#save-column').click();
    await page.waitForFunction(() => document.querySelector('#detail-column').textContent === 'Entregues');
    assert.equal(await page.locator('#status option').textContent(), 'Entregues');
    await page.locator('#close-details').click();

    // Failed saves must not remove a column or its requests.
    await second.locator('#new-column').click();
    await second.locator('#column-name').fill('Preservar');
    await second.locator('#save-column').click();
    const preservedState = await state();
    await page.evaluate(() => { Storage.prototype.setItem = () => { throw new DOMException('Quota exceeded', 'QuotaExceededError'); }; });
    const preserveId = preservedState.columns.find(column => column.name === 'Preservar').id;
    await page.locator(`[data-column-delete="${preserveId}"]`).click();
    await page.locator('#confirm-delete-column').click();
    assert.deepEqual(await state(), preservedState);
    assert.equal(await page.locator('#delete-column-dialog').evaluate(el => el.open), true);
    await page.locator('#cancel-delete-column').click();
    await page.reload();

    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.getByRole('button', { name: 'Expandir solicitação: Código 7001', exact: true }).click();
    assert.equal(await page.locator('#detail-description').textContent(), longDescription);
    await page.locator('#close-details').click();
    await page.locator('#new-column').click();
    await page.locator('#column-name').fill('Criada no celular');
    await page.locator('#save-column').click();
    assert.equal((await state()).columns.some(column => column.name === 'Criada no celular'), true);

    const preview = await context.newPage();
    preview.on('pageerror', error => errors.push(error.message));
    await preview.setContent('<iframe id="preview" sandbox="allow-scripts" style="width:100%;height:900px"></iframe>');
    await preview.evaluate(html => document.querySelector('iframe').srcdoc = html, fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8'));
    const frame = preview.frameLocator('#preview');
    await frame.locator('.card-expand').first().click();
    assert.equal(await frame.locator('#details-dialog').evaluate(el => el.open), true);
    await frame.locator('#close-details').click();
    await frame.locator('#new-column').click();
    await frame.locator('#column-name').fill('Coluna na prévia');
    await frame.locator('#save-column').click();
    assert.equal(await frame.locator('.column').count(), 5);
    await frame.getByRole('button', { name: 'Excluir coluna: Coluna na prévia', exact: true }).click();
    await frame.locator('#confirm-delete-column').click();
    assert.equal(await frame.locator('.column').count(), 4);
    assert.deepEqual(errors, []);
    console.log('PASS: full escaped/multiline details, edit from details, column names/types, dynamic status and drag, persistent transfers including filtered cards, empty-column deletion/cancel, last-column guard, cross-tab updates, failed-save preservation, mobile and sandbox preview.');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
