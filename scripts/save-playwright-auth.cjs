const { chromium } = require('playwright');
const path = require('path');
const readline = require('readline');

const APP_URL = 'http://localhost:3002';
const AUTH_FILE = path.resolve(__dirname, '../.playwright-auth.json');

function waitForEnter() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question('\nPress Enter once you are fully signed in... ', () => { rl.close(); resolve(); }));
}

(async () => {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto(APP_URL);

  await waitForEnter();

  // Debug: capture everything
  const url = page.url();
  console.log('Current page URL:', url);
  await page.screenshot({ path: path.resolve(__dirname, '../.playwright-debug.png') });
  console.log('Screenshot saved to .playwright-debug.png');

  const lsKeys = await page.evaluate(() => Object.keys(localStorage)).catch(() => []);
  const ssKeys = await page.evaluate(() => Object.keys(sessionStorage)).catch(() => []);
  const cookies = await context.cookies();

  console.log('localStorage keys:', lsKeys);
  console.log('sessionStorage keys:', ssKeys);
  console.log('cookies count:', cookies.length);
  cookies.forEach(c => console.log(`  cookie: ${c.name} | domain: ${c.domain} | httpOnly: ${c.httpOnly}`));

  await context.storageState({ path: AUTH_FILE });
  console.log(`\nSaved to ${AUTH_FILE}`);
  await browser.close();
  console.log('Done.');
})().catch(e => { console.error('Error:', e.message); process.exit(1); });
