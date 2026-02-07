import pytest
import sys
import os
import pandas as pd
from unittest.mock import patch, MagicMock
from importlib import import_module

# Helper to import modules from repository_after
def get_module(name):
    return import_module(name)

def test_req_7_progress_bar():
    """Req 7: Verify tqdm is used in main pipeline."""
    if os.environ.get('TARGET_REPO') != 'repository_after':
        pytest.skip("UX test for optimized repo only")
        
    # Patch main.tqdm because main.py imports it at top level
    with patch('tqdm.tqdm') as mock_tqdm:
        import main
        with patch('main.tqdm', mock_tqdm):
            with patch('main.get_csv_info') as mock_info, \
                 patch('main.load_sales_data', return_value=[pd.DataFrame({'a': [1]})]), \
                 patch('main.transform_data', return_value=pd.DataFrame({'a': [1]})), \
                 patch('main.update_aggregates'), \
                 patch('main.finalize_aggregates', return_value={}), \
                 patch('main.export_to_database'), \
                 patch('main.os.path.exists', return_value=True):

                mock_info.return_value = type('X', (), {'total_rows': 123})
                main.main()

            assert mock_tqdm.called, "tqdm should be initialized"
            _, kwargs = mock_tqdm.call_args
            assert kwargs.get('total') == 123

def test_req_7_real_file_progress(tmp_path):
    """Req 7: Verify progress bar uses real file size (no mocks)."""
    if os.environ.get('TARGET_REPO') != 'repository_after':
        pytest.skip("UX test for optimized repo only")

    import main
    
    csv_file = tmp_path / "real_progress.csv"
    # Create 4 lines + header = 5 lines total.
    header = "transaction_id,timestamp,store_id,product_id,product_name,category,quantity,unit_price,discount_percent,customer_id,payment_method,region"
    row = "1,2023-01-01 10:00:00,101,501,Prod,Cat,1,10.0,0.0,1,Card,North"
    csv_file.write_text(f"{header}\n{row}\n{row}\n{row}\n{row}\n")
    
    # We want to check that tqdm is initialized with total=4
    with patch('tqdm.tqdm') as mock_tqdm:
        # Patch load_sales_data to avoid actually running the pipeline
        with patch('main.load_sales_data', return_value=[]), \
             patch('main.transform_data'), \
             patch('main.update_aggregates'), \
             patch('main.finalize_aggregates', return_value={}), \
             patch('main.export_to_database'):
             
            # Temporarily set SALES_DATA_CSV
            old_env = os.environ.get("SALES_DATA_CSV")
            os.environ["SALES_DATA_CSV"] = str(csv_file)
            os.environ["SKIP_DB_WRITE"] = "1"
            
            import importlib
            importlib.reload(main)
            
            try:
                # Reload main? No, just call checks
                # get_csv_info inside main() will read the file.
                main.main()
            finally:
                 if old_env:
                     os.environ["SALES_DATA_CSV"] = old_env
                 else:
                     del os.environ["SALES_DATA_CSV"]
                 
                 if "SKIP_DB_WRITE" in os.environ:
                     del os.environ["SKIP_DB_WRITE"]
            
            assert mock_tqdm.called
            _, kwargs = mock_tqdm.call_args
            # File has 4 data rows
            assert kwargs.get('total') == 4

def test_req_8_logging(tmp_path):
    """Req 8: Verify logging of malformed rows."""
    if os.environ.get('TARGET_REPO') != 'repository_after':
        pytest.skip("Logging test for optimized repo only")
        
    logger = get_module('logger')
    
    with patch('logging.Logger.error') as mock_log:
        logger.log_malformed_row(123, "Test Reason", "Raw Data")
        mock_log.assert_called()
        args = mock_log.call_args[0][0]
        assert "Line 123" in args

