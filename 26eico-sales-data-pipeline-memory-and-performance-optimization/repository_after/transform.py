import pandas as pd
import numpy as np

def transform_data(df: pd.DataFrame) -> pd.DataFrame:
    """
    Transform data using vectorized operations.
    """
    # Create a copy to avoid SettingWithCopy warnings if a view is passed
    # In chunked processing, this is usually safe, but good practice.
    # However, since we want to be memory efficient, we can modify in place IF we own the data.
    # The ingest layer gives us a fresh DF per chunk, so we can modify in place.
    
    # Vectorized Revenue Calculation
    # quantity * unit_price * (1 - discount_percent / 100)
    # Using numpy values can sometimes be slightly faster, but pandas series ops are fine.
    # Ensure fillna(0) or similar isn't needed - assuming verified input or processed in ingest.
    
    # Pre-calculate 1 - discount/100
    discount_factor = 1.0 - (df['discount_percent'] / 100.0)
    
    # Calculate revenue
    # Store directly in new column
    df['revenue'] = df['quantity'] * df['unit_price'] * discount_factor
    
    # Store Category: str(store_id) + '_' + str(category)
    # Vectorized string concatenation
    # Converting to string if they are not already
    # store_id is int32, category is category (or object)
    # We can use series.astype(str) + ...
    
    df['store_category'] = df['store_id'].astype(str) + '_' + df['category'].astype(str)
    
    # Date Extract
    # df['timestamp'] is datetime64
    df['hour'] = df['timestamp'].dt.hour.astype('int32') # optimization
    df['date'] = df['timestamp'].dt.date
    
    # High Value Flag
    # Vectorized comparison
    df['is_high_value'] = df['revenue'] > 100.0
    
    return df
