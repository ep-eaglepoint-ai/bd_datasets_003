import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Home } from 'lucide-react';
import CountdownDisplay from '../components/CountdownDisplay';
import { countdownApi } from '../api/client';
import { CountdownWithTime } from '../types';

const ViewCountdown: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const [countdown, setCountdown] = useState<CountdownWithTime | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (slug) {
      loadCountdown(slug);
    }
  }, [slug]);

  const loadCountdown = async (slug: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await countdownApi.getBySlug(slug);
      setCountdown(response.data.data);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load countdown');
    } finally {
      setIsLoading(false);
    }
  };
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 to-black">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-white border-t-transparent"></div>
          <p className="mt-4 text-white text-lg">Loading countdown...</p>
        </div>
      </div>
    );
  }
  if (error || !countdown) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-red-50 to-pink-50">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center"
        >
          <div className="text-red-500 text-6xl mb-4">⚠️</div>
          <h2 className="text-2xl font-bold mb-4">Countdown Not Found</h2>
          <p className="text-gray-600 mb-6">
            {error || 'The countdown you\'re looking for doesn\'t exist or has been removed.'}
          </p>
          <div className="space-y-3">
            <button
              onClick={() => navigate('/')}
              className="w-full py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
            >
              <Home size={20} />
              Go Home
            </button>
            <button
              onClick={() => navigate('/create')}
              className="w-full py-3 border-2 border-blue-600 text-blue-600 font-semibold rounded-lg hover:bg-blue-50 transition-colors"
            >
              Create New Countdown
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <button
        onClick={() => navigate('/')}
        className="absolute top-4 left-4 z-50 flex items-center gap-2 px-4 py-2 bg-black/50 text-white rounded-lg hover:bg-black/70 transition-colors"
      >
        <ArrowLeft size={20} />
        Back
      </button>
      <CountdownDisplay countdown={countdown} />
    </div>
  );
};

export default ViewCountdown;