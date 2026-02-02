'use client';

// Courier Check-In Form Component
// Allows couriers to register packages and receive secure PINs

import { useState, FormEvent } from 'react';

interface CheckInResponse {
  success: boolean;
  parcelId: number;
  pin: string;
  expiresAt: string;
  message: string;
}

export default function CourierCheckIn() {
  const [recipientEmail, setRecipientEmail] = useState('');
  const [lockerId, setLockerId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<CheckInResponse | null>(null);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch('/api/courier/check-in', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          recipientEmail: recipientEmail.trim(),
          lockerId: parseInt(lockerId, 10),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Check-in failed');
        return;
      }

      setSuccess(data);
      // Reset form after successful check-in
      setRecipientEmail('');
      setLockerId('');
    } catch (err) {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md mx-auto p-6 bg-white rounded-lg shadow-md">
      <h2 className="text-2xl font-bold mb-6 text-gray-800">Courier Check-In</h2>
      
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="recipientEmail" className="block text-sm font-medium text-gray-700 mb-1">
            Recipient Email
          </label>
          <input
            type="email"
            id="recipientEmail"
            value={recipientEmail}
            onChange={(e) => setRecipientEmail(e.target.value)}
            required
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-black"
            placeholder="recipient@example.com"
          />
        </div>

        <div>
          <label htmlFor="lockerId" className="block text-sm font-medium text-gray-700 mb-1">
            Locker Number
          </label>
          <input
            type="number"
            id="lockerId"
            value={lockerId}
            onChange={(e) => setLockerId(e.target.value)}
            required
            min="1"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-black"
            placeholder="Enter locker number"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? 'Processing...' : 'Check In Package'}
        </button>
      </form>

      {error && (
        <div className="mt-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded-md">
          {error}
        </div>
      )}

      {success && (
        <div className="mt-4 p-4 bg-green-100 border border-green-400 text-green-800 rounded-md">
          <p className="font-semibold mb-2">{success.message}</p>
          <div className="space-y-1 text-sm">
            <p><strong>PIN:</strong> <span className="font-mono text-lg">{success.pin}</span></p>
            <p><strong>Expires:</strong> {new Date(success.expiresAt).toLocaleString()}</p>
            <p className="text-xs text-green-700 mt-2">
              ⚠️ Save this PIN securely. It will only be shown once.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
