import { _android as android } from 'playwright';
import { createInstanceClient, Limrun } from '@limrun/api';
import { run } from './test';

const apiKey = process.env['LIM_API_KEY'];

if (!apiKey) {
  console.error('Error: Missing required environment variables (LIM_API_KEY).');
  process.exit(1);
}

const limrun = new Limrun({ apiKey });

// Wait makes sure the request returns only after the URLs are set and
// the instance is ready to connect.
console.time('create');
const instance = await limrun.androidInstances.create({
  metadata: {
    labels: {
      name: 'playwright-example',
    },
  },
  spec: {
    region: process.env["LIMRUN_REGION"],
    initialAssets: [
      {
        kind: 'Configuration',
        configuration: {
          kind: 'ChromeFlag',
          chromeFlag: 'enable-command-line-on-non-rooted-devices@1',
        },
      },
    ],
    sandbox: {
      playwrightAndroid: {
        enabled: true,
      },
    },
    clues: [
      {
        kind: 'OSVersion',
        osVersion: '15',
      },
    ],
  },
  wait: true,
});
console.timeEnd('create');
console.log(`Instance created: ${instance.metadata.id}`);

if (!instance.status.sandbox?.playwrightAndroid?.url) {
  throw new Error('Playwright Android sandbox URL not found');
}
const limClient = await createInstanceClient({
  adbUrl: instance.status.adbWebSocketUrl!,
  endpointUrl: instance.status.endpointWebSocketUrl!,
  token: instance.status.token,
});

console.log(`Connecting to instance: ${instance.metadata.id}`);
console.time('connect');
const device = await android.connect(
  `${instance.status.sandbox.playwrightAndroid.url}?token=${instance.status.token}`,
);
console.timeEnd('connect');

await run(limClient, device);

await device.close();
console.log('Session closed');
limClient.disconnect();
console.log('LimClient disconnected');
await limrun.androidInstances.delete(instance.metadata.id);
console.log('Instance deleted');
