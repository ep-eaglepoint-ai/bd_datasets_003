import { useState } from 'react';
import { createSecret } from '../api';
import './SecretForm.css';

// Preset TTL options in hours
const TTL_PRESETS = [
  { value: 0.25, label: '15 minutes', hours: 0, minutes: 15 },
  { value: 1, label: '1 hour', hours: 1, minutes: 0 },
  { value: 6, label: '6 hours', hours: 6, minutes: 0 },
  { value: 24, label: '24 hours', hours: 24, minutes: 0 },
  { value: 168, label: '7 days', hours: 168, minutes: 0 },
];

// Helper function to format hours as human-readable time
const formatTime = (hours) => {
  if (hours < 1) {
    const minutes = Math.round(hours * 60);
    return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
  } else if (hours < 24) {
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    if (m === 0) {
      return `${h} hour${h !== 1 ? 's' : ''}`;
    }
    return `${h} hour${h !== 1 ? 's' : ''} ${m} minute${m !== 1 ? 's' : ''}`;
  } else {
    const days = Math.floor(hours / 24);
    const remainingHours = Math.floor(hours % 24);
    if (remainingHours === 0) {
      return `${days} day${days !== 1 ? 's' : ''}`;
    }
    return `${days} day${days !== 1 ? 's' : ''} ${remainingHours} hour${remainingHours !== 1 ? 's' : ''}`;
  }
};

export default function SecretForm() {
  const [secret, setSecret] = useState('');
  const [ttlMode, setTtlMode] = useState('preset'); // 'preset' or 'custom'
  const [ttlPreset, setTtlPreset] = useState(24); // hours
  const [ttlCustomHours, setTtlCustomHours] = useState(24);
  const [ttlCustomMinutes, setTtlCustomMinutes] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  // Calculate total hours from current TTL settings
  const getTtlHours = () => {
    if (ttlMode === 'preset') {
      return ttlPreset;
    } else {
      const totalHours = ttlCustomHours + (ttlCustomMinutes / 60);
      // Ensure minimum of 0.1 hours (6 minutes) as per backend validation
      return Math.max(0.1, totalHours);
    }
  };

  const ttlHours = getTtlHours();
  const isValidTtl = ttlHours >= 0.1 && ttlHours <= 168;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await createSecret(secret, ttlHours);
      const fullUrl = `${window.location.origin}${response.url}`;
      setResult({ ...response, fullUrl });
      setSecret(''); // Clear form
    } catch (err) {
      setError(
        err.response?.data?.detail || 
        err.message || 
        'Failed to create secret. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(result.fullUrl);
    alert('URL copied to clipboard!');
  };

  return (
    <div className="secret-form-container">
      <h1>Ephemeral Secret Sharing</h1>
      <p className="subtitle">Share sensitive credentials securely. Secrets self-destruct after one read.</p>
      
      {!result ? (
        <form onSubmit={handleSubmit} className="secret-form">
          <div className="form-group">
            <label htmlFor="secret">Secret</label>
            <textarea
              id="secret"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              placeholder="Enter your secret (API key, password, etc.)"
              required
              rows={6}
            />
          </div>

          <div className="form-group">
            <label htmlFor="ttl">Expiration Time</label>
            <div className="ttl-selector">
              <div className="ttl-mode-toggle">
                <button
                  type="button"
                  className={`mode-button ${ttlMode === 'preset' ? 'active' : ''}`}
                  onClick={() => setTtlMode('preset')}
                >
                  Quick Select
                </button>
                <button
                  type="button"
                  className={`mode-button ${ttlMode === 'custom' ? 'active' : ''}`}
                  onClick={() => setTtlMode('custom')}
                >
                  Custom Time
                </button>
              </div>

              {ttlMode === 'preset' ? (
                <div className="preset-options">
                  {TTL_PRESETS.map((preset) => (
                    <button
                      key={preset.value}
                      type="button"
                      className={`preset-button ${ttlPreset === preset.value ? 'selected' : ''}`}
                      onClick={() => setTtlPreset(preset.value)}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="custom-time-inputs">
                  <div className="time-input-group">
                    <label htmlFor="custom-hours">Hours</label>
                    <input
                      id="custom-hours"
                      type="number"
                      min="0"
                      max="168"
                      value={ttlCustomHours}
                      onChange={(e) => {
                        const val = Math.max(0, Math.min(168, parseInt(e.target.value) || 0));
                        setTtlCustomHours(val);
                      }}
                      className="time-input"
                    />
                  </div>
                  <div className="time-input-group">
                    <label htmlFor="custom-minutes">Minutes</label>
                    <input
                      id="custom-minutes"
                      type="number"
                      min="0"
                      max="59"
                      value={ttlCustomMinutes}
                      onChange={(e) => {
                        const val = Math.max(0, Math.min(59, parseInt(e.target.value) || 0));
                        setTtlCustomMinutes(val);
                      }}
                      className="time-input"
                    />
                  </div>
                </div>
              )}

              <div className={`ttl-preview ${!isValidTtl ? 'invalid' : ''}`}>
                <span className="preview-label">Expires in:</span>
                <span className="preview-value">
                  {isValidTtl ? formatTime(ttlHours) : 'Invalid time (min: 6 min, max: 7 days)'}
                </span>
              </div>
              {!isValidTtl && (
                <div className="ttl-error">
                  Please enter a valid expiration time between 6 minutes and 7 days.
                </div>
              )}
            </div>
          </div>

          {error && <div className="error-message">{error}</div>}

          <button type="submit" disabled={loading || !secret.trim() || !isValidTtl}>
            {loading ? 'Creating...' : 'Create Secret Link'}
          </button>
        </form>
      ) : (
        <div className="result-container">
          <h2>Secret Link Created</h2>
          <p className="warning-text">
            ⚠️ This link can only be accessed once. Share it securely.
          </p>
          <div className="url-display">
            <input
              type="text"
              value={result.fullUrl}
              readOnly
              className="url-input"
            />
            <button onClick={copyToClipboard} className="copy-button">
              Copy
            </button>
          </div>
          <button
            onClick={() => {
              setResult(null);
              setError('');
            }}
            className="create-another-button"
          >
            Create Another Secret
          </button>
        </div>
      )}
    </div>
  );
}

