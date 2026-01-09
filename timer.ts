interface Measurement {
    name: string;
    duration: number;
}

export class BenchmarkTimer {
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