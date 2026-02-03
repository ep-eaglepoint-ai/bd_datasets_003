const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json());

const dataPath = path.join(__dirname, 'data.json');

function loadData() {
    const raw = fs.readFileSync(dataPath, 'utf-8');
    return JSON.parse(raw);
}

function saveData(data) {
    fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));
}

// GET /movies - List all movies with optional filters
app.get('/movies', (req, res) => {
    const data = loadData();
    let movies = [...data.movies];

    // Filter by genre
    if (req.query.genre) {
        movies = movies.filter(m => m.genre.includes(req.query.genre));
    }

    // Filter by availability
    if (req.query.available !== undefined) {
        const available = req.query.available === 'true';
        movies = movies.filter(m => m.available === available);
    }

    // Filter by year range
    if (req.query.yearFrom) {
        movies = movies.filter(m => m.year >= parseInt(req.query.yearFrom));
    }
    if (req.query.yearTo) {
        movies = movies.filter(m => m.year <= parseInt(req.query.yearTo));
    }

    // Filter by minimum rating
    if (req.query.minRating) {
        movies = movies.filter(m => m.rating >= parseFloat(req.query.minRating));
    }

    // Sort by field
    if (req.query.sortBy) {
        const sortField = req.query.sortBy;
        const sortOrder = req.query.order === 'desc' ? -1 : 1;
        movies.sort((a, b) => {
            if (a[sortField] < b[sortField]) return -1 * sortOrder;
            if (a[sortField] > b[sortField]) return 1 * sortOrder;
            return 0;
        });
    }

    res.json({ movies, count: movies.length });
});

// GET /movies/:id - Get a specific movie
app.get('/movies/:id', (req, res) => {
    const data = loadData();
    const movie = data.movies.find(m => m.id === req.params.id);

    if (!movie) {
        return res.status(404).json({ error: 'Movie not found' });
    }

    res.json(movie);
});

// GET /movies/:id/recommendations - Get similar movies
app.get('/movies/:id/recommendations', (req, res) => {
    const data = loadData();
    const movie = data.movies.find(m => m.id === req.params.id);

    if (!movie) {
        return res.status(404).json({ error: 'Movie not found' });
    }

    // Find movies with overlapping genres, excluding the original
    const recommendations = data.movies
        .filter(m => m.id !== movie.id)
        .map(m => {
            const sharedGenres = m.genre.filter(g => movie.genre.includes(g));
            return { ...m, relevanceScore: sharedGenres.length };
        })
        .filter(m => m.relevanceScore > 0)
        .sort((a, b) => b.relevanceScore - a.relevanceScore || b.rating - a.rating)
        .slice(0, 5);

    res.json({ recommendations });
});

// POST /rentals - Rent a movie
app.post('/rentals', (req, res) => {
    const { movieId, customerId } = req.body;

    if (!movieId || !customerId) {
        return res.status(400).json({ error: 'movieId and customerId are required' });
    }

    const data = loadData();

    const movie = data.movies.find(m => m.id === movieId);
    if (!movie) {
        return res.status(404).json({ error: 'Movie not found' });
    }

    if (!movie.available) {
        return res.status(409).json({ error: 'Movie is not available for rental' });
    }

    const customer = data.customers.find(c => c.id === customerId);
    if (!customer) {
        return res.status(404).json({ error: 'Customer not found' });
    }

    // Create rental
    const rental = {
        id: `rent_${Date.now()}`,
        movieId,
        customerId,
        rentedAt: new Date().toISOString(),
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        returnedAt: null
    };

    // Update movie availability
    movie.available = false;

    // Update customer history
    if (!customer.rentalHistory.includes(movieId)) {
        customer.rentalHistory.push(movieId);
    }

    data.rentals.push(rental);
    saveData(data);

    res.status(201).json(rental);
});

// POST /rentals/:id/return - Return a rented movie
app.post('/rentals/:id/return', (req, res) => {
    const data = loadData();

    const rental = data.rentals.find(r => r.id === req.params.id);
    if (!rental) {
        return res.status(404).json({ error: 'Rental not found' });
    }

    if (rental.returnedAt) {
        return res.status(409).json({ error: 'Movie has already been returned' });
    }

    // Mark as returned
    rental.returnedAt = new Date().toISOString();

    // Make movie available again
    const movie = data.movies.find(m => m.id === rental.movieId);
    if (movie) {
        movie.available = true;
    }

    // Calculate if overdue
    const isOverdue = new Date(rental.returnedAt) > new Date(rental.dueDate);

    saveData(data);

    res.json({
        ...rental,
        isOverdue,
        message: isOverdue ? 'Returned late - late fee may apply' : 'Returned on time'
    });
});

// GET /rentals - List all rentals with optional filters
app.get('/rentals', (req, res) => {
    const data = loadData();
    let rentals = [...data.rentals];

    // Filter by customer
    if (req.query.customerId) {
        rentals = rentals.filter(r => r.customerId === req.query.customerId);
    }

    // Filter by active/returned
    if (req.query.active === 'true') {
        rentals = rentals.filter(r => r.returnedAt === null);
    } else if (req.query.active === 'false') {
        rentals = rentals.filter(r => r.returnedAt !== null);
    }

    // Filter overdue
    if (req.query.overdue === 'true') {
        const now = new Date();
        rentals = rentals.filter(r => r.returnedAt === null && new Date(r.dueDate) < now);
    }

    res.json({ rentals, count: rentals.length });
});

// GET /customers/:id - Get customer with rental stats
app.get('/customers/:id', (req, res) => {
    const data = loadData();
    const customer = data.customers.find(c => c.id === req.params.id);

    if (!customer) {
        return res.status(404).json({ error: 'Customer not found' });
    }

    const activeRentals = data.rentals.filter(
        r => r.customerId === customer.id && r.returnedAt === null
    );

    const totalRentals = data.rentals.filter(r => r.customerId === customer.id).length;

    res.json({
        ...customer,
        stats: {
            totalRentals,
            activeRentals: activeRentals.length,
            moviesWatched: customer.rentalHistory.length
        }
    });
});

// GET /stats - Get overall rental statistics
app.get('/stats', (req, res) => {
    const data = loadData();

    const totalMovies = data.movies.length;
    const availableMovies = data.movies.filter(m => m.available).length;
    const totalRentals = data.rentals.length;
    const activeRentals = data.rentals.filter(r => r.returnedAt === null).length;

    const genreCounts = {};
    data.movies.forEach(m => {
        m.genre.forEach(g => {
            genreCounts[g] = (genreCounts[g] || 0) + 1;
        });
    });

    const topDirectors = {};
    data.movies.forEach(m => {
        topDirectors[m.director] = (topDirectors[m.director] || 0) + 1;
    });

    res.json({
        totalMovies,
        availableMovies,
        rentedMovies: totalMovies - availableMovies,
        totalRentals,
        activeRentals,
        completedRentals: totalRentals - activeRentals,
        genreDistribution: genreCounts,
        directorMovieCounts: topDirectors
    });
});

module.exports = app;
