# filename: underwriting_engine.py
# Legacy procedural underwriting logic

def underwrite_policy(user_data, policy_type):
    """
    Legacy monolithic function for policy eligibility.
    Needs to be refactored to a modular Rules Engine.
    """
    reasons = []
    
    # Age check
    if user_data['age'] < 18 or user_data['age'] > 75:
        reasons.append("Age outside acceptable range")
        
    # Credit check
    if user_data['credit_score'] < 600:
        reasons.append("Credit score too low")
        
    # Medical History check (Life Insurance only)
    if policy_type == "life":
        if user_data.get('has_chronic_conditions') and not user_data.get('is_smoker'):
            # Complex nested logic example
            if user_data['age'] > 50:
                reasons.append("Medical risk too high for age group")
        elif user_data.get('is_smoker'):
            reasons.append("Smoking status ineligible for life policy")
            
    # Location check
    restricted_zip_codes = ["90210", "10001"]
    if user_data['zip_code'] in restricted_zip_codes:
        reasons.append("Service unavailable in this region")
        
    if not reasons:
        return {"status": "ELIGIBLE", "reasons": []}
    return {"status": "DENIED", "reasons": reasons}