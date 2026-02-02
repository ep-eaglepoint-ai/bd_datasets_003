import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { CartPage } from './pages/CartPage';
import { ShippingPage } from './pages/ShippingPage';
import { PaymentPage } from './pages/PaymentPage';
import { ConfirmationPage } from './pages/ConfirmationPage';
import './App.css';

function App() {
  return (
    <BrowserRouter>
      <div className="app">
        <header className="app-header">
          <h1>E-Commerce Store</h1>
        </header>
        <main className="app-main">
          <Routes>
            <Route path="/" element={<Navigate to="/cart" replace />} />
            <Route path="/cart" element={<CartPage />} />
            <Route path="/checkout/shipping" element={<ShippingPage />} />
            <Route path="/checkout/payment" element={<PaymentPage />} />
            <Route path="/checkout/confirmation" element={<ConfirmationPage />} />
            <Route path="/products" element={<div>Products Page (placeholder)</div>} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

export default App;
