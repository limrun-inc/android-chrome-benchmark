import { InstanceClient } from "@limrun/api";
import { AndroidDevice } from 'playwright';
import { BenchmarkTimer } from './timer';

export async function run(limClient: InstanceClient, device: AndroidDevice) {
    const timer = new BenchmarkTimer();

    // This is needed for Chrome's first-run initializations to complete.
    await device.shell('am start com.android.chrome/com.google.android.apps.chrome.Main');
    await new Promise((resolve) => setTimeout(resolve, 1_000));
    await device.shell('am force-stop com.android.chrome');
    console.log('Chrome is ready');

    timer.start('total');
    const browser = await device.launchBrowser();
    console.log('Browser launched');

    const page = await browser.newPage();
    await page.goto('https://github.com/microsoft/playwright');
    await page.waitForURL('https://github.com/microsoft/playwright');
    console.log(await page.title());
    console.log('Page title logged');
    // Wait for main content to be visible
    await page.waitForSelector('[data-hpc]', { state: 'visible' });
    const linksCount = await page.locator('a').count();
    console.log(`Links on page: ${linksCount}`);

    await timer.measure('click.github', async () => {
        await page.locator('a[title=".github"]').first().click();
    });
    await page.locator('a[title="workflows"]').first().click();
    await page.locator('a[title="infra.yml"]').first().click();
    // Scroll
    await page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight);
    });
    
    await timer.measure('cdp.screenshot', async () => {
        await page.screenshot({ path: 'screenshot.png' });
    });


    // --- CDP accessibility + DOM snapshot benchmarks ---

    const context = page.context();
    const cdp = await context.newCDPSession(page);

    // Enable domains explicitly (important for cold-start latency testing)
    await cdp.send('Accessibility.enable');
    await cdp.send('DOM.enable');

    console.log('--- CDP Accessibility / DOMSnapshot benchmarks ---');

    // ----------------------------
    // Accessibility.getFullAXTree
    // ----------------------------
    const axTree = await timer.measure('cdp.Accessibility.getFullAXTree', async () => {
        return await cdp.send('Accessibility.getFullAXTree');
    });

    const axNodeCount = axTree?.nodes?.length ?? 0;
    console.log('AX nodes returned:', axNodeCount);

    // -----------------------------------
    // DOMSnapshot.captureSnapshot
    // -----------------------------------
    const domSnapshot = await timer.measure('cdp.DOMSnapshot.captureSnapshot', async () => {
        return await cdp.send('DOMSnapshot.captureSnapshot', {
            computedStyles: [], // keep empty to isolate baseline latency
            includeDOMRects: true,
            includePaintOrder: true,
        });
    });
    timer.end('total');

    const domDocCount = domSnapshot?.documents?.length ?? 0;
    const domNodeCount = domSnapshot?.documents?.[0]?.nodes?.nodeName?.length ?? 0;
    console.log('DOMSnapshot documents:', domDocCount);
    console.log('DOMSnapshot nodes:', domNodeCount);

    // Optional: explicitly detach CDP session
    await cdp.detach();

    console.log('--- CDP benchmarks complete ---');
    
    await timer.measure('limClient.screenshot', async () => {
        await limClient.screenshot();
    });

    // Print the final summary table
    timer.printTable();
}