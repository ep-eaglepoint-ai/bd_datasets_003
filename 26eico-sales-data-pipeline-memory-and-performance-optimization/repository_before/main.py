#!/usr/bin/env python3
"""
Sales Data Pipeline
Processes daily sales transactions and generates aggregate reports.
"""

from ingest import load_sales_data
from transform import transform_data
from aggregate import generate_aggregates
from export import export_to_database

def main():
    print("Starting sales data pipeline...")
    
    print("Loading data...")
    df = load_sales_data("sales_data.csv")
    print(f"Loaded {len(df)} rows")
    
    print("Transforming data...")
    df = transform_data(df)
    print("Transformation complete")
    
    print("Generating aggregates...")
    aggregates = generate_aggregates(df)
    print(f"Generated {len(aggregates)} aggregate reports")
    
    print("Exporting to database...")
    export_to_database(aggregates)
    
    print("Pipeline complete!")

if __name__ == "__main__":
    main()
