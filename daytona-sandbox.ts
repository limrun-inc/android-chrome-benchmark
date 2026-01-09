import { Daytona } from '@daytonaio/sdk';
import { _android as android } from 'playwright';
import { run } from './test';
import { createInstanceClient, Limrun } from '@limrun/api';

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

const limClient = await createInstanceClient({
  adbUrl: instance.status.adbWebSocketUrl!,
  endpointUrl: instance.status.endpointWebSocketUrl!,
  token: instance.status.token,
});

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
  image: "ghcr.io/limrun-inc/android-chrome-benchmark:v0.4.1",
  envVars: {
    LIMRUN_INSTANCE_ENDPOINT_WS_URL: instance.status.endpointWebSocketUrl!,
    LIMRUN_INSTANCE_ADB_WS_URL: instance.status.adbWebSocketUrl!,
    LIMRUN_INSTANCE_TOKEN: instance.status.token,
  },
});

console.log(`Sandbox created: ${sandbox.name}`);
console.time('startSandbox');
await sandbox.start();
console.timeEnd('startSandbox');
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

await run(limClient, device);
await device.close();
console.log('Session closed');
limClient.disconnect();
console.log('LimClient disconnected');
await limrun.androidInstances.delete(instance.metadata.id);
console.log('Instance deleted');
await sandbox.delete();
console.log('Sandbox deleted');
