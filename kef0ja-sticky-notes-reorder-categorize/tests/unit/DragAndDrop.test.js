import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

const resolveRepoFolder = () => {
  const raw = (process.env.REPO_PATH || 'repository_after').trim();
  if (raw.includes('repository_before')) return 'repository_before';
  if (raw.includes('repository_after')) return 'repository_after';
  return 'repository_after';
};

const getComponents = () => {
  const repoPath = resolveRepoFolder();
  const App = require(`../../${repoPath}/src/App`).default;
  return { App };
};

const repoPath = resolveRepoFolder();
const describeAfter = repoPath === 'repository_after' ? describe : describe.skip;
const describeBefore = repoPath === 'repository_before' ? describe : describe.skip;

describeBefore('Baseline (no DnD) - repository_before', () => {
  test('should render and allow adding notes', () => {
    localStorage.clear();
    const { App } = getComponents();
    render(React.createElement(App));

    const addButton = screen.getAllByRole('button', { name: /add new note/i })[0];
    fireEvent.click(addButton);
    expect(screen.getAllByText('Click to edit title').length).toBeGreaterThan(0);
  });
});

describeAfter('Drag and Drop Functionality - repository_after', () => {
  let App;
  
  beforeEach(() => {
    localStorage.clear();
    const components = getComponents();
    App = components.App;
  });

  const mockDataTransfer = {
    setData: jest.fn(),
    getData: jest.fn(() => '0'),
    effectAllowed: '',
    dropEffect: '',
    setDragImage: jest.fn()
  };

  const createDragEvent = (type) => {
    const event = new Event(type, { bubbles: true });
    event.preventDefault = jest.fn();
    event.dataTransfer = mockDataTransfer;
    return event;
  };

  const renderGrid = () => {
    return render(React.createElement(App));
  };

  test('should handle drag start with correct data', () => {
    renderGrid();
    const addButton = screen.getAllByRole('button', { name: /add new note/i })[0];
    fireEvent.click(addButton);
    const dragHandle = screen.getAllByTitle('Drag to reorder')[0];
    const dragStartEvent = createDragEvent('dragstart');
    fireEvent(dragHandle, dragStartEvent);

    expect(mockDataTransfer.setData).toHaveBeenCalledWith('text/plain', '0');
    expect(mockDataTransfer.effectAllowed).toBe('move');
  });

  test('should highlight insertion drop indicator on drag enter', () => {
    renderGrid();
    const addButton = screen.getAllByRole('button', { name: /add new note/i })[0];
    fireEvent.click(addButton);
    fireEvent.click(addButton);
    const indicators = document.querySelectorAll('.drop-indicator');
    expect(indicators.length).toBeGreaterThan(0);
    
    const dragEnterEvent = createDragEvent('dragenter');
    fireEvent(indicators[1], dragEnterEvent);

    expect(document.querySelectorAll('.drop-indicator.active').length).toBe(1);
  });

  test('dropping between notes inserts at that position', () => {
    const seed = [
      { id: 1, title: 'A', content: 'a', color: '#ffd500', category: 'uncategorized', order: 0 },
      { id: 2, title: 'B', content: 'b', color: '#ffd500', category: 'uncategorized', order: 1 },
      { id: 3, title: 'C', content: 'c', color: '#ffd500', category: 'uncategorized', order: 2 },
    ];
    localStorage.setItem('notes', JSON.stringify(seed));
    const { container } = renderGrid();

    const dragHandle = screen.getAllByTitle('Drag to reorder')[0];
    const dragStartEvent = createDragEvent('dragstart');
    fireEvent(dragHandle, dragStartEvent);

    const indicators = container.querySelectorAll('.drop-indicator');
    // Insert after the second note => indicator index 3 (zones: 0,1,2,3)
    const dropEvent = createDragEvent('drop');
    dropEvent.dataTransfer.getData = () => '0';
    fireEvent(indicators[3], dropEvent);

    const titleEls = Array.from(container.querySelectorAll('.sticky-note-title'));
    const titles = titleEls.map(el => el.textContent);
    expect(titles).toEqual(['B', 'C', 'A']);
  });

  test('should show ghost image during drag', () => {
    renderGrid();

    const addButton = screen.getAllByRole('button', { name: /add new note/i })[0];
    fireEvent.click(addButton);

    const dragHandle = screen.getAllByTitle('Drag to reorder')[0];
    const dragStartEvent = createDragEvent('dragstart');
    fireEvent(dragHandle, dragStartEvent);
    expect(mockDataTransfer.setDragImage).toHaveBeenCalled();
  });

  test('should handle drag end and clean up', () => {
    renderGrid();
    const addButton = screen.getAllByRole('button', { name: /add new note/i })[0];
    fireEvent.click(addButton);

    const dragHandle = screen.getAllByTitle('Drag to reorder')[0];
    const dragStartEvent = createDragEvent('dragstart');
    fireEvent(dragHandle, dragStartEvent);
    expect(document.querySelector('.sticky-note.dragging')).toBeInTheDocument();
    const dragEndEvent = createDragEvent('dragend');
    fireEvent(dragHandle, dragEndEvent);
    expect(document.querySelector('.sticky-note.dragging')).not.toBeInTheDocument();
  });

  test('should cancel drag on Escape key', () => {
    const { container } = renderGrid();
    const addButton = screen.getAllByRole('button', { name: /add new note/i })[0];
    fireEvent.click(addButton);
    fireEvent.click(addButton);

    const dragHandle = screen.getAllByTitle('Drag to reorder')[0];
    fireEvent(dragHandle, createDragEvent('dragstart'));

    const indicators = container.querySelectorAll('.drop-indicator');
    fireEvent(indicators[1], createDragEvent('dragenter'));
    expect(document.querySelectorAll('.drop-indicator.active').length).toBe(1);

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(document.querySelectorAll('.drop-indicator.active').length).toBe(0);
  });

  test('should prevent dragging while editing title', () => {
    renderGrid();
    const addButton = screen.getAllByRole('button', { name: /add new note/i })[0];
    fireEvent.click(addButton);

    const title = screen.getAllByText('Click to edit title')[0];
    fireEvent.click(title);

    mockDataTransfer.setData.mockClear();
    const dragHandle = screen.getAllByTitle('Drag to reorder')[0];
    const dragStartEvent = createDragEvent('dragstart');
    fireEvent(dragHandle, dragStartEvent);
    expect(mockDataTransfer.setData).not.toHaveBeenCalled();
  });
});