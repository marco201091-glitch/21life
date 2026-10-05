"""Run F-Droid's destructive source scanner on a disposable clean build tree."""
import argparse
import logging
import tempfile
from pathlib import Path

from fdroidserver import common, metadata, scanner

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--build-dir", type=Path, required=True)
args = parser.parse_args()
root = args.build_dir.resolve(strict=True)
app = metadata.parse_metadata(root / "fdroid/metadata/com.phyrexianarena.app.yml")
if len(app.Builds) != 1:
    raise SystemExit("Expected exactly one F-Droid build recipe")
build = app.Builds[0]
if set(build.scandelete) != {"node_modules", "expo/node_modules"}:
    raise SystemExit("Dependency binaries must be deleted by the source scanner")
logging.basicConfig(level=logging.INFO)
common.config = {}
common.fill_config_defaults(common.config)
common.config["cachedir_scanner"] = str(Path(tempfile.gettempdir()) / "21life-fdroid-signatures")
common.options = argparse.Namespace(verbose=True, json=False, refresh_scanner=True)
problems = scanner.scan_source(str(root), build)
if problems:
    raise SystemExit(f"F-Droid source scanner found {problems} fatal problems")
remaining = list((root / "expo/node_modules").glob("**/local-maven-repo/**/*.aar"))
if remaining:
    raise SystemExit(f"Prebuilt Expo AARs remain after source scan: {remaining}")
print("F-Droid source scan passed; prebuilt Expo AARs deleted.")
