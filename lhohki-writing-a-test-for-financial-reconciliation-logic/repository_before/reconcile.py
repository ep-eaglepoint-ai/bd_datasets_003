def process_refunds(balance, refunds):
    for amount in refunds:
        balance -= amount
    return balance

def check_account_closed(balance):
    return balance == 0.0