const React = require("react");

const containerStyle = {
  padding: "20px",
  display: "inline-block",
  width: "300px",
  border: "1px solid darkgrey",
  borderRadius: "10px",
  background: "#EAEAEA",
};

const inputStyle = {
  display: "inline-block",
  fontSize: "0.9em",
  margin: "5px",
  width: "90%",
  border: "0",
  padding: "10px",
  borderRadius: "10px",
  marginTop: "1rem",
};

const tagStyle = {
  display: "inline-block",
  backgroundColor: "#3C4048",
  margin: "5px",
  padding: "4px 10px",
  borderRadius: "10px",
  cursor: "pointer",
  color: "white",
};

const errorStyle = {
  display: "block",
  color: "#d32f2f",
  fontSize: "0.8em",
  margin: "5px",
  minHeight: "1em",
};

const counterStyle = {
  display: "block",
  fontSize: "0.8em",
  margin: "5px",
  color: "#666",
};

const warningStyle = {
  display: "block",
  fontSize: "0.8em",
  margin: "5px",
  color: "#f57c00",
};

const limitStyle = {
  display: "block",
  fontSize: "0.8em",
  margin: "5px",
  color: "#d32f2f",
};

const dropdownStyle = {
  position: "absolute",
  backgroundColor: "white",
  border: "1px solid #ccc",
  borderRadius: "5px",
  maxHeight: "200px",
  overflowY: "auto",
  zIndex: 1000,
  width: "90%",
  margin: "0 5px",
  boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
};

const suggestionStyle = {
  padding: "8px 12px",
  cursor: "pointer",
  borderBottom: "1px solid #eee",
};

const suggestionHoverStyle = {
  backgroundColor: "#f0f0f0",
};

// R4: Fixed predefined list of suggestions (all conform to validation rules)
const AUTOCOMPLETE_SUGGESTIONS = [
  'JavaScript', 'TypeScript', 'React', 'Vue', 'Angular', 
  'Node-js', 'Python', 'Java', 'C-plus-plus', 'Rust', 'Go', 'Ruby', 'PHP', 'Swift', 'Kotlin'
];

// localStorage helpers - R31-R34
const saveTagsToStorage = (tags) => {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('tagInput-tags', JSON.stringify(tags));
    }
  } catch (error) {
    // Graceful degradation - fail silently
  }
};

const loadTagsFromStorage = () => {
  try {
    if (typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem('tagInput-tags');
      return stored ? JSON.parse(stored) : [];
    }
  } catch (error) {
    // Graceful degradation - fail silently
  }
  return [];
};

// Validation helpers - R25-R27
const validateTag = (tag) => {
  // R25: Minimum 2 characters
  if (tag.length < 2) {
    return { isValid: false, error: 'Tag must be at least 2 characters' };
  }
  
  // R26: Maximum 20 characters
  if (tag.length > 20) {
    return { isValid: false, error: 'Tag must be 20 characters or less' };
  }
  
  // R27: Only letters, numbers, hyphen, underscore
  const validPattern = /^[a-zA-Z0-9_-]+$/;
  if (!validPattern.test(tag)) {
    return { isValid: false, error: 'Only letters, numbers, hyphens and underscores allowed' };
  }
  
  return { isValid: true, error: null };
};

