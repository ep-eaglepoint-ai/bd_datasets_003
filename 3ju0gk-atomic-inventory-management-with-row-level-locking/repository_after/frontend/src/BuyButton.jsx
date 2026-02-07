import { useState } from 'react'
import axios from 'axios'

export default function BuyButton({ userId, productId, price, productName }) {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)

  const handleBuy = async () => {
    // Basic validation to prevent sending "undefined" to the backend
    if (!userId || !productId) {
      setError("Missing User ID or Product ID");
      return;
    }
    
    if (loading) return

    setLoading(true)
    setError(null)
    setResult(null)

    try {
      // Axios automatically handles JSON.stringify, 
      // but ensure the path matches your urls.py
      const resp = await axios.post('/api/purchase/', {
        user_id: userId,
        product_id: productId,
      });

      setResult(resp.data)
    } catch (err) {
      // Improved error logging to see exactly what Django says
      console.error("Backend Error:", err.response?.data);
      const msg = err.response?.data?.error || 'Purchase failed';
      setError(msg);
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ marginTop: '1.5rem' }}>
      <button
        onClick={handleBuy}
        disabled={loading}
        style={{
          padding: '1rem 2rem',
          fontSize: '1.2rem',
          background: loading ? '#aaa' : '#e63946',
          color: 'white',
          border: 'none',
          borderRadius: '8px',
          cursor: loading ? 'not-allowed' : 'pointer',
        }}
      >
        {loading ? 'Processing...' : 'Buy Now'}
      </button>

      {error && (
        <p style={{ color: '#e63946', marginTop: '1rem' }}>{error}</p>
      )}

      {result && (
        <div style={{ marginTop: '1.5rem', padding: '1rem', background: '#f0f4f8', borderRadius: '8px' }}>
          <strong>Success!</strong><br />
          Purchased {productName}<br />
          Paid: ${result.price_paid}<br />
          Remaining stock: {result.remaining_stock}<br />
          Your new balance: ${result.new_balance}
        </div>
      )}
    </div>
  )
}