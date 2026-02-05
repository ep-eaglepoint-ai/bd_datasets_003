import { useState, useEffect } from 'react'
import './index.css'

interface NodeData {
    id: number;
    role: 'follower' | 'candidate' | 'leader';
    currentTerm: number;
    votedFor: number;
    isAlive: boolean;
    lastUpdate: string;
}

interface StateResponse {
    nodes: NodeData[];
    term: number;
}

function App() {
    const [data, setData] = useState<StateResponse | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    const fetchState = async () => {
        try {
            const response = await fetch('http://localhost:8080/state');
            if (!response.ok) throw new Error('Network response was not ok');
            const result = await response.json();
            setData(result);
            setError(null);
        } catch (err) {
            setError('Connection to backend lost...');
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchState();
        const interval = setInterval(fetchState, 500); // Poll every 500ms
        return () => clearInterval(interval);
    }, []);

    const killLeader = async () => {
        try {
            await fetch('http://localhost:8080/kill-leader', { method: 'POST' });
            fetchState();
        } catch (err) {
            console.error('Failed to kill leader', err);
        }
    };

    const getLeader = () => {
        return data?.nodes.find(n => n.role === 'leader' && n.isAlive);
    };

    if (loading && !data) {
        return (
            <div className="loading">
                <h1>Initializing Simulation...</h1>
            </div>
        );
    }

    return (
        <div className="App">
            <header>
                <h1>Consensus Visualizer</h1>
                <div className="dashboard">
                    <span>Global Term: <strong>{data?.term ?? 0}</strong></span>
                    <span>Current Leader: <strong>{getLeader()?.id ?? 'None'}</strong></span>
                </div>
            </header>

            {error && <div style={{ color: '#ff5252', marginTop: '1rem' }}>{error}</div>}

            <div className="cluster-container">
                {data?.nodes.map((node) => (
                    <div
                        key={node.id}
                        className={`node-card ${node.isAlive ? node.role : 'dead'} ${node.role === 'leader' && node.isAlive ? 'pulse' : ''}`}
                    >
                        <div className="node-id">Node {node.id}</div>
                        <div className="node-role">
                            {node.isAlive ? node.role.charAt(0).toUpperCase() + node.role.slice(1) : 'Offline'}
                        </div>
                        <div className="node-term">Term {node.currentTerm}</div>
                        <div style={{ fontSize: '0.7rem', marginTop: '0.5rem', opacity: 0.6 }}>
                            Voted for: {node.votedFor === -1 ? 'None' : node.votedFor}
                        </div>
                    </div>
                ))}
            </div>

            <div className="controls">
                <button className="kill-btn" onClick={killLeader} disabled={!getLeader()}>
                    Kill Current Leader
                </button>
                <button onClick={fetchState}>
                    Refresh State
                </button>
            </div>

            <footer style={{ marginTop: '5rem', opacity: 0.4, fontSize: '0.8rem' }}>
                Simplified Raft-style Consensus Simulation
            </footer>
        </div>
    )
}

export default App
