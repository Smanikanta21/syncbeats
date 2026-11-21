from pathlib import Path
import os
import subprocess
import sys

verification = Path(__file__).resolve().parent
sources = verification.parent / 'Syncbeats' / 'Syncbeats'
products = Path(os.environ.get('SYNCBEATS_BUILD_PRODUCTS', '/tmp/syncbeats-artwork-motion-mac/Build/Products/Debug'))
files = sorted(p for p in sources.rglob('*.swift') if p.name != 'SyncBeatsApp.swift')
binary = '/tmp/syncbeats-video-cover-checks'
subprocess.run(['swiftc', '-swift-version', '5', '-default-isolation', 'MainActor', '-parse-as-library',
                '-I', str(products), '-F', str(products / 'PackageFrameworks'), *map(str, files),
                str(verification / 'VideoCoverVerification.swift'), str(products / 'Starscream.o'),
                str(products / 'SocketIO.o'), '-o', binary], check=True)
subprocess.run([binary, *sys.argv[1:]], check=True)
