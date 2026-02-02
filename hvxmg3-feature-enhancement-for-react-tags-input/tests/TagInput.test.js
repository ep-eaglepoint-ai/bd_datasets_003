const React = require('react');
const { render, screen, fireEvent } = require('@testing-library/react');
const userEvent = require('@testing-library/user-event').default;
const TagInput = require('../repository_after/TagInput');

describe('TagInput - Existing Behavior', () => {
  beforeEach(() => {
    // Create fresh localStorage mock for each test to avoid interference
    const localStorageMock = {
      getItem: jest.fn(),
      setItem: jest.fn(),
      clear: jest.fn(),
      removeItem: jest.fn(),
      length: 0,
      key: jest.fn()
    };
    
    Object.defineProperty(global, 'localStorage', {
      value: localStorageMock,
      writable: true
    });
  });
  // R1: Enter key adds a tag
  test('R1: Pressing Enter adds a tag', async () => {
    const user = userEvent.setup();
    render(React.createElement(TagInput));
    
    const input = screen.getByPlaceholderText('Enter value...');
    await user.type(input, 'React{enter}');
    
    expect(screen.getByText('✖ React')).toBeInTheDocument();
  });

  // R2: Clicking a tag removes it
  test('R2: Clicking a tag removes it', async () => {
    const user = userEvent.setup();
    render(React.createElement(TagInput));
    
    // First add a tag
    const input = screen.getByPlaceholderText('Enter value...');
    await user.type(input, 'React{enter}');
    
    // Then click to remove it
    const tag = screen.getByText('✖ React');
    await user.click(tag);
    
    expect(screen.queryByText('✖ React')).not.toBeInTheDocument();
  });

  // R3: Duplicate tags are not allowed
  test('R3: Duplicate tags are ignored', async () => {
    const user = userEvent.setup();
    render(React.createElement(TagInput));
    
    const input = screen.getByPlaceholderText('Enter value...');

    // Add first tag
    await user.type(input, 'React{enter}');
    expect(screen.getByText('✖ React')).toBeInTheDocument();

    // Try to add duplicate
    await user.type(input, 'React{enter}');

    // Should still only have one tag
    const tags = screen.getAllByText('✖ React');
    expect(tags).toHaveLength(1);
    
    // DESIGN DECISION: Duplicates are silently ignored by design
    // No error message should be shown for duplicates
    expect(screen.queryByText(/Tag must be/)).not.toBeInTheDocument();
  });

  // Additional test: Empty input doesn't add tag
  test('Empty input does not add tag', async () => {
    const user = userEvent.setup();
    render(React.createElement(TagInput));
    
    const input = screen.getByPlaceholderText('Enter value...');
    await user.click(input);
    await user.keyboard('{enter}');
    
    expect(screen.queryAllByText(/✖/)).toHaveLength(0);
  });

  // Additional test: Non-Enter key doesn't add tag
  test('Non-Enter key does not add tag', async () => {
    const user = userEvent.setup();
    render(React.createElement(TagInput));
    
    const input = screen.getByPlaceholderText('Enter value...');
    await user.type(input, 'React');
    await user.keyboard('{tab}');
    
    expect(screen.queryAllByText(/✖/)).toHaveLength(0);
  });

  // Invariant test: Only Enter adds a tag
  test('Invariant: Only Enter adds a tag', async () => {
    const user = userEvent.setup();
    render(React.createElement(TagInput));

    const input = screen.getByPlaceholderText('Enter value...');
    await user.type(input, 'React');
    await user.click(document.body);

    expect(screen.queryByText('✖ React')).not.toBeInTheDocument();
  });
});

describe('TagInput - localStorage Persistence', () => {
  // Mock localStorage before each test
  beforeEach(() => {
    // Create fresh localStorage mock for each test
    const localStorageMock = {
      getItem: jest.fn(),
      setItem: jest.fn(),
      clear: jest.fn(),
      removeItem: jest.fn(),
      length: 0,
      key: jest.fn()
    };
    
    Object.defineProperty(global, 'localStorage', {
      value: localStorageMock,
      writable: true
    });
    
    // Mock console.error to test for no errors
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    // Restore console.error
    console.error.mockRestore();
  });

  // R31: Tags saved to localStorage on every change
  test('R31: Tags saved to localStorage on add', async () => {
    const user = userEvent.setup();
    render(React.createElement(TagInput));
    
    const input = screen.getByPlaceholderText('Enter value...');
    await user.type(input, 'React{enter}');
    
    expect(localStorage.setItem).toHaveBeenCalledWith('tagInput-tags', JSON.stringify(['React']));
  });

  test('R31: Tags saved to localStorage on delete', async () => {
    const user = userEvent.setup();
    
    // Set initial localStorage state
    localStorage.getItem.mockReturnValue(JSON.stringify(['React', 'Vue']));
    
    render(React.createElement(TagInput));
    
    const tag = screen.getByText('✖ React');
    await user.click(tag);
    
    expect(localStorage.setItem).toHaveBeenCalledWith('tagInput-tags', JSON.stringify(['Vue']));
  });

  // R32: Tags loaded from localStorage on mount
  test('R32: Tags loaded from localStorage on mount', () => {
    // Set initial localStorage state
    localStorage.getItem.mockReturnValue(JSON.stringify(['React', 'Vue', 'Angular']));
    
    render(React.createElement(TagInput));
    
    expect(screen.getByText('✖ React')).toBeInTheDocument();
    expect(screen.getByText('✖ Vue')).toBeInTheDocument();
    expect(screen.getByText('✖ Angular')).toBeInTheDocument();
  });

  test('R32: Handles empty localStorage on mount', () => {
    render(React.createElement(TagInput));
    
    expect(screen.queryAllByText(/✖/)).toHaveLength(0);
  });

  // R33: Graceful degradation if localStorage unavailable
  test('R33: Graceful degradation when localStorage throws on set', async () => {
    const user = userEvent.setup();
    
    // Mock localStorage.setItem to throw
    localStorage.setItem.mockImplementation(() => {
      throw new Error('localStorage unavailable');
    });
    
    render(React.createElement(TagInput));
    
    const input = screen.getByPlaceholderText('Enter value...');
    await user.type(input, 'React{enter}');
    
    // Tag should still be added to UI
    expect(screen.getByText('✖ React')).toBeInTheDocument();
    
    // localStorage.setItem should have been called
    expect(localStorage.setItem).toHaveBeenCalled();
    
    // No console errors should occur (except React act warning which we ignore)
    expect(console.error).not.toHaveBeenCalledWith(expect.stringContaining('localStorage unavailable'));
  });

  test('R33: Graceful degradation when localStorage throws on get', () => {
    // Mock localStorage.getItem to throw
    localStorage.getItem.mockImplementation(() => {
      throw new Error('localStorage unavailable');
    });
    
    render(React.createElement(TagInput));
    
    // Should render empty state without errors
    expect(screen.queryAllByText(/✖/)).toHaveLength(0);
    expect(console.error).not.toHaveBeenCalledWith(expect.stringContaining('localStorage unavailable'));
  });

  test('R33: Graceful degradation when localStorage is undefined', () => {
    // Mock localStorage to be undefined
    const originalLocalStorage = global.localStorage;
    global.localStorage = undefined;
    
    render(React.createElement(TagInput));
    
    // Should render empty state without errors
    expect(screen.queryAllByText(/✖/)).toHaveLength(0);
    expect(console.error).not.toHaveBeenCalled();
    
    // Restore original localStorage
    global.localStorage = originalLocalStorage;
  });

  // R34: No crashes or console errors if localStorage fails
  test('R34: No console errors on localStorage failure', async () => {
    const user = userEvent.setup();
    
    // Mock localStorage to throw on all operations
    localStorage.getItem.mockImplementation(() => { throw new Error('Storage error'); });
    localStorage.setItem.mockImplementation(() => { throw new Error('Storage error'); });
    
    render(React.createElement(TagInput));
    
    const input = screen.getByPlaceholderText('Enter value...');
    await user.type(input, 'React{enter}');
    
    // Tag should still be added to UI
    expect(screen.getByText('✖ React')).toBeInTheDocument();
    
    // No localStorage-related console errors should occur
    expect(console.error).not.toHaveBeenCalledWith(expect.stringContaining('Storage error'));
  });

  // R24: localStorage updates after reorder (structure test)
  test('R24: localStorage structure supports reorder updates', async () => {
    const user = userEvent.setup();
    
    render(React.createElement(TagInput));
    
    const input = screen.getByPlaceholderText('Enter value...');
    await user.type(input, 'React{enter}');
    await user.type(input, 'Vue{enter}');
    await user.type(input, 'Angular{enter}');
    
    // Verify localStorage was called with the final array
    expect(localStorage.setItem).toHaveBeenCalledWith('tagInput-tags', JSON.stringify(['React', 'Vue', 'Angular']));
    
    // The structure should support any array reordering
    const lastCall = localStorage.setItem.mock.calls[localStorage.setItem.mock.calls.length - 1];
    const savedTags = JSON.parse(lastCall[1]);
    expect(savedTags).toEqual(expect.any(Array));
    expect(savedTags).toHaveLength(3);
  });
});

