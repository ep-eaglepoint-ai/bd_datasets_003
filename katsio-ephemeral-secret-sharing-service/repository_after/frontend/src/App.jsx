import { BrowserRouter, Routes, Route } from 'react-router-dom';
import SecretForm from './components/SecretForm';
import SecretViewer from './components/SecretViewer';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<SecretForm />} />
        <Route path="/secret/:uuid" element={<SecretViewer />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;

