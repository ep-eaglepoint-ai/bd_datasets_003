import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Shield } from 'lucide-react';
import LoginForm from '../components/LoginForm';
import { useAuth } from '../contexts/AuthContext';
import { authApi } from '../api/client';

const Login: React.FC = () => {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const handleLogin = async (data: { email: string; password: string }) => {
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await authApi.login(data);
      
      if (response.data.success) {
        const { user, token } = response.data.data;
        login(user, token);
        navigate('/');
      }
    } catch (err: any) {
      setError(
        err.response?.data?.error || 
        'Failed to sign in. Please check your credentials and try again.'
      );
    } finally {
      setIsLoading(false);
    }
  };
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
            className="mb-6 p-4 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl flex items-start gap-3"
          >
            <Shield className="text-blue-600 mt-1 flex-shrink-0" size={20} />
            <div>
              <p className="text-sm text-blue-800 font-medium">Secure Login</p>
              <p className="text-xs text-blue-600 mt-1">
                Your credentials are encrypted and never stored in plain text.
              </p>
            </div>
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
          <LoginForm
            onSubmit={handleLogin}
            isLoading={isLoading}
            onSwitchToRegister={() => navigate('/register')}
          />
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="mt-8 text-center"
          >
            <p className="text-sm text-gray-600">
              any account? Try{' '}
              <span className="font-medium text-gray-800">any@example.com</span>{' '}
              / <span className="font-medium text-gray-800">any123</span>
            </p>
            <p className="text-sm text-gray-500 mt-4">
              By signing in, you agree to our{' '}
              <Link to="/terms" className="text-blue-600 hover:text-blue-700">
                Terms of Service
              </Link>{' '}
              and{' '}
              <Link to="/privacy" className="text-blue-600 hover:text-blue-700">
                Privacy Policy
              </Link>
            </p>
          </motion.div>
        </div>
      </div>
    </div>
  );
};

export default Login;