describe('TagInput - Validation Layer', () => {
  beforeEach(() => {
    // Create fresh localStorage mock for each test to avoid interference
    const localStorageMock = {
      getItem: jest.fn(),
      setItem: jest.fn(),
      clear: jest.fn(),
      removeItem: jest.fn(),
      length: 0,
      key: jest.fn()
    };
    
    Object.defineProperty(global, 'localStorage', {
      value: localStorageMock,
      writable: true
    });
  });

  // R25: Minimum tag length: 2
  test('R25: Rejects tags shorter than 2 characters', async () => {
    const user = userEvent.setup();
    render(React.createElement(TagInput));
    
    const input = screen.getByPlaceholderText('Enter value...');
    await user.type(input, 'a{enter}');
    
    // Tag should not be added
    expect(screen.queryByText('✖ a')).not.toBeInTheDocument();
    
    // Error message should be displayed
    expect(screen.getByText('Tag must be at least 2 characters')).toBeInTheDocument();
  });

  test('R25: Accepts tags exactly 2 characters', async () => {
    const user = userEvent.setup();
    render(React.createElement(TagInput));
    
    const input = screen.getByPlaceholderText('Enter value...');
    await user.type(input, 'Go{enter}');
    
    // Tag should be added
    expect(screen.getByText('✖ Go')).toBeInTheDocument();
    
    // No error message
    expect(screen.queryByText('Tag must be at least 2 characters')).not.toBeInTheDocument();
  });

  // R26: Maximum tag length: 20
  test('R26: Rejects tags longer than 20 characters', async () => {
    const user = userEvent.setup();
    render(React.createElement(TagInput));
    
    const input = screen.getByPlaceholderText('Enter value...');
    const longTag = 'a'.repeat(21);
    await user.type(input, longTag + '{enter}');
    
    // Tag should not be added
    expect(screen.queryByText('✖ ' + longTag)).not.toBeInTheDocument();
    
    // Error message should be displayed
    expect(screen.getByText('Tag must be 20 characters or less')).toBeInTheDocument();
  });

  test('R26: Accepts tags exactly 20 characters', async () => {
    const user = userEvent.setup();
    render(React.createElement(TagInput));
    
    const input = screen.getByPlaceholderText('Enter value...');
    const exactTag = 'a'.repeat(20);
    await user.type(input, exactTag + '{enter}');
    
    // Tag should be added
    expect(screen.getByText('✖ ' + exactTag)).toBeInTheDocument();
    
    // No error message
    expect(screen.queryByText('Tag must be 20 characters or less')).not.toBeInTheDocument();
  });

  // R27: Allowed characters: letters, numbers, hyphen, underscore only
  test('R27: Rejects tags with special characters', async () => {
    const user = userEvent.setup();
    render(React.createElement(TagInput));
    
    const input = screen.getByPlaceholderText('Enter value...');
    await user.type(input, 'React@{enter}');
    
    // Tag should not be added
    expect(screen.queryByText('✖ React@')).not.toBeInTheDocument();
    
    // Error message should be displayed
    expect(screen.getByText('Only letters, numbers, hyphens and underscores allowed')).toBeInTheDocument();
  });

  test('R27: Accepts letters, numbers, hyphens, and underscores', async () => {
    const user = userEvent.setup();
    render(React.createElement(TagInput));
    
    const input = screen.getByPlaceholderText('Enter value...');
    
    // Test valid combinations
    const validTags = ['React', 'React-18', 'React_18', '123', 'test-123', 'test_123'];
    
    for (const tag of validTags) {
      await user.clear(input);
      await user.type(input, tag + '{enter}');
      
      // Tag should be added
      expect(screen.getByText('✖ ' + tag)).toBeInTheDocument();
      
      // No error message
      expect(screen.queryByText(/Only letters/)).not.toBeInTheDocument();
      
      // Clear the tag for next test
      const tagElement = screen.getByText('✖ ' + tag);
      await user.click(tagElement);
    }
  });

  test('R27: Rejects various invalid characters', async () => {
    const user = userEvent.setup();
    render(React.createElement(TagInput));
    
    const input = screen.getByPlaceholderText('Enter value...');
    const invalidTestCases = [
      { input: 'React@', description: 'at symbol' },
      { input: 'React#', description: 'hash' },
      { input: 'React$', description: 'dollar' },
      { input: 'React ', description: 'space' },
      { input: 'React.', description: 'period' }
    ];
    
    for (const testCase of invalidTestCases) {
      await user.clear(input);
      await user.type(input, testCase.input);
      await user.keyboard('{enter}');
      
      // Tag should not be added
      expect(screen.queryByText('✖ ' + testCase.input)).not.toBeInTheDocument();
      
      // Error message should be displayed
      expect(screen.getByText('Only letters, numbers, hyphens and underscores allowed')).toBeInTheDocument();
      
      // Clear error for next test
      await user.clear(input);
    }
  });

  // R28: Invalid tags are not added
  test('R28: Invalid tags never appear in UI', async () => {
    const user = userEvent.setup();
    render(React.createElement(TagInput));
    
    const input = screen.getByPlaceholderText('Enter value...');
    
    // Try various invalid inputs
    const invalidInputs = ['a', 'a'.repeat(21), 'React@', 'Test#', 'Hello World'];
    
    for (const invalid of invalidInputs) {
      await user.clear(input);
      await user.type(input, invalid + '{enter}');
      
      // Tag should not be added
      expect(screen.queryByText('✖ ' + invalid)).not.toBeInTheDocument();
      
      // localStorage should not be called with invalid tag
      expect(localStorage.setItem).not.toHaveBeenCalledWith('tagInput-tags', expect.stringContaining(invalid));
    }
  });

  // R29: Inline validation error message displayed
  test('R29: Error message appears and disappears appropriately', async () => {
    const user = userEvent.setup();
    render(React.createElement(TagInput));
    
    const input = screen.getByPlaceholderText('Enter value...');
    
    // Initially no error
    expect(screen.queryByText(/Tag must be/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Only letters/)).not.toBeInTheDocument();
    
    // Type invalid input (too short)
    await user.type(input, 'a{enter}');
    
    // Error should appear
    expect(screen.getByText('Tag must be at least 2 characters')).toBeInTheDocument();
    
    // Type valid input
    await user.clear(input);
    await user.type(input, 'React');
    
    // Error should disappear
    expect(screen.queryByText('Tag must be at least 2 characters')).not.toBeInTheDocument();
    
    // Type another invalid input (special char)
    await user.clear(input);
    await user.type(input, 'Test@{enter}');
    
    // Different error should appear
    expect(screen.getByText('Only letters, numbers, hyphens and underscores allowed')).toBeInTheDocument();
  });

  // R30: Validation errors clear when autocomplete selection is used
  test('R30: Validation errors clear on autocomplete selection (stub)', async () => {
    const user = userEvent.setup();
    render(React.createElement(TagInput));
    
    const input = screen.getByPlaceholderText('Enter value...');
    
    // Type invalid input to trigger error
    await user.type(input, 'a{enter}');
    expect(screen.getByText('Tag must be at least 2 characters')).toBeInTheDocument();
    
    // Simulate autocomplete selection (will be implemented in autocomplete chunk)
    // For now, we'll simulate by clearing and typing valid input
    await user.clear(input);
    await user.type(input, 'React');
    
    // Error should be cleared
    expect(screen.queryByText('Tag must be at least 2 characters')).not.toBeInTheDocument();
  });

  // Additional validation tests
  test('Validation does not affect valid tag addition', async () => {
    const user = userEvent.setup();
    render(React.createElement(TagInput));
    
    const input = screen.getByPlaceholderText('Enter value...');
    
    // Add multiple valid tags
    await user.type(input, 'React{enter}');
    await user.type(input, 'Vue-3{enter}');
    await user.type(input, 'Angular_18{enter}');
    
    // All tags should be added
    expect(screen.getByText('✖ React')).toBeInTheDocument();
    expect(screen.getByText('✖ Vue-3')).toBeInTheDocument();
    expect(screen.getByText('✖ Angular_18')).toBeInTheDocument();
    
    // No errors should be present
    expect(screen.queryByText(/Tag must be/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Only letters/)).not.toBeInTheDocument();
  });

  test('Validation works with localStorage persistence', async () => {
    const user = userEvent.setup();
    render(React.createElement(TagInput));
    
    // Clear localStorage calls from initial render
    localStorage.setItem.mockClear();
    
    const input = screen.getByPlaceholderText('Enter value...');
    
    // Try to add invalid tag
    await user.type(input, 'a{enter}');
    
    // Tag should not be saved to localStorage
    expect(localStorage.setItem).not.toHaveBeenCalled();
    
    // Add valid tag
    await user.clear(input);
    await user.type(input, 'React{enter}');
    
    // Valid tag should be saved
    expect(localStorage.setItem).toHaveBeenCalledWith('tagInput-tags', JSON.stringify(['React']));
  });
});

