
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { gqlRequest } from '../api/client';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState(''); // Mock password field
  const { login } = useAuthStore();
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
        // Simplified login for demo
        const mutation = `
            mutation {
                login(email: "${email}")
            }
        `;
        const data = await gqlRequest(mutation);
        login({ id: '1', email, role: 'PATIENT' }, data.login);
        navigate('/patient');
    } catch (err) {
        alert('Login failed');
    }
  };

  return (
    <div style={{ 
        minHeight: '100vh', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%)' 
    }}>
      <div className="card" style={{ width: '100%', maxWidth: '400px', padding: '2.5rem', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)' }}>
        <div style={{ marginBottom: '2rem', textAlign: 'center' }}>
            <h1 style={{ color: 'var(--primary)', marginBottom: '0.5rem' }}>Healthcare+</h1>
            <p style={{ color: 'var(--slate-500)' }}>Secure Patient Portal</p>
        </div>
        
        <form onSubmit={handleLogin}>
          <div style={{ marginBottom: '1rem' }}>
              <label className="label">Email Address</label>
              <input 
                className="input"
                type="email" 
                placeholder="name@example.com" 
                value={email} 
                onChange={e => setEmail(e.target.value)} 
              />
          </div>
          
          <div style={{ marginBottom: '1.5rem' }}>
              <label className="label">Password</label>
              <input 
                className="input"
                type="password" 
                placeholder="••••••••" 
                value={password} 
                onChange={e => setPassword(e.target.value)} 
              />
          </div>
          
          <button className="btn btn-primary" style={{ width: '100%' }} type="submit">
            Sign In
          </button>
        </form>
        
        <div style={{ marginTop: '1.5rem', textAlign: 'center', fontSize: '0.875rem', color: 'var(--slate-400)' }}>
            <p>Protected by HIPAA-compliant security</p>
        </div>
      </div>
    </div>
  );
};

export default Login;
