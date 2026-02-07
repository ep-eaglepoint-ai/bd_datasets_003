import { useState, useEffect } from 'react'
import axios from 'axios'
import BuyButton from './BuyButton'

function App() {
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  
  const userId = 1 

  useEffect(() => {
    const fetchProducts = async () => {
      try {
        setLoading(true)
        
        const resp = await axios.get('/api/products/')
        setProducts(resp.data)
      } catch (err) {
        console.error("Fetch error:", err)
        setError("Could not load products. Is the backend running?")
      } finally {
        setLoading(false)
      }
    }

    fetchProducts()
  }, [])

  if (loading) return <div style={{ padding: '2rem' }}>Loading active sales...</div>
  if (error) return <div style={{ padding: '2rem', color: 'red' }}>{error}</div>

  return (
    <div style={{ padding: '2rem', fontFamily: 'system-ui, sans-serif', maxWidth: '1200px', margin: '0 auto' }}>
      <header style={{ borderBottom: '2px solid #eee', marginBottom: '2rem', paddingBottom: '1rem' }}>
        <h1 style={{ fontSize: '2.5rem', color: '#333' }}>Flash Sale 🔥</h1>
        <p>Logged in as User #{userId}</p>
      </header>

      {products.length === 0 ? (
        <p>No products are currently active for this sale.</p>
      ) : (
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', 
          gap: '2rem' 
        }}>
          {products.map(product => (
            <div key={product.id} style={{ 
              border: '1px solid #ddd', 
              borderRadius: '12px', 
              padding: '1.5rem',
              boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
            }}>
              <h2 style={{ marginTop: 0 }}>{product.name}</h2>
              <p style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#e63946' }}>
                ${parseFloat(product.price).toFixed(2)}
              </p>
              <p style={{ color: '#666' }}>
                Stock Available: <span style={{ fontWeight: 'bold' }}>{product.stock}</span>
              </p>

              <BuyButton 
                userId={userId} 
                productId={product.id} 
                productName={product.name} 
                price={product.price} 
              />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default App