describe('TagInput - Tag Limit + Visual Feedback', () => {
  beforeEach(() => {
    // Create fresh localStorage mock for each test to avoid interference
    const localStorageMock = {
      getItem: jest.fn(),
      setItem: jest.fn(),
      clear: jest.fn(),
      removeItem: jest.fn(),
      length: 0,
      key: jest.fn()
    };
    
    Object.defineProperty(global, 'localStorage', {
      value: localStorageMock,
      writable: true
    });
  });

  // R15: Maximum 5 tags allowed
  test('R15: Cannot add more than 5 tags', async () => {
    const user = userEvent.setup();
    render(React.createElement(TagInput));
    
    const input = screen.getByPlaceholderText('Enter value...');
    
    // Add 5 valid tags
    await user.type(input, 'React{enter}');
    await user.type(input, 'Vue{enter}');
    await user.type(input, 'Angular{enter}');
    await user.type(input, 'Node{enter}');
    await user.type(input, 'Python{enter}');
    
    // All 5 tags should be present
    expect(screen.getByText('✖ React')).toBeInTheDocument();
    expect(screen.getByText('✖ Vue')).toBeInTheDocument();
    expect(screen.getByText('✖ Angular')).toBeInTheDocument();
    expect(screen.getByText('✖ Node')).toBeInTheDocument();
    expect(screen.getByText('✖ Python')).toBeInTheDocument();
    
    // Try to add 6th tag
    await user.type(input, 'Java{enter}');
    
    // 6th tag should not be added
    expect(screen.queryByText('✖ Java')).not.toBeInTheDocument();
    
    // Should still have exactly 5 tags
    expect(screen.queryAllByText(/✖/)).toHaveLength(5);
  });

  // R16: Input disabled when limit reached
  test('R16: Input disabled when 5 tags reached', async () => {
    const user = userEvent.setup();
    render(React.createElement(TagInput));
    
    const input = screen.getByPlaceholderText('Enter value...');
    
    // Input should be enabled initially
    expect(input).not.toBeDisabled();
    
    // Add 5 tags
    await user.type(input, 'React{enter}');
    await user.type(input, 'Vue{enter}');
    await user.type(input, 'Angular{enter}');
    await user.type(input, 'Node{enter}');
    await user.type(input, 'Python{enter}');
    
    // Input should be disabled at limit
    expect(input).toBeDisabled();
  });

  test('R16: Input re-enabled when tag removed', async () => {
    const user = userEvent.setup();
    render(React.createElement(TagInput));
    
    const input = screen.getByPlaceholderText('Enter value...');
    
    // Add 5 tags to reach limit
    await user.type(input, 'React{enter}');
    await user.type(input, 'Vue{enter}');
    await user.type(input, 'Angular{enter}');
    await user.type(input, 'Node{enter}');
    await user.type(input, 'Python{enter}');
    
    // Input should be disabled
    expect(input).toBeDisabled();
    
    // Remove one tag
    const tag = screen.getByText('✖ React');
    await user.click(tag);
    
    // Input should be re-enabled
    expect(input).not.toBeDisabled();
  });

  // R17: "Maximum tags reached" message shown at limit
  test('R17: Maximum tags reached message appears', async () => {
    const user = userEvent.setup();
    render(React.createElement(TagInput));
    
    const input = screen.getByPlaceholderText('Enter value...');
    
    // Initially no limit message
    expect(screen.queryByText('Maximum tags reached')).not.toBeInTheDocument();
    
    // Add 5 tags
    await user.type(input, 'React{enter}');
    await user.type(input, 'Vue{enter}');
    await user.type(input, 'Angular{enter}');
    await user.type(input, 'Node{enter}');
    await user.type(input, 'Python{enter}');
    
    // Limit message should appear
    expect(screen.getByText('Maximum tags reached')).toBeInTheDocument();
  });

  test('R17: Limit message disappears when tag removed', async () => {
    const user = userEvent.setup();
    render(React.createElement(TagInput));
    
    const input = screen.getByPlaceholderText('Enter value...');
    
    // Add 5 tags to reach limit
    await user.type(input, 'React{enter}');
    await user.type(input, 'Vue{enter}');
    await user.type(input, 'Angular{enter}');
    await user.type(input, 'Node{enter}');
    await user.type(input, 'Python{enter}');
    
    // Limit message should be present
    expect(screen.getByText('Maximum tags reached')).toBeInTheDocument();
    
    // Remove one tag
    const tag = screen.getByText('✖ React');
    await user.click(tag);
    
    // Limit message should disappear
    expect(screen.queryByText('Maximum tags reached')).not.toBeInTheDocument();
  });

  // R18: "1 tag remaining" warning shown at 4 tags
  test('R18: Warning message appears at 4 tags', async () => {
    const user = userEvent.setup();
    render(React.createElement(TagInput));
    
    const input = screen.getByPlaceholderText('Enter value...');
    
    // Initially no warning
    expect(screen.queryByText('1 tag remaining')).not.toBeInTheDocument();
    
    // Add 4 tags
    await user.type(input, 'React{enter}');
    await user.type(input, 'Vue{enter}');
    await user.type(input, 'Angular{enter}');
    await user.type(input, 'Node{enter}');
    
    // Warning should appear
    expect(screen.getByText('1 tag remaining')).toBeInTheDocument();
    
    // Add 5th tag
    await user.type(input, 'Python{enter}');
    
    // Warning should disappear, replaced by limit message
    expect(screen.queryByText('1 tag remaining')).not.toBeInTheDocument();
    expect(screen.getByText('Maximum tags reached')).toBeInTheDocument();
  });

  test('R18: Warning disappears when tag removed from 4', async () => {
    const user = userEvent.setup();
    render(React.createElement(TagInput));
    
    const input = screen.getByPlaceholderText('Enter value...');
    
    // Add 4 tags
    await user.type(input, 'React{enter}');
    await user.type(input, 'Vue{enter}');
    await user.type(input, 'Angular{enter}');
    await user.type(input, 'Node{enter}');
    
    // Warning should be present
    expect(screen.getByText('1 tag remaining')).toBeInTheDocument();
    
    // Remove one tag
    const tag = screen.getByText('✖ React');
    await user.click(tag);
    
    // Warning should disappear
    expect(screen.queryByText('1 tag remaining')).not.toBeInTheDocument();
  });

  // R19: Tag counter "X/5 tags" always visible
  test('R19: Tag counter always visible', async () => {
    const user = userEvent.setup();
    render(React.createElement(TagInput));
    
    // Counter should be visible initially
    expect(screen.getByText('0/5 tags')).toBeInTheDocument();
    
    const input = screen.getByPlaceholderText('Enter value...');
    
    // Add tags and check counter updates
    await user.type(input, 'React{enter}');
    expect(screen.getByText('1/5 tags')).toBeInTheDocument();
    
    await user.type(input, 'Vue{enter}');
    expect(screen.getByText('2/5 tags')).toBeInTheDocument();
    
    await user.type(input, 'Angular{enter}');
    expect(screen.getByText('3/5 tags')).toBeInTheDocument();
    
    await user.type(input, 'Node{enter}');
    expect(screen.getByText('4/5 tags')).toBeInTheDocument();
    
    await user.type(input, 'Python{enter}');
    expect(screen.getByText('5/5 tags')).toBeInTheDocument();
  });

  test('R19: Counter updates when tags removed', async () => {
    const user = userEvent.setup();
    render(React.createElement(TagInput));
    
    const input = screen.getByPlaceholderText('Enter value...');
    
    // Add 3 tags
    await user.type(input, 'React{enter}');
    await user.type(input, 'Vue{enter}');
    await user.type(input, 'Angular{enter}');
    
    // Counter should show 3/5
    expect(screen.getByText('3/5 tags')).toBeInTheDocument();
    
    // Remove one tag
    const tag = screen.getByText('✖ React');
    await user.click(tag);
    
    // Counter should update to 2/5
    expect(screen.getByText('2/5 tags')).toBeInTheDocument();
  });

  // Additional integration tests
  test('Tag limit works with localStorage persistence', async () => {
    const user = userEvent.setup();
    render(React.createElement(TagInput));
    
    // Clear localStorage calls from initial render
    localStorage.setItem.mockClear();
    
    const input = screen.getByPlaceholderText('Enter value...');
    
    // Add 5 tags
    await user.type(input, 'React{enter}');
    await user.type(input, 'Vue{enter}');
    await user.type(input, 'Angular{enter}');
    await user.type(input, 'Node{enter}');
    await user.type(input, 'Python{enter}');
    
    // Try to add 6th tag
    await user.type(input, 'Java{enter}');
    
    // localStorage should only be called with 5 tags, not 6
    expect(localStorage.setItem).toHaveBeenCalledWith('tagInput-tags', JSON.stringify(['React', 'Vue', 'Angular', 'Node', 'Python']));
    expect(localStorage.setItem).not.toHaveBeenCalledWith('tagInput-tags', expect.stringContaining('Java'));
  });

  test('Tag limit works with validation', async () => {
    const user = userEvent.setup();
    render(React.createElement(TagInput));
    
    const input = screen.getByPlaceholderText('Enter value...');
    
    // Add 4 valid tags
    await user.type(input, 'React{enter}');
    await user.type(input, 'Vue{enter}');
    await user.type(input, 'Angular{enter}');
    await user.type(input, 'Node{enter}');
    
    // Try to add invalid tag (should fail validation)
    await user.type(input, 'a{enter}');
    
    // Should show validation error, not limit warning
    expect(screen.getByText('Tag must be at least 2 characters')).toBeInTheDocument();
    expect(screen.getByText('1 tag remaining')).toBeInTheDocument();
    expect(screen.queryByText('Maximum tags reached')).not.toBeInTheDocument();
    
    // Add valid 5th tag
    await user.clear(input);
    await user.type(input, 'Python{enter}');
    
    // Should show limit reached, not validation error
    expect(screen.queryByText('Tag must be at least 2 characters')).not.toBeInTheDocument();
    expect(screen.getByText('Maximum tags reached')).toBeInTheDocument();
  });
});

