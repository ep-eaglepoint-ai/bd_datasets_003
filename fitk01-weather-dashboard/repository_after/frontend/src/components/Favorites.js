import React from 'react';

function Favorites({ favorites, onSelect, onRemove }) {
  if (favorites.length === 0) {
    return null;
  }

  return (
    <div className="favorites" data-testid="favorites">
      <h3>Favorite Cities</h3>
      <div className="favorites-list">
        {favorites.map((city) => (
          <div key={city} className="favorite-item" data-testid={`favorite-${city}`}>
            <button onClick={() => onSelect(city)} data-testid={`select-${city}`}>
              {city}
            </button>
            <button onClick={() => onRemove(city)} data-testid={`remove-${city}`}>
              ×
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

export default Favorites;
