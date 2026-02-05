import pandas as pd
from collections import defaultdict

# Use classes or global structures to hold state
class AggregationState:
    def __init__(self):
        # Store Category Daily: Group by (date, store_id, category)
        # Value: {revenue_sum, quantity_sum, discount_weighted_sum, transaction_count}
        self.store_cat_stats = defaultdict(lambda: {
            'revenue_sum': 0.0,
            'quantity_sum': 0,
            'discount_qty_sum': 0.0, # sum(discount * quantity)
            'transaction_count': 0
        })
        
        # Hourly Trends: Group by (date, hour, region)
        # Value: {revenue_sum, transaction_count}
        self.hourly_stats = defaultdict(lambda: {
            'revenue_sum': 0.0,
            'transaction_count': 0
        })
        
        # Top Products: Group by product_id
        # Value: {revenue_sum, product_name, category}
        # Note: optimizing product name/category storage - keep first/last seen
        self.product_stats = {} 
        
        # Customer Frequency: Group by customer_id -> count
        # In memory efficient way? customer_id is int32.
        # Python dict overhead might be high for millions of customers.
        # If too large, might need to use an array or bloom filter (approx) or external sort.
        # For 50M rows, assuming 1M customers, a Dict is fine (1M ints -> ~tens of MB)
        self.customer_counts = defaultdict(int)

def update_aggregates(state: AggregationState, df: pd.DataFrame):
    """
    Update running aggregates with a chunk of data.
    """
    # 1. Store Category Daily
    # Group chunk first to reduce iterations
    # Pre-calculate discount * quantity for weighted average
    # We rely on transform to have created 'revenue', 'store_category', 'date', 'hour'
    
    # We need store_id and category separately for grouping
    # But transform creates 'store_category' string.
    # Grouping by multiple columns in pandas is fast.
    
    # Optimizing: Calculate partial sums in the chunk
    df['discount_qty'] = df['discount_percent'] * df['quantity']
    
    store_cat_chunk = df.groupby(['date', 'store_id', 'category'], observed=True).agg({
        'revenue': 'sum',
        'quantity': 'sum',
        'discount_qty': 'sum',
        'transaction_id': 'count'
    }).reset_index()
    
    for row in store_cat_chunk.itertuples(index=False):
        key = (row.date, row.store_id, row.category)
        entry = state.store_cat_stats[key]
        entry['revenue_sum'] += row.revenue
        entry['quantity_sum'] += row.quantity
        entry['discount_qty_sum'] += row.discount_qty
        entry['transaction_count'] += row.transaction_id
        
    # 2. Hourly Trends
    hourly_chunk = df.groupby(['date', 'hour', 'region'], observed=True).agg({
        'revenue': 'sum',
        'transaction_id': 'count'
    }).reset_index()
    
    for row in hourly_chunk.itertuples(index=False):
        key = (row.date, row.hour, row.region)
        entry = state.hourly_stats[key]
        entry['revenue_sum'] += row.revenue
        entry['transaction_count'] += row.transaction_id
        
    # 3. Top Products
    product_chunk = df.groupby('product_id').agg({
        'revenue': 'sum',
        'product_name': 'first',
        'category': 'first'
    }).reset_index()
    
    for row in product_chunk.itertuples(index=False):
        pid = row.product_id
        if pid in state.product_stats:
            state.product_stats[pid]['revenue_sum'] += row.revenue
        else:
            state.product_stats[pid] = {
                'revenue_sum': row.revenue,
                'product_name': row.product_name,
                'category': row.category
            }
            
    # 4. Customer Frequency
    # Using value_counts might be faster
    cust_counts = df['customer_id'].value_counts()
    for cust_id, count in cust_counts.items():
        state.customer_counts[cust_id] += count

def finalize_aggregates(state: AggregationState):
    """
    Convert state to final DataFrames.
    """
    aggregates = {}
    
    # 1. Store Category
    print("Finalizing store-category summary...")
    sc_data = []
    for (date, store_id, category), stats in state.store_cat_stats.items():
        avg_disc = stats['discount_qty_sum'] / stats['quantity_sum'] if stats['quantity_sum'] > 0 else 0
        sc_data.append({
            'date': date,
            'store_id': store_id,
            'category': category,
            'total_revenue': stats['revenue_sum'],
            'units_sold': stats['quantity_sum'],
            'avg_discount': avg_disc,
            'transaction_count': stats['transaction_count']
        })
    aggregates['store_category_daily'] = pd.DataFrame(sc_data)
    
    # 2. Hourly Trends
    print("Finalizing hourly trends...")
    ht_data = []
    for (date, hour, region), stats in state.hourly_stats.items():
        ht_data.append({
            'date': date,
            'hour': hour,
            'region': region,
            'total_revenue': stats['revenue_sum'],
            'transaction_count': stats['transaction_count']
        })
    aggregates['hourly_trends'] = pd.DataFrame(ht_data)
    
    # 3. Top Products
    print("Finalizing top products...")
    prod_data = []
    for pid, stats in state.product_stats.items():
        prod_data.append({
            'product_id': pid,
            'product_name': stats['product_name'],
            'category': stats['category'],
            'revenue': stats['revenue_sum']
        })
    df_prod = pd.DataFrame(prod_data)
    df_prod = df_prod.sort_values('revenue', ascending=False).head(100)
    aggregates['top_products'] = df_prod
    
    # 4. Customer Frequency
    print("Finalizing customer frequency...")
    # Convert customer_id -> count mapping to count of counts (histogram)
    freq_dist = defaultdict(int)
    for count in state.customer_counts.values():
        freq_dist[count] += 1
        
    aggregates['customer_frequency'] = pd.DataFrame([
        {'purchase_count': k, 'customer_count': v}
        for k, v in freq_dist.items()
    ])
    
    return aggregates
