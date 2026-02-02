import pandas as pd

def transform_data(df: pd.DataFrame) -> pd.DataFrame:
    """
    Apply transformations to the sales data.
    Calculates revenue, extracts time features, and adds derived columns.
    """
    df = df.copy()
    
    df['revenue'] = df.apply(
        lambda row: row['quantity'] * row['unit_price'] * (1 - row['discount_percent'] / 100),
        axis=1
    )
    
    df['store_category'] = df.apply(
        lambda row: f"{row['store_id']}_{row['category']}",
        axis=1
    )
    
    df['hour'] = df.apply(
        lambda row: row['timestamp'].hour,
        axis=1
    )
    
    df['date'] = df.apply(
        lambda row: row['timestamp'].date(),
        axis=1
    )
    
    df['is_high_value'] = df.apply(
        lambda row: row['revenue'] > 100,
        axis=1
    )
    
    return df
