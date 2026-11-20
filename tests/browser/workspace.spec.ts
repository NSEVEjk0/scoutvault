import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFile } from 'node:fs/promises';

test('desktop and phone layouts remain usable and accessible', async ({ browser }) => {
  for (const viewport of [{ width:1440,height:1024 },{ width:390,height:844 }]) {
    const context = await browser.newContext({ viewport, ...(viewport.width<500?{isMobile:true,hasTouch:true}:{}) });
    const page = await context.newPage();
    await page.goto(process.env.SCOUTVAULT_BROWSER_URL ?? 'http://127.0.0.1:4317');
    await expect(page.getByRole('heading',{name:'Check the place before you pay.'})).toBeVisible();
    await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    const results = await new AxeBuilder({page}).analyze();
    expect(results.violations.map(item=>({id:item.id,targets:item.nodes.map(node=>node.target)}))).toEqual([]);
    await page.screenshot({path:`reports/${viewport.width<500?'phone':'desktop'}.png`,fullPage:true});
    await context.close();
  }
});

test('reduced motion disables drawer animation and keeps keyboard focus', async ({ browser }) => {
  const context=await browser.newContext({reducedMotion:'reduce'});const page=await context.newPage();await page.goto(process.env.SCOUTVAULT_BROWSER_URL ?? 'http://127.0.0.1:4317');
  await page.getByRole('button',{name:'Connect wallet',exact:true}).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  expect(await page.getByRole('dialog').evaluate(element=>getComputedStyle(element).animationName)).toBe('none');
  await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toBeHidden();
  await expect(page.getByRole('button',{name:'Connect wallet',exact:true})).toBeFocused();await context.close();
});

test('buyer and scout complete a funded check through the real API', async ({ page }) => {
  const title = `Browser demo: Akoka studio ${Date.now()}`;
  const source=JSON.parse(await readFile('gateway.json','utf8')).endpoint+'/listings/akoka-studio.html';
  await page.goto(process.env.SCOUTVAULT_BROWSER_URL ?? '/');await page.getByRole('button',{name:'Connect wallet',exact:true}).click();await page.getByRole('button',{name:'Try with test funds',exact:false}).click();
  await expect(page.getByText('Demo wallet · test tokens only')).toBeVisible();
  await page.getByRole('button',{name:'Create a check',exact:true}).click();
  await page.getByLabel('Listing URL').fill(source);
  await page.getByRole('button',{name:'Read listing',exact:true}).click();
  await expect(page.getByText('Listing read with Firecrawl')).toBeVisible({timeout:70000});
  await page.getByLabel('Check title', { exact: true }).fill(title);
  await page.getByLabel('Entrance address').fill('12 Sample Lane, Akoka');
  await page.getByRole('button',{name:'Review funding',exact:true}).click();
  await page.getByRole('button',{name:'Fund 2 TEST USDC',exact:true}).click();
  await expect(page.getByRole('dialog').locator('.detail-meta').getByText('Open for a scout')).toBeVisible();
  await page.getByRole('button',{name:'Close dialog',exact:true}).click();
  await page.getByRole('button',{name:'Scout',exact:true}).click();
  await page.getByRole('link',{name:'Scout map',exact:true}).click();
  await page.getByRole('button',{name:title,exact:true}).click();
  await page.getByRole('button',{name:'Claim this check',exact:true}).click();
  await expect(page.getByRole('button',{name:'Capture field report'})).toBeVisible();
  await page.getByRole('button',{name:'Capture field report'}).click();
  const checks=page.locator('.report-check');
  await checks.nth(0).getByText('Yes',{exact:true}).click();await checks.nth(1).getByText('Yes',{exact:true}).click();await checks.nth(2).getByText('Could not confirm',{exact:true}).click();
  await page.getByLabel('What else should the buyer know?').fill('This is a demo illustration. No real site visit is claimed.');
  await page.getByRole('button',{name:'Use sample illustration',exact:true}).click();
  await expect(page.getByAltText('Your field report photo')).toBeVisible();
  await page.getByRole('button',{name:'Sign and submit report',exact:true}).click();
  await expect(page.getByText('Photo hash and wallet signature match')).toBeVisible();
  await page.getByRole('button',{name:'Close dialog',exact:true}).click();await page.getByRole('button',{name:'Buyer',exact:true}).click();
  await page.getByRole('button',{name:title,exact:true}).click();
  await expect(page.getByText('Photo hash and wallet signature match')).toBeVisible();
  await page.getByRole('button',{name:'Review and pay scout',exact:true}).click();await page.getByRole('button',{name:'Approve and pay scout',exact:true}).click();
  await expect(page.getByText('2 TEST USDC paid',{exact:true})).toBeVisible();
  const review = await new AxeBuilder({page}).analyze();
  expect(review.violations.map(item=>({id:item.id,targets:item.nodes.map(node=>node.target)}))).toEqual([]);
  await page.screenshot({path:'reports/payout-review.png',fullPage:true});
});
