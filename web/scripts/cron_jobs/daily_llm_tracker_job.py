#!/usr/bin/env python3
"""
Daily orchestrator:
1) Sync tracker models with Azure Foundry (append/prune)
2) Fetch prices for newly appended rows only
3) Sync ArkAgentic pricing schema from tracker
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path


def run_py(script: Path, args: list[str]) -> dict:
    cmd = [sys.executable, str(script)] + args
    p = subprocess.run(cmd, capture_output=True, text=True)
    if p.returncode != 0:
        raise RuntimeError(
            f"{script.name} failed (exit={p.returncode})\nSTDOUT:\n{p.stdout}\nSTDERR:\n{p.stderr}"
        )
    try:
        return json.loads(p.stdout)
    except Exception as e:
        raise RuntimeError(f"{script.name} returned non-JSON output: {e}\nOutput:\n{p.stdout}") from e


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--excel", default="LLM Models Tracker.xlsx")
    p.add_argument("--sheet", default="pricing_worksheet")
    p.add_argument("--resource-group", default="AI-Resources-RG")
    p.add_argument("--account", default="ArkAgentic")
    p.add_argument("--provider", default="azure_openai")
    p.add_argument("--notify-email", default="charles.zhang@arkagentic.com")
    p.add_argument("--dry-run", action="store_true")
    p.add_argument("--apply", action="store_true")
    p.add_argument("--no-auto-login", action="store_true")
    p.add_argument("--include-nonrunning", action="store_true")
    p.add_argument("--no-email", action="store_true")
    args = p.parse_args()

    if not args.dry_run and not args.apply:
        raise SystemExit("Specify either --dry-run or --apply")

    base_dir = Path(__file__).resolve().parent
    sync_script = base_dir / "sync_llm_models_tracker.py"
    fetch_script = base_dir / "fetch_foundry_prices_to_tracker.py"
    ark_script = base_dir / "sync_arkagentic_pricing_from_tracker.py"

    mode_flag = "--dry-run" if args.dry_run else "--apply"

    sync_args = [
        "--excel", args.excel,
        "--sheet", args.sheet,
        "--resource-group", args.resource_group,
        "--account", args.account,
        "--provider", args.provider,
        "--prune-missing",
    ]
    if args.dry_run:
        sync_args.append("--dry-run")
    if args.no_auto_login:
        sync_args.append("--no-auto-login")
    if args.include_nonrunning:
        sync_args.append("--include-nonrunning")

    fetch_args = [
        "--excel", args.excel,
        "--sheet", args.sheet,
        "--notify-email", args.notify_email,
        mode_flag,
    ]
    if args.no_email:
        fetch_args.append("--no-email")

    ark_args = [
        "--excel", args.excel,
        "--sheet", args.sheet,
        mode_flag,
    ]

    sync_result = run_py(sync_script, sync_args)
    fetch_result = run_py(fetch_script, fetch_args)
    ark_result = run_py(ark_script, ark_args)

    print(json.dumps({
        "ok": True,
        "mode": "dry-run" if args.dry_run else "apply",
        "steps": {
            "sync_llm_models_tracker": sync_result,
            "fetch_foundry_prices_to_tracker": fetch_result,
            "sync_arkagentic_pricing_from_tracker": ark_result,
        },
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
