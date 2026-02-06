import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Globe } from 'lucide-react';
import CountdownGrid from '../components/CountdownGrid';
import { countdownApi } from '../api/client';
import { CountdownWithTime } from '../types';

const Browse: React.FC = () => {
  const navigate = useNavigate();
  const [countdowns, setCountdowns] = useState<CountdownWithTime[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        setIsLoading(true);
        const resp = await countdownApi.getPublicCountdowns();
        setCountdowns(resp.data.data);
      } catch (e: any) {
        setError(e?.response?.data?.error || 'Failed to load public countdowns');
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-purple-50">
      <div className="container mx-auto px-4 py-8">
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-2 text-gray-600 hover:text-gray-800 mb-8"
        >
          <ArrowLeft size={20} />
          Back to Home
        </button>

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <div className="flex items-center gap-2 mb-2">
            <Globe size={24} className="text-blue-600" />
            <h1 className="text-3xl md:text-4xl font-bold text-gray-800">Public Countdowns</h1>
          </div>
          <p className="text-gray-600 mb-8">Browse shareable countdowns. No account required.</p>

          {isLoading ? (
            <div className="text-center py-12">
              <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-blue-600 border-t-transparent"></div>
              <p className="mt-4 text-gray-600">Loading...</p>
            </div>
          ) : error ? (
            <div className="bg-white rounded-xl shadow p-6 text-red-700 border border-red-200">{error}</div>
          ) : (
            <CountdownGrid countdowns={countdowns} />
          )}
        </motion.div>
      </div>
    </div>
  );
};

export default Browse;
