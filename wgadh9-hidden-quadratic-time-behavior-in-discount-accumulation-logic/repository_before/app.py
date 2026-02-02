def compute_final_prices(prices, discounts, region):
    """
    prices: list of dicts with keys:
        - route_id: str
        - base_price: int
        - currency: str

    discounts: list of dicts with keys:
        - route_id: str
        - percent: int
        - regions: list of region strings

    region: str

    Returns a dict mapping route_id -> final_price
    """
    # Build route -> ordered applicable discounts (O(m))
    discount_map = {}
    for d in discounts:
        if region in d["regions"]:
            if d["route_id"] not in discount_map:
                discount_map[d["route_id"]] = []
            discount_map[d["route_id"]].append(d["percent"])

    # Compute final prices (O(n + total applicable discounts))
    final = {}
    for p in prices:
        current_price = p["base_price"]
        for percent in discount_map.get(p["route_id"], []):
            current_price -= (current_price * percent // 100)
        final[p["route_id"]] = current_price

    return final
