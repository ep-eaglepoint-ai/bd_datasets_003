import Dogpic from "../Assets/dog.jpg";
import React from 'react';

function DogImage({ imgLinks, error, toggleFavorite, isFavorited }) {
  const currentImageUrl = imgLinks.length > 0 ? imgLinks[0].url : null;
  const isCurrentFavorited = currentImageUrl ? isFavorited(currentImageUrl) : false;

  return (
    <div className='doggy'>
      
      {error ? (
        <div>
          <img src={Dogpic} alt='doggy' />
          <p>{error}</p>
        </div>
      ) : (
        imgLinks.length > 0 && (
          <div className="image-container">
            <img src={imgLinks[0].url} alt='doggy' />
            <button 
              className={`heart-icon ${isCurrentFavorited ? 'favorited' : ''}`}
              onClick={() => toggleFavorite(currentImageUrl)}
              aria-label={isCurrentFavorited ? 'Remove from favorites' : 'Add to favorites'}
              data-testid="heart-icon"
            >
              {isCurrentFavorited ? '❤️' : '🤍'}
            </button>
            <p className="breed">Breed : {imgLinks[0].breed}</p>
          </div>
        )
      )}
    </div>
  );
}

export default DogImage;


