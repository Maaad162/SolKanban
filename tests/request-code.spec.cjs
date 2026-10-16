// Run with the static server on port 8000: node tests/request-code.spec.cjs
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const baseURL = process.env.SOLKANBAN_TEST_URL || 'http://127.0.0.1:8000/';
const executablePath = process.env.SOLKANBAN_CHROMIUM || '/usr/bin/chromium';

(async () => {
  const browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(baseURL);
    await page.locator('.card').first().waitFor();
    await page.locator('#new-request').click();
    const code = page.getByLabel('Código da Solicitação *', { exact: true });
    assert.equal(await code.getAttribute('inputmode'), 'numeric');
    for (const invalid of ['', 'abc', '123abc', '1.5', '1,5', '-10', '+10', '1e3', ' 123 ', '9007199254740992', '12345678901234567890']) {
      await code.fill(invalid);
      await page.locator('#save-request').click();
      assert.equal(await page.locator('#request-dialog').evaluate(el => el.open), true, `Rejected ${JSON.stringify(invalid)}`);
      assert.equal(await code.evaluate(el => el.validity.valid), false);
      assert.equal(await page.locator('.card').count(), 8);
    }
    await code.fill('00012345');
    await page.locator('#description').fill('Código numérico de teste');
    await page.locator('#save-request').click();
    let saved = await page.evaluate(() => JSON.parse(localStorage.getItem('solkanban.v1')));
    const request = saved.requests.find(r => r.description === 'Código numérico de teste');
    assert.equal(request.code, 12345);
    assert.equal(typeof request.code, 'number');
    assert.equal(Object.hasOwn(request, 'title'), false);
    await page.reload();
    await page.locator('#search').fill('12345');
    assert.equal(await page.locator('.card').count(), 1);
    await page.getByRole('button', { name: 'Editar Código 12345', exact: true }).click();
    assert.equal(await code.inputValue(), '12345');
    await code.fill('7.5');
    await page.locator('#save-request').click();
    saved = await page.evaluate(() => JSON.parse(localStorage.getItem('solkanban.v1')));
    assert.equal(saved.requests.find(r => r.id === request.id).code, 12345, 'Invalid edits do not overwrite the code');
    await code.fill('0');
    await code.press('Enter');
    saved = await page.evaluate(() => JSON.parse(localStorage.getItem('solkanban.v1')));
    assert.equal(saved.requests.find(r => r.id === request.id).code, 0, 'Zero is a valid non-negative integer');
    await page.locator('#search').fill('');
    await page.getByRole('button', { name: 'Editar Código 0', exact: true }).click();
    await code.fill('9007199254740991');
    await page.locator('#save-request').click();
    await page.reload();
    saved = await page.evaluate(() => JSON.parse(localStorage.getItem('solkanban.v1')));
    assert.equal(saved.requests.find(r => r.id === request.id).code, Number.MAX_SAFE_INTEGER, 'Safe integer boundary persists without rounding');
    const downloadPromise = page.waitForEvent('download');
    await page.locator('#export').click();
    const download = await downloadPromise;
    const fs = require('node:fs');
    const backup = JSON.parse(fs.readFileSync(await download.path(), 'utf8'));
    assert.equal(backup.requests.find(r => r.id === request.id).code, Number.MAX_SAFE_INTEGER);

    // Compatibility with already saved text titles: do not assign invented codes or lose text.
    const legacy = {
      version: 1, nextNumber: 1003,
      requests: [
        { id: 'old-text', number: 1001, title: 'Pedido antigo importante', description: 'Detalhes antigos.', project: 'Obra antiga', assignee: 'Ana', priority: 'high', status: 'review', due: '', reference: '', sample: false },
        { id: 'old-numeric', number: 1002, title: '9876', description: 'Código já digitado no título.', project: '', assignee: '', priority: 'low', status: 'new', due: '', reference: '', sample: false }
      ]
    };
    const legacyPage = await browser.newPage();
    legacyPage.on('pageerror', error => errors.push(error.message));
    await legacyPage.addInitScript(value => {
      if (!localStorage.getItem('solkanban.v1')) localStorage.setItem('solkanban.v1', JSON.stringify(value));
    }, legacy);
    await legacyPage.goto(baseURL);
    assert.equal(await legacyPage.locator('.card').count(), 2);
    assert.deepEqual(await legacyPage.evaluate(() => JSON.parse(localStorage.getItem('solkanban.v1'))), legacy, 'Reading legacy data does not rewrite it');
    await legacyPage.getByRole('button', { name: 'Editar Código não informado', exact: true }).click();
    assert.equal(await legacyPage.locator('#code').inputValue(), '');
    assert.equal(await legacyPage.locator('#description').inputValue(), 'Pedido antigo importante\n\nDetalhes antigos.');
    await legacyPage.locator('#save-request').click();
    assert.equal(await legacyPage.locator('#request-dialog').evaluate(el => el.open), true);
    await legacyPage.locator('#code').fill('7654');
    await legacyPage.locator('#save-request').click();
    await legacyPage.reload();
    const migrated = await legacyPage.evaluate(() => JSON.parse(localStorage.getItem('solkanban.v1')).requests.find(r => r.id === 'old-text'));
    assert.equal(migrated.code, 7654);
    assert.equal(migrated.description, 'Pedido antigo importante\n\nDetalhes antigos.');
    assert.equal(migrated.project, 'Obra antiga');
    assert.equal(migrated.status, 'review');
    await legacyPage.getByRole('button', { name: 'Editar Código 7654', exact: true }).click();
    assert.equal(await legacyPage.locator('#description').inputValue(), migrated.description, 'Old title is not duplicated on subsequent edits');
    await legacyPage.locator('#cancel-dialog').click();
    await legacyPage.getByRole('button', { name: 'Editar Código 9876', exact: true }).click();
    assert.equal(await legacyPage.locator('#code').inputValue(), '9876');
    assert.deepEqual(errors, []);
    console.log('PASS: integer-only code validation, numeric persistence/export, edit/search, safe integer limits, legacy data preservation and conversion without duplicated descriptions.');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
