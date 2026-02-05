import pandas as pd
from sqlalchemy import create_engine
import os

DATABASE_URL = "postgresql://user:password@localhost:5432/sales_db"

def export_to_database(aggregates):
    """
    Export aggregated DataFrames to PostgreSQL.
    Uses chunked inserts and ensures connection limit compliance.
    """
    # Create engine with connection pool limits (Req 10)
    # limit=10. internal default is often 5, overflow 10.
    # explicit pool_size=5, max_overflow=5 ensures sum <= 10.
    engine = create_engine(
        DATABASE_URL,
        pool_size=5,
        max_overflow=5
    )
    
    # Use method='multi' for faster batch inserts
    # chunksize depends on column count and postgres limits (params < 65535)
    # usually 1000-5000 is good for reasonable row widths.
    EXPORT_CHUNK_SIZE = 5000 
    
    with engine.begin() as conn:
        for table_name, df in aggregates.items():
            print(f"Exporting {table_name} ({len(df)} rows)...")

            df.to_sql(
                table_name,
                con=conn,
                if_exists='replace',
                index=False,
                method='multi',
                chunksize=EXPORT_CHUNK_SIZE,
            )

            print(f"  Exported {table_name}")
    
    print("All exports complete")
