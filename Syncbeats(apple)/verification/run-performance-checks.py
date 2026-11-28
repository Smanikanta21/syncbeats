#!/usr/bin/env python3
"""Benchmark actual native components with optimization enabled on macOS.

First build the Mac Release target, then pass its Build/Products/Release folder:
  python3 run-performance-checks.py --products /tmp/build/Build/Products/Release
This does not launch the app, access accounts, or change room playback.
"""
import argparse
import hashlib
import json
import platform
import subprocess
import tempfile
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--products", required=True, type=Path)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    verification = Path(__file__).resolve().parent
    sources = verification.parent / "Syncbeats" / "Syncbeats"
    files = sorted(p for p in sources.rglob("*.swift") if p.name != "SyncBeatsApp.swift")
    products = args.products.resolve()
    for dependency in ["SocketIO.o", "Starscream.o"]:
        if not (products / dependency).is_file():
            parser.error(f"Missing {products / dependency}; build the macOS Release target first")
    hashes = {str(p.relative_to(sources)): hashlib.sha256(p.read_bytes()).hexdigest() for p in files}
    with tempfile.TemporaryDirectory(prefix="syncbeats-performance-") as temporary:
        binary = str(Path(temporary) / "native-performance")
        subprocess.run([
            "swiftc", "-O", "-whole-module-optimization", "-swift-version", "5",
            "-default-isolation", "MainActor", "-I", str(products),
            *map(str, files), str(verification / "NativePerformanceVerification.swift"),
            str(products / "SocketIO.o"), str(products / "Starscream.o"), "-lz", "-o", binary,
        ], check=True)
        result = json.loads(subprocess.check_output([binary], text=True))
    result["host"] = {"system": platform.system(), "machine": platform.machine(), "macos": platform.mac_ver()[0]}
    if hashes != {str(p.relative_to(sources)): hashlib.sha256(p.read_bytes()).hexdigest() for p in files}:
        raise RuntimeError("Native sources changed during the benchmark; rerun on a stable snapshot")
    result["source_sha256"] = hashes
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(result, indent=2) + "\n")
    for item in result["results"]:
        print(f'{item["operation"]}: median {item["median_ms"]:.3f} ms, p95 {item["p95_ms"]:.3f} ms')
    if args.output:
        print(f"Results: {args.output}")


if __name__ == "__main__":
    main()
