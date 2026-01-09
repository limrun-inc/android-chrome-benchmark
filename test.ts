import { InstanceClient } from "@limrun/api";
import { AndroidDevice } from 'playwright';

interface Measurement {
    name: string;
    duration: number;
}

class BenchmarkTimer {
    private measurements: Measurement[] = [];
    private startTimes: Map<string, number> = new Map();

    start(name: string): void {
        this.startTimes.set(name, performance.now());
    }

    end(name: string): number {
        const startTime = this.startTimes.get(name);
        if (startTime === undefined) {
            throw new Error(`Timer "${name}" was never started`);
        }
        const duration = performance.now() - startTime;
        this.measurements.push({ name, duration });
        this.startTimes.delete(name);
        console.log(`${name}: ${duration.toFixed(2)}ms`);
        return duration;
    }

    async measure<T>(name: string, fn: () => Promise<T>): Promise<T> {
        this.start(name);
        const result = await fn();
        this.end(name);
        return result;
    }

    printTable(): void {
        console.log('\n' + '='.repeat(55));
        console.log('                 BENCHMARK RESULTS');
        console.log('='.repeat(55));
        
        const maxNameLen = Math.max(...this.measurements.map(m => m.name.length), 30);
        
        console.log(`${'Metric'.padEnd(maxNameLen)}  ${'Time (ms)'.padStart(12)}`);
        console.log('-'.repeat(55));
        
        for (const m of this.measurements) {
            console.log(`${m.name.padEnd(maxNameLen)}  ${m.duration.toFixed(2).padStart(12)}`);
        }
        
        console.log('='.repeat(55));
    }
}

export async function run(limClient: InstanceClient, device: AndroidDevice) {
    const timer = new BenchmarkTimer();

    // This is needed for Chrome's first-run initializations to complete.
    await device.shell('am start com.android.chrome/com.google.android.apps.chrome.Main');
    await new Promise((resolve) => setTimeout(resolve, 1_000));
    await device.shell('am force-stop com.android.chrome');
    console.log('Chrome is ready');

    const browser = await device.launchBrowser();
    console.log('Browser launched');

    timer.start('cdp.commands.total');
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
    timer.end('cdp.commands.total');


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