import os

import pandas as pd
import pytest


def test_main_verifies_reference_checksums(sample_csv_data, tmp_path, monkeypatch):
    """End-to-end-ish: main() should verify checksums when reference exists.

    We patch ingest/transform/aggregate/export to avoid real IO/DB and focus on checksum gate.
    """
    if os.environ.get("TARGET_REPO") != "repository_after":
        pytest.skip("Only for optimized repo")

    # Create a reference checksum file that matches what we'll produce.
    import checksum

    aggregates = {
        "store_category_daily": pd.DataFrame({"x": [1]}),
        "hourly_trends": pd.DataFrame({"x": [1]}),
        "top_products": pd.DataFrame({"x": [1]}),
        "customer_frequency": pd.DataFrame({"x": [1]}),
    }

    ref = checksum.compute_aggregate_checksums(aggregates)
    ref_path = tmp_path / "ref.json"
    checksum.write_checksums(ref, str(ref_path))

    monkeypatch.setenv("REFERENCE_CHECKSUMS", str(ref_path))

    import main

    monkeypatch.setattr(main, "get_csv_info", lambda _: type("X", (), {"total_rows": 1}))
    monkeypatch.setattr(main, "load_sales_data", lambda _: [pd.DataFrame({"a": [1]})])
    monkeypatch.setattr(main, "transform_data", lambda df: df)
    monkeypatch.setattr(main, "update_aggregates", lambda *_: None)
    monkeypatch.setattr(main, "finalize_aggregates", lambda *_: aggregates)
    monkeypatch.setattr(main, "export_to_database", lambda *_: None)
    monkeypatch.setattr(main.os.path, "exists", lambda *_: True)

    # should not raise
    main.main()
