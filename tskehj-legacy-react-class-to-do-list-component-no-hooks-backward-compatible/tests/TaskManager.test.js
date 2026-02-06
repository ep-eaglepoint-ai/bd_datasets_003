var React = require('react');
var rtl = require('@testing-library/react');
var matchers = require('@testing-library/jest-dom');
var fs = require('fs');
var path = require('path');
var TaskManager = require('../repository_after/src/TaskManager').default;

var render = rtl.render;
var screen = rtl.screen;
var fireEvent = rtl.fireEvent;

expect.extend(matchers);

describe('TaskManager Legacy Class Component', function () {

  test('Test 1: Initial render shows empty list with input and Add button', function () {
    render(React.createElement(TaskManager));

    var input = screen.getByTestId('task-input');
    var addButton = screen.getByTestId('add-button');
    var taskList = screen.getByTestId('task-list');

    expect(input).toBeInTheDocument();
    expect(addButton).toBeInTheDocument();
    expect(taskList).toBeInTheDocument();
    expect(taskList.children.length).toBe(0);
  });

  test('Test 2: Type "Buy groceries" and click Add', function () {
    render(React.createElement(TaskManager));

    var input = screen.getByTestId('task-input');
    var addButton = screen.getByTestId('add-button');

    fireEvent.change(input, { target: { value: 'Buy groceries' } });
    fireEvent.click(addButton);

    var taskItems = screen.getAllByTestId('task-item');
    expect(taskItems.length).toBe(1);
    expect(screen.getByText('Buy groceries')).toBeInTheDocument();
    expect(input.value).toBe('');
  });

  test('Test 3: Add multiple tasks in order', function () {
    render(React.createElement(TaskManager));

    var input = screen.getByTestId('task-input');
    var addButton = screen.getByTestId('add-button');

    fireEvent.change(input, { target: { value: 'Buy groceries' } });
    fireEvent.click(addButton);

    fireEvent.change(input, { target: { value: 'Call mom' } });
    fireEvent.click(addButton);

    fireEvent.change(input, { target: { value: 'Walk dog' } });
    fireEvent.click(addButton);

    var taskItems = screen.getAllByTestId('task-item');
    expect(taskItems.length).toBe(3);
    expect(taskItems[0]).toHaveTextContent('Buy groceries');
    expect(taskItems[1]).toHaveTextContent('Call mom');
    expect(taskItems[2]).toHaveTextContent('Walk dog');
  });

  test('Test 4: Add and remove a task', function () {
    render(React.createElement(TaskManager));

    var input = screen.getByTestId('task-input');
    var addButton = screen.getByTestId('add-button');

    fireEvent.change(input, { target: { value: 'Task A' } });
    fireEvent.click(addButton);

    var taskItems = screen.getAllByTestId('task-item');
    expect(taskItems.length).toBe(1);

    var removeButton = screen.getByTestId('remove-button');
    fireEvent.click(removeButton);

    var taskList = screen.getByTestId('task-list');
    expect(taskList.children.length).toBe(0);
  });

  test('Test 5: Add 10 items, remove 3 from different positions', function () {
    render(React.createElement(TaskManager));

    var input = screen.getByTestId('task-input');
    var addButton = screen.getByTestId('add-button');

    for (var i = 1; i <= 10; i++) {
      fireEvent.change(input, { target: { value: 'Task ' + i } });
      fireEvent.click(addButton);
    }

    var taskItems = screen.getAllByTestId('task-item');
    expect(taskItems.length).toBe(10);

    // Remove Task 9 (index 8), Task 5 (index 4), Task 1 (index 0)
    var removeButtons = screen.getAllByTestId('remove-button');
    fireEvent.click(removeButtons[8]);
    fireEvent.click(removeButtons[4]);
    fireEvent.click(removeButtons[0]);

    taskItems = screen.getAllByTestId('task-item');
    expect(taskItems.length).toBe(7);

    expect(screen.getByText('Task 2')).toBeInTheDocument();
    expect(screen.getByText('Task 3')).toBeInTheDocument();
    expect(screen.queryByText('Task 1')).not.toBeInTheDocument();
    expect(screen.queryByText('Task 5')).not.toBeInTheDocument();
    expect(screen.queryByText('Task 9')).not.toBeInTheDocument();
  });

  test('Test 6: Attempt to add empty string', function () {
    render(React.createElement(TaskManager));

    var addButton = screen.getByTestId('add-button');
    var taskList = screen.getByTestId('task-list');

    // Click Add without typing
    fireEvent.click(addButton);
    expect(taskList.children.length).toBe(0);

    // Try with whitespace only
    var input = screen.getByTestId('task-input');
    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.click(addButton);
    expect(taskList.children.length).toBe(0);
  });

  test('Test 7: Add 100 items and verify performance', function () {
    var startTime = performance.now();
    render(React.createElement(TaskManager));

    var input = screen.getByTestId('task-input');
    var addButton = screen.getByTestId('add-button');

    for (var i = 1; i <= 100; i++) {
      fireEvent.change(input, { target: { value: 'Task ' + i } });
      fireEvent.click(addButton);
    }

    var taskItems = screen.getAllByTestId('task-item');
    expect(taskItems.length).toBe(100);

    // Remove a middle item
    var removeButtons = screen.getAllByTestId('remove-button');
    fireEvent.click(removeButtons[50]);

    var updatedItems = screen.getAllByTestId('task-item');
    expect(updatedItems.length).toBe(99);

    var endTime = performance.now();
    var duration = endTime - startTime;

    // Should complete in reasonable time
    expect(duration).toBeLessThan(10000);
  });

  test('Test 8: Rapid clicks handling', function () {
    render(React.createElement(TaskManager));

    var input = screen.getByTestId('task-input');
    var addButton = screen.getByTestId('add-button');

    fireEvent.change(input, { target: { value: 'Rapid Task' } });

    // Rapid clicks – input is cleared after first add
    for (var i = 0; i < 5; i++) {
      fireEvent.click(addButton);
    }

    var taskItems = screen.getAllByTestId('task-item');
    expect(taskItems.length).toBe(1);
  });

  test('Test 9: Enter key press adds task', function () {
    render(React.createElement(TaskManager));

    var input = screen.getByTestId('task-input');

    fireEvent.change(input, { target: { value: 'Task via Enter' } });
    fireEvent.keyPress(input, { key: 'Enter', code: 'Enter', charCode: 13 });

    var taskItems = screen.getAllByTestId('task-item');
    expect(taskItems.length).toBe(1);
    expect(screen.getByText('Task via Enter')).toBeInTheDocument();
  });

  test('Test 10: No hooks or lifecycle console warnings', function () {
    var hookWarnings = [];

    var originalError = console.error;
    var originalWarn = console.warn;

    console.error = function () {
      var msg = String(arguments[0]);
      if (
        msg.indexOf('Hook') !== -1 ||
        msg.indexOf('hook') !== -1 ||
        msg.indexOf('useState') !== -1 ||
        msg.indexOf('useEffect') !== -1 ||
        msg.indexOf('useRef') !== -1 ||
        msg.indexOf('useCallback') !== -1 ||
        msg.indexOf('useMemo') !== -1 ||
        msg.indexOf('useContext') !== -1 ||
        msg.indexOf('useReducer') !== -1 ||
        msg.indexOf('Invalid hook call') !== -1 ||
        msg.indexOf('lifecycle') !== -1
      ) {
        hookWarnings.push(msg);
      }
    };

    console.warn = function () {
      var msg = String(arguments[0]);
      if (
        msg.indexOf('Hook') !== -1 ||
        msg.indexOf('hook') !== -1 ||
        msg.indexOf('lifecycle') !== -1 ||
        msg.indexOf('componentWillMount') !== -1 ||
        msg.indexOf('componentWillReceiveProps') !== -1 ||
        msg.indexOf('componentWillUpdate') !== -1
      ) {
        hookWarnings.push(msg);
      }
    };

    render(React.createElement(TaskManager));

    var input = screen.getByTestId('task-input');
    var addButton = screen.getByTestId('add-button');

    fireEvent.change(input, { target: { value: 'Test Task' } });
    fireEvent.click(addButton);

    var removeButton = screen.getByTestId('remove-button');
    fireEvent.click(removeButton);

    console.error = originalError;
    console.warn = originalWarn;

    expect(hookWarnings).toEqual([]);
  });

  test('Test 11: Source code contains no hooks or functional component syntax', function () {
    var sourcePath = path.join(
      __dirname,
      '..',
      'repository_after',
      'src',
      'TaskManager.js'
    );
    var source = fs.readFileSync(sourcePath, 'utf-8');

    // Forbidden hook patterns
    var forbiddenHooks = [
      'useState',
      'useEffect',
      'useRef',
      'useCallback',
      'useMemo',
      'useContext',
      'useReducer',
      'useLayoutEffect',
      'useImperativeHandle',
      'useDebugValue'
    ];

    forbiddenHooks.forEach(function (hook) {
      expect(source.indexOf(hook)).toBe(-1);
    });

    // Must not contain arrow function syntax
    // Check for => but exclude comments and strings
    var lines = source.split('\n');
    lines.forEach(function (line) {
      var trimmed = line.trim();
      // Skip comment-only lines
      if (trimmed.indexOf('//') === 0 || trimmed.indexOf('*') === 0) {
        return;
      }
      // Arrow functions: any => that is not inside a comment
      var codeBeforeComment = trimmed.split('//')[0];
      expect(codeBeforeComment.indexOf('=>')).toBe(-1);
    });

    // Must use class syntax
    expect(source.indexOf('class TaskManager')).not.toBe(-1);
    expect(source.indexOf('extends React.Component')).not.toBe(-1);

    // Must have constructor
    expect(source.indexOf('constructor')).not.toBe(-1);

    // Must bind in constructor (not in render)
    expect(source.indexOf('.bind(this)')).not.toBe(-1);
  });

  test('Test 12: No per-render handler allocation (stable onRemove reference)', function () {
    var renderCount = 0;
    var onRemoveRefs = [];

    // Spy on TaskItem to capture onRemove prop across renders
    var TaskItem = require('../repository_after/src/TaskManager').TaskItem;
    var originalRender = TaskItem.prototype.render;

    TaskItem.prototype.render = function () {
      renderCount = renderCount + 1;
      onRemoveRefs.push(this.props.onRemove);
      return originalRender.call(this);
    };

    render(React.createElement(TaskManager));

    var input = screen.getByTestId('task-input');
    var addButton = screen.getByTestId('add-button');

    // Add two tasks to trigger multiple renders
    fireEvent.change(input, { target: { value: 'Task A' } });
    fireEvent.click(addButton);

    fireEvent.change(input, { target: { value: 'Task B' } });
    fireEvent.click(addButton);

    // Restore original render
    TaskItem.prototype.render = originalRender;

    // All onRemove references should be the same function (bound once)
    for (var i = 1; i < onRemoveRefs.length; i++) {
      expect(onRemoveRefs[i]).toBe(onRemoveRefs[0]);
    }
  });
});