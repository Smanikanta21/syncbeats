#!/usr/bin/env python3
"""Run against native-audio.sim.yaml. Renders a quiet synthetic test tone."""
import os
from pathlib import Path
import subprocess
root = Path(__file__).resolve().parents[1]
products = Path(os.environ.get('SYNCBEATS_BUILD_PRODUCTS', '/tmp/syncbeats-macos-audio-build/Build/Products/Debug'))
sources = root / 'Syncbeats' / 'Syncbeats'
files = sorted(p for p in sources.rglob('*.swift') if p.name != 'SyncBeatsApp.swift')
binary = '/tmp/syncbeats-native-audio-verification'
subprocess.run(['swiftc', '-swift-version', '5', '-default-isolation', 'MainActor', '-I', str(products),
                *map(str, files), str(root/'verification'/'NativeAudioVerification.swift'),
                str(products/'SocketIO.o'), str(products/'Starscream.o'), '-lz', '-o', binary], check=True)
subprocess.run([binary], check=True)
