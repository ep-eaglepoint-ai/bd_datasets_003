import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Plus, Clock, Users, Share2, Sparkles } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import CountdownGrid from '../components/CountdownGrid';
import { countdownApi } from '../api/client';
import { CountdownWithTime } from '../types';

const Home: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [countdowns, setCountdowns] = useState<CountdownWithTime[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (user) {
      loadUserCountdowns();
    } else {
      setIsLoading(false);
    }
  }, [user]);

  const loadUserCountdowns = async () => {
    try {
      setIsLoading(true);
      const response = await countdownApi.getUserCountdowns();
      setCountdowns(response.data.data);
    } catch (error) {
      console.error('Failed to load countdowns:', error);
    } finally {
      setIsLoading(false);
    }
  };
  const handleDeleteCountdown = async (id: string) => {
    if (window.confirm('Are you sure you want to delete this countdown?')) {
      try {
        await countdownApi.delete(id);
        setCountdowns(countdowns.filter(c => c.id !== id));
      } catch (error) {
        console.error('Failed to delete countdown:', error);
      }
    }
  };
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-purple-50">
      <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white">
        <div className="container mx-auto px-4 py-16">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-4xl mx-auto text-center"
          >
            <h1 className="text-5xl md:text-7xl font-bold mb-6">
              Count Down
            </h1>
            <p className="text-xl opacity-90 mb-8 max-w-2xl mx-auto">
              Create beautiful, shareable countdowns for birthdays, vacations, launches and all your important milestones.
            </p>
            <div className="flex flex-wrap gap-4 justify-center">
              <button
                onClick={() => navigate('/create')}
                className="flex items-center gap-2 px-8 py-4 bg-white text-blue-600 font-bold rounded-xl hover:bg-blue-50 transition-all hover:scale-105"
              >
                <Plus size={24} />
                Create Countdown
              </button>
              <button
                onClick={() => navigate('/browse')}
                className="flex items-center gap-2 px-8 py-4 bg-transparent border-2 border-white font-bold rounded-xl hover:bg-white/10 transition-all"
              >
                <Share2 size={24} />
                Browse Public Countdowns
              </button>
            </div>
          </motion.div>
        </div>
      </div>
      <div className="container mx-auto px-4 py-16">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-16">
          {[
            {
              icon: <Clock size={32} />,
              title: 'Beautiful Displays',
              description: 'Custom themes, colors, and animations for stunning countdowns.',
            },
            {
              icon: <Share2 size={32} />,
              title: 'Share Instantly',
              description: 'Unique links let anyone view your countdown without signing up.',
            },
            {
              icon: <Users size={32} />,
              title: 'Cross-Device Sync',
              description: 'Save countdowns across devices with optional accounts.',
            },
          ].map((feature, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              className="bg-white p-8 rounded-2xl shadow-lg text-center"
            >
              <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-100 rounded-full mb-4">
                <div className="text-blue-600">{feature.icon}</div>
              </div>
              <h3 className="text-xl font-bold mb-2">{feature.title}</h3>
              <p className="text-gray-600">{feature.description}</p>
            </motion.div>
          ))}
        </div>
        {user ? (
          <div>
            <div className="flex justify-between items-center mb-8">
              <div>
                <h2 className="text-3xl font-bold text-gray-800 flex items-center gap-2">
                  <Sparkles size={28} />
                  Your Countdowns
                </h2>
                <p className="text-gray-600 mt-2">
                  {countdowns.length} countdown{countdowns.length !== 1 ? 's' : ''} • Sorted by nearest date
                </p>
              </div>
              <button
                onClick={() => navigate('/create')}
                className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Plus size={20} />
                New Countdown
              </button>
            </div>

            {isLoading ? (
              <div className="text-center py-12">
                <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-blue-600 border-t-transparent"></div>
                <p className="mt-4 text-gray-600">Loading your countdowns...</p>
              </div>
            ) : (
              <CountdownGrid 
                countdowns={countdowns} 
                onDelete={handleDeleteCountdown}
              />
            )}
          </div>
        ) : (
          <div className="text-center py-12 bg-white rounded-2xl shadow-lg">
            <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-r from-blue-100 to-purple-100 rounded-full mb-6">
              <Clock size={40} className="text-blue-600" />
            </div>
            <h3 className="text-2xl font-bold mb-4">Save Your Countdowns</h3>
            <p className="text-gray-600 mb-8 max-w-md mx-auto">
              Create an account to save countdowns across devices, access them anytime, and manage all your events in one place.
            </p>
            <div className="flex gap-4 justify-center">
              <button
                onClick={() => navigate('/login')}
                className="px-8 py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors"
              >
                Sign In
              </button>
              <button
                onClick={() => navigate('/register')}
                className="px-8 py-3 border-2 border-blue-600 text-blue-600 font-semibold rounded-lg hover:bg-blue-50 transition-colors"
              >
                Create Account
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Home;