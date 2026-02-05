const path = require('path');

module.exports = {
  testEnvironment: 'jsdom',
  
  // Enable fake timers globally
  fakeTimers: {
    enableGlobally: true,
  },
  
  // Remove setupFilesAfterEnv or point to correct path
  // setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  
  testMatch: [
    '<rootDir>/tests/**/*.test.js',
    '<rootDir>/tests/**/*.spec.js'
  ],
  
  testPathIgnorePatterns: ['/node_modules/'],
  
  transform: {
    '^.+\\.(js|jsx)$': 'babel-jest',
    '^.+\\.css$': 'jest-transform-stub'
  },
  
  moduleNameMapper: {
    '^react$': '<rootDir>/node_modules/react',
    '^react-dom$': '<rootDir>/node_modules/react-dom',
    '^react-dom/client$': '<rootDir>/node_modules/react-dom/client',
    '\\.(css|less|scss|sass)$': 'identity-obj-proxy',
    '\\.(jpg|jpeg|png|gif|eot|otf|webp|svg|ttf|woff|woff2|mp4|webm|wav|mp3|m4a|aac|oga)$': 'jest-transform-stub'
  },
  
  moduleDirectories: [
    'node_modules'
  ]
};