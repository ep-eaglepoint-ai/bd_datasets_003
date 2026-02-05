'use client';

import React, { useState } from 'react';
import StartScreen from '@/components/StartScreen';
import QuestionScreen from '@/components/QuestionScreen';
import ResultScreen from '@/components/ResultScreen';
import { questions } from '@/lib/questions';
import { AnimatePresence, motion } from 'framer-motion';

type QuizState = 'start' | 'playing' | 'result';

export default function Home() {
  const [gameState, setGameState] = useState<QuizState>('start');
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [score, setScore] = useState(0);

  const startQuiz = () => {
    setGameState('playing');
    setCurrentQuestionIndex(0);
    setScore(0);
  };

  const handleAnswer = (isCorrect: boolean) => {
    if (isCorrect) {
      setScore((prev) => prev + 1);
    }

    const nextIndex = currentQuestionIndex + 1;
    if (nextIndex < questions.length) {
      setCurrentQuestionIndex(nextIndex);
    } else {
      setGameState('result');
    }
  };

  const restartQuiz = () => {
    setGameState('start');
    setCurrentQuestionIndex(0);
    setScore(0);
  };

  return (
    <main className="min-h-screen bg-transparent text-white font-sans overflow-hidden">
      <AnimatePresence mode="wait">
        {gameState === 'start' && (
          <motion.div
            key="start"
            initial={{ opacity: 0, scale: 0.95, filter: 'blur(10px)' }}
            animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
            exit={{ opacity: 0, scale: 1.05, filter: 'blur(10px)' }}
            transition={{ duration: 0.5 }}
            className="absolute inset-0 w-full h-full"
          >
            <StartScreen onStart={startQuiz} />
          </motion.div>
        )}

        {gameState === 'playing' && (
          <motion.div
            key="playing"
            initial={{ opacity: 0, x: 300, rotateY: 90 }}
            animate={{ opacity: 1, x: 0, rotateY: 0 }}
            exit={{ opacity: 0, x: -300, rotateY: -90 }}
            transition={{ duration: 0.6, type: "spring", bounce: 0.25 }}
            className="absolute inset-0 w-full h-full perspective-1000"
          >
            <QuestionScreen
              question={questions[currentQuestionIndex]}
              currentQuestionIndex={currentQuestionIndex}
              totalQuestions={questions.length}
              onAnswer={handleAnswer}
            />
          </motion.div>
        )}

        {gameState === 'result' && (
          <motion.div
            key="result"
            initial={{ opacity: 0, scale: 0.5, rotate: -5 }}
            animate={{ opacity: 1, scale: 1, rotate: 0 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ duration: 0.5, type: "spring" }}
            className="absolute inset-0 w-full h-full"
          >
            <ResultScreen
              score={score}
              totalQuestions={questions.length}
              onRestart={restartQuiz}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}
