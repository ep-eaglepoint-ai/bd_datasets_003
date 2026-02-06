import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, CheckCircle } from 'lucide-react';
import CountdownForm from '../components/CountdownForm';
import { countdownApi } from '../api/client';
import { useAuth } from '../contexts/AuthContext';

const CreateCountdown: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createdSlug, setCreatedSlug] = useState<string | null>(null);

  const handleSubmit = async (data: any) => {
    setIsSubmitting(true);
    try {
      const response = await countdownApi.create(data);
      setCreatedSlug(response.data.data.slug);
    } catch (error) {
      console.error('Failed to create countdown:', error);
      alert('Failed to create countdown. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };
  if (createdSlug) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 to-blue-50 flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center"
        >
          <div className="inline-flex items-center justify-center w-20 h-20 bg-green-100 rounded-full mb-6">
            <CheckCircle size={40} className="text-green-600" />
          </div>
          <h2 className="text-3xl font-bold mb-4">Countdown Created!</h2>
          <p className="text-gray-600 mb-6">
            Your countdown is ready to share.
          </p>
          <div className="space-y-4">
            <button
              onClick={() => navigate(`/countdown/${createdSlug}`)}
              className="w-full py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors"
            >
              View Countdown
            </button>
            <button
              onClick={() => {
                navigator.clipboard.writeText(
                  `${window.location.origin}/countdown/${createdSlug}`
                );
                alert('Link copied to clipboard!');
              }}
              className="w-full py-3 border-2 border-blue-600 text-blue-600 font-semibold rounded-lg hover:bg-blue-50 transition-colors"
            >
              Copy Share Link
            </button>
            <button
              onClick={() => {
                setCreatedSlug(null);
                navigate('/');
              }}
              className="w-full py-3 text-gray-600 hover:text-gray-800 transition-colors"
            >
              Back to Home
            </button>
          </div>
        </motion.div>
      </div>
    );
  }
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

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold text-gray-800 mb-2">
              Create New Countdown
            </h1>
            <p className="text-gray-600">
              Design a beautiful countdown for your special event
            </p>
            {!user && (
              <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg inline-block">
                <p className="text-yellow-800">
                  ⓘ Creating without an account? You won't be able to edit or delete this countdown later.
                </p>
              </div>
            )}
          </div>
          <CountdownForm 
            onSubmit={handleSubmit} 
            isLoading={isSubmitting}
          />
        </motion.div>
      </div>
    </div>
  );
};

export default CreateCountdown;