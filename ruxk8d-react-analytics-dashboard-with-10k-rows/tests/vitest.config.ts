import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

const projectPath = process.env.PROJECT_PATH || '../repository_before';

export default defineConfig({
    plugins: [react()],
    test: {
        globals: true,
        environment: 'jsdom',
        setupFiles: [path.resolve(__dirname, './setup.ts')],
        alias: {
            '@project': path.resolve(__dirname, '..', projectPath, 'src'),
        },
    },
});
