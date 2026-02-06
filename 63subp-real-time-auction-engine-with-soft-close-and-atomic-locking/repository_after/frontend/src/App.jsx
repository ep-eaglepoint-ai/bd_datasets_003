import React from 'react';
import AuctionComponent from './components/AuctionComponent';

export default function App() {
  return (
    <div className="app-container">
      <h1>Real-time Auction</h1>
      <AuctionComponent itemId={1} />
    </div>
  );
}
