#!/usr/bin/env python3
"""Run the page transition against the native macOS SwiftUI layout engine."""
from pathlib import Path
import subprocess
import tempfile

root = Path(__file__).resolve().parents[1]
with tempfile.TemporaryDirectory(prefix="syncbeats-page-transition-") as temporary:
    binary = Path(temporary) / "page-transition-checks"
    subprocess.run([
        "swiftc", "-swift-version", "5", "-default-isolation", "MainActor", "-parse-as-library",
        str(root / "Syncbeats/Syncbeats/DesignSystem/NativePageTransition.swift"),
        str(root / "verification/NativePageTransitionVerification.swift"),
        "-o", str(binary),
    ], check=True, timeout=60)
    subprocess.run([str(binary)], check=True, timeout=15)
