from pathlib import Path
import os
import subprocess

verification = Path(__file__).resolve().parent
sources = verification.parent / "Syncbeats" / "Syncbeats"
products = Path(os.environ.get("SYNCBEATS_BUILD_PRODUCTS", "/tmp/syncbeats-personal-team-build/Build/Products/Debug"))
files = [*sorted(p for p in sources.rglob("*.swift") if p.name != "SyncBeatsApp.swift"),
         verification / "RoomFixtures.swift", verification / "RoomStateVerification.swift"]
binary = "/tmp/syncbeats-room-state-verification"
subprocess.run(["swiftc", "-swift-version", "5", "-default-isolation", "MainActor", "-I", str(products),
                *map(str, files), str(products / "SocketIO.o"), str(products / "Starscream.o"), "-lz", "-o", binary], check=True)
subprocess.run([binary], check=True)
