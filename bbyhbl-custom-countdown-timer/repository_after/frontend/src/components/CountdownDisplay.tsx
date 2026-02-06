import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { CountdownWithTime } from '../types';
import { Calendar, Clock, Globe, Share2, RefreshCw, Archive } from 'lucide-react';

interface CountdownDisplayProps {
  countdown: CountdownWithTime;
  isPreview?: boolean;
  canManage?: boolean;
  onReset?: () => void;
  onArchive?: () => void;
}

function computeRemaining(targetDateIso: string): CountdownWithTime['timeRemaining'] {
  const now = new Date();
  const target = new Date(targetDateIso);
  const diffMs = target.getTime() - now.getTime();
  const totalSecondsRaw = Math.floor(diffMs / 1000);

  if (totalSecondsRaw <= 0) {
    const daysAgo = Math.floor(Math.abs(totalSecondsRaw) / 86400);
    return {
      days: daysAgo,
      hours: 0,
      minutes: 0,
      seconds: 0,
      totalSeconds: 0,
      status: 'past',
    };
  }

  const days = Math.floor(totalSecondsRaw / 86400);
  const hours = Math.floor((totalSecondsRaw % 86400) / 3600);
  const minutes = Math.floor((totalSecondsRaw % 3600) / 60);
  const seconds = totalSecondsRaw % 60;
  const status = totalSecondsRaw <= 60 ? 'happening' : 'upcoming';

  return { days, hours, minutes, seconds, totalSeconds: totalSecondsRaw, status };
}

function CountdownDisplay({ countdown, isPreview = false, canManage = false, onReset, onArchive }: CountdownDisplayProps) {
  const [timeRemaining, setTimeRemaining] = useState(countdown.timeRemaining);

  useEffect(() => {
    if (timeRemaining.status === 'past' || isPreview) return;

    const interval = setInterval(() => {
      setTimeRemaining(computeRemaining(countdown.targetDate));
    }, 1000);

    return () => clearInterval(interval);
  }, [countdown.targetDate, isPreview, timeRemaining.status]);

  useEffect(() => {
    // If the server returned a stale snapshot, ensure we immediately compute from targetDate.
    setTimeRemaining(computeRemaining(countdown.targetDate));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countdown.targetDate]);

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

  const themeConfig = (() => {
    switch (countdown.theme) {
      case 'neon':
        return {
          titleClass: 'drop-shadow-[0_0_18px_rgba(255,0,255,0.35)]',
          numberClass: 'shadow-[0_0_24px_rgba(0,255,0,0.25)]',
          overlayClass: 'bg-black/50 backdrop-blur',
        };
      case 'elegant':
        return {
          titleClass: 'font-serif',
          numberClass: 'shadow-lg',
          overlayClass: 'bg-black/35 backdrop-blur-md',
        };
      case 'celebration':
        return {
          titleClass: 'tracking-wide',
          numberClass: 'shadow-xl',
          overlayClass: 'bg-black/25 backdrop-blur-sm',
        };
      default:
        return {
          titleClass: '',
          numberClass: '',
          overlayClass: 'bg-black/30 backdrop-blur-sm',
        };
    }
  })();

  const backgroundStyle = countdown.backgroundImage 
    ? { backgroundImage: `url(${countdown.backgroundImage})` }
    : { backgroundColor: countdown.backgroundColor };

  return (
    <div 
      className="min-h-screen flex flex-col items-center justify-center p-4 bg-cover bg-center bg-no-repeat"
      style={backgroundStyle}
    >
      <div className={`${themeConfig.overlayClass} p-8 rounded-2xl max-w-4xl w-full`}>
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-8"
        >
          <h1 
            className={`text-5xl md:text-7xl font-bold mb-4 ${themeConfig.titleClass}`}
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
                className={`text-5xl md:text-7xl font-bold mb-2 rounded-lg p-4 bg-black/50 ${themeConfig.numberClass}`}
                style={{ 
                  color: countdown.accentColor,
                  border: `2px solid ${countdown.accentColor}`
                }}
              >
                <motion.span
                  key={`${item.key}-${item.value}`}
                  initial={{ y: 8, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ duration: 0.18 }}
                  className="inline-block"
                >
                  {formatNumber(item.value)}
                </motion.span>
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
            {timeRemaining.status === 'past' && canManage && (
              <>
                <button
                  className="flex items-center gap-2 px-6 py-3 rounded-lg font-semibold border-2 transition-transform hover:scale-105"
                  style={{ 
                    borderColor: countdown.accentColor,
                    color: countdown.accentColor
                  }}
                  onClick={onReset}
                >
                  <RefreshCw size={20} />
                  Reset
                </button>
                <button
                  className="flex items-center gap-2 px-6 py-3 rounded-lg font-semibold border-2 transition-transform hover:scale-105"
                  style={{ 
                    borderColor: countdown.accentColor,
                    color: countdown.accentColor
                  }}
                  onClick={onArchive}
                >
                  <Archive size={20} />
                  Archive
                </button>
              </>
            )}
          </motion.div>
        )}
      </div>
    </div>
  );
}

export default CountdownDisplay;