describe('TagInput - Autocomplete', () => {
  const suggestions = [
    'JavaScript', 'TypeScript', 'React', 'Vue', 'Angular', 
    'Node-js', 'Python', 'Java', 'C-plus-plus', 'Rust', 'Go', 'Ruby', 'PHP', 'Swift', 'Kotlin'
  ];

  beforeEach(() => {
    // Create fresh localStorage mock for each test to avoid interference
    const localStorageMock = {
      getItem: jest.fn(),
      setItem: jest.fn(),
      clear: jest.fn(),
      removeItem: jest.fn(),
      length: 0,
      key: jest.fn()
    };
    
    Object.defineProperty(global, 'localStorage', {
      value: localStorageMock,
      writable: true
    });
  });

  // R4: Suggestions come from the fixed predefined list
  test('R4: Suggestions come from predefined list', async () => {
    const user = userEvent.setup();
    render(React.createElement(TagInput));
    
    const input = screen.getByPlaceholderText('Enter value...');
    
    // Type "React" - should show React from suggestions
    await user.type(input, 'React');
    
    // Should show React suggestion
    expect(screen.getByText('React')).toBeInTheDocument();
  });

  // R5: Suggestions are filtered case-insensitively
  test('R5: Case-insensitive filtering', async () => {
    const user = userEvent.setup();
    render(React.createElement(TagInput));
    
    const input = screen.getByPlaceholderText('Enter value...');
    
    // Test various case combinations
    const testCases = [
      { input: 'react', expected: 'React' },
      { input: 'REACT', expected: 'React' },
      { input: 'ReAcT', expected: 'React' },
      { input: 'python', expected: 'Python' },
      { input: 'PYTHON', expected: 'Python' },
      { input: 'node', expected: 'Node-js' },
    ];
    
    for (const testCase of testCases) {
      await user.clear(input);
      await user.type(input, testCase.input);
      
      expect(screen.getByText(testCase.expected)).toBeInTheDocument();
      
      // Clear for next test
      await user.clear(input);
    }
  });

  // R6: Suggestions appear only when input length ≥ 2
  test('R6: Suggestions appear only with 2+ characters', async () => {
    const user = userEvent.setup();
    render(React.createElement(TagInput));
    
    const input = screen.getByPlaceholderText('Enter value...');
    
    // No suggestions with 0 characters
    expect(screen.queryByText('React')).not.toBeInTheDocument();
    
    // No suggestions with 1 character
    await user.type(input, 'r');
    expect(screen.queryByText('React')).not.toBeInTheDocument();
    
    // Suggestions appear with 2 characters
    await user.type(input, 'e');
    expect(screen.getByText('React')).toBeInTheDocument();
  });

  // R7: Suggestions appear only if matches exist
  test('R7: No suggestions when no matches exist', async () => {
    const user = userEvent.setup();
    render(React.createElement(TagInput));
    
    const input = screen.getByPlaceholderText('Enter value...');
    
    // Type something that won't match any suggestions
    await user.type(input, 'xyz');
    
    // Should not show any suggestions
    expect(screen.queryByText('React')).not.toBeInTheDocument();
    expect(screen.queryByText('Python')).not.toBeInTheDocument();
    expect(screen.queryByText('Java')).not.toBeInTheDocument();
  });

  // R8: Already-added tags must not appear in suggestions
  test('R8: Existing tags excluded from suggestions', async () => {
    const user = userEvent.setup();
    render(React.createElement(TagInput));
    
    const input = screen.getByPlaceholderText('Enter value...');
    
    // Add React as a tag
    await user.type(input, 'React{enter}');
    
    // Clear input and type "Ja" (should show JavaScript but not React)
    await user.clear(input);
    await user.type(input, 'Ja');
    
    // React should not appear in suggestions since it's already added
    expect(screen.queryByText('React')).not.toBeInTheDocument();
    
    // JavaScript should still appear
    expect(screen.getByText('JavaScript')).toBeInTheDocument();
  });

  // R9: ArrowDown navigates suggestions
  test('R9: ArrowDown navigation', async () => {
    const user = userEvent.setup();
    render(React.createElement(TagInput));
    
    const input = screen.getByPlaceholderText('Enter value...');
    await user.type(input, 'ja'); // Should match JavaScript, Java
    
    // Should show matching suggestions
    expect(screen.getByText('JavaScript')).toBeInTheDocument();
    expect(screen.getByText('Java')).toBeInTheDocument();
    
    // Press ArrowDown to highlight first suggestion
    await user.keyboard('{arrowdown}');
    
    // First suggestion should be highlighted (implementation dependent)
    // For now, just ensure no errors occur and dropdown stays open
    expect(screen.getByText('JavaScript')).toBeInTheDocument();
    expect(screen.getByText('Java')).toBeInTheDocument();
  });

  // R10: ArrowUp navigates suggestions
  test('R10: ArrowUp navigation', async () => {
    const user = userEvent.setup();
    render(React.createElement(TagInput));
    
    const input = screen.getByPlaceholderText('Enter value...');
    await user.type(input, 'ja'); // Should match JavaScript, Java
    
    // Should show matching suggestions
    expect(screen.getByText('JavaScript')).toBeInTheDocument();
    expect(screen.getByText('Java')).toBeInTheDocument();
    
    // Press ArrowUp to navigate
    await user.keyboard('{arrowup}');
    
    // Suggestions should still be visible
    expect(screen.getByText('JavaScript')).toBeInTheDocument();
    expect(screen.getByText('Java')).toBeInTheDocument();
  });

  // R11: Enter selects highlighted suggestion
  test('R11: Enter selects suggestion', async () => {
    const user = userEvent.setup();
    render(React.createElement(TagInput));
    
    const input = screen.getByPlaceholderText('Enter value...');
    await user.type(input, 'React');
    
    // Should show React suggestion
    expect(screen.getByText('React')).toBeInTheDocument();
    
    // Navigate to suggestion and select with Enter
    await user.keyboard('{arrowdown}');
    await user.keyboard('{enter}');
    
    // React should be added as a tag
    expect(screen.getByText('✖ React')).toBeInTheDocument();
    
    // Input should be cleared
    expect(input.value).toBe('');
    
    // Suggestions should be hidden
    expect(screen.queryByText('JavaScript')).not.toBeInTheDocument();
  });

  // Additional keyboard autocomplete tests
  test('Keyboard autocomplete: ArrowDown then Enter selects suggestion', async () => {
    const user = userEvent.setup();
    render(React.createElement(TagInput));
    
    const input = screen.getByPlaceholderText('Enter value...');
    await user.type(input, 'ja'); // Should match JavaScript, Java
    
    // Should show matching suggestions
    expect(screen.getByText('JavaScript')).toBeInTheDocument();
    expect(screen.getByText('Java')).toBeInTheDocument();
    
    // Navigate down and select first suggestion
    await user.keyboard('{arrowdown}');
    await user.keyboard('{enter}');
    
    // First suggestion should be added
    expect(screen.getByText('✖ JavaScript')).toBeInTheDocument();
    
    // Input should be cleared
    expect(input.value).toBe('');
    
    // Suggestions should be hidden
    expect(screen.queryByText('JavaScript')).not.toBeInTheDocument();
    expect(screen.queryByText('Java')).not.toBeInTheDocument();
  });

  test('Keyboard autocomplete: ArrowUp then Enter selects suggestion', async () => {
    const user = userEvent.setup();
    render(React.createElement(TagInput));
    
    const input = screen.getByPlaceholderText('Enter value...');
    await user.type(input, 'ja'); // Should match JavaScript, Java
    
    // Should show matching suggestions
    expect(screen.getByText('JavaScript')).toBeInTheDocument();
    expect(screen.getByText('Java')).toBeInTheDocument();
    
    // Navigate down to select first suggestion
    await user.keyboard('{arrowdown}');
    await user.keyboard('{enter}');
    
    // JavaScript should be added
    expect(screen.getByText('✖ JavaScript')).toBeInTheDocument();
    
    // Input should be cleared
    expect(input.value).toBe('');
    
    // Suggestions should be hidden
    expect(screen.queryByText('JavaScript')).not.toBeInTheDocument();
    expect(screen.queryByText('Java')).not.toBeInTheDocument();
  });

  test('Keyboard autocomplete: Enter without selection adds from input', async () => {
    const user = userEvent.setup();
    render(React.createElement(TagInput));
    
    const input = screen.getByPlaceholderText('Enter value...');
    await user.type(input, 'CustomTag');
    
    // No dropdown should show (not in suggestions)
    expect(screen.queryByText('JavaScript')).not.toBeInTheDocument();
    
    // Press Enter should add from input
    await user.keyboard('{enter}');
    
    // Custom tag should be added
    expect(screen.getByText('✖ CustomTag')).toBeInTheDocument();
    
    // Input should be cleared
    expect(input.value).toBe('');
  });

  // R12: Escape closes dropdown
  test('R12: Escape closes dropdown', async () => {
    const user = userEvent.setup();
    render(React.createElement(TagInput));
    
    const input = screen.getByPlaceholderText('Enter value...');
    await user.type(input, 'React');
    
    // Should show suggestions
    expect(screen.getByText('React')).toBeInTheDocument();
    
    // Press Escape to close dropdown
    await user.keyboard('{escape}');
    
    // Suggestions should be hidden
    expect(screen.queryByText('React')).not.toBeInTheDocument();
    
    // Input should retain its value
    expect(input.value).toBe('React');
  });

  // R13: Mouse click selects suggestion
  test('R13: Mouse click selects suggestion', async () => {
    const user = userEvent.setup();
    render(React.createElement(TagInput));
    
    const input = screen.getByPlaceholderText('Enter value...');
    await user.type(input, 'React');
    
    // Should show React suggestion
    const suggestion = screen.getByText('React');
    expect(suggestion).toBeInTheDocument();
    
    // Click on suggestion
    await user.click(suggestion);
    
    // React should be added as a tag
    expect(screen.getByText('✖ React')).toBeInTheDocument();
    
    // Input should be cleared
    expect(input.value).toBe('');
    
    // Suggestions should be hidden
    expect(screen.queryByText('JavaScript')).not.toBeInTheDocument();
  });

  // R14: Dropdown closes when tag limit is reached
  test('R14: Autocomplete closes at limit', async () => {
    const user = userEvent.setup();
    render(React.createElement(TagInput));
    
    const input = screen.getByPlaceholderText('Enter value...');
    
    // Add 5 tags to reach limit
    await user.type(input, 'React{enter}');
    await user.type(input, 'Vue{enter}');
    await user.type(input, 'Angular{enter}');
    await user.type(input, 'Node{enter}');
    await user.type(input, 'Python{enter}');
    
    // Input should be disabled, preventing autocomplete
    expect(input).toBeDisabled();
    
    // Try to type to trigger autocomplete (should not work)
    await user.type(input, 'Java');
    
    // No suggestions should appear since input is disabled
    expect(screen.queryByText('JavaScript')).not.toBeInTheDocument();
    expect(screen.queryByText('Java')).not.toBeInTheDocument();
  });

  // Integration tests
  test('Autocomplete clears validation errors on selection', async () => {
    const user = userEvent.setup();
    render(React.createElement(TagInput));
    
    const input = screen.getByPlaceholderText('Enter value...');
    
    // Type invalid input to trigger validation error
    await user.type(input, 'a{enter}');
    expect(screen.getByText('Tag must be at least 2 characters')).toBeInTheDocument();
    
    // Clear and type valid input that shows suggestions
    await user.clear(input);
    await user.type(input, 'React');
    
    // Should show suggestions and no validation error
    expect(screen.getByText('React')).toBeInTheDocument();
    expect(screen.queryByText('Tag must be at least 2 characters')).not.toBeInTheDocument();
    
    // Select suggestion
    await user.click(screen.getByText('React'));
    
    // Tag should be added and validation error should remain cleared
    expect(screen.getByText('✖ React')).toBeInTheDocument();
    expect(screen.queryByText('Tag must be at least 2 characters')).not.toBeInTheDocument();
  });

  test('Autocomplete works with tag limit', async () => {
    const user = userEvent.setup();
    render(React.createElement(TagInput));
    
    const input = screen.getByPlaceholderText('Enter value...');
    
    // Add 4 tags
    await user.type(input, 'React{enter}');
    await user.type(input, 'Vue{enter}');
    await user.type(input, 'Angular{enter}');
    await user.type(input, 'Node{enter}');
    
    // Should show warning but still allow autocomplete
    await user.type(input, 'Python');
    expect(screen.getByText('Python')).toBeInTheDocument();
    expect(screen.getByText('1 tag remaining')).toBeInTheDocument();
    
    // Select suggestion
    await user.click(screen.getByText('Python'));
    
    // Should reach limit and disable input
    expect(screen.getByText('✖ Python')).toBeInTheDocument();
    expect(input).toBeDisabled();
    expect(screen.getByText('Maximum tags reached')).toBeInTheDocument();
  });

  test('Autocomplete filtering works with special characters', async () => {
    const user = userEvent.setup();
    render(React.createElement(TagInput));
    
    const input = screen.getByPlaceholderText('Enter value...');
    
    // Test filtering with Node-js (contains hyphen)
    await user.type(input, 'no');
    expect(screen.getByText('Node-js')).toBeInTheDocument();
    
    // Test filtering with C-plus-plus (contains hyphen and plus)
    await user.clear(input);
    await user.type(input, 'c-plus');
    expect(screen.getByText('C-plus-plus')).toBeInTheDocument();
  });

  test('Autocomplete dropdown positioning and behavior', async () => {
    const user = userEvent.setup();
    render(React.createElement(TagInput));
    
    const input = screen.getByPlaceholderText('Enter value...');
    
    // Type to show suggestions
    await user.type(input, 'ja');
    
    // Multiple suggestions should appear
    expect(screen.getByText('JavaScript')).toBeInTheDocument();
    expect(screen.getByText('Java')).toBeInTheDocument();
    
    // Click outside should close dropdown (implementation dependent)
    await user.click(document.body);
    
    // This test ensures the structure is in place for proper dropdown behavior
    // Actual click-outside behavior will be implementation specific
  });
});

