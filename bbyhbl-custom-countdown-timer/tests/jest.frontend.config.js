module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  
  roots: ['<rootDir>'],
  testMatch: [
    '**/frontend/**/*.test.ts',
    '**/frontend/**/*.test.tsx',
  ],
  
  transform: {
    '^.+\\.(ts|tsx)$': [
      'ts-jest',
      {
        tsconfig: '<rootDir>/tsconfig.json',
      },
    ],
  },
  
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  setupFilesAfterEnv: ['<rootDir>/setupTests.ts'],
  
  moduleNameMapper: {
    '\\.(css|less|scss|sass)$': 'identity-obj-proxy',
    '\\.(jpg|jpeg|png|gif|webp|svg)$': '<rootDir>/__mocks__/fileMock.js',
    '^framer-motion$': '<rootDir>/__mocks__/framer-motion.tsx',
    '^lucide-react$': '<rootDir>/__mocks__/lucide-react.tsx',

    // Mock the frontend API client used across pages/components.
    '^\.\./api/client$': '<rootDir>/__mocks__/frontendApiClient.ts',

    // Ensure a single copy of React + core libs is used in tests even when
    // importing files from repository_after/frontend.
    '^react$': '<rootDir>/node_modules/react',
    '^react/jsx-runtime$': '<rootDir>/node_modules/react/jsx-runtime',
    '^react/jsx-dev-runtime$': '<rootDir>/node_modules/react/jsx-dev-runtime',
    '^react-dom$': '<rootDir>/node_modules/react-dom',
    '^react-dom/client$': '<rootDir>/node_modules/react-dom/client',
    '^react-router-dom$': '<rootDir>/node_modules/react-router-dom/dist/index.js',
    '^react-router$': '<rootDir>/node_modules/react-router/dist/development/index.js',
    '^react-hook-form$': '<rootDir>/node_modules/react-hook-form',
    '^@hookform/resolvers$': '<rootDir>/node_modules/@hookform/resolvers',
    '^@hookform/resolvers/(.*)$': '<rootDir>/node_modules/@hookform/resolvers/$1',
    '^zod$': '<rootDir>/node_modules/zod',
    '^luxon$': '<rootDir>/node_modules/luxon',
    '^axios$': '<rootDir>/node_modules/axios'
  },
  
  // Exclude TypeScript declaration files
  testPathIgnorePatterns: [
    '/node_modules/',
    '\\.d\\.ts$',
  ],
  
  // Clear mocks between tests
  clearMocks: true,
  resetMocks: true,
  restoreMocks: true,
};