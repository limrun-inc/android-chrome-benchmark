import { Daytona } from '@daytonaio/sdk';
import { _android as android } from 'playwright';

const apiKey = process.env['LIM_API_KEY'];

if (!apiKey) {
  console.error('Error: Missing required environment variables (LIM_API_KEY).');
  process.exit(1);
}

const daytonaApiKey = process.env['DAYTONA_API_KEY'];
if (!daytonaApiKey) {
  console.error('Error: Missing required environment variables (DAYTONA_API_KEY).');
  process.exit(1);
}

const daytona = new Daytona({ apiKey: daytonaApiKey });

const sandbox = await daytona.create({
  language: 'typescript',
  ephemeral: true,
  public: true,
  resources: {
    cpu: 1,
    memory: 1,
  },
  image: "ghcr.io/limrun-inc/android-chrome-benchmark:v0.3.0",
  envVars: {
    LIM_API_KEY: apiKey,
    LIMRUN_REGION: process.env['LIMRUN_REGION'] ?? 'eu-north1',
  },
});

console.log(`Sandbox created: ${sandbox.name}`);
await sandbox.start();
console.log('Sandbox started');
await sandbox.process.createSession('server');
const response = await sandbox.process.executeSessionCommand('server', {
  command: 'npm run external-sandbox',
  runAsync: true,
});

// Wait for the server to be ready
await new Promise<void>((resolve, reject) => {
  const timeout = setTimeout(() => {
    reject(new Error('Server startup timed out'));
  }, 30_000);

  sandbox.process.getSessionCommandLogs(
    'server',
    response.cmdId!,
    (stdout) => {
      console.log('[STDOUT]:', stdout);
      if (stdout.includes('Started Android-Playwright server')) {
        clearTimeout(timeout);
        resolve();
      }
    },
    (stderr) => {
      console.error('[STDERR]:', stderr);
    }
  );
});

console.log('Server is ready!');
const playwrightAndroidUrl = await sandbox.getPreviewLink(8989);

console.log(`Connecting to instance: ${playwrightAndroidUrl.url}`);
console.time('connect');
const device = await android.connect(playwrightAndroidUrl.url.replaceAll('https://', 'wss://'), {
  headers: {
    'x-daytona-preview-token': playwrightAndroidUrl.token,
  }
});
console.timeEnd('connect');

// This is needed for Chrome's first-run initializations to complete.
await device.shell('am start com.android.chrome/com.google.android.apps.chrome.Main');
await new Promise((resolve) => setTimeout(resolve, 1_000));
await device.shell('am force-stop com.android.chrome');
console.log('Chrome is ready');

const browser = await device.launchBrowser();
console.log('Browser launched');

console.time('cdp.commands');
const page = await browser.newPage();
await page.goto('https://github.com/microsoft/playwright');
await page.waitForURL('https://github.com/microsoft/playwright');
console.log(await page.title());
console.log('Page title logged');
// Wait for main content to be visible
await page.waitForSelector('[data-hpc]', { state: 'visible' });
const linksCount = await page.locator('a').count();
console.log(`Links on page: ${linksCount}`);

console.time('click.github');
await page.locator('a[title=".github"]').first().click();
console.timeEnd('click.github');
await page.locator('a[title="workflows"]').first().click();
await page.locator('a[title="infra.yml"]').first().click();
// Scroll
await page.evaluate(() => {
  window.scrollTo(0, document.body.scrollHeight);
});
console.time('cdp.screenshot');
await page.screenshot({ path: 'screenshot.png' });
console.timeEnd('cdp.screenshot');
console.timeEnd('cdp.commands');

await device.close();
console.log('Session closed');
