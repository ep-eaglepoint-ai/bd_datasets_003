const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

// Configuration for service URLs and local paths
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8080';
const FRONTEND_DIR = process.env.FRONTEND_DIR || '/app/repository_after/frontend';

/**
 * Fetches the current state of the consensus cluster from the Go backend.
 */
async function fetchState() {
    const response = await fetch(`${BACKEND_URL}/state`);
    if (!response.ok) throw new Error(`Failed to fetch state: ${response.statusText}`);
    return await response.json();
}

/**
 * Sends a command to the backend to simulate a failure of the current leader node.
 */
async function killLeader() {
    const response = await fetch(`${BACKEND_URL}/kill-leader`, { method: 'POST' });
    if (!response.ok) throw new Error(`Failed to kill leader: ${response.statusText}`);
    return response;
}

/**
 * Polling helper that waits for the cluster to elect a new leader.
 * Retries periodically until a leader is found or timeout is reached.
 */
async function waitForLeader(maxRetries = 30) {
    for (let i = 0; i < maxRetries; i++) {
        try {
            const data = await fetchState();
            // Check if any node has transitioned to the 'leader' role and is active
            if (data.nodes.some(n => n.role === 'leader' && n.isAlive)) {
                return data;
            }
            console.log(`Waiting for leader... Attempt ${i + 1}/${maxRetries} (Term: ${data.term})`);
        } catch (e) {
            console.log(`Waiting for backend... Attempt ${i + 1}/${maxRetries}`);
        }
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
    throw new Error('Leader not elected in time');
}

test('Consensus Visualizer System Verification', async (t) => {

    // Validates that the backend exposes nodes correctly with appropriate metadata
    await t.test('Backend state and node structure', async () => {
        const data = await waitForLeader();
        assert.ok(data.nodes.length > 0, 'Cluster should contain at least one node');
        assert.ok(typeof data.term === 'number', 'Global term must be a numeric value');

        const ids = data.nodes.map(n => n.id);
        const uniqueIds = new Set(ids);
        assert.strictEqual(ids.length, uniqueIds.size, 'Every node must have a unique identifier');

        data.nodes.forEach(node => {
            // Verify that node roles adhere to the simplified Raft model
            assert.ok(['leader', 'follower', 'candidate'].includes(node.role), `Node role must be one of leader, follower, or candidate. Found: ${node.role}`);
            assert.ok(typeof node.currentTerm === 'number', 'Node-specific term should be maintained');
            assert.ok(typeof node.isAlive === 'boolean', 'Node health status should be clearly indicated');
        });
    });

    // Verifies the core consensus loop: election triggers upon failure and terms increment
    await t.test('Leader election, term increment, and kill leader flow', async () => {
        const initialData = await fetchState();
        const initialTerm = initialData.term;

        console.log('Action: Triggering leader failure...');
        await killLeader();

        console.log('Action: Observing election timeout and re-election cycle...');
        // Standard election timeout simulation delay
        await new Promise(resolve => setTimeout(resolve, 5000));

        const newData = await waitForLeader();
        // The term should be strictly greater than before the failure
        assert.ok(newData.term > initialTerm, `Global term should increment after a successful election. New: ${newData.term}, Old: ${initialTerm}`);

        const hasLeader = newData.nodes.some(n => n.role === 'leader' && n.isAlive);
        assert.ok(hasLeader, 'The cluster should recover and stabilize with a new active leader');
    });

    // Validates that the active leader propagates its term to all reachable followers via heartbeats
    await t.test('Heartbeats and term synchronization across the cluster', async () => {
        // Allow time for heartbeat cycles to complete and propagate state
        await new Promise(resolve => setTimeout(resolve, 2000));

        const data = await fetchState();
        const leader = data.nodes.find(n => n.role === 'leader' && n.isAlive);

        if (leader) {
            data.nodes.forEach(node => {
                if (node.isAlive) {
                    // All alive nodes should converge on the leader's term
                    assert.strictEqual(node.currentTerm, leader.currentTerm,
                        `Synchronization Error: Follower ${node.id} on Term ${node.currentTerm}, but Leader ${leader.id} on Term ${leader.currentTerm}`);
                }
            });
        }
    });

    // Static analysis check to ensure the React frontend contains necessary UI hooks and styling
    await t.test('Frontend source and styling audit', async () => {
        const appPath = path.join(FRONTEND_DIR, 'src/App.tsx');
        const cssPath = path.join(FRONTEND_DIR, 'src/index.css');

        assert.ok(fs.existsSync(appPath), 'Required source file App.tsx must exist in frontend directory');
        assert.ok(fs.existsSync(cssPath), 'Required stylesheet index.css must exist in frontend directory');

        const appContent = fs.readFileSync(appPath, 'utf8');
        // Ensure UI components are wired to display consensus state and interact with backend
        assert.ok(appContent.includes('term') || appContent.includes('currentTerm'), 'UI missing term display logic');
        assert.ok(appContent.includes('kill-leader') || appContent.includes('killLeader'), 'UI missing leader failure simulation controls');

        const cssContent = fs.readFileSync(cssPath, 'utf8');
        // Ensure color-coding is implemented for visual distinction of node roles
        assert.ok(cssContent.includes('.leader') || cssContent.includes('leader'), 'Styling missing for Leader role');
        assert.ok(cssContent.includes('.follower') || cssContent.includes('follower'), 'Styling missing for Follower role');
    });
});
