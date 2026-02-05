import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Question } from '@/lib/questions';
import { Check, X, Clock, HelpCircle } from 'lucide-react';
import clsx from 'clsx';
import { twMerge } from 'tailwind-merge';

interface QuestionScreenProps {
  question: Question;
  currentQuestionIndex: number;
  totalQuestions: number;
  onAnswer: (isCorrect: boolean) => void;
}

const QuestionScreen: React.FC<QuestionScreenProps> = ({ 
  question, 
  currentQuestionIndex, 
  totalQuestions, 
  onAnswer 
}) => {
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [isAnswered, setIsAnswered] = useState(false);
  
  // Progress bar calculation
  const progress = ((currentQuestionIndex) / totalQuestions) * 100;

  // Reset state when question changes
  useEffect(() => {
    setSelectedOption(null);
    setIsAnswered(false);
  }, [question]);

  const handleOptionClick = (index: number) => {
    if (isAnswered) return;

    setSelectedOption(index);
    setIsAnswered(true);

    const isCorrect = index === question.correctAnswerIndex;
    
    // Add a delay before moving to next question
    setTimeout(() => {
      onAnswer(isCorrect);
    }, 1500); 
  };

  const getButtonClass = (index: number) => {
    const isSelected = index === selectedOption;
    const isCorrect = index === question.correctAnswerIndex;
    
    const baseClass = "group relative w-full p-5 rounded-xl border-2 transition-all duration-300 font-medium text-lg flex items-center justify-between overflow-hidden backdrop-blur-md";
    
    if (!isAnswered) {
      return twMerge(baseClass, "border-white/10 bg-white/5 hover:bg-white/10 hover:border-indigo-400/50 hover:shadow-lg hover:translate-x-1 active:scale-[0.99] text-slate-200");
    }

    if (isCorrect) {
      return twMerge(baseClass, "border-emerald-500 bg-emerald-500/20 text-emerald-300 shadow-[0_0_20px_rgba(16,185,129,0.2)]");
    }

    if (isSelected) {
      return twMerge(baseClass, "border-rose-500 bg-rose-500/20 text-rose-300");
    }

    return twMerge(baseClass, "border-white/5 bg-white/5 opacity-40 grayscale");
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4 max-w-4xl mx-auto w-full">
       {/* Progress Bar */}
       <div className="w-full max-w-2xl mb-8 relative">
           <div className="h-2 w-full bg-white/10 rounded-full overflow-hidden backdrop-blur-sm">
             <motion.div 
                className="h-full bg-gradient-to-r from-indigo-500 to-purple-500"
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.5 }}
             />
           </div>
           <div className="flex justify-between mt-2 text-sm text-slate-400 font-medium tracking-wide">
             <span>Start</span>
             <span>Question {currentQuestionIndex + 1} of {totalQuestions}</span>
             <span>Finish</span>
           </div>
       </div>

      <AnimatePresence mode="wait">
        <motion.div
           key={question.id}
           initial={{ opacity: 0, x: 20 }}
           animate={{ opacity: 1, x: 0 }}
           exit={{ opacity: 0, x: -20 }}
           transition={{ duration: 0.4 }}
           className="w-full max-w-2xl bg-white/5 backdrop-blur-2xl border border-white/10 rounded-3xl p-8 shadow-2xl relative overflow-hidden"
        >
          {/* Decorative Elements */}
          <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl -z-10 -translate-y-1/2 translate-x-1/2" />
          
          <div className="mb-8">
             <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/20 text-indigo-300 text-xs font-bold uppercase tracking-widest mb-4">
               <HelpCircle className="w-3 h-3" /> Trivia Question
             </div>
             <h2 className="text-3xl font-bold text-white leading-tight">
               {question.questionText}
             </h2>
          </div>

          <div className="grid gap-4">
             {question.options.map((option, index) => (
                <button
                  key={index}
                  onClick={() => handleOptionClick(index)}
                  disabled={isAnswered}
                  className={getButtonClass(index)}
                >
                  <span className="relative z-10 flex items-center gap-3">
                    <span className={clsx(
                      "flex items-center justify-center w-8 h-8 rounded-full border text-sm font-bold transition-colors",
                      !isAnswered ? "border-white/20 text-slate-400 group-hover:border-indigo-400 group-hover:text-indigo-400" :
                      index === question.correctAnswerIndex ? "bg-emerald-500 border-emerald-500 text-white" :
                      index === selectedOption ? "bg-rose-500 border-rose-500 text-white" :
                      "border-white/10 text-slate-600"
                    )}>
                      {String.fromCharCode(65 + index)}
                    </span>
                    {option}
                  </span>
                  
                  {isAnswered && index === question.correctAnswerIndex && (
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      className="p-1 rounded-full bg-emerald-500/20 text-emerald-400"
                    >
                      <Check className="w-5 h-5" strokeWidth={3} />
                    </motion.div>
                  )}
                  
                   {isAnswered && index === selectedOption && index !== question.correctAnswerIndex && (
                     <motion.div
                       initial={{ scale: 0 }}
                       animate={{ scale: 1 }}
                       className="p-1 rounded-full bg-rose-500/20 text-rose-400"
                     >
                       <X className="w-5 h-5" strokeWidth={3} />
                     </motion.div>
                   )}
                </button>
             ))}
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
};

export default QuestionScreen;
