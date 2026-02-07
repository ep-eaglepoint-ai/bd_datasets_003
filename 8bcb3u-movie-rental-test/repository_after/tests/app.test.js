const request = require('supertest');
const fs = require('fs');
const path = require('path');
const app = require('../app');

const dataPath = path.join(__dirname, '..', 'data.json');
const fixtureData = {
  "movies": [
    {
      "id": "mov_001",
      "title": "The Matrix",
      "director": "Wachowski Sisters",
      "year": 1999,
      "genre": ["Action", "Sci-Fi"],
      "rating": 8.7,
      "available": true
    },
    {
      "id": "mov_002",
      "title": "Inception",
      "director": "Christopher Nolan",
      "year": 2010,
      "genre": ["Action", "Sci-Fi", "Thriller"],
      "rating": 8.8,
      "available": true
    },
    {
      "id": "mov_003",
      "title": "The Shawshank Redemption",
      "director": "Frank Darabont",
      "year": 1994,
      "genre": ["Drama"],
      "rating": 9.3,
      "available": true
    },
    {
      "id": "mov_004",
      "title": "Pulp Fiction",
      "director": "Quentin Tarantino",
      "year": 1994,
      "genre": ["Crime", "Drama"],
      "rating": 8.9,
      "available": false
    },
    {
      "id": "mov_005",
      "title": "The Dark Knight",
      "director": "Christopher Nolan",
      "year": 2008,
      "genre": ["Action", "Crime", "Drama"],
      "rating": 9.0,
      "available": true
    }
  ],
  "customers": [
    {
      "id": "cust_001",
      "name": "John Doe",
      "email": "john@example.com",
      "rentalHistory": ["mov_001", "mov_003"]
    },
    {
      "id": "cust_002",
      "name": "Jane Smith",
      "email": "jane@example.com",
      "rentalHistory": []
    }
  ],
  "rentals": [
    {
      "id": "rent_001",
      "movieId": "mov_004",
      "customerId": "cust_001",
      "rentedAt": "2026-02-01T10:00:00.000Z",
      "dueDate": "2026-12-31T10:00:00.000Z",
      "returnedAt": null
    }
  ]
};

// Helper function to reset data
function resetData() {
  fs.writeFileSync(dataPath, JSON.stringify(fixtureData, null, 2));
}

