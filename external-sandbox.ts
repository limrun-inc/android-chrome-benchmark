import Limrun, { createInstanceClient } from '@limrun/api';
import { _android as android } from 'playwright';
if (!process.env['LIMRUN_INSTANCE_ENDPOINT_WS_URL'] || !process.env['LIMRUN_INSTANCE_ADB_WS_URL'] || !process.env['LIMRUN_INSTANCE_TOKEN']) {
    console.error('Error: Missing required environment variables (LIMRUN_INSTANCE_ENDPOINT_WS_URL, LIMRUN_INSTANCE_ADB_WS_URL, LIMRUN_INSTANCE_TOKEN).');
    process.exit(1);
}

console.log("Setting up adb tunnel");
console.time('startAdbTunnel');
const client = await createInstanceClient({
    adbUrl: process.env['LIMRUN_INSTANCE_ADB_WS_URL'],
    endpointUrl: process.env['LIMRUN_INSTANCE_ENDPOINT_WS_URL'],
    token: process.env['LIMRUN_INSTANCE_TOKEN'],
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
