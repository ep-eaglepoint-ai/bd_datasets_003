import BuyButton from './BuyButton'

function App() {

  const userId = 1001
  const productId = 1
  const productName = "Limited Edition Hoodie"
  const price = 59.99

  return (
    <div style={{ padding: '2rem', fontFamily: 'system-ui, sans-serif' }}>
      <h1>Flash Sale</h1>
      <h2>{productName} — ${price.toFixed(2)}</h2>

      <BuyButton
        userId={userId}
        productId={productId}
        price={price}
        productName={productName}
      />
    </div>
  )
}

export default App