from pathlib import Path
import os
import subprocess

verification = Path(__file__).resolve().parent
sources = verification.parent / 'Syncbeats' / 'Syncbeats'
products = Path(os.environ.get('SYNCBEATS_BUILD_PRODUCTS', '/tmp/syncbeats-ui-polish-build/Build/Products/Debug'))
files = sorted(p for p in sources.rglob('*.swift') if p.name != 'SyncBeatsApp.swift')
binary = '/tmp/syncbeats-native-library-checks'
subprocess.run(['swiftc', '-swift-version', '5', '-default-isolation', 'MainActor', '-I', str(products),
                *map(str, files), str(verification / 'NativeLibraryVerification.swift'),
                str(products / 'SocketIO.o'), str(products / 'Starscream.o'), '-lz', '-o', binary], check=True)
subprocess.run([binary], check=True)
