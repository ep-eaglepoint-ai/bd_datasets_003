
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { gqlRequest } from '../api/client';

const Registration = () => {
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    docScanUrl: 'http://docs.com/id.jpg',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      // Create patient via GraphQL
      const mutation = `
        mutation {
          createPatient(createPatientInput: {
            firstName: "${formData.firstName}",
            lastName: "${formData.lastName}",
            email: "${formData.email}",
            docScanUrl: "${formData.docScanUrl || 'http://docs.com/id.jpg'}",
            insuranceData: "Self-Pay"
          }) {
            id
            firstName
            lastName
            email
          }
        }
      `;
      
      const data = await gqlRequest(mutation);
      console.log('Patient created:', data.createPatient);
      
      // Success - redirect to login
      alert('Registration successful! Please log in.');
      navigate('/login');
    } catch (err: any) {
      console.error('Registration error:', err);
      setError(err.message || 'Registration failed. Please try again.');
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
      <div className="card" style={{ width: '100%', maxWidth: '500px', padding: '2.5rem', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)' }}>
        <div style={{ marginBottom: '2rem', textAlign: 'center' }}>
          <h1 style={{ color: 'var(--primary)', marginBottom: '0.5rem' }}>Healthcare+</h1>
          <h2 style={{ fontSize: '1.25rem' }}>Create Patient Account</h2>
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

        <form onSubmit={handleSubmit}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
            <div>
              <label className="label">First Name</label>
              <input 
                className="input"
                type="text" 
                name="firstName" 
                value={formData.firstName} 
                onChange={handleChange} 
                required 
              />
            </div>
            <div>
              <label className="label">Last Name</label>
              <input 
                className="input"
                type="text" 
                name="lastName" 
                value={formData.lastName} 
                onChange={handleChange} 
                required 
              />
            </div>
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label className="label">Email Address</label>
            <input 
              className="input"
              type="email" 
              name="email" 
              value={formData.email} 
              onChange={handleChange} 
              required 
            />
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label className="label">Password</label>
            <input 
              className="input"
              type="password" 
              name="password" 
              value={formData.password} 
              onChange={handleChange} 
              required 
              minLength={6}
            />
          </div>

          <div style={{ marginBottom: '1.5rem' }}>
            <label className="label">ID Document URL (Optional)</label>
            <input 
              className="input"
              type="text" 
              name="docScanUrl" 
              value={formData.docScanUrl} 
              onChange={handleChange} 
              placeholder="http://example.com/id.jpg"
            />
            <p style={{ fontSize: '0.75rem', color: 'var(--slate-500)', marginTop: '0.25rem' }}>
              For identity verification (uses default if empty)
            </p>
          </div>

          <button 
            className="btn btn-primary" 
            style={{ width: '100%' }} 
            type="submit"
            disabled={loading}
          >
            {loading ? 'Creating Account...' : 'Register Account'}
          </button>
        </form>

        <div style={{ marginTop: '1.5rem', textAlign: 'center', fontSize: '0.9rem' }}>
          <span style={{ color: 'var(--slate-500)' }}>Already have an account? </span>
          <a href="/login" style={{ color: 'var(--primary)', fontWeight: 600, textDecoration: 'none' }}>Sign In</a>
        </div>
      </div>
    </div>
  );
};

export default Registration;
