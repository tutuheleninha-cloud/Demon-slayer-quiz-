import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sword, CheckCircle2, XCircle, Loader2, RotateCcw, Clock, Lightbulb, Volume2, Sun, Moon, Share2, Target, Award } from 'lucide-react';
import type { Question } from './types';
import { Auth } from './components/Auth';
import { Leaderboard } from './components/Leaderboard';
import { auth, db } from './firebase';
import { useAuthState } from 'react-firebase-hooks/auth';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

const TOPICS = [
  'General',
  'Tanjiro Kamado',
  'The Hashira',
  'The Twelve Kizuki',
  'Breathing Styles',
  'Mugen Train Arc',
  'Entertainment District Arc'
];

const MISSIONS = [
  { id: 'm1', text: 'Score at least 1000 points', target: 1000 },
  { id: 'm2', text: 'Score at least 1500 points', target: 1500 },
  { id: 'm3', text: 'Score at least 2000 points', target: 2000 },
  { id: 'm4', text: 'Score at least 800 points', target: 800 },
];

export default function App() {
  const [theme, setTheme] = useState<'dark'|'light'>('dark');
  const [user] = useAuthState(auth);
  const [gameState, setGameState] = useState<'start' | 'loading' | 'playing' | 'end'>('start');
  const [topic, setTopic] = useState<string>('General');
  const [difficulty, setDifficulty] = useState<'Easy' | 'Medium' | 'Hard'>('Medium');
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [isAnswered, setIsAnswered] = useState(false);
  const [timeLeft, setTimeLeft] = useState(30);
  const [timerActive, setTimerActive] = useState(false);

  const [hint, setHint] = useState<string | null>(null);
  const [hintLoading, setHintLoading] = useState(false);
  const [ttsLoading, setTtsLoading] = useState(false);
  
  const [missionCompleted, setMissionCompleted] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);

  const currentMissionIndex = Math.floor(Date.now() / 86400000) % MISSIONS.length;
  const dailyMission = MISSIONS[currentMissionIndex];

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (timerActive && timeLeft > 0) {
      timer = setInterval(() => {
        setTimeLeft((prev) => prev - 1);
      }, 1000);
    } else if (timeLeft === 0 && timerActive) {
      setTimerActive(false);
      handleTimeout();
    }
    return () => clearInterval(timer);
  }, [timerActive, timeLeft]);

  const fetchBonusQuestion = async () => {
    try {
      const response = await fetch('/api/bonus-question');
      if (response.ok) {
        const bonus = await response.json();
        setQuestions(prev => [...prev, bonus]);
      }
    } catch (e) {
      console.error("Failed to fetch bonus round");
    }
  };

  const fetchQuestions = async () => {
    setGameState('loading');
    try {
      const response = await fetch(`/api/questions?topic=${encodeURIComponent(topic)}&difficulty=${difficulty}`);
      if (!response.ok) {
        throw new Error('Failed to fetch questions');
      }
      const data = await response.json();
      setQuestions(data);
      setCurrentIndex(0);
      setScore(0);
      setGameState('playing');
      setSelectedAnswer(null);
      setIsAnswered(false);
      setHint(null);
      setTimeLeft(30);
      setTimerActive(true);
      setMissionCompleted(false);

      fetchBonusQuestion();
    } catch (error) {
      console.error(error);
      setGameState('start');
      alert("Failed to load questions. Please try again.");
    }
  };

  const saveScore = async (finalScore: number) => {
    if (user) {
      try {
        await addDoc(collection(db, 'leaderboard'), {
          userId: user.uid,
          displayName: user.displayName,
          score: finalScore,
          createdAt: serverTimestamp()
        });
      } catch (e) {
        console.error("Error saving score", e);
      }
    }
  };

  const handleTimeout = () => {
    if (isAnswered) return;
    setIsAnswered(true);
    setSelectedAnswer(null);
    nextQuestion(score);
  };

  const handleAnswerClick = (option: string) => {
    if (isAnswered) return;
    setTimerActive(false);
    setSelectedAnswer(option);
    setIsAnswered(true);

    let newScore = score;
    const isCorrect = option === questions[currentIndex].correctAnswer;
    
    if (isCorrect) {
      const timeBonus = Math.floor(timeLeft * 10);
      const basePoints = questions[currentIndex].isBonus ? 300 : 100;
      newScore = score + basePoints + timeBonus;
      setScore(newScore);
    }
    nextQuestion(newScore);
  };

  const nextQuestion = (currentScore: number) => {
    setTimeout(() => {
      if (currentIndex < questions.length - 1) {
        setCurrentIndex((i) => i + 1);
        setSelectedAnswer(null);
        setIsAnswered(false);
        setHint(null);
        setTimeLeft(30);
        setTimerActive(true);
      } else {
        if (currentScore >= dailyMission.target) {
          setMissionCompleted(true);
        }
        setGameState('end');
        saveScore(currentScore);
      }
    }, 1500);
  };

  const getHint = async () => {
    if (hint || hintLoading || timeLeft <= 5) return;
    setHintLoading(true);
    setTimeLeft(prev => Math.max(0, prev - 5)); // penalty
    try {
      const res = await fetch('/api/hint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: questions[currentIndex].question })
      });
      const data = await res.json();
      setHint(data.hint);
    } catch (e) {
      console.error(e);
    } finally {
      setHintLoading(false);
    }
  };

  const readAloud = async () => {
    if (ttsLoading) return;
    setTtsLoading(true);
    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: questions[currentIndex].question })
      });
      
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      if (audioRef.current) {
        audioRef.current.src = url;
        audioRef.current.play();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setTtsLoading(false);
    }
  };

  const shareResult = async () => {
    if (navigator.share) {
      try {
        const rank = score >= 2000 ? "Hashira" : score >= 1000 ? "Kinoe" : "Mizunoto";
        await navigator.share({
          title: 'Demon Slayer Quiz',
          text: `I scored ${score} points and reached ${rank} rank on the Demon Slayer Quiz! Can you beat me?`,
          url: window.location.href,
        });
      } catch (err) {
        console.log('Share failed:', err);
      }
    }
  };

  return (
    <div className={`${theme} min-h-screen bg-stone-50 text-slate-900 dark:bg-slate-900 dark:text-slate-100 flex flex-col p-4 font-sans selection:bg-rose-500/30 relative transition-colors duration-300`}>
      <audio ref={audioRef} className="hidden" />
      
      {/* Background Decor */}
      <div className="fixed inset-0 pointer-events-none flex items-center justify-center opacity-[0.03] dark:opacity-10 transition-opacity">
        <Sword className="w-[800px] h-[800px] -rotate-45 text-rose-500" />
      </div>

      {/* Header Auth & Theme Toggle */}
      <div className="absolute top-4 right-4 z-20 flex items-center gap-4">
        <button 
          onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')}
          className="p-2 rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
          title="Toggle Nichirin Bright Mode"
        >
          {theme === 'dark' ? <Sun className="w-5 h-5 text-amber-400" /> : <Moon className="w-5 h-5 text-indigo-500" />}
        </button>
        <Auth />
      </div>

      <div className="flex-1 w-full max-w-2xl mx-auto flex flex-col justify-center relative z-10 py-12">
        <AnimatePresence mode="wait">
          {gameState === 'start' && (
            <motion.div
              key="start"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="text-center space-y-8 p-8 rounded-3xl bg-white/80 dark:bg-slate-800/50 backdrop-blur-sm border border-slate-200 dark:border-slate-700/50 shadow-xl dark:shadow-none"
            >
              <div className="space-y-4">
                <div className="inline-flex items-center justify-center p-4 bg-rose-500/10 rounded-full text-rose-500 mb-2">
                  <Sword className="w-12 h-12" />
                </div>
                <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight">
                  Demon Slayer Quiz
                </h1>
                <p className="text-lg text-slate-600 dark:text-slate-400 max-w-md mx-auto">
                  Test your knowledge of the Demon Slayer Corps. Every time you play, AI generates brand new questions!
                </p>
              </div>

              {/* Daily Mission Display */}
              <div className="flex items-center gap-3 justify-center p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 max-w-md mx-auto">
                <Target className="w-6 h-6 shrink-0" />
                <div className="text-left">
                  <div className="text-xs font-bold uppercase tracking-wider mb-0.5 opacity-80">Daily Mission</div>
                  <div className="text-sm font-medium">{dailyMission.text}</div>
                </div>
              </div>

              <div className="flex flex-col gap-6 w-full mx-auto bg-white/60 dark:bg-slate-800/40 p-6 rounded-2xl border border-slate-200 dark:border-slate-700/50">
                <div className="space-y-3">
                  <label className="text-sm font-semibold tracking-wider text-slate-500 dark:text-slate-400 uppercase">Topic</label>
                  <div className="flex flex-wrap gap-2 justify-center">
                    {TOPICS.map(t => (
                      <button 
                        key={t}
                        onClick={() => setTopic(t)}
                        className={`px-4 py-2 rounded-xl border-2 transition-all font-medium text-sm ${topic === t ? 'border-rose-500 bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400' : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-600'}`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-3">
                  <label className="text-sm font-semibold tracking-wider text-slate-500 dark:text-slate-400 uppercase">Difficulty</label>
                  <div className="grid grid-cols-3 gap-3">
                    <button 
                      onClick={() => setDifficulty('Easy')}
                      className={`p-3 rounded-xl border-2 transition-all font-medium text-sm ${difficulty === 'Easy' ? 'border-emerald-500 bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400' : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-600'}`}
                    >
                      Easy
                    </button>
                    <button 
                      onClick={() => setDifficulty('Medium')}
                      className={`p-3 rounded-xl border-2 transition-all font-medium text-sm ${difficulty === 'Medium' ? 'border-amber-500 bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400' : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-600'}`}
                    >
                      Medium
                    </button>
                    <button 
                      onClick={() => setDifficulty('Hard')}
                      className={`p-3 rounded-xl border-2 transition-all font-medium text-sm ${difficulty === 'Hard' ? 'border-red-500 bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400' : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-600'}`}
                    >
                      Hard
                    </button>
                  </div>
                </div>
              </div>

              <button
                onClick={fetchQuestions}
                className="inline-flex items-center gap-2 px-8 py-4 bg-rose-600 hover:bg-rose-500 text-white rounded-full font-bold text-lg transition-all active:scale-95 shadow-lg shadow-rose-600/20"
              >
                Start Training <Sword className="w-5 h-5" />
              </button>
            </motion.div>
          )}

          {gameState === 'loading' && (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-center flex flex-col items-center gap-4"
            >
              <Loader2 className="w-12 h-12 text-rose-500 animate-spin" />
              <p className="text-slate-500 dark:text-slate-400 font-medium">Forging new questions...</p>
            </motion.div>
          )}

          {gameState === 'playing' && questions.length > 0 && (
            <motion.div
              key="playing"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="w-full space-y-6"
            >
              <div className="flex items-center justify-between text-sm font-semibold text-slate-500 dark:text-slate-400">
                <span>Question {currentIndex + 1} of {questions.length}</span>
                <div className="flex items-center gap-6">
                  <span className={`flex items-center gap-2 ${timeLeft <= 5 ? 'text-red-500 animate-pulse' : 'text-slate-600 dark:text-slate-300'}`}>
                    <Clock className="w-5 h-5" /> {timeLeft}s
                  </span>
                  <span className="text-rose-500 dark:text-rose-400 text-lg">Score: {score}</span>
                </div>
              </div>
              
              <div className="w-full bg-slate-200 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                <div 
                  className="bg-rose-500 h-full transition-all duration-500"
                  style={{ width: `${((currentIndex) / questions.length) * 100}%` }}
                />
              </div>

              <div className="bg-white/90 dark:bg-slate-800/80 backdrop-blur-md rounded-3xl p-6 md:p-8 border border-slate-200 dark:border-slate-700/50 shadow-2xl space-y-6">
                
                {questions[currentIndex].isBonus && (
                  <div className="inline-flex items-center px-3 py-1 rounded-full bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400 text-xs font-bold uppercase tracking-wider mb-2">
                    Visual Bonus Round
                  </div>
                )}

                {questions[currentIndex].imageUrl && (
                  <div className="w-full h-48 md:h-64 rounded-2xl overflow-hidden bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 relative">
                    <img 
                      src={questions[currentIndex].imageUrl} 
                      alt="Bonus Question" 
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}

                <div className="flex gap-4 items-start justify-between">
                  <h2 className="text-2xl md:text-3xl font-bold leading-tight">
                    {questions[currentIndex].question}
                  </h2>
                  <button 
                    onClick={readAloud} 
                    disabled={ttsLoading}
                    className="p-3 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700/50 dark:hover:bg-slate-700 rounded-full text-slate-600 dark:text-slate-300 transition-colors shrink-0"
                    title="Read Aloud"
                  >
                    {ttsLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Volume2 className="w-5 h-5" />}
                  </button>
                </div>

                {hint && (
                  <motion.div 
                    initial={{ opacity: 0, y: -10 }} 
                    animate={{ opacity: 1, y: 0 }}
                    className="p-4 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-600 rounded-xl text-slate-700 dark:text-slate-300 italic flex gap-3 items-start"
                  >
                    <span className="text-xl">🐦‍⬛</span>
                    <p>"{hint}"</p>
                  </motion.div>
                )}

                <div className="grid gap-3">
                  {questions[currentIndex].options.map((option) => {
                    const isSelected = selectedAnswer === option;
                    const isCorrect = option === questions[currentIndex].correctAnswer;
                    
                    let buttonClass = "w-full text-left p-4 rounded-2xl border-2 transition-all font-medium text-base md:text-lg flex items-center justify-between group ";
                    
                    if (!isAnswered) {
                      buttonClass += "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-rose-400 dark:hover:border-rose-500/50 hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer";
                    } else if (isCorrect) {
                      buttonClass += "border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400";
                    } else if (isSelected && !isCorrect) {
                      buttonClass += "border-red-500 bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400";
                    } else {
                      buttonClass += "border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 opacity-50";
                    }

                    return (
                      <motion.button
                        key={option}
                        onClick={() => handleAnswerClick(option)}
                        disabled={isAnswered}
                        className={buttonClass}
                        animate={
                          isAnswered && isCorrect ? { scale: [1, 1.02, 1] } :
                          isAnswered && isSelected && !isCorrect ? { x: [-4, 4, -4, 4, 0] } : {}
                        }
                        transition={{ duration: 0.3 }}
                      >
                        <span className="pr-4">{option}</span>
                        {isAnswered && isCorrect && <CheckCircle2 className="w-6 h-6 shrink-0" />}
                        {isAnswered && isSelected && !isCorrect && <XCircle className="w-6 h-6 shrink-0" />}
                      </motion.button>
                    );
                  })}
                </div>

                {!isAnswered && !hint && (
                  <div className="pt-4 flex justify-end">
                    <button 
                      onClick={getHint}
                      disabled={hintLoading || timeLeft <= 5}
                      className="inline-flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 hover:text-amber-500 dark:hover:text-amber-400 transition-colors disabled:opacity-50"
                    >
                      {hintLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lightbulb className="w-4 h-4" />}
                      Ask Kasugai Crow (-5s)
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {gameState === 'end' && (
            <motion.div
              key="end"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-8"
            >
              <div className="text-center p-10 rounded-3xl bg-white/90 dark:bg-slate-800/80 backdrop-blur-md border border-slate-200 dark:border-slate-700/50 shadow-2xl space-y-6">
                
                {missionCompleted && (
                  <motion.div 
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 rounded-full font-bold text-sm uppercase tracking-wide mx-auto"
                  >
                    <Award className="w-5 h-5" /> Mission Accomplished!
                  </motion.div>
                )}

                <div className="space-y-2">
                  <p className="text-slate-500 dark:text-slate-400 font-medium uppercase tracking-widest text-sm">Trial Complete</p>
                  <div className="text-7xl font-black bg-gradient-to-br from-rose-500 to-rose-700 dark:from-rose-400 dark:to-rose-600 bg-clip-text text-transparent pb-2">
                    {score} <span className="text-3xl text-slate-400 dark:text-slate-500 font-bold">pts</span>
                  </div>
                </div>
                
                <h2 className="text-2xl font-bold">
                  {score >= 2000 ? "Hashira Level!" : 
                   score >= 1000 ? "Kinoe Rank!" : 
                   "Mizunoto Rank - Keep Training!"}
                </h2>
                
                {!user && (
                  <p className="text-amber-600 dark:text-amber-400 text-sm font-medium pt-4">
                    Sign in to save your high score to the global leaderboard!
                  </p>
                )}

                <div className="pt-6 flex flex-col sm:flex-row gap-4 justify-center items-center">
                  <button
                    onClick={fetchQuestions}
                    className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-rose-600 hover:bg-rose-500 text-white rounded-full font-bold text-lg transition-all active:scale-95 shadow-lg shadow-rose-600/20 w-full sm:w-auto"
                  >
                    Play Again <RotateCcw className="w-5 h-5" />
                  </button>
                  {typeof navigator.share !== 'undefined' && (
                    <button
                      onClick={shareResult}
                      className="inline-flex items-center justify-center gap-2 px-6 py-4 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-900 dark:text-white rounded-full font-bold text-lg transition-all active:scale-95 w-full sm:w-auto"
                    >
                      Share <Share2 className="w-5 h-5" />
                    </button>
                  )}
                </div>
              </div>

              <Leaderboard />

            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
