import React from 'react';
import { motion } from 'framer-motion';
import { BrainCircuit, Sparkles, Play } from 'lucide-react';

interface StartScreenProps {
  onStart: () => void;
}

const StartScreen: React.FC<StartScreenProps> = ({ onStart }) => {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4 overflow-hidden relative">
      <div className="absolute inset-0 z-0 bg-transparent" />
      
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        className="relative z-10 max-w-2xl w-full text-center space-y-12"
      >
        <div className="relative inline-block group">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
            className="absolute -top-12 -right-8 text-yellow-500"
          >
            <Sparkles className="w-10 h-10 animate-pulse" strokeWidth={1.5} />
          </motion.div>
          
          <h1 className="text-6xl md:text-8xl font-extrabold tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-blue-300 via-purple-300 to-pink-300 drop-shadow-[0_0_30px_rgba(168,85,247,0.5)]">
            Ultimate<br/>Trivia
          </h1>
          
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="flex justify-center mt-6"
          >
             <div className="p-4 bg-white/5 rounded-full backdrop-blur-3xl border border-white/10 shadow-2xl">
               <BrainCircuit className="w-16 h-16 text-indigo-400" />
             </div>
          </motion.div>
        </div>

        <motion.p 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
          className="text-2xl text-slate-300 font-light max-w-lg mx-auto leading-relaxed"
        >
          Embark on a journey of knowledge. 
          <span className="block mt-2 text-indigo-300 font-medium">10 Questions. One Champion.</span>
        </motion.p>

        <motion.div
           initial={{ opacity: 0, y: 20 }}
           animate={{ opacity: 1, y: 0 }}
           transition={{ delay: 0.8 }}
        >
          <button
            onClick={onStart}
            className="group relative px-10 py-5 bg-gradient-to-r from-indigo-600 to-purple-600 rounded-2xl font-bold text-xl text-white shadow-[0_0_40px_rgba(99,102,241,0.5)] transition-all hover:scale-105 hover:shadow-[0_0_60px_rgba(99,102,241,0.7)] active:scale-95 overflow-hidden"
          >
            <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300 ease-out" />
            <span className="relative flex items-center justify-center gap-3">
              Start Quiz <Play className="w-5 h-5 fill-current" />
            </span>
          </button>
        </motion.div>
      </motion.div>
    </div>
  );
};

export default StartScreen;
