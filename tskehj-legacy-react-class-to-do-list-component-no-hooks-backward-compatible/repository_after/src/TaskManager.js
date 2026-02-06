import React from 'react';

/**
 * Legacy React Class Component for To-Do List Management
 * Strict Requirements: No Hooks, No Functional Components, No Arrow Functions
 * Backward-Compatible with pre-16.8 React codebases
 */
class TaskManager extends React.Component {
  constructor(props) {
    super(props);
    
    // Initialize state in constructor (legacy pattern)
    this.state = {
      tasks: [],
      inputValue: ''
    };
    
    // Bind all event handlers in constructor to avoid context loss
    // This is the recommended legacy pattern for performance
    this.handleInputChange = this.handleInputChange.bind(this);
    this.handleAddTask = this.handleAddTask.bind(this);
    this.handleKeyPress = this.handleKeyPress.bind(this);
  }
  
  /**
   * Handle input field changes
   * @param {Event} event - DOM input event
   */
  handleInputChange(event) {
    this.setState({
      inputValue: event.target.value
    });
  }
  
  /**
   * Handle Enter key press in input field
   * @param {KeyboardEvent} event - DOM keyboard event
   */
  handleKeyPress(event) {
    if (event.key === 'Enter') {
      this.handleAddTask();
    }
  }
  
  /**
   * Add new task to the list
   * Uses functional setState to avoid race conditions
   */
  handleAddTask() {
    var trimmedValue = this.state.inputValue.trim();
    
    // Ignore empty inputs gracefully
    if (trimmedValue === '') {
      return;
    }
    
    // Create new task object with unique ID
    // Using timestamp + random for uniqueness without external libraries
    var newTask = {
      id: Date.now() + Math.random(),
      text: trimmedValue
    };
    
    // Update state immutably using functional setState
    // This pattern prevents direct mutation and race conditions
    this.setState(function(prevState) {
      return {
        tasks: prevState.tasks.concat([newTask]),
        inputValue: ''
      };
    });
  }
  
  /**
   * Create a remove handler for a specific task
   * Returns a function to maintain correct this context
   * @param {number} taskId - Unique task identifier
   * @returns {function} Handler function for onClick
   */
  handleRemoveTask(taskId) {
    var self = this;
    return function() {
      self.setState(function(prevState) {
        return {
          tasks: prevState.tasks.filter(function(task) {
            return task.id !== taskId;
          })
        };
      });
    };
  }
  
  /**
   * Render method using React.createElement (no JSX dependencies)
   * This ensures maximum backward compatibility
   */
  render() {
    var self = this;
    
    return React.createElement(
      'div',
      { 
        className: 'task-manager',
        style: {
          maxWidth: '600px',
          margin: '20px auto',
          padding: '20px',
          fontFamily: 'Arial, sans-serif'
        }
      },
      React.createElement(
        'h1', 
        { 
          style: {
            textAlign: 'center',
            color: '#333'
          }
        }, 
        'To-Do List'
      ),
      React.createElement(
        'div',
        { 
          className: 'input-container',
          style: {
            display: 'flex',
            marginBottom: '20px',
            gap: '10px'
          }
        },
        React.createElement('input', {
          type: 'text',
          value: this.state.inputValue,
          onChange: this.handleInputChange,
          onKeyPress: this.handleKeyPress,
          placeholder: 'Enter a task...',
          className: 'task-input',
          'data-testid': 'task-input',
          style: {
            flex: '1',
            padding: '10px',
            fontSize: '16px',
            border: '1px solid #ddd',
            borderRadius: '4px'
          }
        }),
        React.createElement(
          'button',
          {
            onClick: this.handleAddTask,
            className: 'add-button',
            'data-testid': 'add-button',
            style: {
              padding: '10px 20px',
              fontSize: '16px',
              backgroundColor: '#4CAF50',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }
          },
          'Add'
        )
      ),
      React.createElement(
        'ul',
        { 
          className: 'task-list',
          'data-testid': 'task-list',
          style: {
            listStyle: 'none',
            padding: '0'
          }
        },
        this.state.tasks.map(function(task) {
          return React.createElement(
            'li',
            { 
              key: task.id,
              className: 'task-item',
              'data-testid': 'task-item',
              style: {
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '10px',
                marginBottom: '8px',
                backgroundColor: '#f9f9f9',
                border: '1px solid #ddd',
                borderRadius: '4px'
              }
            },
            React.createElement(
              'span', 
              { 
                className: 'task-text',
                style: {
                  flex: '1',
                  fontSize: '16px'
                }
              }, 
              task.text
            ),
            React.createElement(
              'button',
              {
                onClick: self.handleRemoveTask(task.id),
                className: 'remove-button',
                'data-testid': 'remove-button',
                style: {
                  padding: '5px 15px',
                  fontSize: '14px',
                  backgroundColor: '#f44336',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }
              },
              'Remove'
            )
          );
        })
      ),
      React.createElement(
        'div',
        {
          style: {
            marginTop: '20px',
            textAlign: 'center',
            color: '#666',
            fontSize: '14px'
          }
        },
        'Total tasks: ' + this.state.tasks.length
      )
    );
  }
}

export default TaskManager;