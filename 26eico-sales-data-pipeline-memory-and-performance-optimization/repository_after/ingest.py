import pandas as pd
import numpy as np

# Column types for memory optimization
DTYPES = {
    'transaction_id': 'int32',
    'store_id': 'int32',
    'product_id': 'int32',
    'category': 'category',
    'quantity': 'int32',
    'unit_price': 'float64',
    'discount_percent': 'float64',
    'customer_id': 'int32',
    'payment_method': 'category',
    'region': 'category'
}

CHUNK_SIZE = 500_000

def load_sales_data(filepath):
    """
    Load sales data from CSV in chunks.
    Returns a generator of DataFrames.
    """
    # C engine doesn't support callable for on_bad_lines efficiently.
    # We prioritize performance and stability.
    chunk_iter = pd.read_csv(
        filepath,
        chunksize=CHUNK_SIZE,
        dtype=DTYPES,
        parse_dates=['timestamp'],
        on_bad_lines='skip', 
        engine='c'
    )
    
    return chunk_iter
