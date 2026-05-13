#!/usr/bin/env bash
set -euo pipefail

if command -v apt-get >/dev/null 2>&1; then
  export DEBIAN_FRONTEND=noninteractive
  apt-get update
  apt-get install -y --no-install-recommends \
    openjdk-17-jdk \
    g++ \
    python3 \
    golang-go
elif command -v dnf >/dev/null 2>&1; then
  dnf install -y \
    java-17-openjdk-devel \
    gcc-c++ \
    python3 \
    golang
elif command -v yum >/dev/null 2>&1; then
  yum install -y \
    java-17-openjdk-devel \
    gcc-c++ \
    python3 \
    golang
else
  echo "No supported package manager found for judge runtime installation."
  exit 0
fi

echo "Judge runtimes are ready."
