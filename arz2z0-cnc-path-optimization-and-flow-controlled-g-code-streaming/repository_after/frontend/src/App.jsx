import React, { useState, useEffect, useRef } from 'react';
import Visualizer from './components/Visualizer';

// Icons using lucide-react (if installed) or text
// For simplicity assuming lucide-react might not be fully working if I didn't verify install.
// But I put it in package.json.
// I'll use text labels for safety or SVGs if needed.

const App = () => {
  const [socket, setSocket] = useState(null);
  const [status, setStatus] = useState('Disconnected'); // Disconnected, Idle, Printing, Paused
  const [gcodeLog, setGcodeLog] = useState([]);
  const [segments, setSegments] = useState([]);
  const [jobGCode, setJobGCode] = useState([]); // The full plan
  const [jobTime, setJobTime] = useState(0);
  const logEndRef = useRef(null);

  // Auto-scroll log
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [gcodeLog]);

  // WebSocket Connection
  const connect = () => {
    // In dev, use localhost:8000 (via proxy '/ws')
    // In docker, it might be same origin.
    // Use relative path '/ws' which Vite proxy handles in dev, and Nginx/FastAPI handles in prod.
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host; // includes port
    // If running via vite dev server (port 5173), proxy handles /ws
    // If running in docker, served by fastapi, it works.
    
    // However, Vite proxy for WS sometimes needs explicit full URL if native WebSocket is used.
    // Let's try relative first.
    let wsUrl = `${protocol}//${host}/ws`;
    if (window.location.port === '5173') {
       wsUrl = `ws://localhost:8000/ws`; // Explicit for dev
    }

    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      setStatus('Idle');
      setGcodeLog(prev => [...prev, '--- Connected ---']);
    };

    ws.onmessage = (event) => {
      const msg = event.data;
      if (msg.startsWith('STATUS:')) {
        setStatus(msg.split(': ')[1]);
      } else if (msg.startsWith('GCODE:')) {
        const line = msg.split(': ')[1];
        setGcodeLog(prev => [...prev, line]);
      } else {
        // e.g. ERROR or ACK
        console.log("WS Msg:", msg);
      }
    };

    ws.onclose = () => {
      setStatus('Disconnected');
      setSocket(null);
      setGcodeLog(prev => [...prev, '--- Disconnected ---']);
    };

    setSocket(ws);
  };

  const disconnect = () => {
    if (socket) socket.close();
  };

  // Generate Test Pattern
  const loadPattern = () => {
    // Generate 'HELLO' segments or random
    const newSegments = [];
    const pushLine = (x1, y1, x2, y2) => newSegments.push({ x1, y1, x2, y2 });
    
    // Simple H
    pushLine(10, 10, 10, 50);
    pushLine(10, 30, 30, 30);
    pushLine(30, 10, 30, 50);
    
    // Simple I (random order)
    pushLine(50, 50, 50, 10); // drawn up
    
    // Grid/Star for visual appeal
    for(let i=0; i<10; i++) {
        pushLine(60 + Math.random()*40, 60 + Math.random()*40, 
                 60 + Math.random()*40, 60 + Math.random()*40);
    }

    setSegments(newSegments);
    setGcodeLog(['--- Pattern Loaded ---']);
    setJobGCode([]);
    setJobTime(0);
  };

  // Optimize & Plan
  const optimize = async () => {
    if (segments.length === 0) return;
    
    try {
      const res = await fetch('/optimize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(segments)
      });
      const data = await res.json();
      setJobGCode(data.gcode);
      setGcodeLog(prev => [...prev, `--- Optimized: ${data.count} lines ---`]);
      calculateJobTime(data.gcode);
    } catch (e) {
      console.error(e);
      setGcodeLog(prev => [...prev, '--- Error Optimizing ---']);
    }
  };

  const calculateJobTime = (gcode) => {
    // Estimate
    let time = 0;
    let curX = 0, curY = 0;
    let feed = 1000; // default F1000
    const rapid = 5000;
    
    gcode.forEach(line => {
      const parts = line.split(' ');
      let newX = curX, newY = curY;
      let f = feed;
      let isRapid = false;
      
      if (line.startsWith('F')) {
          feed = parseFloat(line.substring(1));
          return;
      }
      
      parts.forEach(p => {
        if (p.startsWith('X')) newX = parseFloat(p.substring(1));
        if (p.startsWith('Y')) newY = parseFloat(p.substring(1));
        if (p.startsWith('F')) f = parseFloat(p.substring(1));
      });
      
      if (line.startsWith('G0')) isRapid = true;
      
      const dist = Math.sqrt((newX-curX)**2 + (newY-curY)**2);
      time += dist / (isRapid ? rapid : f);
      
      curX = newX; curY = newY;
    });
    
    setJobTime(time * 60); // Seconds
  };

  const sendCommand = (cmd) => {
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(cmd);
    }
  };

  return (
    <div className="layout" style={{ maxWidth: '1200px', margin: '0 auto', padding: '2rem', height: '100vh', display: 'grid', gridTemplateColumns: '300px 1fr', gap: '2rem' }}>
      
      {/* Sidebar Controls */}
      <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 'bold', background: 'linear-gradient(to right, #38bdf8, #2563eb)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', margin: 0 }}>
          LaserControl
        </h1>
        
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div className={`status-indicator`}>
            <div className={`status-dot ${status.toLowerCase()}`}></div>
            {status}
          </div>
          <button 
             onClick={socket ? disconnect : connect}
             className={socket ? "btn-danger" : "btn-primary"}
             style={{ padding: '0.25rem 0.75rem', fontSize: '0.8rem' }}
          >
            {socket ? "Disconnect" : "Connect"}
          </button>
        </div>

        <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', margin: '0.5rem 0' }}></div>

        <button className="btn-primary" onClick={loadPattern} disabled={status === 'Printing'}>
          Load Test Pattern
        </button>

        <button className="btn-primary" onClick={optimize} disabled={segments.length === 0 || status === 'Printing'}>
          Optimize & Plan
        </button>
        
        {jobTime > 0 && (
           <div style={{ background: 'rgba(255,255,255,0.05)', padding: '1rem', borderRadius: '8px' }}>
              <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Est. Job Time</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{jobTime.toFixed(1)}s</div>
              <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>{jobGCode.length} Lines</div>
           </div>
        )}

        <div style={{ flex: 1 }}></div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
          <button className="btn-primary" 
             onClick={() => sendCommand('START')} 
             disabled={status === 'Printing' || status === 'Disconnected' || jobGCode.length === 0}
             style={{ background: '#22c55e' }}
          >
            Run Job
          </button>
          <button className="btn-danger" 
             onClick={() => sendCommand('STOP')} 
             disabled={status === 'Idle' || status === 'Disconnected'}
          >
            Stop
          </button>
        </div>
        
        {status === 'Printing' || status === 'Paused' ? (
           <button className="btn-primary" 
              onClick={() => sendCommand(status === 'Paused' ? 'RESUME' : 'PAUSE')}
              style={{ background: '#f59e0b' }}
           >
             {status === 'Paused' ? 'Resume' : 'Pause'}
           </button>
        ) : null}

      </div>

      {/* Main Content */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', minHeight: 0 }}>
        {/* Visualizer */}
        <div style={{ flex: 2, minHeight: 0 }}>
             <Visualizer gcodeLines={gcodeLog} segments={segments} />
        </div>

        {/* Console Log */}
        <div className="glass-panel" style={{ flex: 1, padding: '1rem', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
           <h3 style={{ margin: '0 0 0.5rem 0', color: '#94a3b8', fontSize: '0.9rem' }}>Machine Stream</h3>
           <div style={{ 
               flex: 1, 
               background: '#0f172a', 
               borderRadius: '6px', 
               padding: '0.5rem', 
               fontFamily: 'monospace', 
               fontSize: '0.8rem', 
               color: '#22c55e',
               overflowY: 'auto' 
           }}>
             {gcodeLog.map((line, i) => (
               <div key={i}>{line}</div>
             ))}
             <div ref={logEndRef} />
           </div>
        </div>
      </div>

    </div>
  );
};

export default App;
