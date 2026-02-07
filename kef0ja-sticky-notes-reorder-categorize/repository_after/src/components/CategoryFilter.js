import React from 'react'
import { useStickyNotes } from '../context/StickyNotesContext'
import './CategoryFilter.css'

const CategoryFilter = () => {
    const { categories, selectedCategory, setSelectedCategory } = useStickyNotes()

    return (
        <div className="category-filter-container">
            <div className="category-filter">
                <button
                    className={`category-filter-button ${selectedCategory === 'all' ? 'active' : ''}`}
                    onClick={() => setSelectedCategory('all')}
                >
                    All
                </button>
                {categories.map(category => (
                    <button
                        key={category.id}
                        className={`category-filter-button ${selectedCategory === category.id ? 'active' : ''}`}
                        style={{ backgroundColor: category.color }}
                        onClick={() => setSelectedCategory(category.id)}
                    >
                        {category.name}
                    </button>
                ))}
            </div>
        </div>
    )
}

export default CategoryFilter