def test_req_8_log_file_created(tmp_path):
    """Req 8: Verify malformed_rows.log is actually created on disk."""
    if os.environ.get('TARGET_REPO') != 'repository_after':
        pytest.skip("Logging test for optimized repo only")
        
    ingest = get_module('ingest')
    import logging
    
    # We need to configure the logger to write to a temp file, 
    # OR assertions that the production logger writes to FileHandler.
    # The production logger.py likely configures a FileHandler for 'malformed_rows.log'.
    # We should override the filename or CWD to check file creation.
    
    # If logger is already configured, we might not easily switch file path.
    # Let's check where it writes.
    # We will assume it writes to CWD/malformed_rows.log.
    
    import logging
    import importlib
    
    # Reload logger to ensure it binds to the new file location if needed, 
    # but logger.py uses a relative path "malformed_rows.log".
    # In pytest, CWD might be the root or /app.
    # We should ensure we are looking at the right file.
    
    # Force CWD to be tmp_path so the log file is created there (cleaner)
    original_cwd = os.getcwd()
    os.chdir(tmp_path)
    
    try:
        # Reload logger module to re-run setup_logger() in the new CWD
        logger_mod = get_module('logger')
        importlib.reload(logger_mod)
        
        # Trigger a log
        csv_file = tmp_path / "bad.csv"
        # 2 lines: header, then data row with 'invalid' in quantity (int32)
        header = "transaction_id,timestamp,store_id,product_id,product_name,category,quantity,unit_price,discount_percent,customer_id,payment_method,region"
        # 'invalid_qty' is not int -> type error -> should be logged
        row = "1,2023-01-01 10:00:00,101,501,Prod,Cat,invalid_qty,10.0,0.0,1,Card,North"
        csv_file.write_text(f"{header}\n{row}\n")
        
        # Reload ingest to pick up the reloaded logger?
        ingest = get_module('ingest')
        importlib.reload(ingest)

        try:
            list(ingest.load_sales_data(str(csv_file)))
        except Exception:
            pass 
            
        # Flush handlers
        for handler in logger_mod.logger.handlers:
            handler.flush()
            handler.close()
            
        log_file_path = tmp_path / "malformed_rows.log"
        assert log_file_path.exists(), f"Log file not found at {log_file_path}"
        content = log_file_path.read_text()
        # "invalid type" is what we log for coercion failures, "malformed CSV row" is for parser errors
        assert "invalid type" in content or "malformed CSV row" in content
        
    finally:
        os.chdir(original_cwd)


def test_req_10_db_connection_limit():
    """Req 10: Verify PostgreSQL connection pool limits."""
    if os.environ.get('TARGET_REPO') != 'repository_after':
         pytest.skip("DB optimization test for optimized repo only")
         
    export = get_module('export')
    
    # Needs to patch export.create_engine because of 'from sqlalchemy import create_engine'
    with patch.object(export, 'create_engine') as mock_create_engine, \
        patch('pandas.DataFrame.to_sql') as mock_to_sql:
         
         mock_engine = MagicMock()
         mock_create_engine.return_value = mock_engine
         mock_connection = MagicMock()
         mock_engine.connect.return_value.__enter__.return_value = mock_connection
         
         export.export_to_database({'table': pd.DataFrame({'a': [1]})})
         
         assert mock_create_engine.called
         args, kwargs = mock_create_engine.call_args
         assert 'pool_size' in kwargs
         assert 'max_overflow' in kwargs
         assert kwargs['pool_size'] + kwargs['max_overflow'] <= 10

         # Also ensure batching options are used.
         assert mock_to_sql.called
         _, to_sql_kwargs = mock_to_sql.call_args
         assert to_sql_kwargs.get('method') == 'multi'
         assert to_sql_kwargs.get('chunksize')


def test_req_8_malformed_rows_logged_and_skipped(malformed_csv_data, tmp_path):
    """Req 8: malformed/invalid rows get logged with line numbers and are skipped."""
    if os.environ.get('TARGET_REPO') != 'repository_after':
        pytest.skip("Only for optimized repo")

    ingest = get_module('ingest')

    csv_file = tmp_path / "bad_sales.csv"
    # Added a row with 'invalid' in quantity (int32) -> should be logged as type error
    csv_data = malformed_csv_data + "10,2023-01-01 10:00:00,101,501,Prod,Cat,invalid,10.0,0.0,1,Card,North\n"
    csv_file.write_text(csv_data)

    # Capture logger calls
    with patch('logger.logger.error') as mock_err:
        chunks = list(ingest.load_sales_data(str(csv_file)))

    df = pd.concat(chunks) if chunks else pd.DataFrame()

    # Original has 3 data lines after header; 2 are invalid (INVALID_DATE, negative quantity)
    assert len(df) == 1

    assert mock_err.called
    logged = "\n".join(call.args[0] for call in mock_err.call_args_list)
    # Expected invalid lines are line 3 and 4 in file (header=1)
    assert "Line 3" in logged
    assert "Line 4" in logged
    # Line 5 was the type error
    assert "Line 5" in logged
    assert "invalid type" in logged


