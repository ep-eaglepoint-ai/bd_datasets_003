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
            with patch('main.load_sales_data', return_value=[pd.DataFrame({'a': [1]})]), \
                 patch('main.transform_data', return_value=pd.DataFrame({'a': [1]})), \
                 patch('main.update_aggregates'), \
                 patch('main.finalize_aggregates', return_value={}), \
                 patch('main.export_to_database'):
                 
                 main.main()
                 
            assert mock_tqdm.called, "tqdm should be initialized"

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

def test_req_12_explicit_gc():
    """Req 12: Verify explicit garbage collection."""
    if os.environ.get('TARGET_REPO') != 'repository_after':
        pytest.skip("GC test for optimized repo only")
        
    with patch('gc.collect') as mock_gc:
        import main
        with patch('main.load_sales_data', return_value=[pd.DataFrame({'a': [1]})]), \
             patch('main.transform_data', return_value=pd.DataFrame({'a': [1]})), \
             patch('main.update_aggregates'), \
             patch('main.finalize_aggregates', return_value={}), \
             patch('main.export_to_database'):
             
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
    target = sc[(sc['store_id']==101) & (sc['category']=='Electronics')]['total_revenue'].iloc[0]
    assert target == 275.0