describe('Movie Rental API - GET /movies', () => {
  beforeEach(() => {
    resetData();
  });

  test('should return all movies with correct structure', async () => {
    const response = await request(app).get('/movies');
    
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('movies');
    expect(response.body).toHaveProperty('count');
    expect(response.body.movies).toHaveLength(5);
    expect(response.body.count).toBe(5);
    
    const movie = response.body.movies[0];
    expect(movie).toHaveProperty('id');
    expect(movie).toHaveProperty('title');
    expect(movie).toHaveProperty('director');
    expect(movie).toHaveProperty('year');
    expect(movie).toHaveProperty('genre');
    expect(movie).toHaveProperty('rating');
    expect(movie).toHaveProperty('available');
  });

  test('should filter movies by genre', async () => {
    const response = await request(app).get('/movies?genre=Action');
    
    expect(response.status).toBe(200);
    expect(response.body.count).toBe(3); // Matrix, Inception, Dark Knight
    response.body.movies.forEach(movie => {
      expect(movie.genre).toContain('Action');
    });
  });

  test('should filter movies by available=true', async () => {
    const response = await request(app).get('/movies?available=true');
    
    expect(response.status).toBe(200);
    expect(response.body.count).toBe(4);
    response.body.movies.forEach(movie => {
      expect(movie.available).toBe(true);
    });
  });

  test('should filter movies by available=false', async () => {
    const response = await request(app).get('/movies?available=false');
    
    expect(response.status).toBe(200);
    expect(response.body.count).toBe(1);
    expect(response.body.movies[0].id).toBe('mov_004');
    expect(response.body.movies[0].available).toBe(false);
  });

  test('should filter movies by yearFrom', async () => {
    const response = await request(app).get('/movies?yearFrom=2000');
    
    expect(response.status).toBe(200);
    expect(response.body.count).toBe(2); // Inception (2010), Dark Knight (2008)
    response.body.movies.forEach(movie => {
      expect(movie.year).toBeGreaterThanOrEqual(2000);
    });
  });

  test('should filter movies by yearTo', async () => {
    const response = await request(app).get('/movies?yearTo=1999');
    
    expect(response.status).toBe(200);
    expect(response.body.count).toBe(3); // Matrix (1999), Shawshank (1994), Pulp Fiction (1994)
    response.body.movies.forEach(movie => {
      expect(movie.year).toBeLessThanOrEqual(1999);
    });
  });

  test('should filter movies by year range', async () => {
    const response = await request(app).get('/movies?yearFrom=1994&yearTo=2008');
    
    expect(response.status).toBe(200);
    expect(response.body.count).toBe(4);
    response.body.movies.forEach(movie => {
      expect(movie.year).toBeGreaterThanOrEqual(1994);
      expect(movie.year).toBeLessThanOrEqual(2008);
    });
  });

  test('should filter movies by minRating', async () => {
    const response = await request(app).get('/movies?minRating=9.0');
    
    expect(response.status).toBe(200);
    expect(response.body.count).toBe(2); // Shawshank (9.3), Dark Knight (9.0)
    response.body.movies.forEach(movie => {
      expect(movie.rating).toBeGreaterThanOrEqual(9.0);
    });
  });

  test('should sort movies by rating ascending', async () => {
    const response = await request(app).get('/movies?sortBy=rating&order=asc');
    
    expect(response.status).toBe(200);
    expect(response.body.movies[0].rating).toBe(8.7);
    expect(response.body.movies[4].rating).toBe(9.3);
  });

  test('should sort movies by rating descending', async () => {
    const response = await request(app).get('/movies?sortBy=rating&order=desc');
    
    expect(response.status).toBe(200);
    expect(response.body.movies[0].rating).toBe(9.3);
    expect(response.body.movies[4].rating).toBe(8.7);
  });

  test('should sort movies by year', async () => {
    const response = await request(app).get('/movies?sortBy=year&order=asc');
    
    expect(response.status).toBe(200);
    expect(response.body.movies[0].year).toBe(1994);
    expect(response.body.movies[4].year).toBe(2010);
  });

  test('should combine multiple filters', async () => {
    const response = await request(app).get('/movies?genre=Action&minRating=8.8&available=true');
    
    expect(response.status).toBe(200);
    response.body.movies.forEach(movie => {
      expect(movie.genre).toContain('Action');
      expect(movie.rating).toBeGreaterThanOrEqual(8.8);
      expect(movie.available).toBe(true);
    });
  });
});

describe('Movie Rental API - GET /movies/:id', () => {
  beforeEach(() => {
    resetData();
  });

  test('should return movie with valid ID', async () => {
    const response = await request(app).get('/movies/mov_001');
    
    expect(response.status).toBe(200);
    expect(response.body.id).toBe('mov_001');
    expect(response.body.title).toBe('The Matrix');
    expect(response.body.director).toBe('Wachowski Sisters');
    expect(response.body.year).toBe(1999);
    expect(response.body.genre).toEqual(['Action', 'Sci-Fi']);
    expect(response.body.rating).toBe(8.7);
    expect(response.body.available).toBe(true);
  });

  test('should return 404 for invalid movie ID', async () => {
    const response = await request(app).get('/movies/invalid_id');
    
    expect(response.status).toBe(404);
    expect(response.body).toHaveProperty('error');
    expect(response.body.error).toBe('Movie not found');
  });
});

