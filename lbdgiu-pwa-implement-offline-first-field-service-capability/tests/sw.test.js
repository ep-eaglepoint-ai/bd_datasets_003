const fs = require('fs');
const path = require('path');

describe('Service Worker Strategy', () => {
    const swPath = path.resolve(__dirname, '../repository_after/client/src/sw/service-worker.js');
    const swContent = fs.readFileSync(swPath, 'utf8');

    it('should call skipWaiting() in the install phase', () => {
        expect(swContent).toMatch(/self\.skipWaiting\(\)/);
    });

    it('should call clients.claim() in the activate phase', () => {
        expect(swContent).toMatch(/self\.clients\.claim\(\)/);
    });

    it('should implement Cache-First strategy', () => {
        const fetchHandlerRegex = /self\.addEventListener\(['"]fetch['"][\s\S]*?event\.respondWith\([\s\S]*?caches\.match\([\s\S]*?fetch\(/;
        expect(swContent).toMatch(fetchHandlerRegex);
    });
});
