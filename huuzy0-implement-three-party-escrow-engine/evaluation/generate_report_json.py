import json
import pathlib
import sys


def truncate(text: str, limit: int) -> str:
    if text is None:
        return ""
    if len(text) <= limit:
        return text
    return text[:limit]


def main() -> int:
    try:
        code = int(sys.argv[1]) if len(sys.argv) > 1 else 1
    except Exception:
        code = 1

    xml_path = pathlib.Path("/app/evaluation/report.xml")
    json_path = pathlib.Path("/app/evaluation/report.json")

    xml = ""
    if xml_path.exists():
        try:
            xml = xml_path.read_text(encoding="utf-8", errors="replace")
        except Exception:
            xml = ""

    out = {
        "ok": (code == 0 and bool(xml)),
        "pytest_exit_code": code,
        "report_url": ("evaluation/report.xml" if xml else "No report available"),
        "report_content": (truncate(xml, 200_000) if xml else "Error: report.xml not found"),
    }

    try:
        json_path.parent.mkdir(parents=True, exist_ok=True)
        json_path.write_text(json.dumps(out, indent=2), encoding="utf-8")
    except Exception:
        pass

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
