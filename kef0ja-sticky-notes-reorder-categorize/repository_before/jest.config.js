module.exports = {
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/src/setupTests.js'],
   roots: ['<rootDir>/src', '<rootDir>/../../tests'],
  testMatch: [
    '<rootDir>/src/**/__tests__/**/*.{js,jsx,ts,tsx}',
    '<rootDir>/src/**/*.{spec,test}.{js,jsx,ts,tsx}',
    '<rootDir>/../../tests/**/*.{spec,test}.{js,jsx,ts,tsx}'
  ],
  
  // Optional: Setup file if you have one
  setupFilesAfterEnv: ['<rootDir>/../../tests/setup.js']
};