describe('Movie Rental API - GET /movies/:id/recommendations', () => {
  beforeEach(() => {
    resetData();
  });

  test('should return recommendations for movies with matching genres', async () => {
    const response = await request(app).get('/movies/mov_001/recommendations');
    
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('recommendations');
    expect(Array.isArray(response.body.recommendations)).toBe(true);
    
    // Matrix has Action and Sci-Fi genres
    response.body.recommendations.forEach(rec => {
      expect(rec.relevanceScore).toBeGreaterThan(0);
      const hasSharedGenre = rec.genre.some(g => ['Action', 'Sci-Fi'].includes(g));
      expect(hasSharedGenre).toBe(true);
    });
  });

  test('should not include source movie in recommendations', async () => {
    const response = await request(app).get('/movies/mov_001/recommendations');
    
    expect(response.status).toBe(200);
    const ids = response.body.recommendations.map(r => r.id);
    expect(ids).not.toContain('mov_001');
  });

  test('should sort recommendations by relevance score then rating', async () => {
    const response = await request(app).get('/movies/mov_002/recommendations');
    
    expect(response.status).toBe(200);
    const recommendations = response.body.recommendations;
    
    for (let i = 0; i < recommendations.length - 1; i++) {
      const current = recommendations[i];
      const next = recommendations[i + 1];
      
      if (current.relevanceScore === next.relevanceScore) {
        expect(current.rating).toBeGreaterThanOrEqual(next.rating);
      } else {
        expect(current.relevanceScore).toBeGreaterThan(next.relevanceScore);
      }
    }
  });

  test('should limit recommendations to 5 movies', async () => {
    const response = await request(app).get('/movies/mov_005/recommendations');
    
    expect(response.status).toBe(200);
    expect(response.body.recommendations.length).toBeLessThanOrEqual(5);
  });

  test('should return 404 for non-existent movie', async () => {
    const response = await request(app).get('/movies/invalid_id/recommendations');
    
    expect(response.status).toBe(404);
    expect(response.body.error).toBe('Movie not found');
  });
});

describe('Movie Rental API - POST /rentals', () => {
  beforeEach(() => {
    resetData();
  });

  test('should create rental with valid data', async () => {
    const rentalData = {
      movieId: 'mov_001',
      customerId: 'cust_002'
    };
    
    const response = await request(app)
      .post('/rentals')
      .send(rentalData);
    
    expect(response.status).toBe(201);
    expect(response.body).toHaveProperty('id');
    expect(response.body.movieId).toBe('mov_001');
    expect(response.body.customerId).toBe('cust_002');
    expect(response.body).toHaveProperty('rentedAt');
    expect(response.body).toHaveProperty('dueDate');
    expect(response.body.returnedAt).toBeNull();
  });

  test('should mark movie as unavailable after rental', async () => {
    const rentalData = {
      movieId: 'mov_001',
      customerId: 'cust_002'
    };
    
    await request(app)
      .post('/rentals')
      .send(rentalData);
    
    const movieResponse = await request(app).get('/movies/mov_001');
    expect(movieResponse.body.available).toBe(false);
  });

  test('should update customer rental history', async () => {
    const rentalData = {
      movieId: 'mov_002',
      customerId: 'cust_002'
    };
    
    await request(app)
      .post('/rentals')
      .send(rentalData);
    
    const customerResponse = await request(app).get('/customers/cust_002');
    expect(customerResponse.body.rentalHistory).toContain('mov_002');
  });

  test('should return 400 when movieId is missing', async () => {
    const response = await request(app)
      .post('/rentals')
      .send({ customerId: 'cust_001' });
    
    expect(response.status).toBe(400);
    expect(response.body.error).toBe('movieId and customerId are required');
  });

  test('should return 400 when customerId is missing', async () => {
    const response = await request(app)
      .post('/rentals')
      .send({ movieId: 'mov_001' });
    
    expect(response.status).toBe(400);
    expect(response.body.error).toBe('movieId and customerId are required');
  });

  test('should return 404 when movie does not exist', async () => {
    const response = await request(app)
      .post('/rentals')
      .send({ movieId: 'invalid_movie', customerId: 'cust_001' });
    
    expect(response.status).toBe(404);
    expect(response.body.error).toBe('Movie not found');
  });

  test('should return 404 when customer does not exist', async () => {
    const response = await request(app)
      .post('/rentals')
      .send({ movieId: 'mov_001', customerId: 'invalid_customer' });
    
    expect(response.status).toBe(404);
    expect(response.body.error).toBe('Customer not found');
  });

  test('should return 409 when movie is not available', async () => {
    const response = await request(app)
      .post('/rentals')
      .send({ movieId: 'mov_004', customerId: 'cust_002' });
    
    expect(response.status).toBe(409);
    expect(response.body.error).toBe('Movie is not available for rental');
  });
});

