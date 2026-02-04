import React from 'react';

function TemperatureToggle({ unit, onToggle }) {
  return (
    <div className="temperature-toggle" data-testid="temperature-toggle">
      <button
        className={unit === 'celsius' ? 'active' : ''}
        onClick={onToggle}
        data-testid="celsius-btn"
      >
        °C
      </button>
      <button
        className={unit === 'fahrenheit' ? 'active' : ''}
        onClick={onToggle}
        data-testid="fahrenheit-btn"
      >
        °F
      </button>
    </div>
  );
}

export default TemperatureToggle;
