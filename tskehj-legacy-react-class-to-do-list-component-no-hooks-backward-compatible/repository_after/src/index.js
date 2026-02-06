import React from 'react';
import ReactDOM from 'react-dom';
import TaskManager from './TaskManager';

// Legacy ReactDOM.render pattern (pre-React 18)
ReactDOM.render(
  React.createElement(TaskManager, null),
  document.getElementById('root')
);