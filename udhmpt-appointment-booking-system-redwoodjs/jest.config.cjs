module.exports = {
  testEnvironment: 'node',
  testMatch: ["**/tests/**/*.test.ts", "**/tests/**/*.spec.ts", "**/tests/**/*.test.tsx"],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  transform: {
    '^.+\\.tsx?$': 'ts-jest',
  },
  moduleNameMapper: {
    '^react$': '<rootDir>/node_modules/react',
    '^react-dom$': '<rootDir>/node_modules/react-dom',
  },
};
