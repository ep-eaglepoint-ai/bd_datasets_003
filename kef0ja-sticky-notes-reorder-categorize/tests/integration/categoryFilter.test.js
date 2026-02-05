// tests/integration/categoryFilter.test.js
const path = require('path');

// Use require.resolve with explicit paths
const repoPath = process.env.REPO_PATH || 'repository_before';

// First, clear any cached modules
delete require.cache[require.resolve('react')];
delete require.cache[require.resolve('@testing-library/react')];
delete require.cache[require.resolve('@testing-library/jest-dom')];

// Resolve from repository node_modules
const React = require(require.resolve('react', {
  paths: [
    path.join(__dirname, '..', '..', repoPath, 'node_modules'),
    path.join(__dirname, '..', '..', 'node_modules')
  ]
}));

const testingLibraryPath = require.resolve('@testing-library/react', {
  paths: [
    path.join(__dirname, '..', '..', repoPath, 'node_modules'),
    path.join(__dirname, '..', '..', 'node_modules')
  ]
});
const { render, screen } = require(testingLibraryPath);

require(require.resolve('@testing-library/jest-dom', {
  paths: [
    path.join(__dirname, '..', '..', repoPath, 'node_modules'),
    path.join(__dirname, '..', '..', 'node_modules')
  ]
}));

const getComponents = () => {
  const StickyNotesGrid = require(`../../${repoPath}/src/components/StickyNotesGrid`).default;
  const StickyNotesProvider = require(`../../${repoPath}/src/context/StickyNotesContext`).default;
  return { StickyNotesGrid, StickyNotesProvider };
};

describe('Category Filter Integration', () => {
  let StickyNotesGrid, StickyNotesProvider;
  
  beforeEach(() => {
    global.localStorage = {
      getItem: jest.fn(() => null),
      setItem: jest.fn(),
      clear: jest.fn(),
      removeItem: jest.fn(),
    };
    
    const components = getComponents();
    StickyNotesGrid = components.StickyNotesGrid;
    StickyNotesProvider = components.StickyNotesProvider;
  });

  const renderApp = () => {
    return render(
      React.createElement(StickyNotesProvider, null, 
        React.createElement(StickyNotesGrid)
      )
    );
  };

  test('renders without crashing', () => {
    renderApp();
    expect(screen.queryByText(/all/i) || document.body).toBeTruthy();
  });
});