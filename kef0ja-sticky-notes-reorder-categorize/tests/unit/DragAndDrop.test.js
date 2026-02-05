import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

const getComponents = () => {
  const repoPath = process.env.REPO_PATH || 'repository_after';
  const App = require(`../../${repoPath}/src/App`).default;
  return { App };
};

describe('Drag and Drop Functionality', () => {
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

  test('should highlight drop zone on drag over', () => {
    renderGrid();
    const addButton = screen.getAllByRole('button', { name: /add new note/i })[0];
    fireEvent.click(addButton);
    fireEvent.click(addButton);
    const dropZones = document.querySelectorAll('.note-container');
    expect(dropZones.length).toBeGreaterThan(0);
    
    const dragOverEvent = createDragEvent('dragover');
    fireEvent(dropZones[0], dragOverEvent);

    expect(dragOverEvent.preventDefault).toHaveBeenCalled();
    expect(mockDataTransfer.dropEffect).toBe('move');
  });

  test('should handle drop and reorder notes', async () => {
    const { container } = renderGrid();
    const addButton = screen.getAllByRole('button', { name: /add new note/i })[0];
    fireEvent.click(addButton);
    fireEvent.click(addButton);
    fireEvent.click(addButton);
    const initialNotes = screen.getAllByText('Click to edit title');
    expect(initialNotes).toHaveLength(3);
    const dragStartEvent = createDragEvent('dragstart');
    const dragHandle = screen.getAllByTitle('Drag to reorder')[0];
    fireEvent(dragHandle, dragStartEvent);

    const dropZones = container.querySelectorAll('.note-container');
    const dropEvent = createDragEvent('drop');
    dropEvent.dataTransfer.getData = () => '0'; 
    
    fireEvent(dropZones[2], dropEvent);
    expect(dropEvent.preventDefault).toHaveBeenCalled();
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
});