import { useState, useEffect } from "react";
import BreedSelector from "./BreedSelector";
import DogImage from "./DogImage";
import Header from "./Header";
import Footer from "./Footer";


function Dog() {
  const [imgLinks, setImgLinks] = useState([]);
  const [breeds, setBreeds] = useState([]);
  const [selectedBreed, setSelectedBreed] = useState("");
  const [error, setError] = useState(null);
  const [favorites, setFavorites] = useState([]);

  useEffect(() => {
    const savedFavorites = localStorage.getItem('dogFavorites');
    if (savedFavorites) {
      try {
        setFavorites(JSON.parse(savedFavorites));
      } catch (e) {
        console.error('Failed to parse favorites from localStorage');
      }
    }
  }, []);

  // Toggle favorite - add or remove current image
  const toggleFavorite = (imageUrl) => {
    if (!imageUrl) return;
    
    setFavorites((prevFavorites) => {
      const isFavorited = prevFavorites.includes(imageUrl);
      let updatedFavorites;
      
      if (isFavorited) {
        // Remove from favorites
        updatedFavorites = prevFavorites.filter((url) => url !== imageUrl);
      } else {
        // Add to favorites (prevent duplicates)
        if (prevFavorites.includes(imageUrl)) {
          return prevFavorites; // Already exists, no change
        }
        updatedFavorites = [...prevFavorites, imageUrl];
      }
      
      // Persist to localStorage
      localStorage.setItem('dogFavorites', JSON.stringify(updatedFavorites));
      return updatedFavorites;
    });
  };

  // Check if current image is favorited
  const isFavorited = (imageUrl) => {
    return favorites.includes(imageUrl);
  };

  const getBreeds = () => {
    fetch("https://dog.ceo/api/breeds/list/all")
      .then((response) => response.json())
      .then((data) => {
        if (data.status === "success") {
          const breedList = Object.keys(data.message);
          setBreeds(breedList);
        } else {
          setError("Select The Breed Of The Dog");
        }
      })
      .catch(() => {
        setError("Failed to fetch breeds");
      });
  };
  const getRandomDog = () => {
    fetch('https://dog.ceo/api/breeds/image/random')
      .then((response) => response.json())
      .then((dog) => {
        if (dog.status === 'success') {
          const breedName = dog.message.split('/')[4];
          setImgLinks([{ url: dog.message, breed: breedName }]);
          setError(null);
        } else {
          setError('Failed to fetch image');
        }
      })
      .catch(() => {
        setError('Failed to fetch image');
      });
  };
  
  const getDogs = () => {
    if (selectedBreed !== "") {
      fetch(`https://dog.ceo/api/breed/${selectedBreed}/images/random`)
        .then((response) => response.json())
        .then((dog) => {
          if (dog.status === "success") {
            setImgLinks((prevLinks) => [
              { url: dog.message, breed: selectedBreed },
              ...prevLinks,
            ]);
            setError(null);
          } else {
            setError("Failed to fetch image");
          }
        })
        .catch(() => {
          setError("Failed to fetch image");
        });
    } else {
      getRandomDog();
    }
  };
  useEffect(() => {
    getBreeds();
    getRandomDog();
    console.log("Component mounted");
  }, []);

  return (
    <div className="dog-box">
      <Header />
      <DogImage 
        imgLinks={imgLinks} 
        error={error} 
        toggleFavorite={toggleFavorite}
        isFavorited={isFavorited}
      />
      <BreedSelector
        breeds={breeds}
        selectedBreed={selectedBreed}
        setSelectedBreed={setSelectedBreed}
        getDogs={getDogs}
      />
      {favorites.length > 0 && (
        <div className="favorites-section">
          <h3>Favorites ({favorites.length})</h3>
          <div className="favorites-grid">
            {favorites.map((url, index) => (
              <div key={index} className="favorite-item">
                <img src={url} alt={`Favorite ${index + 1}`} />
                <button 
                  className="remove-favorite"
                  onClick={() => toggleFavorite(url)}
                  aria-label="Remove from favorites"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
      <Footer />
    </div>
  );
}

export default Dog;
