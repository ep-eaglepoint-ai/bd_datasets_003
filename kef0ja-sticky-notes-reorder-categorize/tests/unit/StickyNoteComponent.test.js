const React = require('react');
const { render, screen, fireEvent, waitFor, act } = require('@testing-library/react');
require('@testing-library/jest-dom');

const getComponents = () => {
  const repoPath = process.env.REPO_PATH || 'repository_after';
  const StickyNote = require(`../../${repoPath}/src/components/StickyNote`).default;
  const StickyNotesProvider = require(`../../${repoPath}/src/context/StickyNotesContext`).default;
  return { StickyNote, StickyNotesProvider };
};

const repoPath = process.env.REPO_PATH || 'repository_after';
const describeAfter = describe;
const describeBefore = repoPath === 'repository_before' ? describe : describe.skip;

describeBefore('StickyNote Component - repository_before (baseline)', () => {
  test('should render basic sticky note', () => {
    const { StickyNote, StickyNotesProvider } = getComponents();
    const mockNote = {
      id: 1,
      title: 'Test Title',
      content: 'Test Content',
      color: '#ffd500'
    };
    const mockHandlers = { onNoteChange: jest.fn(), onDelete: jest.fn() };
    render(
      React.createElement(StickyNotesProvider, null,
        React.createElement(StickyNote, { note: mockNote, ...mockHandlers })
      )
    );
    expect(screen.getByText('Test Title')).toBeInTheDocument();
    expect(screen.getByText('Test Content')).toBeInTheDocument();
  });
});

describeAfter('StickyNote Component - repository_after', () => {
  let StickyNote, StickyNotesProvider;
  
  beforeEach(() => {
    localStorage.clear();
    const components = getComponents();
    StickyNote = components.StickyNote;
    StickyNotesProvider = components.StickyNotesProvider;
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  const mockNote = {
    id: 1,
    title: 'Test Title',
    content: 'Test Content',
    color: '#ffd500',
    category: 'uncategorized',
    order: 0
  };

  const mockHandlers = {
    onNoteChange: jest.fn(),
    onDelete: jest.fn()
  };

  const renderWithProvider = (component) => {
    return render(
      React.createElement(StickyNotesProvider, null, component)
    );
  };

  test('should display note content and category badge', () => {
    renderWithProvider(
      React.createElement(StickyNote, { note: mockNote, ...mockHandlers })
    );

    expect(screen.getByText('Test Title')).toBeInTheDocument();
    expect(screen.getByText('Test Content')).toBeInTheDocument();
    expect(screen.getByText('Uncategorized')).toBeInTheDocument();
  });

  test('keyboard: Enter edits title; Escape cancels', () => {
    renderWithProvider(
      React.createElement(StickyNote, { note: mockNote, ...mockHandlers })
    );

    const noteRoot = document.querySelector('.sticky-note');
    expect(noteRoot).toBeTruthy();
    noteRoot.focus();
    fireEvent.keyDown(noteRoot, { key: 'Enter' });

    const input = document.querySelector('.sticky-note-title-input');
    expect(input).toBeInTheDocument();
    fireEvent.change(input, { target: { value: 'Changed' } });
    fireEvent.keyDown(input, { key: 'Escape' });

    expect(document.querySelector('.sticky-note-title-input')).not.toBeInTheDocument();
    expect(screen.getByText('Test Title')).toBeInTheDocument();
  });
});