describe('Movie Rental API - POST /rentals/:id/return', () => {
  beforeEach(() => {
    resetData();
  });

  test('should return rental successfully', async () => {
    const response = await request(app)
      .post('/rentals/rent_001/return');
    
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('returnedAt');
    expect(response.body.returnedAt).not.toBeNull();
  });

  test('should make movie available after return', async () => {
    await request(app)
      .post('/rentals/rent_001/return');
    
    const movieResponse = await request(app).get('/movies/mov_004');
    expect(movieResponse.body.available).toBe(true);
  });

  test('should calculate overdue status correctly for on-time return', async () => {
    const response = await request(app)
      .post('/rentals/rent_001/return');
    
    expect(response.body).toHaveProperty('isOverdue');
    expect(response.body).toHaveProperty('message');
    expect(response.body.message).toContain('Returned on time');
  });

  test('should calculate overdue status correctly for late return', async () => {
    // Create a rental with a past due date
    const pastDueRental = {
      id: 'rent_overdue',
      movieId: 'mov_003',
      customerId: 'cust_002',
      rentedAt: '2024-01-01T10:00:00.000Z',
      dueDate: '2024-01-02T10:00:00.000Z',
      returnedAt: null
    };
    
    const data = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
    data.rentals.push(pastDueRental);
    data.movies.find(m => m.id === 'mov_003').available = false;
    fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));
    
    const response = await request(app)
      .post('/rentals/rent_overdue/return');
    
    expect(response.body.isOverdue).toBe(true);
    expect(response.body.message).toContain('late');
  });

  test('should return 409 when rental already returned', async () => {
    await request(app).post('/rentals/rent_001/return');
    
    const response = await request(app)
      .post('/rentals/rent_001/return');
    
    expect(response.status).toBe(409);
    expect(response.body.error).toBe('Movie has already been returned');
  });

  test('should return 404 for non-existent rental', async () => {
    const response = await request(app)
      .post('/rentals/invalid_rental/return');
    
    expect(response.status).toBe(404);
    expect(response.body.error).toBe('Rental not found');
  });
});

describe('Movie Rental API - GET /rentals', () => {
  beforeEach(() => {
    resetData();
  });

  test('should return all rentals', async () => {
    const response = await request(app).get('/rentals');
    
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('rentals');
    expect(response.body).toHaveProperty('count');
    expect(response.body.count).toBe(1);
  });

  test('should filter rentals by customerId', async () => {
    const response = await request(app).get('/rentals?customerId=cust_001');
    
    expect(response.status).toBe(200);
    response.body.rentals.forEach(rental => {
      expect(rental.customerId).toBe('cust_001');
    });
  });

  test('should filter active rentals', async () => {
    const response = await request(app).get('/rentals?active=true');
    
    expect(response.status).toBe(200);
    response.body.rentals.forEach(rental => {
      expect(rental.returnedAt).toBeNull();
    });
  });

  test('should filter returned rentals', async () => {
    // First return the rental
    await request(app).post('/rentals/rent_001/return');
    
    const response = await request(app).get('/rentals?active=false');
    
    expect(response.status).toBe(200);
    response.body.rentals.forEach(rental => {
      expect(rental.returnedAt).not.toBeNull();
    });
  });

  test('should filter overdue rentals', async () => {
    // Add an overdue rental
    const data = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
    data.rentals.push({
      id: 'rent_overdue',
      movieId: 'mov_003',
      customerId: 'cust_002',
      rentedAt: '2024-01-01T10:00:00.000Z',
      dueDate: '2024-01-02T10:00:00.000Z',
      returnedAt: null
    });
    fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));
    
    const response = await request(app).get('/rentals?overdue=true');
    
    expect(response.status).toBe(200);
    response.body.rentals.forEach(rental => {
      expect(rental.returnedAt).toBeNull();
      expect(new Date(rental.dueDate).getTime()).toBeLessThan(new Date().getTime());
    });
  });

  test('should combine multiple filters', async () => {
    const response = await request(app).get('/rentals?customerId=cust_001&active=true');
    
    expect(response.status).toBe(200);
    response.body.rentals.forEach(rental => {
      expect(rental.customerId).toBe('cust_001');
      expect(rental.returnedAt).toBeNull();
    });
  });
});

