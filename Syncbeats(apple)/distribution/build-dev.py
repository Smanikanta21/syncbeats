#!/usr/bin/env python3
"""Build locally, then sign with a stable installed development certificate."""
import argparse
from pathlib import Path
import re
import subprocess

parser = argparse.ArgumentParser()
parser.add_argument("--identity", help="Installed codesigning certificate SHA-1; saved for subsequent builds")
parser.add_argument("--derived-data", default="/tmp/syncbeats-native-dev")
args = parser.parse_args()
root = Path(__file__).resolve().parents[2]
setting = Path.home() / "Library/Application Support/SyncBeats/development-signing-identity"
inventory = subprocess.check_output(["security", "find-identity", "-v", "-p", "codesigning"], text=True)
identities = re.findall(r'\b([A-F0-9]{40}) "Apple Development:[^"\n]+"', inventory)
identity = args.identity or (setting.read_text().strip() if setting.exists() else None)
if identity is None and identities:
    identity = identities[0]
if identity not in identities:
    raise SystemExit("No saved Apple Development certificate is available. Install one or pass --identity SHA1 from security find-identity -v -p codesigning.")
setting.parent.mkdir(parents=True, exist_ok=True)
setting.write_text(identity + "\n")
subprocess.run(["xcodebuild", "-project", str(root / "Syncbeats(apple)/Syncbeats/Syncbeats.xcodeproj"),
                "-scheme", "Syncbeats", "-configuration", "Debug", "-destination", "platform=macOS",
                "-derivedDataPath", args.derived_data, "CODE_SIGNING_ALLOWED=NO", "build"], check=True)
app = Path(args.derived_data) / "Build/Products/Debug/Syncbeats.app"
subprocess.run(["codesign", "--force", "--sign", identity, "--identifier", "Syncbeats.Syncbeats", str(app)], check=True)
subprocess.run(["codesign", "--verify", "--strict", str(app)], check=True)
print(f"Signed development app: {app}")
