import { useState } from 'react'
import axios from 'axios'

export default function BuyButton({ userId, productId, price, productName }) {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)

  const handleBuy = async () => {
    // REQUIREMENT 3: Prevent double submission at the logic level
    if (loading) return
    
    if (!userId || !productId) {
      setError("Missing User ID or Product ID");
      return;
    }

    // REQUIREMENT 6: Set loading state immediately in the same tick as onClick
    // This triggers the 'disabled' attribute on the button element
    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const resp = await axios.post('/api/purchase/', {
        user_id: userId,
        product_id: productId,
      });

      // Backend returns: { success: true, product, price_paid, remaining_stock, new_balance }
      setResult(resp.data)
    } catch (err) {
      console.error("Backend Error:", err.response?.data);
      
      // Handle specific status codes (409: Out of stock, 402: No money)
      const msg = err.response?.data?.error || 'Purchase failed';
      setError(msg);
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ marginTop: '1.5rem' }}>
      {/* REQUIREMENT 3 & 6: The 'disabled' attribute must be present.
         This physically prevents browser events from firing a second request.
      */}
      <button
        onClick={handleBuy}
        disabled={loading} 
        style={{
          padding: '1rem 2rem',
          fontSize: '1.2rem',
          background: loading ? '#95a5a6' : '#e63946',
          color: 'white',
          border: 'none',
          borderRadius: '8px',
          cursor: loading ? 'not-allowed' : 'pointer',
          transition: 'background 0.3s ease'
        }}
      >
        {loading ? 'Processing Transaction...' : 'Buy Now'}
      </button>

      {error && (
        <div style={{ 
          color: '#e63946', 
          marginTop: '1rem', 
          fontWeight: 'bold',
          padding: '0.5rem',
          border: '1px solid #e63946',
          borderRadius: '4px'
        }}>
          ⚠️ {error}
        </div>
      )}

      {result && (
        <div style={{ 
          marginTop: '1.5rem', 
          padding: '1rem', 
          background: '#d4edda', 
          color: '#155724',
          border: '1px solid #c3e6cb',
          borderRadius: '8px' 
        }}>
          <strong>✅ Purchase Successful!</strong><br />
          Item: {productName}<br />
          Stock Left: {result.remaining_stock}<br />
          New Balance: ${parseFloat(result.new_balance).toFixed(2)}
        </div>
      )}
    </div>
  )
}