import React, { useEffect, useRef } from 'react';

import { calculateBounds, calculateTransform, toScreen } from '../utils/visualizerUtils';

const Visualizer = ({ gcodeLines, segments }) => {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    
    // Clear
    ctx.fillStyle = '#1e293b'; // bg-secondary
    ctx.fillRect(0, 0, width, height);
    
    if (!segments || segments.length === 0) {
      // Draw grid or empty state
      return;
    }

    // 1. Calculate Layout
    const bounds = calculateBounds(segments);
    const { scale, offsetX, offsetY } = calculateTransform(bounds, width, height);
    
    // Helper wrapper
    const convert = (x, y) => toScreen(x, y, scale, offsetX, offsetY, height);

    // 2. Draw parsed G-Code
    // We parse the lines sequentially to track current position
    let curX = 0;
    let curY = 0;
    
    // Default start at 0? G-Code usually starts with G90...
    
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    
    gcodeLines.forEach(line => {
      const parts = line.split(' ');
      let cmd = parts[0];
      let newX = curX;
      let newY = curY;
      
      // Basic parsing for G0/G1 X.. Y..
      // Example: G0 X10.5 Y20.0
      parts.forEach(p => {
        if (p.startsWith('X')) newX = parseFloat(p.substring(1));
        if (p.startsWith('Y')) newY = parseFloat(p.substring(1));
      });
      
      const start = convert(curX, curY);
      const end = convert(newX, newY);
      
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(end.x, end.y);
      
      if (cmd.startsWith('G0')) {
        // Travel: Faint Blue Dashed
        ctx.strokeStyle = '#38bdf8'; // light blue
        ctx.setLineDash([5, 5]);
        ctx.globalAlpha = 0.5;
        ctx.stroke();
      } else if (cmd.startsWith('G1')) {
        // Cut: Red Solid
        ctx.strokeStyle = '#ef4444'; // red
        ctx.setLineDash([]);
        ctx.globalAlpha = 1.0;
        ctx.stroke();
      }
      
      // Update pos
      curX = newX;
      curY = newY;
    });
    
    // Draw "Head"
    const head = convert(curX, curY);
    ctx.beginPath();
    ctx.arc(head.x, head.y, 5, 0, 2 * Math.PI);
    ctx.fillStyle = '#22c55e'; // Green head
    ctx.fill();
    ctx.globalAlpha = 1.0;

  }, [gcodeLines, segments]); // Re-render when lines or segments change

  return (
    <div className="glass-panel" style={{ padding: '1rem', width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
        <h3 style={{ margin: '0 0 1rem 0', color: '#94a3b8' }}>G-Code Visualizer</h3>
        <canvas 
            ref={canvasRef} 
            width={600} 
            height={400} 
            style={{ width: '100%', height: '100%', background: '#1e293b', borderRadius: '8px' }}
        />
    </div>
  );
};

export default Visualizer;
