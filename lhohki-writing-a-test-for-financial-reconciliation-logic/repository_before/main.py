from reconcile import process_refunds, check_account_closed

def main():
    # Use the standard floating-point trap case
    initial_balance = 0.3
    refunds = [0.1, 0.1, 0.1]
    
    print("--- Financial Reconciliation Execution ---")
    print(f"Inputs: Initial={initial_balance}, Refunds={refunds}")
    
    final_balance = process_refunds(initial_balance, refunds)
    is_closed = check_account_closed(final_balance)
    
    # Show the 20th decimal place to expose the IEEE 754 precision error
    print(f"Final Balance (Raw): {final_balance:.20f}")
    print(f"check_account_closed Result: {is_closed}")

if __name__ == "__main__":
    main()