def test_req_8_structural_malformed_csv_logged(structurally_malformed_csv_data, tmp_path):
    """Req 8: structurally malformed CSV lines (wrong #cols) are logged with correct line number."""
    if os.environ.get('TARGET_REPO') != 'repository_after':
        pytest.skip("Only for optimized repo")

    ingest = get_module('ingest')
    csv_file = tmp_path / "struct_bad.csv"
    csv_file.write_text(structurally_malformed_csv_data)

    with patch('logger.logger.error') as mock_err:
        chunks = list(ingest.load_sales_data(str(csv_file)))

    # We provided 2 valid rows and 1 structurally malformed row
    df = pd.concat(chunks) if chunks else pd.DataFrame()
    assert len(df) == 2

    logged = "\n".join(call.args[0] for call in mock_err.call_args_list)
    # The broken row is the 3rd line in the file (header is line 1)
    assert "Line 3" in logged


def test_req_9_checksums_verified(tmp_path):
    """Req 9: checksums are computed and verified when REFERENCE_CHECKSUMS is set."""
    if os.environ.get('TARGET_REPO') != 'repository_after':
        pytest.skip("Only for optimized repo")

    import checksum
    df = pd.DataFrame({'b': [2, 1], 'a': ["x", "y"]})
    computed = checksum.compute_aggregate_checksums({'t': df})
    ref_path = tmp_path / "ref.json"
    checksum.write_checksums(computed, str(ref_path))

    # should not raise
    checksum.verify_checksums(computed, str(ref_path))

def test_req_12_explicit_gc():
    """Req 12: Verify explicit garbage collection."""
    if os.environ.get('TARGET_REPO') != 'repository_after':
        pytest.skip("GC test for optimized repo only")
        
    with patch('gc.collect') as mock_gc:
        import main
        with patch('main.load_sales_data', return_value=[pd.DataFrame({'a': [1]})]), \
             patch('main.get_csv_info') as mock_info, \
             patch('main.transform_data', return_value=pd.DataFrame({'a': [1]})), \
             patch('main.update_aggregates'), \
             patch('main.finalize_aggregates', return_value={}), \
             patch('main.export_to_database'), \
             patch('main.os.path.exists', return_value=True):
             
             mock_info.return_value = type('X', (), {'total_rows': 100})
             main.main()
             
        assert mock_gc.called

def test_req_9_output_determinism(sample_csv_data, tmp_path):
    """Req 9: Verify identical output (determinism)."""
    ingest = get_module('ingest')
    transform = get_module('transform')
    aggregate = get_module('aggregate')
    
    csv_file = tmp_path / "test_sales.csv"
    csv_file.write_text(sample_csv_data)
    
    if os.environ.get('TARGET_REPO') == 'repository_after':
         chunks = ingest.load_sales_data(str(csv_file))
         state = aggregate.AggregationState()
         for chunk in chunks:
             processed = transform.transform_data(chunk)
             aggregate.update_aggregates(state, processed)
         result = aggregate.finalize_aggregates(state)
    else:
         df = ingest.load_sales_data(str(csv_file))
         df = transform.transform_data(df)
         result = aggregate.generate_aggregates(df)
    
    sc = result['store_category_daily']
    sc2 = sc.copy()
    # store_id is categorical in repository_after; normalize for filtering.
    sc2['store_id'] = sc2['store_id'].astype(str)
    target = sc2[(sc2['store_id']=='101') & (sc2['category'].astype(str)=='Electronics')]['total_revenue'].iloc[0]
    assert target == 275.0
