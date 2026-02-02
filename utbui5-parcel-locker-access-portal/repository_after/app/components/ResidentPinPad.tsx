'use client';

// Resident PIN Pad Component
// Allows residents to enter PIN and email to collect packages

import { useState, FormEvent } from 'react';

interface VerifyResponse {
  success: boolean;
  message: string;
}

export default function ResidentPinPad() {
  const [recipientEmail, setRecipientEmail] = useState('');
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch('/api/resident/verify-pin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          recipientEmail: recipientEmail.trim(),
          pin: pin,
        }),
      });

      const data: VerifyResponse = await response.json();

      if (!response.ok) {
        setError(data.error || 'Verification failed');
        return;
      }

      setSuccess(data.message);
      // Reset form after successful collection
      setRecipientEmail('');
      setPin('');
    } catch (err) {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handlePinInput = (value: string) => {
    // Only allow numeric input and limit to 6 digits
    const numericValue = value.replace(/\D/g, '').slice(0, 6);
    setPin(numericValue);
  };

  return (
    <div className="w-full max-w-md mx-auto p-6 bg-white rounded-lg shadow-md">
      <h2 className="text-2xl font-bold mb-6 text-gray-800">Resident PIN Pad</h2>
      
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="residentEmail" className="block text-sm font-medium text-gray-700 mb-1">
            Your Email
          </label>
          <input
            type="email"
            id="residentEmail"
            value={recipientEmail}
            onChange={(e) => setRecipientEmail(e.target.value)}
            required
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-black"
            placeholder="your.email@example.com"
          />
        </div>

        <div>
          <label htmlFor="pin" className="block text-sm font-medium text-gray-700 mb-1">
            Access PIN (6 digits)
          </label>
          <input
            type="text"
            id="pin"
            value={pin}
            onChange={(e) => handlePinInput(e.target.value)}
            required
            maxLength={6}
            pattern="[0-9]{6}"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-2xl text-center tracking-widest text-black"
            placeholder="000000"
            inputMode="numeric"
          />
        </div>

        <button
          type="submit"
          disabled={loading || pin.length !== 6}
          className="w-full bg-green-600 text-white py-2 px-4 rounded-md hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? 'Verifying...' : 'Collect Package'}
        </button>
      </form>

      {error && (
        <div className="mt-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded-md">
          {error}
        </div>
      )}

      {success && (
        <div className="mt-4 p-4 bg-green-100 border border-green-400 text-green-800 rounded-md">
          <p className="font-semibold">{success}</p>
          <p className="text-sm mt-2">Your locker is now unlocked.</p>
        </div>
      )}
    </div>
  );
}
