#!/usr/bin/env python3
"""Copies the generated button macros (dist/macros/*.js) into simulator.xlsx.

Usage (with the workbook closed in ONLYOFFICE):
    node tools/build-macros.js
    python3 tools/sync-workbook-macros.py

ONLYOFFICE stores macros as JSON in xl/jsaProject.bin. Existing macros are
matched by name and only their code is replaced, so their guid (and the
shapes assigned to them) stay the same. Missing macros are added.
"""

import json
import os
import shutil
import sys
import uuid
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WORKBOOK = os.path.join(ROOT, "simulator.xlsx")
LOCK_FILE = os.path.join(ROOT, ".~lock.simulator.xlsx#")
MACROS_DIR = os.path.join(ROOT, "dist", "macros")
MACRO_PART = "xl/jsaProject.bin"

# Macro name in ONLYOFFICE -> generated file
MACROS = {
    "STEP": "step.js",
    "RUN": "run.js",
    "PAUSE": "pause.js",
    "RESET": "reset.js",
    "LOAD PROGRAM": "load-program.js",
    "RUN_TO_END": "run-to-end.js",
    "LOAD_DEMO": "load-demo.js",
}


def main():
    if os.path.exists(LOCK_FILE) and "--force" not in sys.argv:
        sys.exit("simulator.xlsx seems to be open in ONLYOFFICE (lock file found). "
                 "Close it first, or pass --force if the lock file is stale.")

    with zipfile.ZipFile(WORKBOOK) as zin:
        entries = [(info, zin.read(info.filename)) for info in zin.infolist()]

    names = [info.filename for info, _ in entries]
    if MACRO_PART not in names:
        sys.exit(f"{MACRO_PART} not found: open the workbook once in ONLYOFFICE and create any macro first.")

    project = json.loads(dict((i.filename, d) for i, d in entries)[MACRO_PART].decode("utf-8"))
    macros = project.setdefault("macrosArray", [])
    by_name = {m.get("name"): m for m in macros}

    for name, file in MACROS.items():
        with open(os.path.join(MACROS_DIR, file), encoding="utf-8") as f:
            code = f.read()
        if name in by_name:
            by_name[name]["value"] = code
            print(f"updated {name}")
        else:
            macros.append({"guid": uuid.uuid4().hex, "name": name, "autostart": False, "value": code})
            print(f"added   {name}")

    new_part = json.dumps(project, ensure_ascii=False).encode("utf-8")

    backup = WORKBOOK + ".bak"
    shutil.copyfile(WORKBOOK, backup)
    tmp = WORKBOOK + ".tmp"
    with zipfile.ZipFile(tmp, "w", zipfile.ZIP_DEFLATED) as zout:
        for info, data in entries:
            zout.writestr(info, new_part if info.filename == MACRO_PART else data)
    os.replace(tmp, WORKBOOK)
    print(f"saved {WORKBOOK} (backup: {backup})")


if __name__ == "__main__":
    main()
