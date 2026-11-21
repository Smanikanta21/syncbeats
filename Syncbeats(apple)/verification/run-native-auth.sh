#!/bin/zsh
set -eu
verification_dir="${0:A:h}"
native_sources="$verification_dir/../Syncbeats/Syncbeats"
swiftc -swift-version 5 -default-isolation MainActor \
  "$native_sources/Infrastructure/AppConfiguration.swift" \
  "$native_sources/Infrastructure/AuthAPI.swift" \
  "$native_sources/Infrastructure/SessionStore.swift" \
  "$native_sources/Infrastructure/GoogleSignIn.swift" \
  "$native_sources/Infrastructure/NativeDiagnostics.swift" \
  "$native_sources/App/AppModel.swift" \
  "$verification_dir/NativeAuthVerification.swift" \
  -o /tmp/syncbeats-native-auth-verification
/tmp/syncbeats-native-auth-verification
