import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
    plugins: [react()],
    resolve: {
        alias: {
            '../repository_after': path.resolve(__dirname, '../repository_after'),
            'react': path.resolve(__dirname, 'node_modules/react'),
            'react-dom': path.resolve(__dirname, 'node_modules/react-dom'),
        }
    },
    test: {
        globals: true,
        environment: 'jsdom',
        setupFiles: './setup.js',
        include: ['**/*.test.{js,jsx}'],
        coverage: {
            reporter: ['text', 'json', 'html'],
        },
    },
})
