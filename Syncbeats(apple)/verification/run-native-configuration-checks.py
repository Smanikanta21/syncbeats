#!/usr/bin/env python3
"""Verify development defaults, override validation, and Release isolation."""
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
        defaults = ("https://api.syncbeats.in", "https://syncbeats.in")
        loopback = ("http://localhost:4000", "http://localhost:3000")
        numeric_loopback = ("http://127.0.0.1:4000", "http://127.0.0.1:3000")
        preprod = ("https://dev-api.syncbeats.in", "https://dev.syncbeats.in")
        variables = ("SYNCBEATS_API_URL", "SYNCBEATS_WEBSITE_URL")
        cases = [((None, None), defaults), (loopback, loopback), (numeric_loopback, numeric_loopback),
                 (preprod, preprod), (("http://example.com", "http://example.com"), defaults),
                 (("https://user:password@example.com", "https://user:password@example.com"), defaults),
                 ((loopback[0], None), (loopback[0], defaults[1]))]
        for overrides, debug_expected in cases:
            env = dict(os.environ)
            for variable, override in zip(variables, overrides):
                env.pop(variable, None)
                if override is not None:
                    env[variable] = override
            expected = debug_expected if mode == "Debug" else defaults
            subprocess.run([binary, *expected], env=env, check=True)
            checks += 1
print(f"{checks} native backend configuration checks passed")
