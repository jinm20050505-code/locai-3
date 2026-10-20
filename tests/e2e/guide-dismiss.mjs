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
    const avatarBefore = await page.locator('.komame-avatar').boundingBox();
    await close.click();
    const reopen = page.getByRole('button', { name: 'こまめの説明を開く', exact: true });
    await reopen.waitFor();
    assert.equal(await page.locator('.komame-bubble').count(), 0);
    assert.equal(await page.getByRole('dialog').isVisible(), false);
    assert.equal(await page.locator('.app-page-region').evaluate(e => e.clientHeight), expanded);
    const avatarAfter = await page.locator('.komame-avatar').boundingBox();
    assert.ok(Math.abs(avatarBefore.x - avatarAfter.x) < 1 && Math.abs(avatarBefore.y - avatarAfter.y) < 1);
    assert.equal(await reopen.evaluate(e => e === document.activeElement), true);
    assert.ok(await page.evaluate(() => {
      const guide = document.querySelector('.komame-guide');
      const area = document.querySelector('.app-page-region').getBoundingClientRect();
      const menu = document.querySelector('.mobile-navigation');
      const bottom = innerWidth < 768 ? menu.getBoundingClientRect().top : innerHeight;
      return Math.abs(area.bottom - bottom) <= 2 && area.bottom > guide.getBoundingClientRect().top && getComputedStyle(guide).backgroundColor === 'rgba(0, 0, 0, 0)';
    }));
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
    assert.ok(await page.evaluate(() => document.querySelector('.app-page-region').getBoundingClientRect().bottom > document.querySelector('.komame-guide').getBoundingClientRect().top));
    assert.deepEqual(errors, []);
    console.log('OK ' + width + 'px：閉じる・再表示・再読み込み・案内・画面の重なり');
    await context.close();
  }
} finally { await browser.close(); }
