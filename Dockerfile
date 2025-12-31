FROM node:24-slim
LABEL org.opencontainers.image.source=https://github.com/limrun-inc/android-chrome-benchmark

RUN apt-get update && \
    apt-get install -y unzip curl && \
    curl -Lo platform-tools-latest-linux.zip https://dl.google.com/android/repository/platform-tools-latest-linux.zip && \
    unzip platform-tools-latest-linux.zip && \
    mv platform-tools/* /usr/local/bin/

COPY . /app

WORKDIR /app
RUN npm install

ENTRYPOINT ["npm", "run", "external-sandbox"]