module.exports = {
  roots: ['<rootDir>/src', '<rootDir>/../../tests'],
  testMatch: [
    '<rootDir>/src/**/__tests__/**/*.{js,jsx,ts,tsx}',
    '<rootDir>/src/**/*.{spec,test}.{js,jsx,ts,tsx}',
    '<rootDir>/../../tests/**/*.{spec,test}.{js,jsx,ts,tsx}'
  ],
  testPathIgnorePatterns: ['/node_modules/'],
  setupFilesAfterEnv: ['<rootDir>/src/setupTests.js']
};