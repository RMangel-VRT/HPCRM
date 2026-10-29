#!/usr/bin/env python3
"""Compact P3-5 evidence from ignored Vitest/typecheck outputs; no baseline suppression."""
import collections
import json
import pathlib
import re
import shutil

ROOT = pathlib.Path(__file__).resolve().parents[2]
RAW = ROOT / "generated-artifacts/p3-5"


def suite(name):
    data = json.loads((RAW / f"{name}.json").read_text())
    failures, load_errors = [], []
    files = collections.Counter()
    for result in data["testResults"]:
        file = result["name"].removeprefix(str(ROOT) + "/")
        assertions = result.get("assertionResults", [])
        status = result["status"]
        if assertions and all(a["status"] in ("skipped", "pending", "todo") for a in assertions):
            status = "skipped"
        files[status] += 1
        if result["status"] == "failed" and not assertions:
            load_errors.append({"file": file, "message": result.get("message", "")})
        for assertion in assertions:
            if assertion["status"] == "failed":
                failures.append({
                    "file": file,
                    "test": assertion["fullName"],
                    "reason": "\n".join(assertion.get("failureMessages", [])).split("\n")[0],
                })
    return {
        "passed": data["numPassedTests"], "failed": data["numFailedTests"],
        "skipped": data["numPendingTests"], "files": dict(files),
        "failures": failures, "loadErrors": load_errors,
    }


def identities(failures):
    return {(f["file"], f["test"]) for f in failures}


def differences(before, after):
    old, new = identities(before), identities(after)
    return {
        "added": [{"file": f, "test": t} for f, t in sorted(new - old)],
        "resolved": [{"file": f, "test": t} for f, t in sorted(old - new)],
        "unchanged": len(old & new),
    }


def diagnostics(name):
    errors = collections.Counter()
    for line in (RAW / f"{name}.log").read_text().splitlines():
        # Ignore shifted source coordinates, but retain the complete diagnostic and file.
        match = re.match(r"(.+?)\(\d+,\d+\): error (TS\d+): (.*)", line)
        if match:
            errors[" | ".join(match.groups())] += 1
    return errors


audit = json.loads((ROOT / "docs/display-type-filter-audit.json").read_text())
out = {
    "baselineRevision": "2cc3bf1ac7a2b10db641012ed0609d2673e74e5f",
    "testedRevision": "9c20a3da139706f0747cf2ef4b414fbc8063b0b2",
    "suites": {}, "types": {},
}
for package in ("api", "crm"):
    before, final = suite(f"baseline-{package}"), suite(f"final-{package}")
    out["suites"][package] = {
        "before": before, "final": final,
        "againstFreshBaseline": differences(before["failures"], final["failures"]),
        "againstDisplayFilterAudit": differences(audit["final"][package]["failures"], final["failures"]),
        "contendedRun": suite(f"contended-{package}"),
    }
    b, f = diagnostics(f"baseline-{package}-types"), diagnostics(f"final-{package}-types")
    out["types"][package] = {
        "baseline": b.total(), "final": f.total(),
        "added": dict(f - b), "removed": dict(b - f),
    }
for tz in ("utc", "denver"):
    out["suites"][f"focused-{tz}"] = suite(f"final-focused-{tz}")

destination = ROOT / "docs/scheduling/P3-5-evidence.json"
destination.write_text(json.dumps(out, indent=2) + "\n")
browser_dir = RAW / "browser"
if (browser_dir / "evidence.json").exists():
    browser = {
        "layoutTestedRevision": "b1b73fd8ef7697196d63cf9cd0d922e3258e9e68",
        "finalPresentationRevision": out["testedRevision"],
        "initialBrowserSnapshot": json.loads((browser_dir / "evidence.json").read_text()),
        "continuationReport": (browser_dir / "report.md").read_text(),
        "contrastProof": "P3-5-contrast.json",
        "interpretation": (
            "The initial snapshot's notRun list is historical. The continuation report "
            "adds the 18-crew stationary-edge, bounded scroll, leaving-pane and post-drop "
            "recovery checks. Final color-only AA verification is in the separate contrast "
            "proof. An unobscured mobile dark screenshot was not retained; dimensions, "
            "theme alpha and no page-level horizontal overflow were measured."
        ),
    }
    (ROOT / "docs/scheduling/P3-5-browser-evidence.json").write_text(json.dumps(browser, indent=2) + "\n")
    shutil.copyfile(browser_dir / "repro.js", ROOT / "docs/scheduling/P3-5-browser-repro.js")
print(destination.relative_to(ROOT))
for key, value in out["suites"].items():
    final = value.get("final", value)
    print(key, f'{final["passed"]} passed / {final["failed"]} failed / {final["skipped"]} skipped')
    if "againstFreshBaseline" in value:
        print("  fresh baseline:", value["againstFreshBaseline"])
        print("  display-filter audit:", value["againstDisplayFilterAudit"])
print("Typecheck:", out["types"])
