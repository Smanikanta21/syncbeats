#!/usr/bin/env python3
"""Build and package the no-Developer-ID Mac beta. Never uploads artifacts."""
from pathlib import Path
import argparse
import hashlib
import json
import os
import plistlib
import shutil
import subprocess
import tempfile

root = Path(__file__).resolve().parents[2]
distribution = Path(__file__).resolve().parent
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--build-number", default="2")
parser.add_argument("--beta", default="1")
args = parser.parse_args()
if not args.build_number.isdecimal() or not args.beta.isdecimal():
    parser.error("Build number and beta must be positive integers")
if min(int(args.build_number), int(args.beta)) < 1:
    parser.error("Build number and beta must be positive integers")
label = f"SyncBeats-1.0-beta.{args.beta}-macOS-arm64"
output = root / "releases/macos" / f"1.0-beta.{args.beta}"
if output.exists():
    raise SystemExit(f"Output already exists; choose a new beta number: {output}")
output.mkdir(parents=True)
build = output / "build"
log = output / "build.log"
with log.open("w") as stream:
    subprocess.run(["xcodebuild", "-project", str(root / "Syncbeats(apple)/Syncbeats/Syncbeats.xcodeproj"),
                    "-scheme", "Syncbeats", "-configuration", "Release", "-destination", "platform=macOS",
                    "-derivedDataPath", str(build), "CODE_SIGNING_ALLOWED=NO", "ARCHS=arm64", "ONLY_ACTIVE_ARCH=YES",
                    "SWIFT_ACTIVE_COMPILATION_CONDITIONS=", "CODE_SIGN_ENTITLEMENTS=", "MARKETING_VERSION=1.0",
                    f"CURRENT_PROJECT_VERSION={args.build_number}", "build"], stdout=stream, stderr=subprocess.STDOUT, check=True)
source = build / "Build/Products/Release/Syncbeats.app"
with (source / "Contents/Info.plist").open("rb") as stream:
    info = plistlib.load(stream)
minimum = info["LSMinimumSystemVersion"]
readme = f"""SyncBeats 1.0 beta {args.beta} (build {args.build_number})

Requirements
- Apple Silicon Mac, macOS {minimum} or later. Intel Macs are not supported by this download.
- Internet access. This beta connects to the live service at https://api.syncbeats.in.
- Use a production SyncBeats account. A previous localhost login will not transfer.

Install
DMG: open the disk image and drag Syncbeats.app onto Applications. Eject the image.
ZIP: extract the ZIP and move Syncbeats.app into Applications.
Launch Syncbeats from Applications.

This is an ad-hoc-signed beta, without an Apple Developer ID or notarization.
macOS may block it. If you trust this download, attempt to open the app, then use
System Settings > Privacy & Security > Open Anyway if macOS offers that option.
Do not disable Gatekeeper or remove quarantine using Terminal. If macOS reports
malware, an altered bundle, or provides no approval option, stop and report it.
The checksum file beside the downloads lets you verify the file is unchanged.

Known beta limitations
- Email sign-in and registration remain supported. Google sign-in uses a browser
  callback and requires the native Google migration and updated server/website deployment.
- Apple Music authorization/import, cloud/LAN recovery, and clean-Mac compatibility
  still need beta validation. Production service behavior can differ from local source.
- macOS will request only the permissions a feature needs. Apple Music permissions
  do not imply that all subscription tracks can be played directly.
- Updates are manual: download the next beta and replace the app in Applications.
- This is a beta on the production service: rooms and account changes are real.

What to test
Sign in; create/join a test room from a Mac and browser or another Mac; queue music;
play/pause/seek/next; reconnect and sleep/wake; artwork and lyrics; full-screen
entry/exit; notch hover, opening, playback controls and multiple displays.

Feedback
Use the channel where you received the beta. Include the version/build, macOS
version, Mac chip, steps, and a screenshot or short recording. Never send passwords,
session tokens, or private account data. Describe crashes and audio sync problems.

Uninstall
Quit Syncbeats and move the application to Trash. Your cloud account and rooms are
not deleted by uninstalling. Signing and sandbox limitations may vary between Macs.
"""
(output / "INSTALL.txt").write_text(readme)
with tempfile.TemporaryDirectory(prefix="syncbeats-beta-staging-") as temporary:
    staging = Path(temporary)
    app = staging / "Syncbeats.app"
    subprocess.run(["ditto", "--norsrc", "--noextattr", str(source), str(app)], check=True)
    os.symlink("/Applications", staging / "Applications")
    (staging / "INSTALL.txt").write_text(readme)
    forbidden = {".env", ".git", "node_modules", "build", "DerivedData"}
    for path in app.rglob("*"):
        if path.name in forbidden or path.suffix in {".swift", ".xcconfig", ".xcodeproj", ".p12", ".mobileprovision"}:
            raise SystemExit(f"Unexpected source/credential/build file: {path}")
    executable = app / "Contents/MacOS" / info["CFBundleExecutable"]
    subprocess.run(["codesign", "--force", "--sign", "-", "--timestamp=none", "--options", "runtime",
                    "--entitlements", str(distribution / "unsigned-beta.entitlements"), str(app)], check=True)
    subprocess.run(["codesign", "--verify", "--deep", "--strict", "--verbose=2", str(app)], check=True)
    entitlements = subprocess.run(["codesign", "-d", "--entitlements", ":-", str(app)], capture_output=True, check=True)
    parsed = plistlib.loads(entitlements.stdout)
    if "com.apple.developer.associated-domains" in parsed or "com.apple.security.get-task-allow" in parsed:
        raise SystemExit("Beta contains developer-team/debug-only entitlements")
    if not parsed.get("com.apple.security.network.client") or not parsed.get("com.apple.security.app-sandbox"):
        raise SystemExit("Required sandbox/network entitlements missing")
    subprocess.run(["hdiutil", "create", "-volname", f"SyncBeats Beta {args.beta}", "-srcfolder", str(staging),
                    "-format", "UDZO", "-fs", "HFS+", str(output / f"{label}.dmg")], check=True)
    subprocess.run(["hdiutil", "verify", str(output / f"{label}.dmg")], check=True)
    (staging / "Applications").unlink()
    subprocess.run(["ditto", "-c", "-k", "--norsrc", "--noextattr", str(staging), str(output / f"{label}.zip")], check=True)
    extracted = staging / "verified-zip"
    subprocess.run(["ditto", "-x", "-k", str(output / f"{label}.zip"), str(extracted)], check=True)
    subprocess.run(["codesign", "--verify", "--deep", "--strict", str(extracted / "Syncbeats.app")], check=True)
manifest = {"version": "1.0", "beta": int(args.beta), "build": args.build_number,
            "architecture": "arm64", "minimumMacOS": minimum, "backend": "https://api.syncbeats.in",
            "signing": "ad-hoc; not Developer ID", "notarized": False, "googleSignIn": True, "googleSignInRequires": "native Google handoff server and website deployed", "files": {}}
checksums = []
for artifact in [output / f"{label}.dmg", output / f"{label}.zip"]:
    with artifact.open("rb") as stream:
        digest = hashlib.file_digest(stream, "sha256").hexdigest()
    manifest["files"][artifact.name] = {"bytes": artifact.stat().st_size, "sha256": digest}
    checksums.append(f"{digest}  {artifact.name}")
(output / "SHA256SUMS.txt").write_text("\n".join(checksums) + "\n")
(output / "release-manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
print(f"Packaged beta: {output}")
