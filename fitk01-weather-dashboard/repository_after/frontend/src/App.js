import React, { useState, useEffect } from 'react';
import SearchBar from './components/SearchBar';
import WeatherDisplay from './components/WeatherDisplay';
import Forecast from './components/Forecast';
import Favorites from './components/Favorites';
import TemperatureToggle from './components/TemperatureToggle';
import './App.css';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

function App() {
  const [weather, setWeather] = useState(null);
  const [forecast, setForecast] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [unit, setUnit] = useState(() => {
    return localStorage.getItem('temperatureUnit') || 'celsius';
  });
  const [favorites, setFavorites] = useState(() => {
    const saved = localStorage.getItem('favorites');
    return saved ? JSON.parse(saved) : [];
  });

  useEffect(() => {
    localStorage.setItem('temperatureUnit', unit);
  }, [unit]);

  useEffect(() => {
    localStorage.setItem('favorites', JSON.stringify(favorites));
  }, [favorites]);

  const searchCity = async (city) => {
    setLoading(true);
    setError(null);
    setWeather(null);
    setForecast(null);

    try {
      const [weatherRes, forecastRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/weather?city=${encodeURIComponent(city)}`),
        fetch(`${API_BASE_URL}/api/forecast?city=${encodeURIComponent(city)}`)
      ]);

      // Check for 404 on EITHER weather OR forecast (Req 5 & 7)
      if (weatherRes.status === 404 || forecastRes.status === 404) {
        setError('City not found');
        setLoading(false);
        return;
      }

      // Check for 503 on either endpoint
      if (weatherRes.status === 503 || forecastRes.status === 503) {
        setError('Weather service unavailable');
        setLoading(false);
        return;
      }

      if (!weatherRes.ok || !forecastRes.ok) {
        setError('Failed to fetch weather data');
        setLoading(false);
        return;
      }

      const weatherData = await weatherRes.json();
      const forecastData = await forecastRes.json();

      setWeather(weatherData);
      setForecast(forecastData.forecast);
    } catch (err) {
      setError('Unable to connect to weather service');
    } finally {
      setLoading(false);
    }
  };

  const toggleUnit = () => {
    setUnit(prev => prev === 'celsius' ? 'fahrenheit' : 'celsius');
  };

  const convertTemp = (celsius) => {
    if (unit === 'fahrenheit') {
      return Math.round(celsius * 9 / 5 + 32);
    }
    return Math.round(celsius);
  };

  const addFavorite = (city) => {
    // Case-insensitive duplicate check (Req 14)
    const normalizedCity = city.toLowerCase();
    const isDuplicate = favorites.some(f => f.toLowerCase() === normalizedCity);
    if (!isDuplicate) {
      setFavorites([...favorites, city]);
    }
  };

  const removeFavorite = (city) => {
    setFavorites(favorites.filter(f => f !== city));
  };

  return (
    <div className="app">
      <header className="header">
        <h1>Weather Dashboard</h1>
        <TemperatureToggle unit={unit} onToggle={toggleUnit} />
      </header>

      <main className="main">
        <SearchBar onSearch={searchCity} />

        {loading && (
          <div className="loading" data-testid="loading">
            <div className="spinner"></div>
            <p>Loading...</p>
          </div>
        )}

        {error && (
          <div className="error" data-testid="error">
            <p>{error}</p>
          </div>
        )}

        {weather && !loading && (
          <WeatherDisplay
            weather={weather}
            convertTemp={convertTemp}
            unit={unit}
            onAddFavorite={addFavorite}
            isFavorite={favorites.some(f => f.toLowerCase() === weather.city.toLowerCase())}
          />
        )}

        {forecast && !loading && (
          <Forecast
            forecast={forecast}
            convertTemp={convertTemp}
            unit={unit}
          />
        )}

        <Favorites
          favorites={favorites}
          onSelect={searchCity}
          onRemove={removeFavorite}
        />
      </main>
    </div>
  );
}

export default App;
