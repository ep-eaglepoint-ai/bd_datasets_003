import React from 'react';
import { motion } from 'framer-motion';
import { CountdownWithTime } from '../types';
import { Calendar, Clock, Eye, Share2, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';

interface CountdownGridProps {
  countdowns: CountdownWithTime[];
  onDelete?: (id: string) => void;
}

const CountdownGrid: React.FC<CountdownGridProps> = ({ countdowns, onDelete }) => {
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'happening':
        return <span className="px-3 py-1 bg-yellow-500 text-white rounded-full text-sm">Live Now</span>;
      case 'past':
        return <span className="px-3 py-1 bg-red-500 text-white rounded-full text-sm">Ended</span>;
      default:
        return <span className="px-3 py-1 bg-green-500 text-white rounded-full text-sm">Upcoming</span>;
    }
  };
  if (countdowns.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="text-gray-400 text-6xl mb-4">⏰</div>
        <h3 className="text-xl font-semibold text-gray-600 mb-2">No countdowns yet</h3>
        <p className="text-gray-500">Create your first countdown to get started!</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {countdowns.map((countdown, index) => (
        <motion.div
          key={countdown.id}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: index * 0.1 }}
          className="bg-white rounded-xl shadow-lg overflow-hidden border border-gray-200 hover:shadow-xl transition-shadow"
        >
          <div
            className="h-40 relative bg-cover bg-center"
            style={
              countdown.backgroundImage
                ? { backgroundImage: `url(${countdown.backgroundImage})` }
                : { backgroundColor: countdown.backgroundColor }
            }
          >
            <div className="absolute inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center">
              <div className="text-center">
                <h3
                  className="text-2xl font-bold mb-2"
                  style={{ color: countdown.textColor }}
                >
                  {countdown.title}
                </h3>
                {getStatusBadge(countdown.timeRemaining.status)}
              </div>
            </div>
          </div>
          <div className="p-6">
            {countdown.description && (
              <p className="text-gray-600 mb-4 line-clamp-2">
                {countdown.description}
              </p>
            )}

            <div className="space-y-3 mb-6">
              <div className="flex items-center gap-2 text-gray-700">
                <Calendar size={16} />
                <span className="text-sm">
                  {new Date(countdown.targetDate).toLocaleDateString()}
                </span>
              </div>
              <div className="flex items-center gap-2 text-gray-700">
                <Clock size={16} />
                <span className="text-sm">
                  {new Date(countdown.targetDate).toLocaleTimeString([], { 
                    hour: '2-digit', 
                    minute: '2-digit' 
                  })}
                </span>
              </div>
            </div>
            <div className="grid grid-cols-4 gap-2 mb-6">
              {[
                { label: 'Days', value: countdown.timeRemaining.days },
                { label: 'Hours', value: countdown.timeRemaining.hours },
                { label: 'Mins', value: countdown.timeRemaining.minutes },
                { label: 'Secs', value: countdown.timeRemaining.seconds },
              ].map((item) => (
                <div
                  key={item.label}
                  className="text-center p-2 rounded-lg"
                  style={{ 
                    backgroundColor: countdown.accentColor + '20',
                    color: countdown.accentColor
                  }}
                >
                  <div className="text-2xl font-bold">{item.value}</div>
                  <div className="text-xs uppercase">{item.label}</div>
                </div>
              ))}
            </div>
            <div className="flex justify-between items-center">
              <Link
                to={`/countdown/${countdown.slug}`}
                className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
              >
                <Eye size={16} />
                View
              </Link>

              <div className="flex gap-2">
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(
                      `${window.location.origin}/countdown/${countdown.slug}`
                    );
                    alert('Link copied to clipboard!');
                  }}
                  className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <Share2 size={16} />
                </button>

                {onDelete && (
                  <button
                    onClick={() => onDelete(countdown.id)}
                    className="flex items-center gap-2 px-4 py-2 border border-red-300 text-red-600 rounded-lg hover:bg-red-50 transition-colors"
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            </div>
          </div>
        </motion.div>
      ))}
    </div>
  );
};

export default CountdownGrid;