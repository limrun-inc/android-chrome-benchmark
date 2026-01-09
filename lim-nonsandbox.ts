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
console.log("Setting up adb tunnel");
console.time('startAdbTunnel');
const limClient = await createInstanceClient({
    adbUrl: instance.status.adbWebSocketUrl!,
    endpointUrl: instance.status.endpointWebSocketUrl!,
    token: instance.status.token,
})
const adbTunnel = await limClient.startAdbTunnel();
console.timeEnd('startAdbTunnel');
console.log(`Connecting to instance: ${instance.metadata.id}`);
console.time('connect');
const [device] = await android.devices();
console.timeEnd('connect');

await run(limClient, device);

await device.close();
console.log('Session closed');
adbTunnel.close();
limClient.disconnect();
console.log('Client disconnected');
await limrun.androidInstances.delete(instance.metadata.id);
console.log('Instance deleted');
