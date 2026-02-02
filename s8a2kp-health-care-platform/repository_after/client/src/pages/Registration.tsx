
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

const Registration = () => {
  const [formData, setFormData] = useState({
      firstName: '',
      lastName: '',
      email: '',
      password: '',
      docScanUrl: '', // Mock for ID upload
  });
  const navigate = useNavigate();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      // Mock API call
      console.log('Registering patient:', formData);
      // Simulate successful registration and redirect to login
      navigate('/login');
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
            />
          </div>

          <div style={{ marginBottom: '1.5rem' }}>
              <label className="label">ID Document URL (Mock)</label>
              <input 
                  className="input"
                  type="text" 
                  name="docScanUrl" 
                  value={formData.docScanUrl} 
                  onChange={handleChange} 
                  placeholder="http://example.com/id.jpg"
              />
              <p style={{ fontSize: '0.75rem', color: 'var(--slate-500)', marginTop: '-0.5rem' }}>
                Required for identity verification
              </p>
          </div>

          <button className="btn btn-primary" style={{ width: '100%' }} type="submit">
            Register Account
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
