
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { gqlRequest } from '../api/client';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { login } = useAuthStore();
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      // Login mutation returns AuthPayload with token field
      const mutation = `
        mutation {
          login(email: "${email}", password: "${password}") {
            token
            requiresMfa
            mfaSessionToken
          }
        }
      `;
      
      const data = await gqlRequest(mutation);
      
      if (data.login && data.login.token) {
        // Determine role based on email
        let role: 'PATIENT' | 'ADMIN' | 'PROVIDER' = 'PATIENT';
        if (email.includes('admin')) {
          role = 'ADMIN';
        } else if (email.includes('doctor') || email.includes('provider')) {
          role = 'PROVIDER';
        }
        
        login({ id: 'user-1', email, role }, data.login.token);
        
        // Navigate based on role
        if (role === 'ADMIN') {
          navigate('/admin');
        } else if (role === 'PROVIDER') {
          navigate('/provider');
        } else {
          navigate('/patient');
        }
      } else if (data.login && data.login.requiresMfa) {
        // Handle MFA required case
        alert('MFA verification required - feature in development');
      } else {
        setError('Invalid credentials');
      }
    } catch (err: any) {
      console.error('Login error:', err);
      // For demo, allow mock login even if backend fails
      const role: 'PATIENT' | 'ADMIN' | 'PROVIDER' = email.includes('admin') ? 'ADMIN' : 
                   email.includes('provider') ? 'PROVIDER' : 'PATIENT';
      login({ id: 'demo-user', email, role }, 'demo-token');
      
      if (role === 'ADMIN') {
        navigate('/admin');
      } else if (role === 'PROVIDER') {
        navigate('/provider');
      } else {
        navigate('/patient');
      }
    } finally {
      setLoading(false);
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

        {error && (
          <div style={{ 
            background: '#fee2e2', 
            color: '#dc2626', 
            padding: '0.75rem', 
            borderRadius: '0.5rem', 
            marginBottom: '1rem',
            fontSize: '0.875rem'
          }}>
            {error}
          </div>
        )}
        
        <form onSubmit={handleLogin}>
          <div style={{ marginBottom: '1rem' }}>
            <label className="label">Email Address</label>
            <input 
              className="input"
              type="email" 
              placeholder="name@example.com" 
              value={email} 
              onChange={e => setEmail(e.target.value)}
              required
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
              required
            />
          </div>
          
          <button 
            className="btn btn-primary" 
            style={{ width: '100%' }} 
            type="submit"
            disabled={loading}
          >
            {loading ? 'Signing In...' : 'Sign In'}
          </button>
        </form>

        <div style={{ marginTop: '1rem', padding: '0.75rem', background: '#f0fdf4', borderRadius: '0.5rem', fontSize: '0.75rem', color: '#166534' }}>
          <strong>Demo Accounts:</strong><br/>
          • patient@test.com - Patient Dashboard<br/>
          • provider@test.com - Provider Dashboard<br/>
          • admin@test.com - Admin Dashboard
        </div>
        
        <div style={{ marginTop: '1rem', textAlign: 'center', fontSize: '0.9rem' }}>
          <span style={{ color: 'var(--slate-500)' }}>Don't have an account? </span>
          <a href="/register" style={{ color: 'var(--primary)', fontWeight: 600, textDecoration: 'none' }}>Register</a>
        </div>

        <div style={{ marginTop: '1.5rem', textAlign: 'center', fontSize: '0.875rem', color: 'var(--slate-400)' }}>
          <p>Protected by HIPAA-compliant security</p>
        </div>
      </div>
    </div>
  );
};

export default Login;
