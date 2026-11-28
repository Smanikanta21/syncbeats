#!/usr/bin/env python3
"""Run with the existing native-audio Postman simulation on port 4189."""
from pathlib import Path
import os
import subprocess

verification = Path(__file__).resolve().parent
sources = verification.parent / 'Syncbeats' / 'Syncbeats'
products = Path(os.environ.get('SYNCBEATS_BUILD_PRODUCTS', '/tmp/syncbeats-performance-2026-11-22/build-macos/Build/Products/Release'))
files = sorted(p for p in sources.rglob('*.swift') if p.name != 'SyncBeatsApp.swift')
binary = '/tmp/syncbeats-native-hybrid-verification'
subprocess.run(['swiftc', '-swift-version', '5', '-default-isolation', 'MainActor', '-I', str(products),
                *map(str, files), str(verification/'NativeHybridVerification.swift'),
                str(products/'SocketIO.o'), str(products/'Starscream.o'), '-lz', '-o', binary], check=True)
subprocess.run([binary], check=True)
