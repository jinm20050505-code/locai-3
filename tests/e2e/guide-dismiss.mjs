// 手元の画面だけで説明バーの開閉と保存を確認。アカウント・取引は変更しない。
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const browser = await chromium.launch();
try {
  for (const width of [320, 390, 1280]) {
    const context = await browser.newContext({ viewport: { width, height: 844 }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto('http://localhost:3004/');
    const close = page.getByRole('button', { name: 'こまめの説明バーを閉じる', exact: true });
    await close.waitFor();
    assert.ok((await close.boundingBox()).height >= 48);
    const expanded = await page.locator('.app-page-region').evaluate(e => e.clientHeight);
    await close.click();
    const reopen = page.getByRole('button', { name: 'こまめの説明を開く', exact: true });
    await reopen.waitFor();
    assert.equal(await page.locator('.komame-bubble').count(), 0);
    assert.equal(await page.getByRole('dialog').isVisible(), false);
    assert.ok(await page.locator('.app-page-region').evaluate(e => e.clientHeight) > expanded);
    assert.equal(await reopen.evaluate(e => e === document.activeElement), true);
    await page.reload();
    await reopen.waitFor();
    assert.equal(await page.locator('.komame-bubble').count(), 0);
    if (width < 768) {
      const menu = page.getByRole('navigation', { name: '下のメニュー' });
      assert.equal(await menu.getByRole('link').count(), 4);
      await menu.getByRole('link', { name: '探す', exact: true }).click();
      await page.waitForURL(/\/search$/);
      await reopen.waitFor();
      assert.equal(await page.locator('.komame-bubble').count(), 0);
    }
    await reopen.click();
    await close.waitFor();
    await page.getByRole('button', { name: 'こまめの使い方ガイドを開く', exact: true }).click();
    await page.getByRole('dialog').waitFor();
    await page.getByRole('button', { name: '案内を閉じる', exact: true }).click();
    await page.reload();
    await close.waitFor();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    assert.ok(await page.evaluate(() => document.querySelector('.app-page-region').getBoundingClientRect().bottom <= document.querySelector('.komame-guide').getBoundingClientRect().top));
    assert.deepEqual(errors, []);
    console.log('OK ' + width + 'px：閉じる・再表示・再読み込み・案内・画面の重なり');
    await context.close();
  }
} finally { await browser.close(); }
