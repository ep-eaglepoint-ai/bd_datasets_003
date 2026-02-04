import React, {useState} from 'react';
import './App.css';
function App() {
  return (
    <div className="App">
      <header className="App-header">
        <Counter />
      </header>
    </div>
  );
}



const Counter = () => {
  const [count, setCount] = useState(0);
  const countPlus = () => setCount(count+1);
  const countMinus = () => setCount(count-1);
  const resetVal = () => setCount(0);
  return (
    <div>
      <h1 data-testid="count">{count}</h1>
      <button className="buttonStyle" data-testid="increment" onClick={countPlus}>Count+</button>
      <button className="buttonStyle" data-testid="reset" onClick={resetVal}>Reset</button>
      <button className="buttonStyle" data-testid="decrement" onClick={countMinus}>Count-</button>
    </div>
  )
}

export { Counter };
export default App;
