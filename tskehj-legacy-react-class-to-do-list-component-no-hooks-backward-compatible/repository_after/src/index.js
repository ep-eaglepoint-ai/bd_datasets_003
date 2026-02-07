var React = require('react');
var ReactDOM = require('react-dom');
var TaskManager = require('./TaskManager').default;

/**
 * Application entry point.
 * Uses legacy ReactDOM.render pattern for pre-React 18 compatibility.
 * Only renders if root element exists (safe for testing).
 */
function renderApp() {
  var rootElement = document.getElementById('root');
  if (rootElement) {
    ReactDOM.render(
      React.createElement(TaskManager, null),
      rootElement
    );
  }
  return rootElement;
}

// Check if we're in a browser with root element before auto-rendering
if (typeof document !== 'undefined') {
  var root = document.getElementById('root');
  if (root) {
    renderApp();
  }
}

// Export for testing and external use
module.exports = {
  renderApp: renderApp,
  TaskManager: TaskManager
};