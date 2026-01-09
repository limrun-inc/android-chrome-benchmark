import { InstanceClient } from "@limrun/api";
import { _android as android, AndroidDevice } from 'playwright';

export async function run(limClient: InstanceClient, device: AndroidDevice) {
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
    console.time('cdp.Accessibility.getFullAXTree');
    const axTree = await cdp.send('Accessibility.getFullAXTree');
    console.timeEnd('cdp.Accessibility.getFullAXTree');

    console.log('AX nodes returned:', axTree?.nodes?.length ?? 0);

    // -----------------------------------
    // DOMSnapshot.captureSnapshot
    // -----------------------------------
    console.time('cdp.DOMSnapshot.captureSnapshot');
    const domSnapshot = await cdp.send('DOMSnapshot.captureSnapshot', {
    computedStyles: [], // keep empty to isolate baseline latency
    includeDOMRects: true,
    includePaintOrder: true,
    });
    console.timeEnd('cdp.DOMSnapshot.captureSnapshot');

    console.log('DOMSnapshot documents:', domSnapshot?.documents?.length ?? 0);
    console.log(
    'DOMSnapshot nodes:',
    domSnapshot?.documents?.[0]?.nodes?.nodeName?.length ?? 0
    );

    // Optional: explicitly detach CDP session
    await cdp.detach();

    console.log('--- CDP benchmarks complete ---');
    console.time('limClient.screenshot');
    await limClient.screenshot();
    console.timeEnd('limClient.screenshot');
}