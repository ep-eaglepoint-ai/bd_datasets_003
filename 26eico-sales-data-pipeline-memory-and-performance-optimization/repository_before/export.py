import pandas as pd
from sqlalchemy import create_engine
from typing import Dict

DATABASE_URL = "postgresql://user:password@localhost:5432/sales_db"

def export_to_database(aggregates: Dict[str, pd.DataFrame]) -> None:
    """
    Export all aggregate DataFrames to PostgreSQL tables.
    """
    engine = create_engine(DATABASE_URL)
    
    for table_name, df in aggregates.items():
        print(f"Exporting {table_name}...")
        df.to_sql(
            table_name,
            engine,
            if_exists='replace',
            index=False
        )
        print(f"Exported {len(df)} rows to {table_name}")
    
    engine.dispose()
    print("All exports complete")
