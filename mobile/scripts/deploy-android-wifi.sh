#!/bin/sh
# Build (optional) + install the Orca mobile APK to the paired device over ADB
# Wi-Fi using a STABLE endpoint, so the wireless-debugging port no longer has to
# be re-entered on every reconnect.
#
# How the stable endpoint works: the device's adbd is switched to a fixed TCP
# port with `adb tcpip 5555` (done once over any live connection). Combined with
# the phone's Tailscale IP (100.x, stable across networks) this gives a durable
# `adb connect` target that survives disconnects.
#
# If the phone REBOOTS, adbd reverts to the rotating wireless-debugging port.
# Re-pair once:  adb connect <ip>:<rotating-port>  &&  adb -s <ip>:<rotating-port> tcpip 5555
# then this script works again on :5555.
#
# Usage:
#   mobile/scripts/deploy-android-wifi.sh            # install the existing release APK
#   mobile/scripts/deploy-android-wifi.sh --build    # build the arm64 release APK first
set -e

DEVICE="${ORCA_ADB_DEVICE:-100.96.156.40:5555}"
PACKAGE="com.stably.orca.mobile"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APK="$ROOT/android/app/build/outputs/apk/release/app-release.apk"

if [ "$1" = "--build" ]; then
  ANDROID_HOME="${ANDROID_HOME:-/opt/homebrew/share/android-commandlinetools}"
  export ANDROID_HOME
  export PATH="$PATH:$ANDROID_HOME/platform-tools"
  (cd "$ROOT/android" && ./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a --no-daemon)
fi

adb connect "$DEVICE"
if ! adb -s "$DEVICE" get-state 2>/dev/null | grep -q device; then
  echo "Device $DEVICE offline. If the phone rebooted, re-pair on its current"
  echo "wireless-debugging port, then: adb -s <ip>:<port> tcpip 5555" >&2
  exit 1
fi
adb -s "$DEVICE" install -r "$APK"
adb -s "$DEVICE" shell monkey -p "$PACKAGE" -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1 || true
echo "Deployed to $DEVICE"
