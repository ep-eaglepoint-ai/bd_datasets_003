import React from 'react';

function WeatherDisplay({ weather, convertTemp, unit, onAddFavorite, isFavorite }) {
  const unitSymbol = unit === 'celsius' ? '°C' : '°F';

  return (
    <div className="weather-display" data-testid="weather-display">
      <div className="weather-header">
        <h2 className="weather-city" data-testid="city-name">{weather.city}</h2>
        <button
          className={`favorite-btn ${isFavorite ? 'active' : ''}`}
          onClick={() => onAddFavorite(weather.city)}
          data-testid="add-favorite"
        >
          {isFavorite ? '★ Saved' : '☆ Save'}
        </button>
      </div>
      <div className="weather-temp" data-testid="temperature">
        {convertTemp(weather.temperature)}{unitSymbol}
      </div>
      <div className="weather-details">
        <div className="weather-detail">
          <span className="weather-detail-label">Condition</span>
          <span className="weather-detail-value" data-testid="condition">{weather.condition}</span>
        </div>
        <div className="weather-detail">
          <span className="weather-detail-label">Humidity</span>
          <span className="weather-detail-value" data-testid="humidity">{weather.humidity}%</span>
        </div>
      </div>
    </div>
  );
}

export default WeatherDisplay;
