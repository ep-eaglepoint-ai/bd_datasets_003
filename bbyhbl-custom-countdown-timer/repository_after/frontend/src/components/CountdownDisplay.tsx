import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { CountdownWithTime } from '../types';
import { Calendar, Clock, Globe, Share2, RefreshCw } from 'lucide-react';

interface CountdownDisplayProps {
  countdown: CountdownWithTime;
  isPreview?: boolean;
}
function CountdownDisplay({ countdown, isPreview = false }: CountdownDisplayProps) {
  const [timeRemaining, setTimeRemaining] = useState(countdown.timeRemaining);

  useEffect(() => {
    if (timeRemaining.status === 'past' || isPreview) return;

    const interval = setInterval(() => {
      setTimeRemaining(prev => {
        const newRemaining = { ...prev };
        newRemaining.seconds -= 1;
        if (newRemaining.seconds < 0) {
          newRemaining.seconds = 59;
          newRemaining.minutes -= 1;
        }
        if (newRemaining.minutes < 0) {
          newRemaining.minutes = 59;
          newRemaining.hours -= 1;
        }
        if (newRemaining.hours < 0) {
          newRemaining.hours = 23;
          newRemaining.days -= 1;
        }
        if (newRemaining.days < 0) {
          newRemaining.status = 'past';
          clearInterval(interval);
        } else if (newRemaining.days === 0 && 
                   newRemaining.hours === 0 && 
                   newRemaining.minutes === 0 && 
                   newRemaining.seconds <= 60) {
          newRemaining.status = 'happening';
        }
        
        return newRemaining;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isPreview]);

  const getStatusColor = () => {
    switch (timeRemaining.status) {
      case 'happening': return 'text-yellow-400';
      case 'past': return 'text-red-400';
      default: return 'text-green-400';
    }
  };
  const getStatusText = () => {
    switch (timeRemaining.status) {
      case 'happening': return 'Happening Now!';
      case 'past': return `${timeRemaining.days} days ago`;
      default: return 'Counting down...';
    }
  };
  const formatNumber = (num: number) => num.toString().padStart(2, '0');

  const backgroundStyle = countdown.backgroundImage 
    ? { backgroundImage: `url(${countdown.backgroundImage})` }
    : { backgroundColor: countdown.backgroundColor };

  return (
    <div 
      className="min-h-screen flex flex-col items-center justify-center p-4 bg-cover bg-center bg-no-repeat"
      style={backgroundStyle}
    >
      <div className="backdrop-blur-sm bg-black/30 p-8 rounded-2xl max-w-4xl w-full">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-8"
        >
          <h1 
            className="text-5xl md:text-7xl font-bold mb-4"
            style={{ color: countdown.textColor }}
          >
            {countdown.title}
          </h1>
          {countdown.description && (
            <p 
              className="text-xl opacity-90"
              style={{ color: countdown.textColor }}
            >
              {countdown.description}
            </p>
          )}
        </motion.div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {[
            { key: 'days', label: 'days', value: timeRemaining.days },
            { key: 'hours', label: 'hours', value: timeRemaining.hours },
            { key: 'minutes', label: 'minutes', value: timeRemaining.minutes },
            { key: 'seconds', label: 'seconds', value: timeRemaining.seconds },
          ].map((item, index) => (
            <motion.div
              key={item.key}
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: index * 0.1 }}
              className="text-center"
            >
              <div 
                className="text-5xl md:text-7xl font-bold mb-2 rounded-lg p-4 bg-black/50"
                style={{ 
                  color: countdown.accentColor,
                  border: `2px solid ${countdown.accentColor}`
                }}
              >
                {formatNumber(item.value)}
              </div>
              <div 
                className="text-lg uppercase tracking-wider"
                style={{ color: countdown.textColor }}
              >
                {item.label}
              </div>
            </motion.div>
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className={`text-center text-2xl font-semibold mb-6 ${getStatusColor()}`}
        >
          {getStatusText()}
        </motion.div>

        <div className="flex flex-wrap gap-4 justify-center items-center">
          <div className="flex items-center gap-2" style={{ color: countdown.textColor }}>
            <Calendar size={20} />
            <span>{new Date(countdown.targetDate).toLocaleDateString()}</span>
          </div>
          <div className="flex items-center gap-2" style={{ color: countdown.textColor }}>
            <Clock size={20} />
            <span>{new Date(countdown.targetDate).toLocaleTimeString()}</span>
          </div>
          <div className="flex items-center gap-2" style={{ color: countdown.textColor }}>
            <Globe size={20} />
            <span>{countdown.timezone}</span>
          </div>
        </div>

        {!isPreview && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.7 }}
            className="mt-8 flex gap-4 justify-center"
          >
            <button
              className="flex items-center gap-2 px-6 py-3 rounded-lg font-semibold transition-transform hover:scale-105"
              style={{ 
                backgroundColor: countdown.accentColor,
                color: countdown.textColor
              }}
              onClick={() => {
                navigator.clipboard.writeText(window.location.href);
                alert('Link copied to clipboard!');
              }}
            >
              <Share2 size={20} />
              Share Countdown
            </button>
            {timeRemaining.status === 'past' && (
              <button
                className="flex items-center gap-2 px-6 py-3 rounded-lg font-semibold border-2 transition-transform hover:scale-105"
                style={{ 
                  borderColor: countdown.accentColor,
                  color: countdown.accentColor
                }}
              >
                <RefreshCw size={20} />
                Reset Countdown
              </button>
            )}
          </motion.div>
        )}
      </div>
    </div>
  );
}

export default CountdownDisplay;