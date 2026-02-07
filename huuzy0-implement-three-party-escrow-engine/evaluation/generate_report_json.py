import json
import pathlib
import sys
import xml.etree.ElementTree as ET


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

    tests = None
    failures = None
    errors = None
    parsed_ok = None
    if xml:
        try:
            root = ET.fromstring(xml)

            def to_int(value):
                try:
                    return int(value)
                except Exception:
                    return None
            if root.tag == "testsuite":
                tests = to_int(root.attrib.get("tests"))
                failures = to_int(root.attrib.get("failures"))
                errors = to_int(root.attrib.get("errors"))
            elif root.tag == "testsuites":
                tests = to_int(root.attrib.get("tests"))
                failures = to_int(root.attrib.get("failures"))
                errors = to_int(root.attrib.get("errors"))
                if tests is None or failures is None or errors is None:
                    t = f = e = 0
                    for ts in root.findall("testsuite"):
                        t += to_int(ts.attrib.get("tests")) or 0
                        f += to_int(ts.attrib.get("failures")) or 0
                        e += to_int(ts.attrib.get("errors")) or 0
                    tests, failures, errors = t, f, e

            if tests is not None and failures is not None and errors is not None:
                parsed_ok = (tests > 0 and failures == 0 and errors == 0)
        except Exception:
            parsed_ok = None

    ok = parsed_ok if parsed_ok is not None else (code == 0 and bool(xml))
    normalized_exit_code = 0 if ok else (code if isinstance(code, int) else 1)

    out = {
        "ok": bool(ok),
        "pytest_exit_code": normalized_exit_code,
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
