import React from 'react';

/**
 * Style constants defined outside render to prevent object churn.
 * Shared across all instances without recreation.
 */
var STYLES = {
  container: {
    maxWidth: '600px',
    margin: '20px auto',
    padding: '20px',
    fontFamily: 'Arial, sans-serif'
  },
  heading: {
    textAlign: 'center',
    color: '#333'
  },
  inputContainer: {
    display: 'flex',
    marginBottom: '20px',
    gap: '10px'
  },
  input: {
    flex: '1',
    padding: '10px',
    fontSize: '16px',
    border: '1px solid #ddd',
    borderRadius: '4px'
  },
  addButton: {
    padding: '10px 20px',
    fontSize: '16px',
    backgroundColor: '#4CAF50',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer'
  },
  taskList: {
    listStyle: 'none',
    padding: '0'
  },
  taskItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '10px',
    marginBottom: '8px',
    backgroundColor: '#f9f9f9',
    border: '1px solid #ddd',
    borderRadius: '4px'
  },
  taskText: {
    flex: '1',
    fontSize: '16px'
  },
  removeButton: {
    padding: '5px 15px',
    fontSize: '14px',
    backgroundColor: '#f44336',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer'
  },
  footer: {
    marginTop: '20px',
    textAlign: 'center',
    color: '#666',
    fontSize: '14px'
  }
};

/**
 * TaskItem - Individual task display component (class-based).
 *
 * Owns its own remove handler bound once in the constructor.
 * Implements shouldComponentUpdate to prevent unnecessary re-renders
 * when sibling tasks change but this task's props remain the same.
 *
 * Props:
 *   task   {Object}   – { id: number, text: string }
 *   onRemove {Function} – stable callback from parent, called with task id
 */
class TaskItem extends React.Component {
  constructor(props) {
    super(props);
    // Bind once in constructor – no per-render allocation
    this.handleRemove = this.handleRemove.bind(this);
  }

  /**
   * Prevent re-render unless this specific task changed.
   * onRemove is a stable reference (bound in TaskManager constructor),
   * so we only need to compare the task data.
   */
  shouldComponentUpdate(nextProps) {
    if (this.props.task.id !== nextProps.task.id) {
      return true;
    }
    if (this.props.task.text !== nextProps.task.text) {
      return true;
    }
    return false;
  }

  /**
   * Delegates to parent handler with this task's id.
   * Bound once in constructor – same function reference across renders.
   */
  handleRemove() {
    this.props.onRemove(this.props.task.id);
  }

  render() {
    return React.createElement(
      'li',
      {
        className: 'task-item',
        'data-testid': 'task-item',
        style: STYLES.taskItem
      },
      React.createElement(
        'span',
        {
          className: 'task-text',
          style: STYLES.taskText
        },
        this.props.task.text
      ),
      React.createElement(
        'button',
        {
          onClick: this.handleRemove,
          className: 'remove-button',
          'data-testid': 'remove-button',
          style: STYLES.removeButton
        },
        'Remove'
      )
    );
  }
}

/**
 * TaskManager – Main to-do list component (class-based, no hooks).
 *
 * State:
 *   tasks      {Array}  – list of { id: number, text: string }
 *   inputValue {string} – controlled input value
 *
 * All handlers are bound once in the constructor.
 * handleRemoveTask is passed by stable reference to every TaskItem;
 * each TaskItem calls it with its own id via its own constructor-bound
 * handler, so zero functions are created inside render().
 */
class TaskManager extends React.Component {
  constructor(props) {
    super(props);

    // Simple incrementing counter for unique task IDs
    this._nextId = 0;

    this.state = {
      tasks: [],
      inputValue: ''
    };

    // Bind every handler exactly once
    this.handleInputChange = this.handleInputChange.bind(this);
    this.handleAddTask     = this.handleAddTask.bind(this);
    this.handleKeyPress    = this.handleKeyPress.bind(this);
    this.handleRemoveTask  = this.handleRemoveTask.bind(this);
  }

  /**
   * Controlled input handler.
   * @param {Event} event
   */
  handleInputChange(event) {
    this.setState({ inputValue: event.target.value });
  }

  /**
   * Submit on Enter key.
   * @param {KeyboardEvent} event
   */
  handleKeyPress(event) {
    if (event.key === 'Enter') {
      this.handleAddTask();
    }
  }

  /**
   * Append a new task. Uses functional setState to prevent
   * stale-state bugs under batched updates.
   */
  handleAddTask() {
    var trimmedValue = this.state.inputValue.trim();

    if (trimmedValue === '') {
      return;
    }

    this._nextId = this._nextId + 1;

    var newTask = {
      id: this._nextId,
      text: trimmedValue
    };

    this.setState(function (prevState) {
      return {
        tasks: prevState.tasks.concat([newTask]),
        inputValue: ''
      };
    });
  }

  /**
   * Remove a task by id. Stable reference (bound in constructor).
   * Passed as a prop to TaskItem – same reference every render.
   * @param {number} taskId
   */
  handleRemoveTask(taskId) {
    this.setState(function (prevState) {
      return {
        tasks: prevState.tasks.filter(function (task) {
          return task.id !== taskId;
        })
      };
    });
  }

  render() {
    var self = this;

    return React.createElement(
      'div',
      {
        className: 'task-manager',
        style: STYLES.container
      },

      // Heading
      React.createElement('h1', { style: STYLES.heading }, 'To-Do List'),

      // Input row
      React.createElement(
        'div',
        {
          className: 'input-container',
          style: STYLES.inputContainer
        },
        React.createElement('input', {
          type: 'text',
          value: this.state.inputValue,
          onChange: this.handleInputChange,
          onKeyPress: this.handleKeyPress,
          placeholder: 'Enter a task...',
          className: 'task-input',
          'data-testid': 'task-input',
          style: STYLES.input
        }),
        React.createElement(
          'button',
          {
            onClick: this.handleAddTask,
            className: 'add-button',
            'data-testid': 'add-button',
            style: STYLES.addButton
          },
          'Add'
        )
      ),

      // Task list – each TaskItem receives a stable onRemove reference
      React.createElement(
        'ul',
        {
          className: 'task-list',
          'data-testid': 'task-list',
          style: STYLES.taskList
        },
        this.state.tasks.map(function (task) {
          return React.createElement(TaskItem, {
            key: task.id,
            task: task,
            onRemove: self.handleRemoveTask
          });
        })
      ),

      // Footer
      React.createElement(
        'div',
        { style: STYLES.footer },
        'Total tasks: ' + this.state.tasks.length
      )
    );
  }
}

export { TaskItem };
export default TaskManager;