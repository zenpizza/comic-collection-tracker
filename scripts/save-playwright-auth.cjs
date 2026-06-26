const { chromium } = require('playwright');
const path = require('path');
const readline = require('readline');

const APP_URL = process.env.APP_URL || 'http://localhost:3000';
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

  await context.storageState({ path: AUTH_FILE });
  console.log(`\nSaved to ${AUTH_FILE}`);
  await browser.close();
  console.log('Done.');
})().catch(e => { console.error('Error:', e.message); process.exit(1); });
