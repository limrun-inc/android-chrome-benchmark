# Limrun Android-Playwright Sandbox Benchmark

This repo was internally used to measure the high level benefits of running
Android-Playwright server close to our Android instances for end users in
South Asia.

We've seen 5x improvement in latency, attributing it mostly to how Chrome Devtools
Protocol (CDP) is chatty that the impact of latency is multipled and running
Android-Playwright server on bare metal.

Note that we used to have only `eu-north1` and `us-west1` regions at the time,
we now have `as-south1` and it's automatically selected depending where you
run the benchmark so you need to select `us-west1` or `eu-north1` explicitly
while the client is in India/Singapore region to replicate the benchmarks.

In the results section, we have different combinations too but our main goal
was to improve for end users in Southeast Asia region who must run their
automation code locally.

## Pre-requisites

* Limrun account to provision Android instance.
* Google Cloud Account
  * Used to provision an environment in Southeast Asia region to mimic the end
    users there.

### Setup

#### Create a VM in Southeast Asia

We'll run the client in a GCP VM in `asia-south2` to mimic our end user as much
as possible.

Note that we get a Standard network tier instance, an end-user laptop in that
region will have even worse latency.

```bash
# Creates a 4 vCPU, 16GB memory instance in asia-south2-c with public IP.
GCP_PROJECT=staging-469409
gcloud compute instances create india-vm \
    --project=${GCP_PROJECT} \
    --zone=asia-south2-c \
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
GCP_PROJECT=staging-469409
gcloud compute ssh --zone "asia-south2-c" "india-vm" --project "${GCP_PROJECT}"
```

Install NodeJS 24.

```bash
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt install nodejs -y
```

#### Prepare the repo

Clone this repository and install dependencies.

```bash
git clone https://github.com/limrun-inc/android-chrome-benchmark.git
cd android-chrome-benchmark
npm install
```

Prepare an API key from [Limrun Console](https://console.limrun.com)

```bash
export LIM_API_KEY=lim_....
```

### Run the tests

#### No Sandbox

Run the non-sandbox test, e.g. set up an ADB tunnel for Playwright to talk to the Android
instance and run as usual where the Android-Playwright server is running locally.

The CDP commands go from `asia-south2-c` VM to our `eu-north1` region in this case.

```bash
npm run non-sandbox
```

You'll see that total `cdp.commands` time is about X.

#### Android-Playwright Server in Lim Sandbox

Run the lim-sandbox test where we enable Android-Playwright server sandbox in our
request to Limrun API and let Playwright code connect to that server directly. The
ADB tunnel is set up at Limrun infrastructure so this test doesn't need to set that
up.

The CDP communication happens in-cluster at Limrun infrastructure, running on bare metal
servers.

```bash
npm run lim-sandbox
```

You'll see that total `cdp.commands` time is about X.

### Results