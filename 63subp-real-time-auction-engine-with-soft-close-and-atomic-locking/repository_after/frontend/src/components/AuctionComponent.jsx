import React, { useEffect, useState, useMemo } from 'react';
import { io } from 'socket.io-client';
import axios from 'axios';

// Initialize outside or use useMemo to ensure the mock is caught correctly
const socket = io('http://localhost:4000');

export default function AuctionComponent({ itemId }) {
  const [item, setItem] = useState(null);
  const [bids, setBids] = useState([]);
  const [myBid, setMyBid] = useState('');
  const [timer, setTimer] = useState(0);
  const [status, setStatus] = useState('');

  useEffect(() => {
    // Initial Fetch
    axios.get(`/api/items/${itemId}`).then(res => {
      const { item: fetchedItem, bids: fetchedBids } = res.data;
      setItem(fetchedItem);
      setBids(fetchedBids || []);
      setTimer(Math.max(0, fetchedItem.end_time - Date.now()));
    });

    socket.emit('JOIN_ITEM', itemId);

    const handleUpdate = (payload) => {
      if (payload.amount) {
        setItem(prev => ({ ...prev, current_price: payload.amount, end_time: payload.endTime || prev.end_time }));
        setBids(prev => [{ user_id: payload.userId, amount: payload.amount, created_at: Date.now() }, ...prev]);
      }
      if (payload.endTime) {
        setTimer(Math.max(0, payload.endTime - Date.now()));
      }
    };

    socket.on('NEW_BID', handleUpdate);
    socket.on('TIMER_UPDATE', handleUpdate);

    return () => {
      socket.off('NEW_BID', handleUpdate);
      socket.off('TIMER_UPDATE', handleUpdate);
    };
  }, [itemId]);

  useEffect(() => {
    const interval = setInterval(() => {
      setTimer(prev => Math.max(0, prev - 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const placeBid = async () => {
    try {
      await axios.post(`/api/bids/${itemId}/bid`, {
        amount: Number(myBid),
        userId: 'User_' + Math.floor(Math.random() * 1000),
      });
      setMyBid('');
      setStatus('');
    } catch (err) {
      if (err.response?.status === 409) setStatus('You were outbid!');
      else if (err.response?.status === 400) setStatus('Auction ended!');
    }
  };

  if (!item) return <div>Loading...</div>;

  return (
    <div className="auction-component">
      <h2>{item.name}</h2>
      
      {/* FIXED: Template literal prevents "broken up by multiple elements" error */}
      <p>{`Current Price: $${item.current_price}`}</p>
      
      <p>{`Time Remaining: ${Math.floor(timer / 1000)}s`}</p>
    
      <input
        type="number"
        value={myBid}
        onChange={(e) => setMyBid(e.target.value)}
        placeholder="Enter your bid"
      />
      <button onClick={placeBid}>Place Bid</button>

      {/* FIXED: Using a more standard style application for JSDOM */}
      {status && (
        <p style={{ color: 'red' }}>
          {status}
        </p>
      )}

      <h3>Bid History:</h3>
      <ul>
        {bids.map((b, idx) => (
          <li key={idx}>
            {`${b.user_id || b.userId}: $${b.amount} at ${new Date(b.created_at).toLocaleTimeString()}`}
          </li>
        ))}
      </ul>
    </div>
  );
}