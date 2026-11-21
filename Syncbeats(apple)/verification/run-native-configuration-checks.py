#!/usr/bin/env python3
"""Verify production defaults, override validation, and Release isolation."""
from pathlib import Path
import os
import subprocess
import tempfile

verification = Path(__file__).resolve().parent
source = verification.parent / "Syncbeats/Syncbeats/Infrastructure/AppConfiguration.swift"
checks = 0
with tempfile.TemporaryDirectory(prefix="syncbeats-config-") as directory:
    for mode, flags in [("Debug", ["-D", "DEBUG"]), ("Release", [])]:
        binary = str(Path(directory) / mode)
        subprocess.run(["swiftc", *flags, str(source), str(verification / "NativeConfigurationVerification.swift"), "-o", binary], check=True)
        production = "https://api.syncbeats.in"
        cases = [(None, production), ("http://localhost:4000", "http://localhost:4000"),
                 ("http://127.0.0.1:4000", "http://127.0.0.1:4000"), ("http://example.com", production),
                 ("https://example.com", "https://example.com"), ("https://user:password@example.com", production)]
        for override, debug_expected in cases:
            env = dict(os.environ)
            env.pop("SYNCBEATS_API_URL", None)
            if override is not None:
                env["SYNCBEATS_API_URL"] = override
            subprocess.run([binary, debug_expected if mode == "Debug" else production], env=env, check=True)
            checks += 1
print(f"{checks} native backend configuration checks passed")
