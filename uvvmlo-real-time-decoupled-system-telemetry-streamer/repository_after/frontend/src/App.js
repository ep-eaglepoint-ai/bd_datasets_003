import React, { useState, useEffect, useCallback } from 'react';

function App() {
  const [metrics, setMetrics] = useState(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState(null);

  const connectWebSocket = useCallback(() => {
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${wsProtocol}//${window.location.host}/ws`;
    
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      setConnected(true);
      setError(null);
      console.log('WebSocket connected');
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        setMetrics(data);
      } catch (e) {
        console.error('Failed to parse message:', e);
      }
    };

    ws.onerror = (event) => {
      console.error('WebSocket error:', event);
      setError('Connection error');
    };

    ws.onclose = () => {
      setConnected(false);
      console.log('WebSocket disconnected');
    };

    return ws;
  }, []);

  useEffect(() => {
    const ws = connectWebSocket();

    // Cleanup function to close WebSocket when component unmounts
    return () => {
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close();
      }
    };
  }, [connectWebSocket]);

  const formatBytes = (bytes) => {
    if (!bytes) return '0 B';
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${sizes[i]}`;
  };

  return (
    <div className="dashboard">
      <h1>System Telemetry Dashboard</h1>
      
      <div className="status">
        <span className={`indicator ${connected ? 'connected' : 'disconnected'}`}></span>
        {connected ? 'Connected' : 'Disconnected'}
        {error && <span className="error"> - {error}</span>}
      </div>

      {metrics ? (
        <div className="metrics-grid">
          <div className="metric-card">
            <h3>CPU Usage</h3>
            <p className="metric-value">{metrics.cpu_usage?.toFixed(2) || 0}%</p>
          </div>

          <div className="metric-card">
            <h3>Memory Usage</h3>
            <p className="metric-value">{metrics.memory_usage_percent?.toFixed(2) || 0}%</p>
            <p className="metric-detail">
              {formatBytes(metrics.memory_used)} / {formatBytes(metrics.memory_total)}
            </p>
          </div>

          <div className="metric-card">
            <h3>Active Connections</h3>
            <p className="metric-value">{metrics.active_connections || 0}</p>
          </div>

          <div className="metric-card">
            <h3>Goroutines</h3>
            <p className="metric-value">{metrics.num_goroutines || 0}</p>
          </div>

          <div className="metric-card">
            <h3>Last Update</h3>
            <p className="metric-value">
              {new Date(metrics.timestamp).toLocaleTimeString()}
            </p>
          </div>
        </div>
      ) : (
        <p className="waiting">Waiting for data...</p>
      )}
    </div>
  );
}

export default App;