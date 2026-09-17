#!/usr/bin/env python3
"""
Manual two-way tracker sync helper.

Usage:
  python3 scripts/cron_jobs/sync_tracker_blob_local.py pull --excel "LLM Models Tracker.xlsx"
  python3 scripts/cron_jobs/sync_tracker_blob_local.py push --excel "LLM Models Tracker.xlsx"
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
from pathlib import Path


def run(cmd: list[str]) -> None:
    p = subprocess.run(cmd, capture_output=True, text=True)
    if p.returncode != 0:
        raise RuntimeError(f"Command failed: {' '.join(cmd)}\nSTDOUT:\n{p.stdout}\nSTDERR:\n{p.stderr}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("action", choices=["pull", "push"])
    parser.add_argument("--excel", default="LLM Models Tracker.xlsx")
    parser.add_argument("--storage-account", default="arkag0807050122")
    parser.add_argument("--container", default="llm-tracker")
    parser.add_argument("--blob-name", default="LLM Models Tracker.xlsx")
    args = parser.parse_args()

    excel_path = Path(args.excel).expanduser().resolve()
    if args.action == "push" and not excel_path.exists():
        raise SystemExit(f"Local excel not found for push: {excel_path}")

    storage_key = (os.getenv("AZURE_STORAGE_KEY") or "").strip()
    auth_args = ["--account-key", storage_key] if storage_key else ["--auth-mode", "login"]

    if args.action == "pull":
        run(
            [
                "az",
                "storage",
                "blob",
                "download",
                "--account-name",
                args.storage_account,
                "--container-name",
                args.container,
                "--name",
                args.blob_name,
                "--file",
                str(excel_path),
                *auth_args,
                "--overwrite",
                "true",
            ]
        )
    else:
        run(
            [
                "az",
                "storage",
                "blob",
                "upload",
                "--account-name",
                args.storage_account,
                "--container-name",
                args.container,
                "--name",
                args.blob_name,
                "--file",
                str(excel_path),
                *auth_args,
                "--overwrite",
                "true",
            ]
        )

    print(
        json.dumps(
            {
                "ok": True,
                "action": args.action,
                "excel": str(excel_path),
                "storage_account": args.storage_account,
                "container": args.container,
                "blob_name": args.blob_name,
            },
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
