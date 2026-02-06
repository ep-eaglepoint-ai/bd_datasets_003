import React from "react";
import {quotes} from "../data/quotes";

const qt = quotes();
const STORAGE_KEY = "favoriteQuotes";
const MAX_FAVORITES = 10;
const UNDO_TIMEOUT_MS = 5000;

export default class Quote extends React.Component {
    state = {
        randomQuoteIndex: 0,
        favorites: [],
        searchQuery: "",
        pendingRemoval: null,
        undoTimerId: null
    };

    componentDidMount() {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            try {
                const parsed = JSON.parse(stored);
                if (Array.isArray(parsed)) {
                    this.setState({ favorites: parsed });
                }
            } catch (e) {
                // Invalid JSON, start fresh
            }
        }
    }

    componentWillUnmount() {
        if (this.state.undoTimerId) {
            clearTimeout(this.state.undoTimerId);
        }
    }

    handleChange = () => {
        this.setState({
            randomQuoteIndex: Math.round(Math.random() * (qt.length - 1))
        });
    };

    getCurrentQuote = () => {
        return qt[this.state.randomQuoteIndex];
    };

    isQuoteFavorited = (quoteText) => {
        const { favorites, pendingRemoval } = this.state;
        const inFavorites = favorites.some(fav => fav.quote === quoteText);
        const isPending = pendingRemoval && pendingRemoval.item.quote === quoteText;
        return inFavorites || isPending;
    };

    getEffectiveFavoritesCount = () => {
        const { favorites, pendingRemoval } = this.state;
        return pendingRemoval ? favorites.length + 1 : favorites.length;
    };

    canAddFavorite = () => {
        return this.getEffectiveFavoritesCount() < MAX_FAVORITES;
    };

    handleHeartClick = () => {
        const currentQuote = this.getCurrentQuote();
        const { favorites, pendingRemoval } = this.state;

        const existingIndex = favorites.findIndex(fav => fav.quote === currentQuote.quote);

        if (existingIndex !== -1) {
            this.removeFavorite(existingIndex);
        } else if (pendingRemoval && pendingRemoval.item.quote === currentQuote.quote) {
            return;
        } else {
            if (!this.canAddFavorite()) {
                return;
            }
            const newFavorite = { quote: currentQuote.quote, author: currentQuote.author };
            const newFavorites = [...favorites, newFavorite];
            this.setState({ favorites: newFavorites }, () => {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(newFavorites));
            });
        }
    };

    removeFavorite = (index) => {
        const { favorites, undoTimerId } = this.state;

        if (undoTimerId) {
            clearTimeout(undoTimerId);
            localStorage.setItem(STORAGE_KEY, JSON.stringify(favorites));
        }

        const removedItem = favorites[index];
        const newFavorites = favorites.filter((_, i) => i !== index);

        const timerId = setTimeout(() => {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state.favorites));
            this.setState({ pendingRemoval: null, undoTimerId: null });
        }, UNDO_TIMEOUT_MS);

        this.setState({
            favorites: newFavorites,
            pendingRemoval: { item: removedItem, originalIndex: index },
            undoTimerId: timerId
        });
    };

    handleUndo = () => {
        const { favorites, pendingRemoval, undoTimerId } = this.state;

        if (!pendingRemoval) return;

        if (undoTimerId) {
            clearTimeout(undoTimerId);
        }

        const restoredFavorites = [
            ...favorites.slice(0, pendingRemoval.originalIndex),
            pendingRemoval.item,
            ...favorites.slice(pendingRemoval.originalIndex)
        ];

        this.setState({
            favorites: restoredFavorites,
            pendingRemoval: null,
            undoTimerId: null
        }, () => {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(restoredFavorites));
        });
    };

    handleSearchChange = (e) => {
        this.setState({ searchQuery: e.target.value });
    };

    getFilteredFavorites = () => {
        const { favorites, searchQuery } = this.state;
        if (!searchQuery.trim()) {
            return favorites.map((fav, idx) => ({ ...fav, originalIndex: idx }));
        }
        const query = searchQuery.toLowerCase();
        return favorites
            .map((fav, idx) => ({ ...fav, originalIndex: idx }))
            .filter(fav =>
                fav.quote.toLowerCase().includes(query) ||
                fav.author.toLowerCase().includes(query)
            );
    };

    render() {
        const { searchQuery, pendingRemoval } = this.state;
        const currentQuote = this.getCurrentQuote();
        const isFavorited = this.isQuoteFavorited(currentQuote.quote);
        const canAdd = this.canAddFavorite();
        const filteredFavorites = this.getFilteredFavorites();

        const heartDisabled = !isFavorited && !canAdd;

        return (
            <div>
                <div className="quote-section">
                    <h2>{currentQuote.quote}</h2>
                    <h3>---{currentQuote.author}</h3>
                </div>
                <div className="button-row">
                    <button onClick={this.handleChange}>Generate Random Quote</button>
                    <button
                        className={`heart-btn ${isFavorited ? 'filled' : ''} ${heartDisabled ? 'disabled' : ''}`}
                        onClick={this.handleHeartClick}
                        disabled={heartDisabled}
                        aria-label={isFavorited ? "Remove from favorites" : "Add to favorites"}
                    >
                        {isFavorited ? '♥' : '♡'}
                    </button>
                </div>

                <div className="favorites-section">
                    <h3>Favorites ({this.state.favorites.length}/{MAX_FAVORITES})</h3>

                    <input
                        type="text"
                        className="search-input"
                        placeholder="Search favorites..."
                        value={searchQuery}
                        onChange={this.handleSearchChange}
                        aria-label="Search favorites"
                    />

                    {pendingRemoval && (
                        <div className="undo-banner">
                            <span>Quote removed</span>
                            <button className="undo-btn" onClick={this.handleUndo}>Undo</button>
                        </div>
                    )}

                    <ul className="favorites-list">
                        {filteredFavorites.map((fav) => (
                            <li key={fav.originalIndex} className="favorite-item">
                                <div className="favorite-content">
                                    <span className="favorite-quote">"{fav.quote}"</span>
                                    <span className="favorite-author">- {fav.author}</span>
                                </div>
                                <button
                                    className="remove-btn"
                                    onClick={() => this.removeFavorite(fav.originalIndex)}
                                    aria-label="Remove favorite"
                                >
                                    x
                                </button>
                            </li>
                        ))}
                    </ul>

                    {filteredFavorites.length === 0 && this.state.favorites.length > 0 && searchQuery && (
                        <p className="no-results">No favorites match your search.</p>
                    )}

                    {this.state.favorites.length === 0 && !pendingRemoval && (
                        <p className="no-favorites">No favorites yet. Click the heart to add quotes!</p>
                    )}
                </div>
            </div>
        );
    }
}
