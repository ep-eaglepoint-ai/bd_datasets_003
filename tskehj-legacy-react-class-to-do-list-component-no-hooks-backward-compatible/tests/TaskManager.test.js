import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import TaskManager from '../repository_after/src/TaskManager';

describe('TaskManager Legacy Class Component', () => {
  
  test('Test 1: Initial render shows empty list with input and Add button', () => {
    render(React.createElement(TaskManager));
    
    const input = screen.getByTestId('task-input');
    const addButton = screen.getByTestId('add-button');
    const taskList = screen.getByTestId('task-list');
    
    expect(input).toBeInTheDocument();
    expect(addButton).toBeInTheDocument();
    expect(taskList).toBeInTheDocument();
    expect(taskList.children.length).toBe(0);
  });
  
  test('Test 2: Type "Buy groceries" and click Add', () => {
    render(React.createElement(TaskManager));
    
    const input = screen.getByTestId('task-input');
    const addButton = screen.getByTestId('add-button');
    
    fireEvent.change(input, { target: { value: 'Buy groceries' } });
    fireEvent.click(addButton);
    
    const taskItems = screen.getAllByTestId('task-item');
    expect(taskItems.length).toBe(1);
    expect(screen.getByText('Buy groceries')).toBeInTheDocument();
    expect(input.value).toBe('');
  });
  
  test('Test 3: Add multiple tasks in order', () => {
    render(React.createElement(TaskManager));
    
    const input = screen.getByTestId('task-input');
    const addButton = screen.getByTestId('add-button');
    
    // Add first task
    fireEvent.change(input, { target: { value: 'Buy groceries' } });
    fireEvent.click(addButton);
    
    // Add second task
    fireEvent.change(input, { target: { value: 'Call mom' } });
    fireEvent.click(addButton);
    
    // Add third task
    fireEvent.change(input, { target: { value: 'Walk dog' } });
    fireEvent.click(addButton);
    
    const taskItems = screen.getAllByTestId('task-item');
    expect(taskItems.length).toBe(3);
    expect(taskItems[0]).toHaveTextContent('Buy groceries');
    expect(taskItems[1]).toHaveTextContent('Call mom');
    expect(taskItems[2]).toHaveTextContent('Walk dog');
  });
  
  test('Test 4: Add and remove a task', () => {
    render(React.createElement(TaskManager));
    
    const input = screen.getByTestId('task-input');
    const addButton = screen.getByTestId('add-button');
    
    fireEvent.change(input, { target: { value: 'Task A' } });
    fireEvent.click(addButton);
    
    let taskItems = screen.getAllByTestId('task-item');
    expect(taskItems.length).toBe(1);
    
    const removeButton = screen.getByTestId('remove-button');
    fireEvent.click(removeButton);
    
    const taskList = screen.getByTestId('task-list');
    expect(taskList.children.length).toBe(0);
  });
  
  test('Test 5: Add 10 items, remove 3 from different positions', () => {
    render(React.createElement(TaskManager));
    
    const input = screen.getByTestId('task-input');
    const addButton = screen.getByTestId('add-button');
    
    // Add 10 tasks
    for (let i = 1; i <= 10; i++) {
      fireEvent.change(input, { target: { value: 'Task ' + i } });
      fireEvent.click(addButton);
    }
    
    let taskItems = screen.getAllByTestId('task-item');
    expect(taskItems.length).toBe(10);
    
    // Remove tasks at positions 0, 4, 8 (first, middle, near-end)
    const removeButtons = screen.getAllByTestId('remove-button');
    fireEvent.click(removeButtons[8]); // Remove Task 9
    fireEvent.click(removeButtons[4]); // Remove Task 5
    fireEvent.click(removeButtons[0]); // Remove Task 1
    
    taskItems = screen.getAllByTestId('task-item');
    expect(taskItems.length).toBe(7);
    
    // Verify remaining tasks are in correct order
    expect(screen.getByText('Task 2')).toBeInTheDocument();
    expect(screen.getByText('Task 3')).toBeInTheDocument();
    expect(screen.queryByText('Task 1')).not.toBeInTheDocument();
    expect(screen.queryByText('Task 5')).not.toBeInTheDocument();
    expect(screen.queryByText('Task 9')).not.toBeInTheDocument();
  });
  
  test('Test 6: Attempt to add empty string', () => {
    render(React.createElement(TaskManager));
    
    const addButton = screen.getByTestId('add-button');
    const taskList = screen.getByTestId('task-list');
    
    // Click Add without typing
    fireEvent.click(addButton);
    expect(taskList.children.length).toBe(0);
    
    // Try with whitespace only
    const input = screen.getByTestId('task-input');
    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.click(addButton);
    expect(taskList.children.length).toBe(0);
  });
  
  test('Test 7: Add 100 items and verify performance', () => {
    const startTime = performance.now();
    render(React.createElement(TaskManager));
    
    const input = screen.getByTestId('task-input');
    const addButton = screen.getByTestId('add-button');
    
    // Add 100 tasks
    for (let i = 1; i <= 100; i++) {
      fireEvent.change(input, { target: { value: 'Task ' + i } });
      fireEvent.click(addButton);
    }
    
    const taskItems = screen.getAllByTestId('task-item');
    expect(taskItems.length).toBe(100);
    
    // Remove a middle item
    const removeButtons = screen.getAllByTestId('remove-button');
    fireEvent.click(removeButtons[50]);
    
    const updatedTaskItems = screen.getAllByTestId('task-item');
    expect(updatedTaskItems.length).toBe(99);
    
    const endTime = performance.now();
    const duration = endTime - startTime;
    
    // Should complete in reasonable time (< 5 seconds)
    expect(duration).toBeLessThan(5000);
  });
  
  test('Test 8: Rapid clicks handling', () => {
    render(React.createElement(TaskManager));
    
    const input = screen.getByTestId('task-input');
    const addButton = screen.getByTestId('add-button');
    
    fireEvent.change(input, { target: { value: 'Rapid Task' } });
    
    // Rapid clicks
    for (let i = 0; i < 5; i++) {
      fireEvent.click(addButton);
    }
    
    const taskItems = screen.getAllByTestId('task-item');
    // Should only add once since input is cleared after first add
    expect(taskItems.length).toBe(1);
  });
  
  test('Test 9: Enter key press adds task', () => {
    render(React.createElement(TaskManager));
    
    const input = screen.getByTestId('task-input');
    
    fireEvent.change(input, { target: { value: 'Task via Enter' } });
    fireEvent.keyPress(input, { key: 'Enter', code: 'Enter', charCode: 13 });
    
    const taskItems = screen.getAllByTestId('task-item');
    expect(taskItems.length).toBe(1);
    expect(screen.getByText('Task via Enter')).toBeInTheDocument();
  });
  
  test('Test 10: No console errors or warnings', () => {
    const consoleError = jest.spyOn(console, 'error');
    const consoleWarn = jest.spyOn(console, 'warn');
    
    render(React.createElement(TaskManager));
    
    const input = screen.getByTestId('task-input');
    const addButton = screen.getByTestId('add-button');
    
    fireEvent.change(input, { target: { value: 'Test Task' } });
    fireEvent.click(addButton);
    
    expect(consoleError).not.toHaveBeenCalled();
    expect(consoleWarn).not.toHaveBeenCalled();
    
    consoleError.mockRestore();
    consoleWarn.mockRestore();
  });
});