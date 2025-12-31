import Limrun, { createInstanceClient } from '@limrun/api';
import { _android as android } from 'playwright';


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
console.log("Setting up adb tunnel");
console.time('startAdbTunnel');
const client = await createInstanceClient({
    adbUrl: instance.status.adbWebSocketUrl!,
    endpointUrl: instance.status.endpointWebSocketUrl!,
    token: instance.status.token,
})
const adbTunnel = await client.startAdbTunnel();
console.timeEnd('startAdbTunnel');

const serverInstance = await android.launchServer({
    deviceSerialNumber: `${adbTunnel.address.address}:${adbTunnel.address.port}`,
    host: '0.0.0.0',
    port: 8989,
    wsPath: "/",
});
const wsEndpoint = serverInstance.wsEndpoint();
console.log(`Started Android-Playwright server at ${wsEndpoint} targeting ${adbTunnel.address.address}:${adbTunnel.address.port}`);
