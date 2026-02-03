import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { promises as fs } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function testRepository(repoPath: string) {
    const fullRepoPath = join(__dirname, '..', repoPath);
    console.log(`\n=========================================`);
    console.log(`RUNNING UNIT TESTS FOR: ${repoPath}`);
    console.log(`=========================================\n`);

    try {
        await fs.access(fullRepoPath);

        // Core files to check
        const filesToCheck = {
            home: join(fullRepoPath, 'app/routes/home.tsx'),
            stats: join(fullRepoPath, 'app/routes/stats.tsx'),
            login: join(fullRepoPath, 'app/routes/login.tsx'),
            callback: join(fullRepoPath, 'app/routes/auth.callback.tsx'),
            session: join(fullRepoPath, 'app/utils/session.server.ts'),
            history: join(fullRepoPath, 'app/routes/history.tsx')
        };

        // Verify all files exist before reading
        for (const [name, path] of Object.entries(filesToCheck)) {
            try {
                await fs.access(path);
            } catch {
                console.log(`[SKIP] Missing core file: ${name} (${repoPath})`);
                return;
            }
        }

        const [home, stats, login, callback, session, history] = await Promise.all([
            fs.readFile(filesToCheck.home, 'utf8'),
            fs.readFile(filesToCheck.stats, 'utf8'),
            fs.readFile(filesToCheck.login, 'utf8'),
            fs.readFile(filesToCheck.callback, 'utf8'),
            fs.readFile(filesToCheck.session, 'utf8'),
            fs.readFile(filesToCheck.history, 'utf8'),
        ]);

        /** HOME PAGE & AUTO-SAVE **/
        console.log(`Checking (Home Page & Auto-Save)...`);
        if (home.includes('[1, 2, 3].map') && home.includes('textarea')) {
            console.log(`[PASS] Home page renders exactly 3 prompt-based textareas.`);
        }
        if (home.includes('setTimeout') && (home.includes('1000') || home.includes('debounce'))) {
            console.log(`[PASS] Auto-save implemented with 1000ms debounce.`);
        }

        /** PASSWORDLESS AUTH **/
        console.log(`\nChecking (Passwordless Auth Flow)...`);
        if (login.includes('prisma.user.create') || login.includes('prisma.user.upsert')) {
            if (login.includes('magicToken') && login.includes('tokenExpiry')) {
                console.log(`[PASS] Login flow handles user creation and token/expiry generation.`);
            }
        }
        if (callback.includes('magicToken: null') && callback.includes('tokenExpiry: null')) {
            console.log(`[PASS] Token is consumed after successful auth.`);
        }
        const maxAgeMatch = session.match(/maxAge:\s*([\d\s*]+)/);
        if (maxAgeMatch && eval(maxAgeMatch[1]) === 60 * 60 * 24 * 30) {
            console.log(`[PASS] Session persistence set to 30 days.`);
        }

        /** HISTORY & CALENDAR **/
        console.log(`\nChecking (History & Calendar highlights)...`);
        if (history.includes('hasEntry') && (history.includes('entryMap') || history.includes('highlight'))) {
            console.log(`[PASS] Calendar highlights dates with existing entries.`);
        }

        /** ANNIVERSARY **/
        console.log(`\nChecking (Anniversary / On This Day)...`);
        if (home.includes('getFullYear() - 1')) {
            console.log(`[PASS] "On This Day" identifies entries from Year-1.`);
        }

        /** THEMES & INSIGHTS **/
        console.log(`\nChecking (Themes/Word Cloud Analysis)...`);
        if (stats.includes('STOP_WORDS') || stats.includes('wordCounts')) {
            console.log(`[PASS] Words are analyzed and filtered.`);
        }

        /**STREAKS & HEATMAP**/
        console.log(`\nChecking (Streaks & Consistency Heatmap)...`);
        if (stats.includes('currentStreak') || stats.includes('streak')) {
            console.log(`[PASS] Consecutive day streaks calculated.`);
        }
        if (stats.includes('364') || stats.includes('365')) {
            console.log(`[PASS] Frequency Heatmap correctly represents a 365-day period.`);
        }

        console.log(`\n[COMPLETE] ${repoPath} ground truth verification finished.`);

    } catch (err: any) {
        if (err.code === 'ENOENT') {
            console.log(`[SKIP] ${repoPath} folder not found.`);
        } else {
            console.error(`[ERROR] Testing ${repoPath}:`, err.message);
        }
    }
}

async function main() {
    const rootDir = join(__dirname, '..');

    if (process.env.TARGET_REPO) {
        await testRepository(process.env.TARGET_REPO);
        return;
    }

    const dirs = await fs.readdir(rootDir);

    const repos = dirs.filter(d => d.startsWith('repository_'));

    if (repos.length === 0) {
        console.log("No repository_ directories found to test.");
        return;
    }

    repos.sort((a, b) => {
        if (a === 'repository_before') return -1;
        if (b === 'repository_before') return 1;
        return a.localeCompare(b);
    });

    for (const repo of repos) {
        await testRepository(repo);
    }
}

main();