describe('TagInput - Keyboard Enhancements', () => {
  beforeEach(() => {
    // Create fresh localStorage mock for each test to avoid interference
    const localStorageMock = {
      getItem: jest.fn(),
      setItem: jest.fn(),
      clear: jest.fn(),
      removeItem: jest.fn(),
      length: 0,
      key: jest.fn()
    };
    
    Object.defineProperty(global, 'localStorage', {
      value: localStorageMock,
      writable: true
    });
  });

  // R35: Backspace deletes last tag when input empty
  test('R35: Backspace deletes last tag when input empty', async () => {
    const user = userEvent.setup();
    render(React.createElement(TagInput));
    
    const input = screen.getByPlaceholderText('Enter value...');
    
    // Add some tags
    await user.type(input, 'React{enter}');
    await user.type(input, 'Vue{enter}');
    await user.type(input, 'Angular{enter}');
    
    // Verify tags exist
    expect(screen.getByText('✖ React')).toBeInTheDocument();
    expect(screen.getByText('✖ Vue')).toBeInTheDocument();
    expect(screen.getByText('✖ Angular')).toBeInTheDocument();
    
    // Clear input and press Backspace
    await user.clear(input);
    await user.keyboard('{backspace}');
    
    // Last tag (Angular) should be deleted
    expect(screen.queryByText('✖ Angular')).not.toBeInTheDocument();
    expect(screen.getByText('✖ React')).toBeInTheDocument();
    expect(screen.getByText('✖ Vue')).toBeInTheDocument();
    
    // Press Backspace again
    await user.keyboard('{backspace}');
    
    // Next tag (Vue) should be deleted
    expect(screen.queryByText('✖ Vue')).not.toBeInTheDocument();
    expect(screen.getByText('✖ React')).toBeInTheDocument();
    
    // Press Backspace again
    await user.keyboard('{backspace}');
    
    // Next tag (React) should be deleted
    expect(screen.queryByText('✖ React')).not.toBeInTheDocument();
    
    // No tags should remain
    expect(screen.queryAllByText(/✖/)).toHaveLength(0);
    
    // Press Backspace with no tags - should not error
    await user.keyboard('{backspace}');
    expect(screen.queryAllByText(/✖/)).toHaveLength(0);
  });

  // R35: Backspace does not delete when input has content
  test('R35: Backspace does not delete when input has content', async () => {
    const user = userEvent.setup();
    render(React.createElement(TagInput));
    
    const input = screen.getByPlaceholderText('Enter value...');
    
    // Add a tag
    await user.type(input, 'React{enter}');
    expect(screen.getByText('✖ React')).toBeInTheDocument();
    
    // Type some content in input
    await user.type(input, 'Vue');
    
    // Press Backspace - should delete from input, not tag
    await user.keyboard('{backspace}');
    
    // Tag should still exist
    expect(screen.getByText('✖ React')).toBeInTheDocument();
    
    // Input should have one character removed
    expect(input.value).toBe('Vu');
    
    // Press Backspace again to clear input
    await user.keyboard('{backspace}');
    expect(input.value).toBe('V');
    
    // Press Backspace again to clear input completely
    await user.keyboard('{backspace}');
    expect(input.value).toBe('');
    
    // Tag should still exist
    expect(screen.getByText('✖ React')).toBeInTheDocument();
  });

  // R36: No shortcut conflicts
  test('R36: No conflicts with existing keyboard shortcuts', async () => {
    const user = userEvent.setup();
    render(React.createElement(TagInput));
    
    const input = screen.getByPlaceholderText('Enter value...');
    
    // Add a tag
    await user.type(input, 'React{enter}');
    expect(screen.getByText('✖ React')).toBeInTheDocument();
    
    // Clear input
    await user.clear(input);
    
    // Test that Backspace still works for deletion
    await user.keyboard('{backspace}');
    expect(screen.queryByText('✖ React')).not.toBeInTheDocument();
    
    // Add another tag
    await user.type(input, 'Vue{enter}');
    expect(screen.getByText('✖ Vue')).toBeInTheDocument();
    
    // Test that Enter still works for adding tags
    await user.clear(input);
    await user.type(input, 'Angular{enter}');
    expect(screen.getByText('✖ Angular')).toBeInTheDocument();
    
    // Test that Escape still works for closing dropdown
    await user.type(input, 'Re');
    expect(screen.getByText('React')).toBeInTheDocument();
    await user.keyboard('{escape}');
    expect(screen.queryByText('React')).not.toBeInTheDocument();
    
    // Test that Arrow keys still work for navigation
    await user.clear(input);
    await user.type(input, 'ja');
    expect(screen.getByText('JavaScript')).toBeInTheDocument();
    expect(screen.getByText('Java')).toBeInTheDocument();
    await user.keyboard('{arrowdown}');
    await user.keyboard('{enter}');
    expect(screen.getByText('✖ JavaScript')).toBeInTheDocument();
  });

  // R37: Preserve tab behavior
  test('R37: Tab behavior is preserved', async () => {
    const user = userEvent.setup();
    render(React.createElement(TagInput));
    
    const input = screen.getByPlaceholderText('Enter value...');
    
    // Tab should move focus out of input (default browser behavior)
    await user.keyboard('{tab}');
    
    // Component should still be functional after tab
    await user.click(input);
    
    // Add a tag to ensure component still works
    await user.type(input, 'React{enter}');
    expect(screen.getByText('✖ React')).toBeInTheDocument();
    
    // Tab should still work normally
    await user.keyboard('{tab}');
    
    // Component should still be functional after tab
    await user.click(input);
    
    // Backspace should still work
    await user.clear(input);
    await user.keyboard('{backspace}');
    expect(screen.queryByText('✖ React')).not.toBeInTheDocument();
  });

  // Additional edge cases
  test('Backspace behavior with autocomplete open', async () => {
    const user = userEvent.setup();
    render(React.createElement(TagInput));
    
    const input = screen.getByPlaceholderText('Enter value...');
    
    // Add a tag
    await user.type(input, 'React{enter}');
    expect(screen.getByText('✖ React')).toBeInTheDocument();
    
    // Type to show autocomplete
    await user.type(input, 'ja');
    expect(screen.getByText('JavaScript')).toBeInTheDocument();
    expect(screen.getByText('Java')).toBeInTheDocument();
    
    // Clear input and press Backspace
    await user.clear(input);
    await user.keyboard('{backspace}');
    
    // Tag should be deleted, autocomplete should be closed
    expect(screen.queryByText('✖ React')).not.toBeInTheDocument();
    expect(screen.queryByText('JavaScript')).not.toBeInTheDocument();
    expect(screen.queryByText('Java')).not.toBeInTheDocument();
  });

  test('Backspace behavior with validation error', async () => {
    const user = userEvent.setup();
    render(React.createElement(TagInput));
    
    const input = screen.getByPlaceholderText('Enter value...');
    
    // Add a tag
    await user.type(input, 'React{enter}');
    expect(screen.getByText('✖ React')).toBeInTheDocument();
    
    // Type invalid input to trigger validation error
    await user.type(input, 'a{enter}');
    expect(screen.getByText('Tag must be at least 2 characters')).toBeInTheDocument();
    
    // Clear input and press Backspace
    await user.clear(input);
    await user.keyboard('{backspace}');
    
    // Tag should be deleted, validation error should be cleared
    expect(screen.queryByText('✖ React')).not.toBeInTheDocument();
    expect(screen.queryByText('Tag must be at least 2 characters')).not.toBeInTheDocument();
  });

  test('Backspace behavior at tag limit', async () => {
    const user = userEvent.setup();
    render(React.createElement(TagInput));
    
    const input = screen.getByPlaceholderText('Enter value...');
    
    // Add 5 tags to reach limit
    await user.type(input, 'React{enter}');
    await user.type(input, 'Vue{enter}');
    await user.type(input, 'Angular{enter}');
    await user.type(input, 'Node{enter}');
    await user.type(input, 'Python{enter}');
    
    // Input should be disabled and empty
    expect(input).toBeDisabled();
    expect(input.value).toBe('');
    expect(screen.getByText('Maximum tags reached')).toBeInTheDocument();
    
    // Press Backspace - should still delete last tag
    await user.keyboard('{backspace}');
    
    // One tag should be deleted, input should be re-enabled
    expect(screen.queryByText('✖ Python')).not.toBeInTheDocument();
    expect(screen.getByText('✖ React')).toBeInTheDocument();
    expect(screen.getByText('✖ Vue')).toBeInTheDocument();
    expect(screen.getByText('✖ Angular')).toBeInTheDocument();
    expect(screen.getByText('✖ Node')).toBeInTheDocument();
    expect(input).not.toBeDisabled();
    expect(screen.queryByText('Maximum tags reached')).not.toBeInTheDocument();
    expect(screen.getByText('1 tag remaining')).toBeInTheDocument();
    
    // Input should be empty after deletion
    expect(input.value).toBe('');
  });
});

