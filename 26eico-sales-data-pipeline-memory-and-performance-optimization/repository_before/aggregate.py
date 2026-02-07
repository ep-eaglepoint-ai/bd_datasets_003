import pandas as pd
from typing import Dict

def generate_aggregates(df: pd.DataFrame) -> Dict[str, pd.DataFrame]:
    """
    Generate all aggregate reports from the transformed sales data.
    Returns a dictionary of DataFrames for each report type.
    """
    aggregates = {}
    
    df_copy1 = df.copy()
    store_category_daily = df_copy1.groupby(['date', 'store_id', 'category']).agg({
        'revenue': 'sum',
        'quantity': 'sum',
        'discount_percent': 'mean',
        'transaction_id': 'count'
    }).reset_index()
    store_category_daily.columns = [
        'date', 'store_id', 'category', 
        'total_revenue', 'units_sold', 'avg_discount', 'transaction_count'
    ]
    aggregates['store_category_daily'] = store_category_daily
    
    df_copy2 = df.copy()
    hourly_trends = df_copy2.groupby(['date', 'hour', 'region']).agg({
        'revenue': 'sum',
        'transaction_id': 'count'
    }).reset_index()
    hourly_trends.columns = ['date', 'hour', 'region', 'total_revenue', 'transaction_count']
    aggregates['hourly_trends'] = hourly_trends
    
    df_copy3 = df.copy()
    product_revenue = df_copy3.groupby('product_id').agg({
        'revenue': 'sum',
        'product_name': 'first',
        'category': 'first'
    }).reset_index()
    top_products = product_revenue.sort_values('revenue', ascending=False).head(100)
    aggregates['top_products'] = top_products
    
    df_copy4 = df.copy()
    customer_purchases = df_copy4.groupby('customer_id')['transaction_id'].count().reset_index()
    customer_purchases.columns = ['customer_id', 'purchase_count']
    frequency_distribution = customer_purchases['purchase_count'].value_counts().reset_index()
    frequency_distribution.columns = ['purchase_count', 'customer_count']
    frequency_distribution = frequency_distribution.sort_values('purchase_count')
    aggregates['customer_frequency'] = frequency_distribution
    
    return aggregates
