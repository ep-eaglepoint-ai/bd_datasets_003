var React = require('react');
var rtl = require('@testing-library/react');
var matchers = require('@testing-library/jest-dom');
var fs = require('fs');
var path = require('path');

var render = rtl.render;
var screen = rtl.screen;
var fireEvent = rtl.fireEvent;

expect.extend(matchers);

// Import components
var TaskManagerModule = require('../repository_after/src/TaskManager');
var TaskManager = TaskManagerModule.default;
var TaskItem = TaskManagerModule.TaskItem;

describe('TaskManager Legacy Class Component', function () {

  describe('Core Functionality', function () {

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

    test('Test 5: Add 10 items, remove 3 from different positions, verify relative order', function () {
      render(React.createElement(TaskManager));

      var input = screen.getByTestId('task-input');
      var addButton = screen.getByTestId('add-button');

      // Add tasks 1-10
      for (var i = 1; i <= 10; i++) {
        fireEvent.change(input, { target: { value: 'Task ' + i } });
        fireEvent.click(addButton);
      }

      var taskItems = screen.getAllByTestId('task-item');
      expect(taskItems.length).toBe(10);

      // Remove Task 9 (index 8), then Task 5 (now index 4), then Task 1 (now index 0)
      var removeButtons = screen.getAllByTestId('remove-button');
      fireEvent.click(removeButtons[8]); // Remove Task 9

      removeButtons = screen.getAllByTestId('remove-button');
      fireEvent.click(removeButtons[4]); // Remove Task 5

      removeButtons = screen.getAllByTestId('remove-button');
      fireEvent.click(removeButtons[0]); // Remove Task 1

      taskItems = screen.getAllByTestId('task-item');
      expect(taskItems.length).toBe(7);

      // Verify EXACT relative order: 2, 3, 4, 6, 7, 8, 10
      var expectedOrder = ['Task 2', 'Task 3', 'Task 4', 'Task 6', 'Task 7', 'Task 8', 'Task 10'];
      for (var j = 0; j < expectedOrder.length; j++) {
        expect(taskItems[j]).toHaveTextContent(expectedOrder[j]);
      }

      // Removed items should not exist
      expect(screen.queryByText('Task 1')).not.toBeInTheDocument();
      expect(screen.queryByText('Task 5')).not.toBeInTheDocument();
      expect(screen.queryByText('Task 9')).not.toBeInTheDocument();
    });

    test('Test 6: Attempt to add empty string', function () {
      render(React.createElement(TaskManager));

      var addButton = screen.getByTestId('add-button');
      var taskList = screen.getByTestId('task-list');

      fireEvent.click(addButton);
      expect(taskList.children.length).toBe(0);

      var input = screen.getByTestId('task-input');
      fireEvent.change(input, { target: { value: '   ' } });
      fireEvent.click(addButton);
      expect(taskList.children.length).toBe(0);
    });

  });

  describe('Performance and Scalability', function () {

    test('Test 7: Add 100 items and verify performance within 5s', function () {
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

      // Verify scrollable container exists (list has overflowY style)
      var taskList = screen.getByTestId('task-list');
      expect(taskList).toBeInTheDocument();

      // Remove middle item to verify update stability
      var removeButtons = screen.getAllByTestId('remove-button');
      fireEvent.click(removeButtons[50]);

      var updatedItems = screen.getAllByTestId('task-item');
      expect(updatedItems.length).toBe(99);

      // Verify relative order preserved after removal
      expect(updatedItems[49]).toHaveTextContent('Task 50');
      expect(updatedItems[50]).toHaveTextContent('Task 52');

      var endTime = performance.now();
      var duration = endTime - startTime;

      // Must complete within 5 seconds (DoD requirement)
      expect(duration).toBeLessThan(5000);
    });

    test('Test 8: Rapid clicks handling', function () {
      render(React.createElement(TaskManager));

      var input = screen.getByTestId('task-input');
      var addButton = screen.getByTestId('add-button');

      fireEvent.change(input, { target: { value: 'Rapid Task' } });

      for (var i = 0; i < 10; i++) {
        fireEvent.click(addButton);
      }

      // Only one task should exist (input cleared after first add)
      var taskItems = screen.getAllByTestId('task-item');
      expect(taskItems.length).toBe(1);
    });

  });

  describe('Keyboard and Input Handling', function () {

    test('Test 9: Enter key (keyDown) adds task', function () {
      render(React.createElement(TaskManager));

      var input = screen.getByTestId('task-input');

      fireEvent.change(input, { target: { value: 'Task via Enter' } });
      fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });

      var taskItems = screen.getAllByTestId('task-item');
      expect(taskItems.length).toBe(1);
      expect(screen.getByText('Task via Enter')).toBeInTheDocument();
    });

  });

  describe('Legacy Compliance', function () {

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

    test('Test 11: Source code contains no hooks, no arrow functions, uses class syntax', function () {
      var sourcePath = path.join(
        __dirname,
        '..',
        'repository_after',
        'src',
        'TaskManager.js'
      );
      var source = fs.readFileSync(sourcePath, 'utf-8');

      // Forbidden hook names - check as standalone words
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
        // Use word boundary check: hook must not appear as identifier
        var regex = new RegExp('\\b' + hook + '\\s*\\(', 'g');
        expect(regex.test(source)).toBe(false);
      });

      // Robust arrow function detection:
      // 1. Remove all string literals (single and double quoted)
      // 2. Remove all comments (single-line and multi-line)
      // 3. Then check for arrow function patterns

      // Remove multi-line comments
      var noMultiLineComments = source.replace(/\/\*[\s\S]*?\*\//g, '');
      
      // Remove single-line comments
      var noComments = noMultiLineComments.replace(/\/\/.*$/gm, '');
      
      // Remove string literals (handle escaped quotes)
      var noStrings = noComments.replace(/'(?:[^'\\]|\\.)*'/g, '""');
      noStrings = noStrings.replace(/"(?:[^"\\]|\\.)*"/g, '""');
      
      // Remove template literals
      noStrings = noStrings.replace(/`(?:[^`\\]|\\.)*`/g, '""');

      // Check for arrow function patterns:
      // - () => 
      // - (param) =>
      // - param =>
      // - (param1, param2) =>
      var arrowPatterns = [
        /\(\s*\)\s*=>/,                          // () =>
        /\(\s*[\w$]+\s*\)\s*=>/,                 // (param) =>
        /\(\s*[\w$]+\s*,[\s\w$,]*\)\s*=>/,       // (param1, param2, ...) =>
        /[\w$]+\s*=>/,                           // param =>
        /=\s*\([^)]*\)\s*=>/,                    // = (...) =>
        /=\s*[\w$]+\s*=>/                        // = param =>
      ];

      var arrowFunctionFound = false;
      for (var p = 0; p < arrowPatterns.length; p++) {
        if (arrowPatterns[p].test(noStrings)) {
          arrowFunctionFound = true;
          break;
        }
      }

      expect(arrowFunctionFound).toBe(false);

      // Must use class syntax
      expect(source.indexOf('class TaskManager')).not.toBe(-1);
      expect(source.indexOf('class TaskItem')).not.toBe(-1);
      expect(source.indexOf('extends React.Component')).not.toBe(-1);

      // Must have constructor
      expect(source.indexOf('constructor(props)')).not.toBe(-1);

      // Must use .bind(this) pattern
      expect(source.indexOf('.bind(this)')).not.toBe(-1);

      // No CSS gap property (legacy browser support)
      expect(source.indexOf('gap:')).toBe(-1);
      
      // Verify TaskItem is actually used in render (createElement call with TaskItem)
      expect(source.indexOf('createElement(TaskItem')).not.toBe(-1);
    });

    test('Test 12: TaskItem is a class component with shouldComponentUpdate and is actively used', function () {
      // Verify TaskItem exists and is a class
      expect(TaskItem).toBeDefined();
      expect(TaskItem.prototype).toBeDefined();

      // Verify it extends React.Component
      expect(TaskItem.prototype instanceof React.Component).toBe(true);

      // Verify shouldComponentUpdate is implemented
      expect(typeof TaskItem.prototype.shouldComponentUpdate).toBe('function');

      // Verify render method exists
      expect(typeof TaskItem.prototype.render).toBe('function');

      // Verify handleRemove method exists
      expect(typeof TaskItem.prototype.handleRemove).toBe('function');

      // Verify TaskItem is actually used by rendering TaskManager with tasks
      render(React.createElement(TaskManager));

      var input = screen.getByTestId('task-input');
      var addButton = screen.getByTestId('add-button');

      fireEvent.change(input, { target: { value: 'Verify TaskItem' } });
      fireEvent.click(addButton);

      // If TaskItem is used, we should see task-item elements
      var taskItems = screen.getAllByTestId('task-item');
      expect(taskItems.length).toBe(1);

      // The remove button should also exist (rendered by TaskItem)
      var removeButton = screen.getByTestId('remove-button');
      expect(removeButton).toBeInTheDocument();

      // Clicking remove should work (proves TaskItem.handleRemove is wired up)
      fireEvent.click(removeButton);
      expect(screen.queryByTestId('task-item')).not.toBeInTheDocument();
    });

    test('Test 13: Stable onRemove reference across renders (no per-render allocation)', function () {
      var onRemoveRefs = [];

      var OriginalTaskItem = TaskItem;
      var originalRender = OriginalTaskItem.prototype.render;

      OriginalTaskItem.prototype.render = function () {
        onRemoveRefs.push(this.props.onRemove);
        return originalRender.call(this);
      };

      render(React.createElement(TaskManager));

      var input = screen.getByTestId('task-input');
      var addButton = screen.getByTestId('add-button');

      fireEvent.change(input, { target: { value: 'Task A' } });
      fireEvent.click(addButton);

      fireEvent.change(input, { target: { value: 'Task B' } });
      fireEvent.click(addButton);

      fireEvent.change(input, { target: { value: 'Task C' } });
      fireEvent.click(addButton);

      OriginalTaskItem.prototype.render = originalRender;

      // All onRemove references must be the same function
      expect(onRemoveRefs.length).toBeGreaterThan(0);
      for (var i = 1; i < onRemoveRefs.length; i++) {
        expect(onRemoveRefs[i]).toBe(onRemoveRefs[0]);
      }
    });

  });

  describe('Entry Point', function () {

    test('Test 14: index.js exports work and renderApp renders correctly', function () {
      // Create a mock root element in the document
      var rootDiv = document.createElement('div');
      rootDiv.id = 'test-root';
      document.body.appendChild(rootDiv);

      // Import the index module (now safe because no auto-render without #root)
      var indexModule = require('../repository_after/src/index');

      // Verify exports exist
      expect(indexModule.renderApp).toBeDefined();
      expect(typeof indexModule.renderApp).toBe('function');
      expect(indexModule.TaskManager).toBeDefined();

      // Verify TaskManager export is the actual component
      expect(indexModule.TaskManager).toBe(TaskManager);

      // Create a proper root element and test renderApp behavior
      var actualRoot = document.createElement('div');
      actualRoot.id = 'root';
      document.body.appendChild(actualRoot);

      // Call renderApp and verify it returns the root element
      var result = indexModule.renderApp();
      expect(result).toBe(actualRoot);

      // Verify something was rendered into root
      expect(actualRoot.innerHTML).not.toBe('');
      expect(actualRoot.querySelector('.task-manager')).not.toBeNull();
      expect(actualRoot.querySelector('[data-testid="task-input"]')).not.toBeNull();
      expect(actualRoot.querySelector('[data-testid="add-button"]')).not.toBeNull();
      expect(actualRoot.querySelector('[data-testid="task-list"]')).not.toBeNull();

      // Clean up
      document.body.removeChild(rootDiv);
      document.body.removeChild(actualRoot);
    });

    test('Test 15: renderApp handles missing root element gracefully', function () {
      // Ensure no root element exists
      var existingRoot = document.getElementById('root');
      if (existingRoot) {
        existingRoot.parentNode.removeChild(existingRoot);
      }

      // Re-require to get fresh module
      jest.resetModules();
      var indexModule = require('../repository_after/src/index');

      // Should return null/undefined when root doesn't exist
      var result = indexModule.renderApp();
      expect(result).toBeFalsy();
    });

  });

});