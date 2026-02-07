import pandas as pd

def load_sales_data(filepath: str) -> pd.DataFrame:
    """
    Load the entire sales CSV file into memory.
    """
    df = pd.read_csv(
        filepath,
        parse_dates=['timestamp']
    )
    return df
