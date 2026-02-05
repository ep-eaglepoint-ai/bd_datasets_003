import sys
import pytest
import os
from pathlib import Path

@pytest.fixture
def sample_csv_data():
    return """transaction_id,timestamp,store_id,product_id,product_name,category,quantity,unit_price,discount_percent,customer_id,payment_method,region
1,2023-01-01 10:00:00,101,501,Product A,Electronics,2,100.0,10.0,1001,Credit Card,North
2,2023-01-01 11:30:00,102,502,Product B,Clothing,1,50.0,0.0,1002,Cash,South
3,2023-01-01 12:45:00,101,501,Product A,Electronics,1,100.0,5.0,1003,Debit Card,North
4,2023-01-02 09:15:00,103,503,Product C,Home,3,20.0,0.0,1001,Credit Card,East
"""

@pytest.fixture
def malformed_csv_data():
    return """transaction_id,timestamp,store_id,product_id,product_name,category,quantity,unit_price,discount_percent,customer_id,payment_method,region
1,2023-01-01 10:00:00,101,501,Product A,Electronics,2,100.0,10.0,1001,Credit Card,North
2,INVALID_DATE,102,502,Product B,Clothing,1,50.0,0.0,1002,Cash,South
3,2023-01-01 12:45:00,101,501,Product A,Electronics,-5,100.0,5.0,1003,Debit Card,North
"""

# Add the target repository to sys.path
target_repo = os.environ.get('TARGET_REPO', 'repository_before')
proj_root = Path(__file__).parents[1]
repo_path = proj_root / target_repo

sys.path.insert(0, str(repo_path))

print(f"\nTESTING TARGET: {target_repo} at {repo_path}")
