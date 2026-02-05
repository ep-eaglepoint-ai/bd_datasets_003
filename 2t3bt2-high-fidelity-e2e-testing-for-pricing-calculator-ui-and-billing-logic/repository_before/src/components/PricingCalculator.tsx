import React, { useState, useMemo } from 'react';

export const PricingCalculator: React.FC = () => {
  const [seats, setSeats] = useState(10);
  const [isAnnual, setIsAnnual] = useState(false);
  const [addExtras, setAddExtras] = useState(false);

  const pricing = useMemo(() => {
    const basePrice = seats < 50 ? 15 : 12; // Pro is $15/seat, Enterprise is $12/seat
    let total = seats * basePrice;
    if (addExtras) total += 50; // Flat $50 fee for extras
    
    const monthlyTotal = total;
    const displayTotal = isAnnual ? (total * 0.8 * 12) : total;
    
    return {
      unitPrice: basePrice,
      total: displayTotal.toFixed(2),
      tier: seats < 50 ? 'Pro' : 'Enterprise',
      period: isAnnual ? 'year' : 'month'
    };
  }, [seats, isAnnual, addExtras]);

  return (
    <div className="p-6 max-w-md mx-auto bg-white rounded-xl shadow-md space-y-4" data-testid="pricing-card">
      <h2 className="text-xl font-bold">Estimate Your Plan</h2>
      
      <div className="flex flex-col">
        <label htmlFor="seat-range" className="text-sm">Seats: <span data-testid="seat-count">{seats}</span></label>
        <input 
          id="seat-range"
          type="range" 
          min="1" 
          max="500" 
          value={seats} 
          onChange={(e) => setSeats(parseInt(e.target.value))} 
          className="w-full"
          data-testid="seat-slider"
        />
      </div>

      <div className="flex items-center space-x-2">
        <button 
          role="switch"
          aria-checked={isAnnual}
          onClick={() => setIsAnnual(!isAnnual)}
          className={`p-2 rounded ${isAnnual ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}
          data-testid="billing-toggle"
        >
          {isAnnual ? 'Annual Billing (-20%)' : 'Monthly Billing'}
        </button>
        {isAnnual && <span className="text-green-600 text-xs font-bold" data-testid="discount-badge">SAVE 20%</span>}
      </div>

      <div className="border-t pt-4">
        <p className="text-sm text-gray-500">Current Tier: <span className="font-bold text-black" data-testid="plan-tier">{pricing.tier}</span></p>
        <p className="text-4xl font-extrabold">
          $<span data-testid="total-price">{pricing.total}</span>
          <span className="text-lg font-normal text-gray-400">/{pricing.period}</span>
        </p>
      </div>
    </div>
  );
};
