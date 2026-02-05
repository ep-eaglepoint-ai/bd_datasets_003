import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Trophy, RefreshCcw, Star, Award, TrendingUp } from 'lucide-react';
import clsx from 'clsx';

import confetti from 'canvas-confetti';

interface ResultScreenProps {
  score: number;
  totalQuestions: number;
  onRestart: () => void;
}

const ResultScreen: React.FC<ResultScreenProps> = ({ score, totalQuestions, onRestart }) => {
  const percentage = Math.round((score / totalQuestions) * 100);
  const [animatedScore, setAnimatedScore] = useState(0);

  useEffect(() => {
    // Simple count up animation
    let start = 0;
    const end = score;
    
    // Trigger confetti if good score
    if (percentage >= 60) {
        const duration = 3000;
        const animationEnd = Date.now() + duration;
        const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 0 };

        const random = (min: number, max: number) => Math.random() * (max - min) + min;

        const interval: any = setInterval(function() {
        const timeLeft = animationEnd - Date.now();

        if (timeLeft <= 0) {
            return clearInterval(interval);
        }

        const particleCount = 50 * (timeLeft / duration);
        confetti(Object.assign({}, defaults, { particleCount, origin: { x: random(0.1, 0.3), y: Math.random() - 0.2 } }));
        confetti(Object.assign({}, defaults, { particleCount, origin: { x: random(0.7, 0.9), y: Math.random() - 0.2 } }));
        }, 250);
    }

    if (start === end) return;

    let timer = setInterval(() => {
      start += 1;
      setAnimatedScore(start);
      if (start === end) clearInterval(timer);
    }, 100); // adjust speed

    return () => clearInterval(timer);
  }, [score, percentage]);

  let feedbackMessage = '';
  let feedbackColor = '';
  
  if (percentage >= 80) {
    feedbackMessage = 'Outstanding Performance!';
    feedbackColor = 'text-yellow-400';
  } else if (percentage >= 60) {
    feedbackMessage = 'Great Job!';
    feedbackColor = 'text-emerald-400';
  } else {
    feedbackMessage = 'Keep Learning!';
    feedbackColor = 'text-indigo-400';
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4 overflow-hidden relative">
      {/* Dynamic Background glow */}
       <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-indigo-600/10 rounded-full blur-[100px] -z-10" />

      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.5 }}
        className="max-w-md w-full relative z-10"
      >
        <div className="relative bg-white/5 backdrop-blur-2xl border border-white/10 rounded-3xl p-8 shadow-2xl text-center overflow-hidden">
           {/* Top decoration */}
           <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500" />

           <motion.div 
             initial={{ y: -20, opacity: 0 }}
             animate={{ y: 0, opacity: 1 }}
             transition={{ delay: 0.3 }}
             className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-yellow-500/10 border border-yellow-500/20 mb-6 shadow-[0_0_30px_rgba(234,179,8,0.2)]"
           >
              <Trophy className="w-10 h-10 text-yellow-400" />
           </motion.div>

           <h2 className="text-3xl font-bold text-white mb-2">Quiz Complete</h2>
           <p className={clsx("text-lg font-medium mb-8", feedbackColor)}>{feedbackMessage}</p>

           <div className="mb-8 p-6 rounded-2xl bg-white/5 border border-white/5 flex flex-col items-center justify-center">
               <p className="text-slate-200 text-xl font-bold">
                 You scored <span className="text-3xl text-white">{animatedScore}</span> out of <span className="text-3xl text-white">{totalQuestions}</span>
               </p>
               <div className="mt-2 text-slate-400 font-medium">
                  Accuracy: {percentage}%
               </div>
           </div>

           <button
             onClick={onRestart}
             className="w-full py-4 px-6 bg-white hover:bg-slate-50 text-slate-900 font-bold rounded-xl shadow-lg transform transition-all hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-2 group"
           >
             <RefreshCcw className="w-5 h-5 group-hover:rotate-180 transition-transform duration-500" />
             Restart Quiz
           </button>
        </div>
      </motion.div>
    </div>
  );
};

export default ResultScreen;
