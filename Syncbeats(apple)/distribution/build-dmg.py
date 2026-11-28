#!/usr/bin/env python3
"""Create the branded installer with real Finder icons and an embedded background."""
from pathlib import Path
import argparse
import importlib.metadata
import os
import subprocess
import sys

DMGBUILD_VERSION = "2.0.0"
distribution = Path(__file__).resolve().parent


def run_builder(app: Path, output: Path, volume: str) -> None:
    import dmgbuild

    dmgbuild.build_dmg(str(output), volume, settings={
        "format": "UDZO",
        "files": [str(app)],
        "symlinks": {"Applications": "/Applications"},
        "background": str(distribution / "dmg-background.png"),
        "window_rect": ((200, 200), (720, 440)),
        "icon_locations": {app.name: (180, 200), "Applications": (540, 200)},
        "icon_size": 96,
        "text_size": 14,
        "default_view": "icon-view",
        "arrange_by": None,
        "show_toolbar": False,
        "show_status_bar": False,
        "show_sidebar": False,
        "show_tab_view": False,
        "include_icon_view_settings": True,
    })


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--app", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--volume", required=True)
    args = parser.parse_args()
    app, output = args.app.resolve(), args.output.resolve()
    if not app.is_dir() or app.suffix != ".app":
        parser.error("--app must point to an existing .app bundle")
    if output.exists():
        parser.error("Output already exists; choose a new filename")
    if not (distribution / "dmg-background.png").is_file():
        parser.error("dmg-background.png is missing from the distribution folder")
    try:
        ready = importlib.metadata.version("dmgbuild") == DMGBUILD_VERSION
    except importlib.metadata.PackageNotFoundError:
        ready = False
    if not ready:
        # Keep dependencies isolated; the usual python3 packaging command still works.
        environment = Path.home() / "Library/Caches/SyncBeats" / f"dmgbuild-{DMGBUILD_VERSION}"
        python = environment / "bin/python"
        if not python.is_file():
            subprocess.run([sys.executable, "-m", "venv", str(environment)], check=True)
        installed = subprocess.run([str(python), "-c",
            f"from importlib.metadata import version; assert version('dmgbuild') == '{DMGBUILD_VERSION}'"],
            capture_output=True)
        if installed.returncode != 0:
            subprocess.run([str(python), "-m", "pip", "install", "--disable-pip-version-check",
                            f"dmgbuild=={DMGBUILD_VERSION}"], check=True)
        os.execv(str(python), [str(python), str(Path(__file__).resolve()), *sys.argv[1:]])
    run_builder(app, output, args.volume)
