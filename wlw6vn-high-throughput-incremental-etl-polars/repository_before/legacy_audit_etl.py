# // filename: legacy_audit_etl.py
import pandas as pd
import glob

# filename: legacy_process.py
def run_audit_etl(data_dir):
    # Problem: glob.glob() + pd.concat() will eventually exhaust RAM
    all_files = glob.glob(f"{data_dir}/*.csv")
    
    print("Loading massive dataset...")
    # This line is the primary failure point
    df = pd.concat([pd.read_csv(f) for f in all_files])

    print("Joining with metadata...")
    merchants = pd.read_csv("merchants.csv")
    rates = pd.read_csv("fx_rates.csv")

    # Complex logic: Join + Multi-column calculation
    df = df.merge(merchants, on="merchant_id")
    df = df.merge(rates, on="currency_code")
    
    df['amount_usd'] = df['amount'] * df['conversion_rate']
    
    # Grouping by multiple dimensions
    summary = df.groupby(['region', 'category', 'month']).agg({'amount_usd': 'sum'})
    
    summary.to_csv("audit_summary.csv")

if __name__ == "__main__":
    # run_audit_etl("./raw_transactions")
    pass