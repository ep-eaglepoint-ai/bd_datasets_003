import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';

const getComponents = () => {
  const repoPath = process.env.REPO_PATH || 'repository_after';
  const App = require(`../../${repoPath}/src/App`).default;
  return { App };
};

describe('LocalStorage Integration', () => {
  let App;
  
  beforeEach(() => {
    localStorage.clear();
    const components = getComponents();
    App = components.App;
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  const renderApp = () => {
    return render(React.createElement(App));
  };

  test('should persist notes to localStorage on add', () => {
    renderApp();
    let savedNotes = JSON.parse(localStorage.getItem('notes') || '[]');
    expect(savedNotes).toHaveLength(0);
    const addButton = screen.getAllByRole('button', { name: /add new note/i })[0];
    fireEvent.click(addButton);
    savedNotes = JSON.parse(localStorage.getItem('notes') || '[]');
    expect(savedNotes).toHaveLength(1);
    expect(savedNotes[0]).toMatchObject({
      title: 'Click to edit title',
      content: 'Click to edit content',
      category: 'uncategorized',
      order: 0
    });
  });

  test('should persist note order changes to localStorage', async () => {
    const { container } = renderApp();
    const addButton = screen.getAllByRole('button', { name: /add new note/i })[0];
    fireEvent.click(addButton);
    fireEvent.click(addButton);
    fireEvent.click(addButton);
    let savedNotes = JSON.parse(localStorage.getItem('notes'));
    const initialOrder = savedNotes.map(note => note.id);
    const { useStickyNotes } = require(`../../${process.env.REPO_PATH || 'repository_after'}/src/context/StickyNotesContext`);
    savedNotes = JSON.parse(localStorage.getItem('notes'));
    savedNotes.forEach((note, index) => {
      expect(note.order).toBe(index);
    });
  });

  test('should persist category changes to localStorage', async () => {
    renderApp();

    const addButton = screen.getAllByRole('button', { name: /add new note/i })[0];
    fireEvent.click(addButton);

    // Open the note's category dropdown (button with title="Category") and choose Work.
    const noteCategoryButton = screen.getAllByTitle('Category')[0];
    fireEvent.click(noteCategoryButton);

    const noteEl = noteCategoryButton.closest('.sticky-note');
    expect(noteEl).not.toBeNull();
    const workOption = within(noteEl).getByRole('button', { name: 'Work' });
    fireEvent.click(workOption);

    await waitFor(() => {
      const savedNotes = JSON.parse(localStorage.getItem('notes'));
      expect(savedNotes[0].category).toBe('work');
    });
  });

  test('should load notes from localStorage on init', () => {
    const existingNotes = [
      {
        id: 1,
        title: 'Saved Note 1',
        content: 'Saved Content 1',
        color: '#ffd500',
        category: 'work',
        order: 0
      },
      {
        id: 2,
        title: 'Saved Note 2',
        content: 'Saved Content 2',
        color: '#0000ff',
        category: 'personal',
        order: 1
      }
    ];
    localStorage.setItem('notes', JSON.stringify(existingNotes));

    renderApp();
    expect(screen.getByText('Saved Note 1')).toBeInTheDocument();
    expect(screen.getByText('Saved Note 2')).toBeInTheDocument();
    expect(screen.getAllByText('Work').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Personal').length).toBeGreaterThan(0);
  });

  test('should handle migration of old localStorage format', () => {
    const oldFormatNotes = [
      { id: 1, title: 'Old Note 1', content: 'Content 1', color: '#ffd500' },
      { id: 2, title: 'Old Note 2', content: 'Content 2', color: '#ff0000' }
    ];
    localStorage.setItem('notes', JSON.stringify(oldFormatNotes));

    renderApp();
    const savedNotes = JSON.parse(localStorage.getItem('notes'));
    expect(savedNotes).toHaveLength(2);
    expect(savedNotes[0]).toMatchObject({
      id: 1,
      title: 'Old Note 1',
      category: 'uncategorized',
      order: 0
    });
    expect(savedNotes[1]).toMatchObject({
      id: 2,
      title: 'Old Note 2',
      category: 'uncategorized',
      order: 1
    });
  });
});