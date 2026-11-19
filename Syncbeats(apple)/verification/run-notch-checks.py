from pathlib import Path
import os
import subprocess
import tempfile

verification = Path(__file__).resolve().parent
sources = verification.parent / 'Syncbeats' / 'Syncbeats'
products = Path(os.environ.get('SYNCBEATS_BUILD_PRODUCTS', '/tmp/syncbeats-macos-ui-build/Build/Products/Debug'))
objects = [products / 'SocketIO.o', products / 'Starscream.o']
if not all(p.exists() for p in objects):
    raise SystemExit('Build the Debug app first, or set SYNCBEATS_BUILD_PRODUCTS.')
files = sorted(p for p in sources.rglob('*.swift') if p.name != 'SyncBeatsApp.swift')
with tempfile.TemporaryDirectory(prefix='syncbeats-notch-verification-') as directory:
    binary = Path(directory) / 'notch-window-checks'
    subprocess.run(['swiftc', '-swift-version', '5', '-default-isolation', 'MainActor', '-I', str(products),
                    *map(str, files), str(verification / 'RoomFixtures.swift'),
                    str(verification / 'NotchWindowVerification.swift'), *map(str, objects), '-lz', '-o', str(binary)], check=True)
    subprocess.run([str(binary)], check=True)
