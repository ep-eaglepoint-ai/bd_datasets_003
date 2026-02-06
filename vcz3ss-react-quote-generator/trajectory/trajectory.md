# Trajectory

## 1. Audit the Original Quote Component

I read the existing Quote.js component. It was a simple React class component that displayed random quotes from a static data array. The component had minimal state (just `randomQuoteIndex`) and a single handler method (`handleChange`) that generated random indices to display different quotes. The implementation was functional but lacked any personalization features.

Key observations:
- Simple class component extending React.Component
- State only tracked the current quote index
- Random index generation used Math.random() with a hardcoded multiplier
- No persistence mechanism
- No user interaction beyond generating new quotes

## 2. Identify Required Features

Based on the requirements, I identified three main feature sets that needed to be added:

**Favorites Management:**
- Heart icon to add/remove quotes from favorites
- Visual feedback (filled heart) when a quote is favorited
- Maximum limit of 10 favorites
- Duplicate prevention based on quote text (not author)
- Display favorites in chronological order (oldest first)

**Search Functionality:**
- Text input for filtering favorites
- Case-insensitive search
- Filter by both quote text and author name
- Real-time filtering as user types

**Undo Mechanism:**
- 5-second undo window after removing a favorite
- Only one removal can be undone at a time
- Restore to original position in the list
- Critical: localStorage must retain the item during undo window

## 3. Design State Management Strategy

I expanded the component state to handle all new features:

```javascript
state = {
    randomQuoteIndex: 0,      // Original - current quote
    favorites: [],            // New - array of saved quotes
    searchQuery: "",          // New - current search filter
    pendingRemoval: null,     // New - tracks removed item for undo
    undoTimerId: null         // New - timeout reference for cleanup
}
```

The `pendingRemoval` object stores both the removed item and its original index, enabling accurate position restoration.

## 4. Implement Favorites with Heart Icon

I added a heart button that toggles between filled (favorited) and empty (not favorited) states. The key challenge was implementing the `isQuoteFavorited` method to check both the current favorites array AND any pending removal - if a quote was just removed but is in the undo window, it should still show as "favorited" to prevent confusion.

For duplicate detection, I check only the `quote` text property, ignoring the author. This ensures the same quote from different authors isn't added twice.

## 5. Implement Maximum Favorites Limit with Undo Consideration

A critical requirement was that removing a favorite at the maximum (10) should NOT immediately enable adding new favorites. The removed quote might be restored via undo, bringing the count back to 10.

I solved this with `getEffectiveFavoritesCount()`:
```javascript
getEffectiveFavoritesCount = () => {
    return pendingRemoval ? favorites.length + 1 : favorites.length;
};
```

This counts the pending removal as still taking a slot, so users must wait for the undo window to expire before the heart re-enables.

## 6. Implement Search Filtering

The search filters favorites by both quote text and author name using case-insensitive comparison:

```javascript
getFilteredFavorites = () => {
    const query = searchQuery.toLowerCase();
    return favorites
        .map((fav, idx) => ({ ...fav, originalIndex: idx }))
        .filter(fav =>
            fav.quote.toLowerCase().includes(query) ||
            fav.author.toLowerCase().includes(query)
        );
};
```

The `originalIndex` mapping is crucial - when removing from a filtered view, we need the actual array index, not the filtered position.

## 7. Implement Undo with Delayed localStorage Update

The most complex requirement was: "During the 5-second undo window, localStorage should still contain the removed item."

My approach:
1. When removing, update the in-memory state immediately (for UI responsiveness)
2. Store the removed item in `pendingRemoval` with its original index
3. Set a 5-second timeout that updates localStorage only when it expires
4. If user clicks Undo, clear the timeout and restore the item
5. If user removes another item during the window, the previous removal is finalized to localStorage first

This ensures that refreshing during the undo window preserves the item.

## 8. Implement Position Restoration

When undoing, the quote must return to its original position. I use array splicing:

```javascript
const restoredFavorites = [
    ...favorites.slice(0, pendingRemoval.originalIndex),
    pendingRemoval.item,
    ...favorites.slice(pendingRemoval.originalIndex)
];
```

This works correctly even when searching - the item is restored to its position in the full array, and if it matches the current search, it appears in the filtered view.

## 9. Handle Real-time Heart Updates

The heart icon state must update whenever the random quote changes, not just when clicked. I achieved this by computing `isFavorited` directly in the render method based on the current quote:

```javascript
const currentQuote = this.getCurrentQuote();
const isFavorited = this.isQuoteFavorited(currentQuote.quote);
```

Since `isQuoteFavorited` checks against the favorites array, changing quotes automatically updates the heart state.

## 10. Add localStorage Persistence

Favorites persist using `componentDidMount` for loading and callback-based saving:

```javascript
componentDidMount() {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
        this.setState({ favorites: JSON.parse(stored) });
    }
}
```

For saving, I call `localStorage.setItem` in the setState callback for adds, and in the timeout callback for removals (delayed save).

## 11. Style the New Components

I updated App.css with styles for:
- Heart button with filled/empty/disabled states
- Favorites list with remove buttons
- Search input with focus state
- Undo banner with button
- Empty state messages

The heart button uses a circular shape with transform animation on hover. The disabled state reduces opacity and changes cursor to indicate the 10-favorite limit or undo-in-progress.

## 12. Result

The enhanced component now supports:
- Adding quotes to favorites via heart icon (max 10)
- Visual heart feedback based on current quote
- Duplicate prevention by quote text
- Case-insensitive search filtering
- 5-second undo window for removals
- Position restoration on undo
- Delayed localStorage updates during undo
- Persistence across page refreshes

All original functionality (random quote generation, display) is preserved while adding the new personalization and recovery features.