describe('Movie Rental API - GET /customers/:id', () => {
  beforeEach(() => {
    resetData();
  });

  test('should return customer with stats', async () => {
    const response = await request(app).get('/customers/cust_001');
    
    expect(response.status).toBe(200);
    expect(response.body.id).toBe('cust_001');
    expect(response.body.name).toBe('John Doe');
    expect(response.body.email).toBe('john@example.com');
    expect(response.body).toHaveProperty('stats');
    expect(response.body.stats).toHaveProperty('totalRentals');
    expect(response.body.stats).toHaveProperty('activeRentals');
    expect(response.body.stats).toHaveProperty('moviesWatched');
  });

  test('should calculate correct stats', async () => {
    const response = await request(app).get('/customers/cust_001');
    
    expect(response.status).toBe(200);
    expect(response.body.stats.totalRentals).toBe(1);
    expect(response.body.stats.activeRentals).toBe(1);
    expect(response.body.stats.moviesWatched).toBe(2);
  });

  test('should return 404 for non-existent customer', async () => {
    const response = await request(app).get('/customers/invalid_customer');
    
    expect(response.status).toBe(404);
    expect(response.body.error).toBe('Customer not found');
  });
});

describe('Movie Rental API - GET /stats', () => {
  beforeEach(() => {
    resetData();
  });

  test('should return overall statistics', async () => {
    const response = await request(app).get('/stats');
    
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('totalMovies');
    expect(response.body).toHaveProperty('availableMovies');
    expect(response.body).toHaveProperty('rentedMovies');
    expect(response.body).toHaveProperty('totalRentals');
    expect(response.body).toHaveProperty('activeRentals');
    expect(response.body).toHaveProperty('completedRentals');
    expect(response.body).toHaveProperty('genreDistribution');
    expect(response.body).toHaveProperty('directorMovieCounts');
  });

  test('should calculate correct movie counts', async () => {
    const response = await request(app).get('/stats');
    
    expect(response.body.totalMovies).toBe(5);
    expect(response.body.availableMovies).toBe(4);
    expect(response.body.rentedMovies).toBe(1);
  });

  test('should calculate correct rental counts', async () => {
    const response = await request(app).get('/stats');
    
    expect(response.body.totalRentals).toBe(1);
    expect(response.body.activeRentals).toBe(1);
    expect(response.body.completedRentals).toBe(0);
  });

  test('should calculate genre distribution correctly', async () => {
    const response = await request(app).get('/stats');
    
    expect(response.body.genreDistribution).toHaveProperty('Action');
    expect(response.body.genreDistribution).toHaveProperty('Sci-Fi');
    expect(response.body.genreDistribution).toHaveProperty('Drama');
    expect(response.body.genreDistribution.Action).toBe(3);
    expect(response.body.genreDistribution['Sci-Fi']).toBe(2);
  });

  test('should calculate director movie counts correctly', async () => {
    const response = await request(app).get('/stats');
    
    expect(response.body.directorMovieCounts).toHaveProperty('Christopher Nolan');
    expect(response.body.directorMovieCounts['Christopher Nolan']).toBe(2);
  });
});