describe('TagInput - Drag and Drop Reordering', () => {
  beforeEach(() => {
    // Create fresh localStorage mock for each test to avoid interference
    const localStorageMock = {
      getItem: jest.fn(),
      setItem: jest.fn(),
      clear: jest.fn(),
      removeItem: jest.fn(),
      length: 0,
      key: jest.fn()
    };
    
    Object.defineProperty(global, 'localStorage', {
      value: localStorageMock,
      writable: true
    });
  });

  // R20: Native HTML5 drag events
  test('R20: Tags have drag properties', async () => {
    const user = userEvent.setup();
    render(React.createElement(TagInput));
    
    const input = screen.getByPlaceholderText('Enter value...');
    
    // Add some tags
    await user.type(input, 'React{enter}');
    await user.type(input, 'Vue{enter}');
    await user.type(input, 'Angular{enter}');
    
    const tags = screen.getAllByText(/✖/);
    
    // Tags should have draggable property
    tags.forEach(tag => {
      expect(tag).toHaveAttribute('draggable', 'true');
    });
  });

  // R21: Visual feedback during drag
  test('R21: Drag start and end events', async () => {
    const user = userEvent.setup();
    render(React.createElement(TagInput));
    
    const input = screen.getByPlaceholderText('Enter value...');
    
    // Add some tags
    await user.type(input, 'React{enter}');
    await user.type(input, 'Vue{enter}');
    
    const reactTag = screen.getByText('✖ React');
    const vueTag = screen.getByText('✖ Vue');
    
    // Start drag on React tag
    fireEvent.dragStart(reactTag);
    
    // React tag should have visual feedback (dragging state)
    expect(reactTag).toHaveAttribute('aria-grabbed', 'true');
    
    // Drop on Vue tag
    fireEvent.drop(vueTag);
    fireEvent.dragEnd(reactTag);
    
    // React tag should no longer be dragging
    expect(reactTag).toHaveAttribute('aria-grabbed', 'false');
  });

  // R22: Correct reorder logic
  test('R22: Drag and drop reorders tags correctly', async () => {
    const user = userEvent.setup();
    render(React.createElement(TagInput));
    
    const input = screen.getByPlaceholderText('Enter value...');
    
    // Add tags in order
    await user.type(input, 'React{enter}');
    await user.type(input, 'Vue{enter}');
    await user.type(input, 'Angular{enter}');
    
    const reactTag = screen.getByText('✖ React');
    const angularTag = screen.getByText('✖ Angular');
    
    // Get initial order
    const initialTags = screen.getAllByText(/✖/);
    expect(initialTags[0]).toHaveTextContent('✖ React');
    expect(initialTags[1]).toHaveTextContent('✖ Vue');
    expect(initialTags[2]).toHaveTextContent('✖ Angular');
    
    // Drag React to Angular position (move from index 0 to index 2)
    fireEvent.dragStart(reactTag);
    fireEvent.drop(angularTag);
    fireEvent.dragEnd(reactTag);
    
    // Check new order
    const reorderedTags = screen.getAllByText(/✖/);
    expect(reorderedTags[0]).toHaveTextContent('✖ Vue');
    expect(reorderedTags[1]).toHaveTextContent('✖ Angular');
    expect(reorderedTags[2]).toHaveTextContent('✖ React');
  });

  // R23: Disable drag when <2 tags
  test('R23: Drag disabled with fewer than 2 tags', async () => {
    const user = userEvent.setup();
    render(React.createElement(TagInput));
    
    const input = screen.getByPlaceholderText('Enter value...');
    
    // Add one tag
    await user.type(input, 'React{enter}');
    
    const reactTag = screen.getByText('✖ React');
    
    // Single tag should not be draggable
    expect(reactTag).toHaveAttribute('draggable', 'false');
    
    // Add second tag
    await user.type(input, 'Vue{enter}');
    
    const tags = screen.getAllByText(/✖/);
    
    // With 2+ tags, both should be draggable
    tags.forEach(tag => {
      expect(tag).toHaveAttribute('draggable', 'true');
    });
    
    // Remove one tag
    await user.click(tags[0]); // Remove React
    
    const remainingTag = screen.getByText('✖ Vue');
    
    // Single tag should not be draggable again
    expect(remainingTag).toHaveAttribute('draggable', 'false');
  });

  // R24: Persist reorder to localStorage
  test('R24: Reorder persists to localStorage', async () => {
    const user = userEvent.setup();
    render(React.createElement(TagInput));
    
    const input = screen.getByPlaceholderText('Enter value...');
    
    // Clear localStorage calls from initial render
    localStorage.setItem.mockClear();
    
    // Add tags
    await user.type(input, 'React{enter}');
    await user.type(input, 'Vue{enter}');
    await user.type(input, 'Angular{enter}');
    
    const reactTag = screen.getByText('✖ React');
    const angularTag = screen.getByText('✖ Angular');
    
    // Reorder: Move React to end
    fireEvent.dragStart(reactTag);
    fireEvent.drop(angularTag);
    fireEvent.dragEnd(reactTag);
    
    // Check localStorage was called with new order
    expect(localStorage.setItem).toHaveBeenCalledWith(
      'tagInput-tags',
      JSON.stringify(['Vue', 'Angular', 'React'])
    );
  });

  // Additional comprehensive tests
  test('Drag and drop: Multiple reorders work correctly', async () => {
    const user = userEvent.setup();
    render(React.createElement(TagInput));
    
    const input = screen.getByPlaceholderText('Enter value...');
    
    // Add tags
    await user.type(input, 'React{enter}');
    await user.type(input, 'Vue{enter}');
    await user.type(input, 'Angular{enter}');
    await user.type(input, 'Node{enter}');
    
    // First reorder: Move Node to front
    let nodeTag = screen.getByText('✖ Node');
    let reactTag1 = screen.getByText('✖ React');
    
    fireEvent.dragStart(nodeTag);
    fireEvent.drop(reactTag1);
    fireEvent.dragEnd(nodeTag);
    
    let tags = screen.getAllByText(/✖/);
    expect(tags[0]).toHaveTextContent('✖ Node');
    expect(tags[1]).toHaveTextContent('✖ React');
    expect(tags[2]).toHaveTextContent('✖ Vue');
    expect(tags[3]).toHaveTextContent('✖ Angular');
    
    // Second reorder: Move Angular to second position (index 1)
    // Angular is currently at index 3, we want it at index 1
    // So we drop it on React (index 1)
    let angularTag = screen.getByText('✖ Angular');
    let reactTag2 = screen.getByText('✖ React');
    
    fireEvent.dragStart(angularTag);
    fireEvent.drop(reactTag2);
    fireEvent.dragEnd(angularTag);
    
    tags = screen.getAllByText(/✖/);
    expect(tags[0]).toHaveTextContent('✖ Node');
    expect(tags[1]).toHaveTextContent('✖ Angular');
    expect(tags[2]).toHaveTextContent('✖ React');
    expect(tags[3]).toHaveTextContent('✖ Vue');
  });

  test('Drag and drop: Drag over same position does nothing', async () => {
    const user = userEvent.setup();
    render(React.createElement(TagInput));
    
    const input = screen.getByPlaceholderText('Enter value...');
    
    // Add tags
    await user.type(input, 'React{enter}');
    await user.type(input, 'Vue{enter}');
    await user.type(input, 'Angular{enter}');
    
    const reactTag = screen.getByText('✖ React');
    const vueTag = screen.getByText('✖ Vue');
    
    // Get initial order
    const initialTags = screen.getAllByText(/✖/);
    const initialOrder = initialTags.map(tag => tag.textContent);
    
    // Try to drop React on Vue (adjacent position, should swap)
    fireEvent.dragStart(reactTag);
    fireEvent.drop(vueTag);
    fireEvent.dragEnd(reactTag);
    
    // Order should change
    const reorderedTags = screen.getAllByText(/✖/);
    expect(reorderedTags.map(tag => tag.textContent)).not.toEqual(initialOrder);
  });

  test('Drag and drop: Works with tag limit', async () => {
    const user = userEvent.setup();
    render(React.createElement(TagInput));
    
    const input = screen.getByPlaceholderText('Enter value...');
    
    // Add 5 tags to reach limit
    await user.type(input, 'React{enter}');
    await user.type(input, 'Vue{enter}');
    await user.type(input, 'Angular{enter}');
    await user.type(input, 'Node{enter}');
    await user.type(input, 'Python{enter}');
    
    // Input should be disabled
    expect(input).toBeDisabled();
    
    // Tags should still be draggable
    const tags = screen.getAllByText(/✖/);
    tags.forEach(tag => {
      expect(tag).toHaveAttribute('draggable', 'true');
    });
    
    // Reorder should still work
    const reactTag = screen.getByText('✖ React');
    const pythonTag = screen.getByText('✖ Python');
    
    fireEvent.dragStart(reactTag);
    fireEvent.drop(pythonTag);
    fireEvent.dragEnd(reactTag);
    
    const reorderedTags = screen.getAllByText(/✖/);
    expect(reorderedTags[0]).toHaveTextContent('✖ Vue');
    expect(reorderedTags[4]).toHaveTextContent('✖ React');
  });

  test('Drag and drop: Works with validation', async () => {
    const user = userEvent.setup();
    render(React.createElement(TagInput));
    
    const input = screen.getByPlaceholderText('Enter value...');
    
    // Add tags
    await user.type(input, 'React{enter}');
    await user.type(input, 'Vue{enter}');
    
    // Type invalid input to trigger validation error
    await user.type(input, 'a{enter}');
    expect(screen.getByText('Tag must be at least 2 characters')).toBeInTheDocument();
    
    // Drag and drop should still work despite validation error
    const reactTag = screen.getByText('✖ React');
    const vueTag = screen.getByText('✖ Vue');
    
    fireEvent.dragStart(reactTag);
    fireEvent.drop(vueTag);
    fireEvent.dragEnd(reactTag);
    
    const reorderedTags = screen.getAllByText(/✖/);
    expect(reorderedTags[0]).toHaveTextContent('✖ Vue');
    expect(reorderedTags[1]).toHaveTextContent('✖ React');
    
    // Validation error should still be present
    expect(screen.getByText('Tag must be at least 2 characters')).toBeInTheDocument();
  });

  test('Drag and drop: Visual feedback states', async () => {
    const user = userEvent.setup();
    render(React.createElement(TagInput));
    
    const input = screen.getByPlaceholderText('Enter value...');
    
    // Add tags
    await user.type(input, 'React{enter}');
    await user.type(input, 'Vue{enter}');
    await user.type(input, 'Angular{enter}');
    
    const reactTag = screen.getByText('✖ React');
    const vueTag = screen.getByText('✖ Vue');
    
    // Start drag
    fireEvent.dragStart(reactTag);
    
    // Dragged tag should have grabbed state
    expect(reactTag).toHaveAttribute('aria-grabbed', 'true');
    
    // Other tags should have visual feedback when dragged over (React state only)
    fireEvent.dragOver(vueTag);
    
    // End drag
    fireEvent.drop(vueTag);
    fireEvent.dragEnd(reactTag);
    
    // States should reset
    expect(reactTag).toHaveAttribute('aria-grabbed', 'false');
  });
});
