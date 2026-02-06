import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, CheckCircle } from 'lucide-react';
import RegisterForm from '../components/RegisterForm';
import { useAuth } from '../contexts/AuthContext';
import { authApi } from '../api/client';

const Register: React.FC = () => {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleRegister = async (data: { email: string; username: string; password: string }) => {
    setIsLoading(true);
    setError(null); 
    try {
      const response = await authApi.register(data);
      
      if (response.data.success) {
        setSuccess(true);
        const loginResponse = await authApi.login({
          email: data.email,
          password: data.password,
        });
        
        if (loginResponse.data.success) {
          const { user, token } = loginResponse.data.data;
          login(user, token);
          setTimeout(() => {
            navigate('/');
          }, 2000);
        }
      }
    } catch (err: any) {
      setError(
        err.response?.data?.error || 
        'Registration failed. Please try again.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 to-blue-50 flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center"
        >
          <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-r from-green-100 to-blue-100 rounded-full mb-6">
            <CheckCircle size={40} className="text-green-600" />
          </div>
          <h2 className="text-3xl font-bold mb-4">Account Created!</h2>
          <p className="text-gray-600 mb-6">
            Welcome to CountdownTimer! Your account has been created successfully.
            You'll be redirected to the home page after.
          </p>
          <div className="animate-pulse">
            <div className="w-full h-2 bg-gradient-to-r from-green-400 to-blue-400 rounded-full"></div>
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

        <div className="max-w-md mx-auto">
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 p-4 bg-gradient-to-r from-purple-50 to-pink-50 border border-purple-200 rounded-xl"
          >
            <h3 className="font-semibold text-purple-800 mb-2">Why Register?</h3>
            <ul className="space-y-1 text-sm text-purple-600">
              <li className="flex items-start gap-2">
                <CheckCircle size={14} className="text-green-500 mt-0.5 flex-shrink-0" />
                <span>Save countdowns</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle size={14} className="text-green-500 mt-0.5 flex-shrink-0" />
                <span>Edit or delete your countdowns anytime</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle size={14} className="text-green-500 mt-0.5 flex-shrink-0" />
                <span>Access your countdowns from anywhere</span>
              </li>
            </ul>
          </motion.div>
          {error && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700"
            >
              {error}
            </motion.div>
          )}
          <RegisterForm
            onSubmit={handleRegister}
            isLoading={isLoading}
            onSwitchToLogin={() => navigate('/login')}
          />
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="mt-8 text-center"
          >
            <p className="text-sm text-gray-500">
              By registering, you agree to our{' '}
              <Link to="/terms" className="text-blue-600 hover:text-blue-700">
                Terms of Service
              </Link>{' '}
              and{' '}
              <Link to="/privacy" className="text-blue-600 hover:text-blue-700">
                Privacy Policy
              </Link>
            </p>
            <p className="text-xs text-gray-400 mt-4">
              We'll never share your personal information with third parties.
            </p>
          </motion.div>
        </div>
      </div>
    </div>
  );
};

export default Register;