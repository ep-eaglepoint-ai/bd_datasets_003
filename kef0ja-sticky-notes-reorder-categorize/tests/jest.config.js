module.exports = {
  testEnvironment: 'jsdom',

  haste: {
    throwOnModuleCollision: false,
  },

  fakeTimers: {
    enableGlobally: true,
  },

  testMatch: ['<rootDir>/**/*.test.js', '<rootDir>/**/*.spec.js'],

  testPathIgnorePatterns: ['/node_modules/'],

  transform: {
    '^.+\\.(js|jsx)$': 'babel-jest',
    '^.+\\.css$': 'jest-transform-stub'
  },

  moduleNameMapper: {
    '^react$': '<rootDir>/node_modules/react',
    '^react/jsx-runtime$': '<rootDir>/node_modules/react/jsx-runtime',
    '^react-dom$': '<rootDir>/node_modules/react-dom',
    '^react-dom/client$': '<rootDir>/node_modules/react-dom/client',
    '\\.(css|less|scss|sass)$': '<rootDir>/node_modules/jest-transform-stub',
    '\\.(jpg|jpeg|png|gif|eot|otf|webp|svg|ttf|woff|woff2|mp4|webm|wav|mp3|m4a|aac|oga)$': 'jest-transform-stub'
  },

  moduleDirectories: [
    'node_modules',
    '<rootDir>/node_modules'
  ],

  moduleFileExtensions: ["js", "jsx"]
};
