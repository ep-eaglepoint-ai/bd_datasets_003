import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { getSecret } from '../api';
import './SecretViewer.css';

export default function SecretViewer() {
  const { uuid } = useParams();
  const [secret, setSecret] = useState(null);
  const [revealed, setRevealed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const fetchSecret = async () => {
      try {
        const response = await getSecret(uuid);
        setSecret(response.secret);
      } catch (err) {
        setError(
          err.response?.data?.detail || 
          err.message || 
          'Secret not found or has already been read'
        );
      } finally {
        setLoading(false);
      }
    };

    fetchSecret();
  }, [uuid]);

  const handleReveal = () => {
    setRevealed(true);
  };

  const copyToClipboard = () => {
    if (secret) {
      navigator.clipboard.writeText(secret);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (loading) {
    return (
      <div className="secret-viewer-container">
        <div className="loading">Loading secret...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="secret-viewer-container">
        <div className="error-container">
          <h2>Secret Unavailable</h2>
          <p className="error-message">{error}</p>
          <p className="error-detail">
            This secret may have been:
            <ul>
              <li>Already read (secrets can only be viewed once)</li>
              <li>Expired (past its time-to-live)</li>
              <li>Never existed</li>
            </ul>
          </p>
          <a href="/" className="home-link">Create a new secret</a>
        </div>
      </div>
    );
  }

  return (
    <div className="secret-viewer-container">
      <h1>Secret Retrieved</h1>
      <div className="warning-box">
        <strong>⚠️ Important:</strong> This secret has been permanently deleted from our servers.
        It cannot be accessed again. Close this page or refresh to ensure it's not visible to others.
      </div>

      {!revealed ? (
        <div className="reveal-section">
          <p className="reveal-prompt">Click the button below to reveal the secret:</p>
          <button onClick={handleReveal} className="reveal-button">
            Reveal Secret
          </button>
        </div>
      ) : (
        <div className="secret-display">
          <div className="secret-content">
            <pre>{secret}</pre>
          </div>
          <button onClick={copyToClipboard} className="copy-secret-button">
            {copied ? '✓ Copied!' : 'Copy Secret'}
          </button>
          <p className="reminder-text">
            Remember: This secret has been deleted and cannot be retrieved again.
          </p>
        </div>
      )}
    </div>
  );
}

