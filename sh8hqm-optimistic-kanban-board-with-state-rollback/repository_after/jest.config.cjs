const path = require('path');

const projectRoot = path.resolve(__dirname, '..');

module.exports = {
    projects: [
        {
            displayName: 'frontend',
            testEnvironment: 'jsdom',
            rootDir: projectRoot,
            testMatch: ['<rootDir>/tests/frontend/**/*.test.tsx'],
            setupFilesAfterEnv: ['<rootDir>/tests/setupTests.ts'],
            transform: {
                '^.+\\.(ts|tsx)?$': [
                    require.resolve('ts-jest'),
                    { tsconfig: path.resolve(__dirname, 'tsconfig.json') },
                ],
            },
            moduleNameMapper: {
                '\\.(css|less|scss|sass)$': 'identity-obj-proxy',
            },
            moduleDirectories: [
                path.resolve(__dirname, 'node_modules'),
                'node_modules'
            ],
        },
        {
            displayName: 'backend',
            testEnvironment: 'node',
            rootDir: projectRoot,
            testMatch: ['<rootDir>/tests/backend/**/*.test.ts'],
            transform: {
                '^.+\\.ts$': [
                    require.resolve('ts-jest'),
                    { tsconfig: path.resolve(__dirname, 'tsconfig.json') },
                ],
            },
            moduleDirectories: [
                path.resolve(__dirname, 'node_modules'),
                'node_modules'
            ],
        },
    ],
};