const TagInput = () => {
  const [tags, setTags] = React.useState(() => loadTagsFromStorage());
  const [validationError, setValidationError] = React.useState(null);
  const [inputValue, setInputValue] = React.useState('');
  const [showDropdown, setShowDropdown] = React.useState(false);
  const [filteredSuggestions, setFilteredSuggestions] = React.useState([]);
  const [highlightedIndex, setHighlightedIndex] = React.useState(-1);
  const [draggedTag, setDraggedTag] = React.useState(null);
  const [dragOverIndex, setDragOverIndex] = React.useState(null);
  
  // R15: Maximum 5 tags allowed
  const MAX_TAGS = 5;
  const isAtLimit = tags.length >= MAX_TAGS;
  const isNearLimit = tags.length === MAX_TAGS - 1;
  const canDrag = tags.length >= 2; // R23: Enable drag only with 2+ tags

  // Update localStorage whenever tags change - R31
  React.useEffect(() => {
    saveTagsToStorage(tags);
  }, [tags]);

  // R4-R8: Filter suggestions based on input
  React.useEffect(() => {
    if (inputValue.length >= 2 && !isAtLimit) {
      // R5: Case-insensitive filtering
      const filtered = AUTOCOMPLETE_SUGGESTIONS.filter(suggestion => 
        suggestion.toLowerCase().includes(inputValue.toLowerCase()) &&
        // R8: Exclude already-added tags
        !tags.includes(suggestion)
      );
      setFilteredSuggestions(filtered);
      setShowDropdown(filtered.length > 0);
      setHighlightedIndex(-1);
    } else {
      setFilteredSuggestions([]);
      setShowDropdown(false);
      setHighlightedIndex(-1);
    }
  }, [inputValue, tags, isAtLimit]);

  const handleAddTag = (input) => {
    if (!input) return;
    // DESIGN DECISION: Duplicates are silently ignored by design
    // This matches user expectation - if a tag already exists, no action needed
    if (tags.includes(input)) return;
    
    // R25-R27: Validate input before adding
    const validation = validateTag(input);
    if (!validation.isValid) {
      setValidationError(validation.error);
      return;
    }
    
    // R15: Check tag limit
    if (tags.length >= MAX_TAGS) {
      return; // Silently ignore - input should be disabled
    }
    
    // R28: Only add valid tags
    const newTags = [...tags, input];
    setTags(newTags);
    setValidationError(null); // Clear error on successful addition
    setInputValue(''); // Clear input
    setShowDropdown(false); // Hide dropdown
  };

  const onDeleteTag = (tag) => {
    const filteredTags = tags.filter((t) => t !== tag);
    setTags(filteredTags);
  };

  const handleInputChange = (e) => {
    const value = e.target.value;
    setInputValue(value);
    
    // R29 & R30: Clear validation error when input changes
    if (validationError) {
      setValidationError(null);
    }
  };

  // R20-R22: Drag and drop handlers
  const handleDragStart = (e, tag) => {
    if (!canDrag) return;
    
    // Store only the tag, not the index - compute index at drop time
    setDraggedTag(tag);
    
    // R21: Visual feedback
    e.target.setAttribute('aria-grabbed', 'true');
    
    // Set dataTransfer if available (for real browsers)
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/html', e.target.outerHTML);
    }
  };

  const handleDragEnd = (e) => {
    // R21: Reset visual feedback
    e.target.setAttribute('aria-grabbed', 'false');
    setDraggedTag(null);
    setDragOverIndex(null);
    
    // No DOM cleanup - React state drives everything
  };

  const handleDragOver = (e, index) => {
    if (!canDrag || !draggedTag) return;
    
    e.preventDefault();
    
    // Set dataTransfer if available (for real browsers)
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'move';
    }
    
    // R21: Visual feedback for drop zone - React state only
    setDragOverIndex(index);
  };

  const handleDragLeave = () => {
    setDragOverIndex(null);
  };

  const handleDrop = (e, dropIndex) => {
    if (!canDrag || !draggedTag) return;
    
    e.preventDefault();
    
    // Compute current index at drop time - prevents index drift
    const draggedIndex = tags.indexOf(draggedTag);
    
    // Don't do anything if dropping on same position
    if (draggedIndex === dropIndex) {
      setDragOverIndex(null);
      return;
    }
    
    // R22: Reorder logic
    const currentTags = [...tags];
    currentTags.splice(draggedIndex, 1); // Remove from original position
    currentTags.splice(dropIndex, 0, draggedTag); // Insert at new position
    
    setTags(currentTags);
    setDraggedTag(null);
    setDragOverIndex(null);
  };

  // R35: Backspace deletes last tag when input empty (global handler for disabled input)
  const handleGlobalKeyDown = (e) => {
    // Only handle Backspace when input is disabled and has focus
    if (e.key === 'Backspace' && isAtLimit && inputValue === '' && tags.length > 0) {
      e.preventDefault();
      onDeleteTag(tags[tags.length - 1]);
      return;
    }
  };

  // Add global keydown listener for disabled input
  React.useEffect(() => {
    if (isAtLimit) {
      document.addEventListener('keydown', handleGlobalKeyDown);
      return () => {
        document.removeEventListener('keydown', handleGlobalKeyDown);
      };
    }
  }, [isAtLimit, inputValue, tags]);

  // Unified Enter handling - R9-R13
  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      
      if (showDropdown && highlightedIndex >= 0) {
        // R11: Select highlighted suggestion
        selectSuggestion(filteredSuggestions[highlightedIndex]);
      } else {
        // Regular tag addition from input
        handleAddTag(inputValue);
      }
      return;
    }
    
    // R35: Backspace deletes last tag when input empty (for enabled input)
    if (e.key === 'Backspace' && inputValue === '' && tags.length > 0) {
      e.preventDefault();
      onDeleteTag(tags[tags.length - 1]);
      return;
    }
    
    if (!showDropdown) return;
    
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightedIndex(prev => 
          prev < filteredSuggestions.length - 1 ? prev + 1 : prev
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIndex(prev => prev > 0 ? prev - 1 : -1);
        break;
      case 'Escape':
        e.preventDefault();
        setShowDropdown(false);
        setHighlightedIndex(-1);
        break;
    }
  };

  // R11 & R13: Select suggestion with validation
  const selectSuggestion = (suggestion) => {
    if (tags.includes(suggestion)) return;
    if (tags.length >= MAX_TAGS) return;
    
    // R25-R27: Validate suggestion before adding
    const validation = validateTag(suggestion);
    if (!validation.isValid) {
      // This should not happen with current suggestions, but ensures consistency
      setValidationError(validation.error);
      return;
    }
    
    const newTags = [...tags, suggestion];
    setTags(newTags);
    setInputValue('');
    setShowDropdown(false);
    setHighlightedIndex(-1);
    setValidationError(null); // R30: Clear validation errors
  };

  // R19: Tag counter text
  const getCounterText = () => `${tags.length}/${MAX_TAGS} tags`;
  
  // R18: Warning message
  const getWarningMessage = () => {
    if (isNearLimit && !isAtLimit) {
      return '1 tag remaining';
    }
    return null;
  };
  
  // R17: Limit message
  const getLimitMessage = () => {
    if (isAtLimit) {
      return 'Maximum tags reached';
    }
    return null;
  };

  return React.createElement(
    "div",
    { style: { ...containerStyle, position: 'relative' } },
    React.createElement("h2", null, "ADD SKILLS"),
    tags.map((tag, index) =>
      React.createElement(
        "span",
        {
          key: tag,
          onClick: () => onDeleteTag(tag),
          style: {
            ...tagStyle,
            // R21: Visual feedback for drag states - React state only
            ...(draggedTag === tag ? { opacity: 0.5, transform: 'scale(0.95)' } : {}),
            ...(dragOverIndex === index ? { transform: 'scale(1.05)', boxShadow: '0 0 5px rgba(0,0,0,0.3)' } : {})
          },
          // R20: Native HTML5 drag properties
          draggable: canDrag,
          onDragStart: (e) => handleDragStart(e, tag),
          onDragEnd: handleDragEnd,
          onDragOver: (e) => handleDragOver(e, index),
          onDragLeave: handleDragLeave,
          onDrop: (e) => handleDrop(e, index),
          // R21: ARIA attributes for accessibility - React state only
          'aria-grabbed': draggedTag === tag ? 'true' : 'false'
        },
        "✖ " + tag
      )
    ),
    React.createElement("input", {
      style: inputStyle,
      value: inputValue,
      onChange: handleInputChange,
      onKeyDown: handleKeyDown,
      type: "text",
      placeholder: "Enter value...",
      // R16: Disable input at limit
      disabled: isAtLimit,
    }),
    // R19: Tag counter - always visible
    React.createElement("span", { style: counterStyle }, getCounterText()),
    // R18: Warning message at 4 tags
    getWarningMessage() && React.createElement("span", { style: warningStyle }, getWarningMessage()),
    // R17: Limit message at 5 tags
    getLimitMessage() && React.createElement("span", { style: limitStyle }, getLimitMessage()),
    // R29: Display inline validation error
    validationError && React.createElement("span", { style: errorStyle }, validationError),
    // Autocomplete dropdown
    showDropdown && React.createElement(
      "div",
      { style: dropdownStyle },
      filteredSuggestions.map((suggestion, index) =>
        React.createElement(
          "div",
          {
            key: suggestion,
            style: {
              ...suggestionStyle,
              ...(index === highlightedIndex ? suggestionHoverStyle : {})
            },
            onClick: () => selectSuggestion(suggestion),
            onMouseEnter: () => setHighlightedIndex(index),
            onMouseLeave: () => setHighlightedIndex(-1)
          },
          suggestion
        )
      )
    )
  );
};

module.exports = TagInput;
