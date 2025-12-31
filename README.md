# Limrun Android-Playwright Sandbox Test

At [Limrun](https://lim.run), we provide iOS & Android simulators running
on bare metal, rendered and streamed with real GPUs over WebRTC for your AI
agents.

This repo was internally used to measure the high level benefits of running
Android-Playwright server in a sandbox close to our Android instances for a
subset of end users connecting their agent from their laptops in India.

We've seen 5x improvement in latency, attributing it mostly to how Chrome Devtools
Protocol (CDP) being very chatty that the impact of latency is multipled and
us running the sandbox on bare-metal infra.

> Note that we used to have only `eu-north1` and `us-west1` regions at the time,
> we now have private `as-south1` as well to make it even smoother for all users
> across the globe.

In the results section, we have different combinations too but our main goal
was to improve for end users in Southeast Asia region who must run their
automation code locally.

Disclaimer: This is not a real benchmark. We just wanted to have a high level
idea on where the bottleneck was, e.g. if it is close then it's probably
just setup noise.

## Pre-requisites

* Limrun account to provision Android instance.
* Google Cloud Account
  * Used to provision VMs to mimic end user location.

### Setup

#### Create a VM in Southeast Asia

We'll run the client in a GCP VM in `asia-south2` to mimic our end user as much
as possible.

Note that we get a Standard network tier instance, an end-user laptop in that
region will have even worse latency.

```bash
export GCP_PROJECT=staging-469409
export VM_NAME=india-vm-1
export ZONE=asia-south2-c
```

```bash
# Creates a 4 vCPU, 16GB memory instance in asia-south2-c with public IP.
gcloud compute instances create ${VM_NAME} \
    --project=${GCP_PROJECT} \
    --zone=${ZONE} \
    --machine-type=e2-standard-4 \
    --network-interface=network-tier=STANDARD,stack-type=IPV4_ONLY,subnet=default \
    --metadata=enable-oslogin=true \
    --maintenance-policy=MIGRATE \
    --provisioning-model=STANDARD \
    --service-account=1054865874604-compute@developer.gserviceaccount.com \
    --scopes=https://www.googleapis.com/auth/devstorage.read_only,https://www.googleapis.com/auth/logging.write,https://www.googleapis.com/auth/monitoring.write,https://www.googleapis.com/auth/service.management.readonly,https://www.googleapis.com/auth/servicecontrol,https://www.googleapis.com/auth/trace.append \
    --create-disk=auto-delete=yes,boot=yes,device-name=india-vm,image=projects/debian-cloud/global/images/debian-12-bookworm-v20251209,mode=rw,size=10,type=pd-balanced \
    --no-shielded-secure-boot \
    --shielded-vtpm \
    --shielded-integrity-monitoring \
    --labels=goog-ec-src=vm_add-gcloud \
    --reservation-affinity=any
```

SSH into the instance.

```bash
gcloud compute ssh --zone "${ZONE}" "${VM_NAME}" --project "${GCP_PROJECT}"
```

Install NodeJS 24.

```bash
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt install -y git unzip nodejs
```

Install Android Platform Tools for `adb`.

```bash
curl -Lo platform-tools-latest-linux.zip https://dl.google.com/android/repository/platform-tools-latest-linux.zip
unzip platform-tools-latest-linux.zip
export PATH=$PATH:$(pwd)/platform-tools
which adb
```

#### Prepare the repo

Clone this repository and install dependencies.

```bash
git clone https://github.com/limrun-inc/android-chrome-benchmark.git
cd android-chrome-benchmark
npm install
```

Prepare an API key from [Limrun Console](https://console.limrun.com). You'll get 2 hours
of free usage by default. Ping at muvaf(at)limrun.com for more.

```bash
export LIM_API_KEY=lim_....
```

### Run the tests

#### No Sandbox

Run the non-sandbox test, e.g. set up an ADB tunnel for Playwright to talk to the Android
instance and run as usual where the Android-Playwright server is running locally.

The CDP commands go from `asia-south2-c` VM to our `eu-north1` region in this case.

```bash
# Explicitly set region to prevent proximity-based selection.
export LIMRUN_REGION=eu-north1
npm run non-sandbox
```

`cdp.screenshot` time is about `2.8s`
`cdp.commands` time is about `29.2s`

#### Android-Playwright Server in Lim Sandbox

Run the lim-sandbox test where we enable Android-Playwright server sandbox in our
request to Limrun API and let Playwright code connect to that server directly. The
same ADB tunnel is set up at Limrun infrastructure so this test doesn't need to set that
up.

The CDP communication happens in-cluster at Limrun infrastructure, running on bare metal
servers.

```bash
# Explicitly set region to prevent proximity-based selection.
export LIMRUN_REGION=eu-north1
npm run lim-sandbox
```

`cdp.screenshot` time is about `1.0s`
`cdp.commands` time is about `5.9s`

### Results

Our goal was to test for a specific scenario where the client is in India and connected
to our Android from their laptop where they run Playwright tests compared to us running
Playwright's Android server close to Android and we're clearly seeing a **gain about ~5x**
in total time for CDP-based actions.

The screenshot is explicitly included to see latency effect of a singular connection and
it being not as dramatically faster shows that the culprit is mostly CDP being a very
chatty protocol, requiring being close to the target browser.

For clients in `asia-south1-c`, Limrun sandbox runs **5x faster compared to no sandbox** and
about **2x faster compared to Daytona sandbox in EU**.

| Setup           | Client Region     | Android Region                 |Screenshot  | CDP Commands |
| --------------- | ----------------- | ------------------------------ | ---------- | ------------ |
| Limrun Sandbox (0.5 CPU, 512MB)  | GCP asia-south1-c | Limrun eu-north1               | 1.0s       | 5.9s         |
| Daytona Sandbox (1cpu, 1GB) | GCP asia-south1-c | Daytona EU -> Limrun eu-north1 | 1.7s       | 10.1         |
| No Sandbox      | GCP asia-south1-c | Limrun eu-north1               | 2.8s       | 29.2s        |

For clients in the same region as Android, Limrun sandbox is **3x faster than no sandbox** and
**4x faster than Daytona sandbox in EU**.

| Setup           | Client Region     | Android Region                 |Screenshot  | CDP Commands |
| --------------- | ----------------- | ------------------------------ | ---------- | ------------ |
| Limrun Sandbox (0.5 CPU, 512MB)  | GCP europe-north1 | Limrun eu-north1               | 202.9ms    | 1.9s         |
| No Sandbox      | GCP europe-north1 | Limrun eu-north1               | 546.2ms    | 5.8s         |
| Daytona Sandbox (1cpu, 1GB) | GCP europe-north1 | Daytona EU -> Limrun eu-north1 | 1.9s       | 10.1s         |


#### External Sandbox Setup

This section describes running the tests with external sandbox providers. Note that this
wasn't an option for us when we performed this work and still isn't, but there was a thread
in X, so here we go.

This image connects to Android instance and spins up Android-Plawyright server similar to
what we're doing in our Limrun sandbox.

```bash
# Make sure it targets linux/amd64
docker build --platform=linux/amd64 . -t ghcr.io/limrun-inc/android-chrome-benchmark:v0.1.0 --push
```

You'll need Daytona API key.
```bash
export DAYTONA_API_KEY=dtn_...
```

This will create a Daytona sandbox and start the Android-Playwright server, wait for it to be ready
and connect to execute the steps.
```bash
npm run daytona-sandbox
```
