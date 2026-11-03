"""Summarize retained R2 checks without rewriting or hiding failing results."""
import collections
import json
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "generated-artifacts/r2"


def tests(name):
    path = RAW / f"{name}.json"
    if not path.exists():
        return {"notRun": True}
    data = json.loads(path.read_text())
    failures = []
    for suite in data.get("testResults", []):
        for case in suite.get("assertionResults", []):
            if case["status"] == "failed":
                failures.append({
                    "file": suite["name"].split("/src/")[-1],
                    "name": case["fullName"],
                    "reason": (case.get("failureMessages") or [""])[0].split("\n")[0],
                })
    return {
        "passed": data["numPassedTests"], "failed": data["numFailedTests"],
        "skipped": data["numPendingTests"], "failures": failures,
    }


def type_signatures(name):
    path = RAW / f"{name}.log"
    if not path.exists():
        return collections.Counter()
    return collections.Counter(
        (m[0], m[1]) for m in re.findall(r"^(.*?)\(\d+,\d+\): error (TS\d+):", path.read_text(), re.M)
    )


evidence = {
    "production": "Read-only access denied; no import/publication/mutations. Owner switch gated on approved company import marker.",
    "mockup": "Approved HTML requested but not supplied; no mockup fidelity claimed.",
    "tests": {name: tests(name) for name in [
        "baseline-api", "final-api", "estimates-recheck", "baseline-crm", "final-crm",
    ]},
    "typechecks": {},
}
for package in ["api", "crm"]:
    before = type_signatures(f"baseline-{package}-types")
    after = type_signatures(f"final-{package}-types")
    delta = lambda c: [{"file": k[0], "code": k[1], "count": v} for k, v in sorted(c.items())]
    evidence["typechecks"][package] = {
        "baseline": sum(before.values()), "final": sum(after.values()),
        "added": delta(after - before), "removed": delta(before - after),
    }
for zone in ["utc", "denver"]:
    path = RAW / f"focused-api-{zone}.log"
    text = path.read_text() if path.exists() else ""
    evidence[f"focusedApi-{zone}"] = [
        line.strip() for line in text.splitlines()
        if re.match(r"\s*(Test Files|Tests)\s", line)
    ]
paths = set()
for args in [["diff", "--name-only"], ["ls-files", "--others", "--exclude-standard"]]:
    paths.update(subprocess.check_output(["git", *args], cwd=ROOT, text=True).splitlines())
evidence["changedFiles"] = sorted(paths)
(ROOT / "docs/scheduling/R2-evidence.json").write_text(json.dumps(evidence, indent=2) + "\n")
print(json.dumps({k: v for k, v in evidence.items() if k != "changedFiles"}, indent=2))
