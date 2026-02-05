export default {
    testEnvironment: 'jsdom',           // For DOM APIs (React, IndexedDB, etc.)
    setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
    transform: {
        '^.+\\.jsx?$': 'babel-jest'       // Use Babel to transform JS/JSX
    },
    moduleFileExtensions: ['js', 'jsx', 'json', 'node'],
    moduleNameMapper: {
        '\\.(css|less|scss|sass)$': 'identity-obj-proxy'  // mock CSS imports
    },
    transformIgnorePatterns: [
        '/node_modules/'                  // don't transform dependencies
    ]
};
