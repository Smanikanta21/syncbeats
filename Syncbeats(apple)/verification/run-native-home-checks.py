from pathlib import Path
import os
import subprocess
import sys

verification = Path(__file__).resolve().parent
sources = verification.parent / "Syncbeats" / "Syncbeats"
products = Path(os.environ.get("SYNCBEATS_BUILD_PRODUCTS", "/tmp/syncbeats-native-home-build/Build/Products/Debug"))
files = sorted(p for p in sources.rglob("*.swift") if p.name != "SyncBeatsApp.swift")
for name in ["NativeHomeVerification", "AlbumArtworkVerification"]:
    binary = Path("/tmp") / ("syncbeats-" + name)
    subprocess.run(["swiftc", "-D", "DEBUG", "-swift-version", "5", "-default-isolation", "MainActor", "-I", str(products),
                    *map(str, files), str(verification / (name + ".swift")),
                    str(products / "SocketIO.o"), str(products / "Starscream.o"), "-lz", "-o", str(binary)], check=True)
    subprocess.run([str(binary), *sys.argv[1:]], check=True)
