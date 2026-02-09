const path = require("path");

const repoPath = process.env.REPO_PATH || "repository_after";
const describeAfter = describe;
const describeBefore = repoPath === 'repository_before' ? describe : describe.skip;

delete require.cache[require.resolve("react")];
delete require.cache[require.resolve("@testing-library/react")];
delete require.cache[require.resolve("@testing-library/jest-dom")];

const React = require(
  require.resolve("react", {
    paths: [
      path.join(__dirname, "..", "..", "node_modules"),
      path.join(__dirname, "..", "..", repoPath, "node_modules"),
    ],
  }),
);

const testingLibraryPath = require.resolve("@testing-library/react", {
  paths: [
    path.join(__dirname, "..", "..", "node_modules"),
    path.join(__dirname, "..", "..", repoPath, "node_modules"),
  ],
});
const { render, screen, fireEvent, waitFor } = require(testingLibraryPath);

require(
  require.resolve("@testing-library/jest-dom", {
    paths: [
      path.join(__dirname, "..", "..", "node_modules"),
      path.join(__dirname, "..", "..", repoPath, "node_modules"),
    ],
  }),
);

const getComponents = () => {
  const StickyNotesGrid = require(path.join(
    __dirname,
    '..',
    '..',
    repoPath,
    'src',
    'components',
    'StickyNotesGrid',
  )).default;
  const StickyNotesProvider = require(path.join(
    __dirname,
    '..',
    '..',
    repoPath,
    'src',
    'context',
    'StickyNotesContext',
  )).default;
  return { StickyNotesGrid, StickyNotesProvider };
};

describeBefore('Category Filter Integration - repository_before (baseline)', () => {
  test('should render without category filter', () => {
    const App = require(path.join(
      __dirname,
      '..',
      '..',
      repoPath,
      'src',
      'App',
    )).default;
    render(React.createElement(App));
    expect(screen.getByText(/sticky notes/i)).toBeInTheDocument();
  });
});

describeAfter("Category Filter Integration - repository_after", () => {
  let StickyNotesGrid, StickyNotesProvider;

  beforeEach(() => {
    localStorage.clear();

    const components = getComponents();
    StickyNotesGrid = components.StickyNotesGrid;
    StickyNotesProvider = components.StickyNotesProvider;
  });

  const renderApp = () => {
    return render(
      React.createElement(
        StickyNotesProvider,
        null,
        React.createElement(StickyNotesGrid),
      ),
    );
  };

  test("should display category filter buttons", () => {
    renderApp();
    expect(screen.getByText(/all/i)).toBeInTheDocument();
    expect(screen.getByText('Work')).toBeInTheDocument();
    expect(screen.getByText('Personal')).toBeInTheDocument();
    expect(screen.getByText('Ideas')).toBeInTheDocument();
    expect(screen.getByText('Urgent')).toBeInTheDocument();
    expect(screen.getByText('Uncategorized')).toBeInTheDocument();
  });

  test('clicking a category filter shows only notes in that category', () => {
    const seed = [
      { id: 1, title: 'W1', content: 'w', color: '#ffd500', category: 'work', order: 0 },
      { id: 2, title: 'P1', content: 'p', color: '#ffd500', category: 'personal', order: 1 },
      { id: 3, title: 'W2', content: 'w2', color: '#ffd500', category: 'work', order: 2 },
    ];
    localStorage.setItem('notes', JSON.stringify(seed));
    renderApp();

    fireEvent.click(screen.getAllByRole('button', { name: 'Work' })[0]);
    expect(screen.getByText('W1')).toBeInTheDocument();
    expect(screen.getByText('W2')).toBeInTheDocument();
    expect(screen.queryByText('P1')).not.toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('button', { name: /all/i })[0]);
    expect(screen.getByText('P1')).toBeInTheDocument();
  });
});