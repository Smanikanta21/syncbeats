#!/bin/zsh
set -euo pipefail
verification_dir="${0:A:h}"
native_sources="$verification_dir/../Syncbeats/Syncbeats"
swiftc -swift-version 5 -default-isolation MainActor \
  "$native_sources/Infrastructure/AppConfiguration.swift" \
  "$native_sources/Infrastructure/AuthAPI.swift" \
  "$native_sources/Infrastructure/NativeDiagnostics.swift" \
  "$native_sources/Infrastructure/GoogleSignIn.swift" \
  "$verification_dir/NativeGoogleVerification.swift" \
  -o /tmp/syncbeats-native-google-verification
/tmp/syncbeats-native-google-verification
