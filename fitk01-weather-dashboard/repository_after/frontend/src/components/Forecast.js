import React from 'react';

function Forecast({ forecast, convertTemp, unit }) {
  const unitSymbol = unit === 'celsius' ? '°C' : '°F';

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  };

  return (
    <div className="forecast" data-testid="forecast">
      <h3>5-Day Forecast</h3>
      <div className="forecast-grid">
        {forecast.map((day, index) => (
          <div key={day.date} className="forecast-day" data-testid={`forecast-day-${index}`}>
            <div className="forecast-date">{formatDate(day.date)}</div>
            <div className="forecast-temp" data-testid={`forecast-temp-${index}`}>
              {convertTemp(day.temperature)}{unitSymbol}
            </div>
            <div className="forecast-condition">{day.condition}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default Forecast;
