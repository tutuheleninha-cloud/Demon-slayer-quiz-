import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sword, CheckCircle2, XCircle, Loader2, RotateCcw, Clock, Lightbulb, Volume2, Sun, Moon, Share2, Target, Award, Flame, Globe, Bookmark } from 'lucide-react';
import type { Question } from './types';
import { Auth } from './components/Auth';
import { Leaderboard } from './components/Leaderboard';
import { ProfileStats } from './components/ProfileStats';
import { BackgroundParticles } from './components/BackgroundParticles';
import { TutorialModal } from './components/TutorialModal';
import { auth, db } from './firebase';
import { useAuthState } from 'react-firebase-hooks/auth';
import { collection, addDoc, serverTimestamp, doc, getDoc, setDoc, updateDoc, increment, query, getDocs, onSnapshot } from 'firebase/firestore';
import { audio } from './utils/audio';
import confetti from 'canvas-confetti';
import { Mic, MicOff, VolumeX, Zap } from 'lucide-react';

const TOPICS = [
  'General',
  'Tanjiro Kamado',
  'The Hashira',
  'The Twelve Kizuki',
  'Breathing Styles',
  'Mugen Train Arc',
  'Entertainment District Arc',
  'Daily Challenge'
];

const MISSIONS = [
  { id: 'm1', text: 'Score at least 1000 points', target: 1000 },
  { id: 'm2', text: 'Score at least 1500 points', target: 1500 },
  { id: 'm3', text: 'Score at least 2000 points', target: 2000 },
  { id: 'm4', text: 'Score at least 800 points', target: 800 },
];

interface HistoryItem {
  question: Question;
  selectedOption: string | null;
  isCorrect: boolean;
  scoreEarned: number;
}

export default function App() {
  const [theme, setTheme] = useState<'dark'|'light'>('dark');
  const [user] = useAuthState(auth);
  const [gameState, setGameState] = useState<'start' | 'loading' | 'playing' | 'end'>('start');
  const [topic, setTopic] = useState<string>('General');
  const [difficulty, setDifficulty] = useState<'Easy' | 'Medium' | 'Hard' | 'Death Match'>('Medium');
  
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [isAnswered, setIsAnswered] = useState(false);
  const [timeLeft, setTimeLeft] = useState(30);
  const [timerActive, setTimerActive] = useState(false);
  const [deathMatchTime, setDeathMatchTime] = useState<number>(30);

  const [hint, setHint] = useState<string | null>(null);
  const [hintLoading, setHintLoading] = useState(false);
  const [ttsLoading, setTtsLoading] = useState(false);
  
  const [missionCompleted, setMissionCompleted] = useState(false);
  const [lang, setLang] = useState<'en' | 'ja'>('en');
  const [favorites, setFavorites] = useState<Question[]>([]);
  const [historyTab, setHistoryTab] = useState<'history'|'favorites'>('history');

  interface ToastMessage { id: string; message: string; icon: React.ReactNode; }
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const [gameMode, setGameMode] = useState<'single' | 'duel'>('single');
  const [duelId, setDuelId] = useState<string | null>(null);
  const [duelData, setDuelData] = useState<any>(null);
  const [joinCode, setJoinCode] = useState('');

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const nextQuestionTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const nextQuestionLogicRef = useRef<(() => void) | null>(null);
  const recognitionRef = useRef<any>(null);
  const [isListening, setIsListening] = useState(false);
  
  const [fastMode, setFastMode] = useState(() => localStorage.getItem('fastMode') === 'true');
  const [bgmMuted, setBgmMuted] = useState(() => {
    const m = localStorage.getItem('bgmMuted');
    return m === null ? true : m === 'true';
  });

  useEffect(() => {
    localStorage.setItem('fastMode', fastMode.toString());
  }, [fastMode]);

  useEffect(() => {
    localStorage.setItem('bgmMuted', bgmMuted.toString());
    audio.setBgmMuted(bgmMuted);
  }, [bgmMuted]);

  // Handle BGM changes
  useEffect(() => {
    if (gameState === 'playing' || gameState === 'loading') {
      audio.playBgm(topic);
    } else {
      audio.stopBgm();
    }
    return () => audio.stopBgm();
  }, [gameState, topic]);

  const currentMissionIndex = Math.floor(Date.now() / 86400000) % MISSIONS.length;
  const dailyMission = MISSIONS[currentMissionIndex];

  const addToast = (message: string, icon: React.ReactNode) => {
    const id = Math.random().toString();
    setToasts(prev => [...prev, { id, message, icon }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  };

  const createDuel = async () => {
    if (!user) { alert("Sign in first to play multiplayer"); return; }
    audio.playClick();
    const code = Math.random().toString(36).substring(2, 7).toUpperCase();
    await setDoc(doc(db, 'duels', code), {
      status: 'waiting',
      topic,
      difficulty,
      lang,
      hostId: user.uid,
      players: {
        [user.uid]: { displayName: user.displayName || 'Player 1', score: 0, currentQuestionIndex: 0 }
      }
    });
    setDuelId(code);
  };

  const joinDuel = async () => {
    if (!user) { alert("Sign in first to play multiplayer"); return; }
    if (!joinCode) return;
    audio.playClick();
    const code = joinCode.toUpperCase();
    const duelRef = doc(db, 'duels', code);
    const snap = await getDoc(duelRef);
    if (!snap.exists() || snap.data().status !== 'waiting') {
      alert("Duel not found or already started.");
      return;
    }
    await updateDoc(duelRef, {
      [`players.${user.uid}`]: { displayName: user.displayName || 'Player 2', score: 0, currentQuestionIndex: 0 },
      status: 'starting'
    });
    setDuelId(code);
  };

  useEffect(() => {
    if (!duelId || !user) return;
    const unsub = onSnapshot(doc(db, 'duels', duelId), async (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setDuelData(data);
        if (data.status === 'starting' && data.players[user.uid]) {
           if (!data.questions) {
              if (data.hostId === user.uid) {
                 try {
                   const response = await fetch(`/api/questions?topic=${encodeURIComponent(data.topic)}&difficulty=${encodeURIComponent(data.difficulty)}&lang=${data.lang}`);
                   const questionsData = await response.json();
                   const bResponse = await fetch(`/api/bonus-question?lang=${data.lang}`);
                   if (bResponse.ok) {
                     const bonus = await bResponse.json();
                     questionsData.push(bonus);
                   }
                   await updateDoc(doc(db, 'duels', duelId), {
                     questions: questionsData,
                     status: 'playing'
                   });
                 } catch (e) {
                   console.error(e);
                 }
              }
           }
        }
        if (data.status === 'playing' && data.questions && gameState === 'start') {
           setQuestions(data.questions);
           setCurrentIndex(0);
           setScore(0);
           setStreak(0);
           setHistory([]);
           setGameState('playing');
           setSelectedAnswer(null);
           setIsAnswered(false);
           setHint(null);
           setTimeLeft(30);
           setTimerActive(true);
        }
      }
    });
    return unsub;
  }, [duelId, user, gameState]);

  const updateDuelProgress = async (newScore: number, newIndex: number) => {
    if (gameMode === 'duel' && duelId && user) {
      await updateDoc(doc(db, 'duels', duelId), {
        [`players.${user.uid}.score`]: newScore,
        [`players.${user.uid}.currentQuestionIndex`]: newIndex
      }).catch(e => console.error(e));
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (gameState !== 'playing') return;
      if (isAnswered && e.key === 'Enter') {
        if (nextQuestionTimeoutRef.current) clearTimeout(nextQuestionTimeoutRef.current);
        if (nextQuestionLogicRef.current) {
          nextQuestionLogicRef.current();
          nextQuestionLogicRef.current = null;
        }
        return;
      }
      if (isAnswered) return;
      const key = e.key.toLowerCase();
      if (['1', '2', '3', '4'].includes(key)) {
        const index = parseInt(key) - 1;
        if (questions[currentIndex]?.options[index]) {
          handleAnswerClick(questions[currentIndex].options[index]);
        }
      } else if (key === 'h') {
        getHint();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [gameState, isAnswered, questions, currentIndex, hintLoading, timeLeft]);

  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    if (isListening) {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = false;
      recognition.lang = lang === 'ja' ? 'ja-JP' : 'en-US';
      
      recognition.onresult = (event: any) => {
        if (gameState !== 'playing' || isAnswered) return;
        
        const lastResult = event.results[event.results.length - 1];
        const transcript = lastResult[0].transcript.toLowerCase().trim();
        
        const currentQ = questions[currentIndex];
        if (!currentQ) return;

        // Check if transcript matches option exactly or starts with number
        let matchedIndex = -1;
        const numbers = ['one', 'two', 'three', 'four', '1', '2', '3', '4'];
        
        for (let i = 0; i < currentQ.options.length; i++) {
          const opt = currentQ.options[i].toLowerCase();
          if (transcript.includes(opt) || opt.includes(transcript)) {
            matchedIndex = i;
            break;
          }
        }

        if (matchedIndex === -1) {
          if (transcript.includes('1') || transcript.includes('one')) matchedIndex = 0;
          else if (transcript.includes('2') || transcript.includes('two')) matchedIndex = 1;
          else if (transcript.includes('3') || transcript.includes('three')) matchedIndex = 2;
          else if (transcript.includes('4') || transcript.includes('four')) matchedIndex = 3;
        }

        if (matchedIndex !== -1 && currentQ.options[matchedIndex]) {
          handleAnswerClick(currentQ.options[matchedIndex]);
        }
      };
      
      recognition.start();
      recognitionRef.current = recognition;
    } else {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    }

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, [isListening, gameState, isAnswered, questions, currentIndex, lang]);

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
      const response = await fetch(`/api/bonus-question?lang=${lang}`);
      if (response.ok) {
        const bonus = await response.json();
        setQuestions(prev => [...prev, bonus]);
      }
    } catch (e) {
      console.error("Failed to fetch bonus round");
    }
  };

  const fetchQuestions = async () => {
    audio.playStartSound(difficulty);
    setGameState('loading');
    try {
      let data = [];
      
      if (topic === 'Daily Challenge') {
        const today = new Date().toISOString().split('T')[0];
        const dailyRef = doc(db, 'daily_challenges', today);
        const snap = await getDoc(dailyRef);
        
        if (snap.exists()) {
          data = snap.data().questions;
        } else {
          // Generate new challenge and save it for everyone
          const response = await fetch(`/api/questions?topic=General&difficulty=Hard&lang=${lang}`);
          if (!response.ok) throw new Error('Failed to fetch questions');
          data = await response.json();
          const bResponse = await fetch(`/api/bonus-question?lang=${lang}`);
          if (bResponse.ok) {
            const bonus = await bResponse.json();
            data.push(bonus);
          }
          await setDoc(dailyRef, { questions: data });
        }
      } else {
        const response = await fetch(`/api/questions?topic=${encodeURIComponent(topic)}&difficulty=${difficulty}&lang=${lang}`);
        if (!response.ok) {
          throw new Error('Failed to fetch questions');
        }
        data = await response.json();
      }

      setQuestions(data);
      setCurrentIndex(0);
      setScore(0);
      setStreak(0);
      setHistory([]);
      setGameState('playing');
      setSelectedAnswer(null);
      setIsAnswered(false);
      setHint(null);
      setTimeLeft(difficulty === 'Death Match' ? deathMatchTime : 30);
      setTimerActive(true);
      setMissionCompleted(false);

      if (topic !== 'Daily Challenge') {
        fetchBonusQuestion();
      }
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

        if (topic === 'Daily Challenge') {
          const today = new Date().toISOString().split('T')[0];
          await setDoc(doc(db, `daily_leaderboard/${today}/entries`, user.uid), {
            userId: user.uid,
            displayName: user.displayName,
            score: finalScore,
            createdAt: serverTimestamp()
          });
        }

        const userRef = doc(db, 'users', user.uid);
        const userSnap = await getDoc(userRef);
        const prevMax = userSnap.exists() ? (userSnap.data().maxScore || 0) : 0;
        
        if (finalScore > prevMax) {
          confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 } });
        }

        const correctCount = history.filter(h => h.isCorrect).length;
        const totalCount = history.length;

        if (userSnap.exists()) {
          const newTotalScore = (userSnap.data().totalScore || 0) + finalScore;
          if (newTotalScore >= 10000 && (userSnap.data().totalScore || 0) < 10000) {
            addToast("10,000 Total Points Reached!", <Award className="text-yellow-400 w-5 h-5" />);
          }

          await updateDoc(userRef, {
            totalQuizzes: increment(1),
            totalScore: increment(finalScore),
            maxScore: Math.max(finalScore, prevMax),
            [`topicStats.${topic}.correct`]: increment(correctCount),
            [`topicStats.${topic}.total`]: increment(totalCount)
          });
        } else {
          await setDoc(userRef, {
            totalQuizzes: 1,
            maxScore: finalScore,
            displayName: user.displayName,
            topicStats: {
              [topic]: { correct: correctCount, total: totalCount }
            }
          });
        }
      } catch (e) {
        console.error("Error saving score", e);
      }
    }
  };

  const handleTimeout = () => {
    if (isAnswered) return;
    audio.playIncorrect();
    setIsAnswered(true);
    setSelectedAnswer(null);
    setStreak(0);
    
    setHistory(prev => [...prev, {
      question: questions[currentIndex],
      selectedOption: null,
      isCorrect: false,
      scoreEarned: 0
    }]);

    const isDeathMatch = difficulty === 'Death Match';
    nextQuestion(score, isDeathMatch);
  };

  const handleAnswerClick = (option: string) => {
    if (isAnswered) return;
    audio.playClick();
    setTimerActive(false);
    setSelectedAnswer(option);
    setIsAnswered(true);

    const isCorrect = option === questions[currentIndex].correctAnswer;
    let earned = 0;
    
    if (isCorrect) {
      audio.playCorrect();
      const newStreak = streak + 1;
      setStreak(newStreak);
      if (newStreak === 10) addToast("10 perfect questions in a row!", <Flame className="text-orange-500 w-5 h-5" />);

      const timeBonus = Math.floor(timeLeft * 10);
      const diffMultiplier = difficulty === 'Death Match' ? 3 : (difficulty === 'Hard' ? 1.5 : (difficulty === 'Medium' ? 1 : 0.5));
      const basePoints = questions[currentIndex].isBonus ? 300 : 100 * diffMultiplier;
      const streakMultiplier = 1 + (newStreak * 0.1); 
      earned = Math.floor((basePoints + timeBonus) * streakMultiplier);
      
    } else {
      audio.playIncorrect();
      setStreak(0);
    }
    
    const newScore = score + earned;
    setScore(newScore);

    setHistory(prev => [...prev, {
      question: questions[currentIndex],
      selectedOption: option,
      isCorrect,
      scoreEarned: earned
    }]);

    const isDeathMatch = difficulty === 'Death Match';
    nextQuestion(newScore, !isCorrect && isDeathMatch);
  };

  const handleSkip = () => {
    if (isAnswered || score < 100 || difficulty === 'Death Match') return;
    audio.playClick();
    setTimerActive(false);
    setIsAnswered(true);
    setSelectedAnswer('SKIPPED');
    setStreak(0);
    
    const newScore = score - 100;
    setScore(newScore);

    setHistory(prev => [...prev, {
      question: questions[currentIndex],
      selectedOption: 'Skipped',
      isCorrect: false,
      scoreEarned: -100
    }]);

    nextQuestion(newScore);
  };

  const nextQuestion = (currentScore: number, forceEnd = false) => {
    const logic = () => {
      if (!forceEnd && currentIndex < questions.length - 1) {
        const nextIdx = currentIndex + 1;
        setCurrentIndex(nextIdx);
        setSelectedAnswer(null);
        setIsAnswered(false);
        setHint(null);
        setTimeLeft(difficulty === 'Death Match' ? deathMatchTime : 30);
        setTimerActive(true);
        updateDuelProgress(currentScore, nextIdx);
      } else {
        if (currentScore >= dailyMission.target) {
          setMissionCompleted(true);
        }
        setGameState('end');
        updateDuelProgress(currentScore, currentIndex + 1);
        saveScore(currentScore);
      }
    };
    nextQuestionLogicRef.current = logic;
    nextQuestionTimeoutRef.current = setTimeout(logic, fastMode ? 500 : 1500);
  };

  const getHint = async () => {
    if (hint || hintLoading || timeLeft <= 5) return;
    audio.playClick();
    setHintLoading(true);
    setTimeLeft(prev => Math.max(0, prev - 5)); // penalty
    try {
      const res = await fetch('/api/hint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: questions[currentIndex].question, lang })
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
    audio.playClick();
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
    audio.playClick();
    const rank = score >= 2000 ? "Hashira" : score >= 1000 ? "Kinoe" : "Mizunoto";
    
    // Draw on hidden canvas
    const canvas = document.createElement('canvas');
    canvas.width = 1200;
    canvas.height = 630; // standard open graph image size
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Background
    const gradient = ctx.createLinearGradient(0, 0, 1200, 630);
    gradient.addColorStop(0, '#0f172a');
    gradient.addColorStop(1, '#334155');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 1200, 630);

    // Decorator circles
    ctx.fillStyle = 'rgba(244, 63, 94, 0.1)';
    ctx.beginPath();
    ctx.arc(0, 0, 300, 0, 2 * Math.PI);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(1200, 630, 400, 0, 2 * Math.PI);
    ctx.fill();

    // Border
    ctx.strokeStyle = '#f43f5e';
    ctx.lineWidth = 10;
    ctx.strokeRect(20, 20, 1160, 590);

    // Text Style
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    
    // Title
    ctx.font = 'bold 70px system-ui, -apple-system, sans-serif';
    ctx.fillText('Demon Slayer Quiz', 600, 150);
    
    // Score
    ctx.font = '900 180px system-ui, -apple-system, sans-serif';
    
    const scoreText = `${score}`;
    ctx.fillStyle = '#f43f5e';
    ctx.fillText(scoreText, 600, 340);
    
    ctx.font = 'bold 50px system-ui, -apple-system, sans-serif';
    ctx.fillStyle = '#cbd5e1';
    ctx.fillText('TOTAL POINTS', 600, 420);
    
    // Rank & Topic
    ctx.fillStyle = '#94a3b8';
    ctx.font = 'bold 36px system-ui, -apple-system, sans-serif';
    ctx.fillText(`Rank: ${rank}   •   Topic: ${topic}`, 600, 500);
    
    // Accuracy
    const accuracy = Math.round((history.filter(h => h.isCorrect).length / Math.max(1, questions.length)) * 100);
    ctx.fillStyle = '#94a3b8';
    ctx.fillText(`Accuracy: ${accuracy}%   •   Difficulty: ${difficulty}`, 600, 560);

    // Download image
    const dataUrl = canvas.toDataURL('image/png');
    
    // Also try to use native share with file if supported, else download
    try {
      const blob = await (await fetch(dataUrl)).blob();
      const file = new File([blob], 'demon-slayer-score.png', { type: 'image/png' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: 'Demon Slayer Quiz',
          text: `I scored ${score} points and reached ${rank} rank! Can you beat me?`,
        });
        return;
      }
    } catch (e) {
      console.log('Native share failed or unsupported, falling back to download');
    }

    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `demon-slayer-quiz-score.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const toggleFavorite = async (questionToSave: Question) => {
    if (!user) {
      alert("Sign in to save your favorite questions!");
      return;
    }
    audio.playClick();
    try {
      await addDoc(collection(db, 'users', user.uid, 'favorites'), {
        question: questionToSave.question,
        options: questionToSave.options,
        correctAnswer: questionToSave.correctAnswer,
        imageUrl: questionToSave.imageUrl || null,
        addedAt: serverTimestamp()
      });
      alert("Question saved to favorites!");
    } catch (error) {
      console.error("Failed to save favorite:", error);
    }
  };

  const loadFavorites = async () => {
    if (!user) return;
    try {
      const favsRef = collection(db, 'users', user.uid, 'favorites');
      const snap = await getDocs(query(favsRef));
      const loadedFavs: Question[] = [];
      snap.forEach(doc => {
        loadedFavs.push(doc.data() as Question);
      });
      setFavorites(loadedFavs);
    } catch (error) {
      console.error("Failed to load favorites", error);
    }
  };

  useEffect(() => {
    if (historyTab === 'favorites' && user) {
      loadFavorites();
    }
  }, [historyTab, user]);

  return (
    <div className={`${theme} min-h-screen bg-stone-50 text-slate-900 dark:bg-slate-900 dark:text-slate-100 flex flex-col p-4 font-sans selection:bg-rose-500/30 relative transition-colors duration-300`}>
      <TutorialModal />
      <BackgroundParticles topic={topic} />
      <audio ref={audioRef} className="hidden" />
      
      {/* Toasts */}
      <div className="fixed bottom-4 left-4 z-50 flex flex-col gap-2 pointer-events-none">
        <AnimatePresence>
          {toasts.map(toast => (
            <motion.div 
              key={toast.id}
              initial={{ opacity: 0, x: -50, scale: 0.9 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: -50, scale: 0.9 }}
              className="px-4 py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-2xl rounded-xl flex items-center gap-3 font-bold text-sm"
            >
              {toast.icon}
              {toast.message}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
      
      {/* Background Decor */}
      <div className="fixed inset-0 pointer-events-none flex items-center justify-center opacity-[0.03] dark:opacity-10 transition-opacity">
        <Sword className="w-[800px] h-[800px] -rotate-45 text-rose-500" />
      </div>

      {/* Header Auth & Theme Toggle */}
      <div className="absolute top-4 right-4 z-20 flex items-center gap-4">
        {(gameState === 'playing' || gameState === 'loading') && (
          <button 
            onClick={() => {
              audio.playClick();
              setGameState('start');
              setTimerActive(false);
            }}
            className="p-2 rounded-full text-rose-500 bg-rose-500/10 hover:bg-rose-500/20 transition-colors"
            title="Quick Restart"
          >
            <RotateCcw className="w-5 h-5" />
          </button>
        )}
        <button 
          onClick={() => {
            audio.playClick();
            setBgmMuted(m => !m);
          }}
          className={`p-2 rounded-full transition-colors flex items-center gap-2 text-sm font-bold ${!bgmMuted ? 'text-indigo-500 bg-indigo-500/10' : 'text-slate-500 hover:bg-black/5 dark:hover:bg-white/10'}`}
          title="Toggle Background Music"
        >
          {bgmMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
        </button>
        <button 
          onClick={() => {
            audio.playClick();
            setFastMode(m => !m);
          }}
          className={`p-2 rounded-full transition-colors flex items-center gap-2 text-sm font-bold ${fastMode ? 'text-amber-500 bg-amber-500/10' : 'text-slate-500 hover:bg-black/5 dark:hover:bg-white/10'}`}
          title="Toggle Fast Mode"
        >
          <Zap className="w-5 h-5" />
        </button>
        <button 
          onClick={() => {
            audio.playClick();
            setIsListening(!isListening);
          }}
          className={`p-2 rounded-full transition-colors flex items-center gap-2 text-sm font-bold ${isListening ? 'text-rose-500 bg-rose-500/10' : 'text-slate-500 hover:bg-black/5 dark:hover:bg-white/10'}`}
          title="Toggle Voice Answering"
        >
          {isListening ? <Mic className="w-5 h-5 animate-pulse" /> : <MicOff className="w-5 h-5" />}
        </button>
        <button 
          onClick={() => {
            audio.playClick();
            setLang(l => l === 'en' ? 'ja' : 'en');
          }}
          className="p-2 rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors flex items-center gap-2 text-sm font-bold text-slate-700 dark:text-slate-300 uppercase"
          title="Toggle Language"
        >
          <Globe className="w-5 h-5 text-sky-500" />
          {lang}
        </button>
        <button 
          onClick={() => {
            audio.playClick();
            setTheme(t => t === 'dark' ? 'light' : 'dark');
          }}
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
              
              <ProfileStats />

              <div className="flex justify-center gap-4 mb-4">
                <button 
                  onClick={() => setGameMode('single')} 
                  className={`px-6 py-2 font-bold rounded-full transition-all ${gameMode === 'single' ? 'bg-rose-600 text-white shadow-lg shadow-rose-600/20' : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-600'}`}
                >
                  Single Player
                </button>
                <button 
                  onClick={() => setGameMode('duel')} 
                  className={`px-6 py-2 font-bold rounded-full transition-all ${gameMode === 'duel' ? 'bg-rose-600 text-white shadow-lg shadow-rose-600/20' : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-600'}`}
                >
                  Quiz Duel
                </button>
              </div>

              {gameMode === 'single' && (
                <div className="flex flex-col gap-6 w-full mx-auto bg-white/60 dark:bg-slate-800/40 p-6 rounded-2xl border border-slate-200 dark:border-slate-700/50">
                  <div className="space-y-3">
                    <label className="text-sm font-semibold tracking-wider text-slate-500 dark:text-slate-400 uppercase">Topic</label>
                    <div className="flex flex-wrap gap-2 justify-center">
                      {TOPICS.map(t => (
                        <button 
                          key={t}
                          onClick={() => { audio.playClick(); setTopic(t); }}
                          className={`px-4 py-2 rounded-xl border-2 transition-all font-medium text-sm ${topic === t ? 'border-rose-500 bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400' : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-600'}`}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-3">
                    <label className="text-sm font-semibold tracking-wider text-slate-500 dark:text-slate-400 uppercase">Difficulty</label>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <button 
                        onClick={() => { audio.playClick(); setDifficulty('Easy'); }}
                        className={`group relative p-3 rounded-xl border-2 transition-all font-medium text-sm ${difficulty === 'Easy' ? 'border-emerald-500 bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400' : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-600'}`}
                      >
                        Easy
                        <div className="absolute -top-10 left-1/2 -translate-x-1/2 w-max px-3 py-1.5 bg-slate-800 dark:bg-slate-700 text-white text-xs font-bold rounded-lg opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-20 shadow-xl hidden md:block">0.5x Multiplier</div>
                      </button>
                      <button 
                        onClick={() => { audio.playClick(); setDifficulty('Medium'); }}
                        className={`group relative p-3 rounded-xl border-2 transition-all font-medium text-sm ${difficulty === 'Medium' ? 'border-amber-500 bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400' : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-600'}`}
                      >
                        Medium
                        <div className="absolute -top-10 left-1/2 -translate-x-1/2 w-max px-3 py-1.5 bg-slate-800 dark:bg-slate-700 text-white text-xs font-bold rounded-lg opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-20 shadow-xl hidden md:block">1.0x Multiplier</div>
                      </button>
                      <button 
                        onClick={() => { audio.playClick(); setDifficulty('Hard'); }}
                        className={`group relative p-3 rounded-xl border-2 transition-all font-medium text-sm ${difficulty === 'Hard' ? 'border-red-500 bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400' : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-600'}`}
                      >
                        Hard
                        <div className="absolute -top-10 left-1/2 -translate-x-1/2 w-max px-3 py-1.5 bg-slate-800 dark:bg-slate-700 text-white text-xs font-bold rounded-lg opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-20 shadow-xl hidden md:block">1.5x Multiplier</div>
                      </button>
                      <button 
                        onClick={() => { audio.playClick(); setDifficulty('Death Match'); }}
                        className={`group relative p-3 rounded-xl border-2 transition-all font-medium text-sm ${difficulty === 'Death Match' ? 'border-purple-500 bg-purple-50 text-purple-600 dark:bg-purple-500/10 dark:text-purple-400' : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-600'}`}
                      >
                        Death Match
                        <div className="absolute -top-10 left-1/2 -translate-x-1/2 w-max px-3 py-1.5 bg-slate-800 dark:bg-slate-700 text-white text-xs font-bold rounded-lg opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-20 shadow-xl hidden md:block">3.0x Multiplier (Sudden Death)</div>
                      </button>
                    </div>
                  </div>
                  
                  {difficulty === 'Death Match' && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="space-y-3 pt-4 border-t border-slate-200 dark:border-slate-700/50">
                      <label className="text-sm font-semibold tracking-wider text-slate-500 dark:text-slate-400 uppercase">Time Per Question</label>
                      <div className="flex justify-center gap-3">
                        {[10, 30, 60].map(time => (
                          <button
                            key={time}
                            onClick={() => { audio.playClick(); setDeathMatchTime(time); }}
                            className={`px-6 py-2 rounded-xl border-2 transition-all font-medium text-sm ${deathMatchTime === time ? 'border-purple-500 bg-purple-50 text-purple-600 dark:bg-purple-500/10 dark:text-purple-400' : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-600'}`}
                          >
                            {time}s
                          </button>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </div>
              )}

              {gameMode === 'duel' && (
                <div className="flex flex-col gap-6 w-full mx-auto bg-white/60 dark:bg-slate-800/40 p-6 rounded-2xl border border-slate-200 dark:border-slate-700/50">
                  {duelId ? (
                    <div className="p-6 bg-slate-100 dark:bg-slate-900/50 rounded-xl text-center space-y-4">
                      <p className="text-lg font-medium">Your Duel Code</p>
                      <p className="text-5xl font-black text-rose-500 tracking-widest">{duelId}</p>
                      <p className="text-sm text-slate-500 dark:text-slate-400">Waiting for opponent to join...</p>
                      <div className="flex justify-center pt-2"><Loader2 className="animate-spin text-rose-500 w-8 h-8" /></div>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-6">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-2">
                        {/* Shortened options for Duel */}
                        <button onClick={() => setDifficulty('Easy')} className={`p-2 rounded-xl border-2 font-medium text-xs ${difficulty === 'Easy' ? 'border-rose-500 text-rose-600' : 'border-slate-200 dark:border-slate-700'}`}>Easy</button>
                        <button onClick={() => setDifficulty('Medium')} className={`p-2 rounded-xl border-2 font-medium text-xs ${difficulty === 'Medium' ? 'border-rose-500 text-rose-600' : 'border-slate-200 dark:border-slate-700'}`}>Medium</button>
                        <button onClick={() => setDifficulty('Hard')} className={`p-2 rounded-xl border-2 font-medium text-xs ${difficulty === 'Hard' ? 'border-rose-500 text-rose-600' : 'border-slate-200 dark:border-slate-700'}`}>Hard</button>
                        <button onClick={() => setDifficulty('Death Match')} className={`p-2 rounded-xl border-2 font-medium text-xs ${difficulty === 'Death Match' ? 'border-rose-500 text-rose-600' : 'border-slate-200 dark:border-slate-700'}`}>Death Match</button>
                      </div>
                      
                      <button onClick={createDuel} className="w-full py-4 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-xl font-bold transition-transform active:scale-95">
                        Host New Duel
                      </button>
                      <div className="relative">
                        <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-300 dark:border-slate-700"></div></div>
                        <div className="relative flex justify-center text-sm"><span className="px-2 bg-white dark:bg-slate-800 text-slate-500">OR</span></div>
                      </div>
                      <div className="flex gap-2">
                        <input 
                          value={joinCode} 
                          onChange={e => setJoinCode(e.target.value)} 
                          placeholder="ENTER CODE" 
                          className="px-4 py-4 rounded-xl border-2 border-slate-300 dark:border-slate-600 flex-1 bg-transparent text-center font-black tracking-widest uppercase focus:border-rose-500 outline-none transition-colors" 
                          maxLength={5}
                        />
                        <button onClick={joinDuel} className="px-6 py-4 bg-rose-600 hover:bg-rose-500 text-white rounded-xl font-bold transition-transform active:scale-95">
                          Join
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {gameMode === 'single' && (
                <motion.button
                  onClick={fetchQuestions}
                  animate={{ scale: [1, 1.05, 1] }}
                  transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                  className="inline-flex items-center gap-2 px-8 py-4 bg-rose-600 hover:bg-rose-500 text-white rounded-full font-bold text-lg transition-colors shadow-lg shadow-rose-600/20"
                >
                  Start Training <Sword className="w-5 h-5" />
                </motion.button>
              )}
            </motion.div>
          )}

          {gameState === 'loading' && (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="w-full space-y-6"
            >
              <div className="flex items-center justify-between animate-pulse">
                <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-24"></div>
                <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-32"></div>
              </div>
              <div className="w-full bg-slate-200 dark:bg-slate-800 h-2 rounded-full overflow-hidden animate-pulse"></div>
              
              <div className="bg-white/90 dark:bg-slate-800/80 backdrop-blur-md rounded-3xl p-6 md:p-8 border border-slate-200 dark:border-slate-700/50 shadow-2xl space-y-6 animate-pulse">
                <div className="h-8 bg-slate-200 dark:bg-slate-700 rounded w-3/4 mb-8"></div>
                <div className="space-y-4">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="h-14 bg-slate-100 dark:bg-slate-700/50 rounded-2xl w-full"></div>
                  ))}
                </div>
                <div className="flex justify-end pt-4">
                  <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-32"></div>
                </div>
              </div>
              <div className="text-center mt-6 text-slate-500 dark:text-slate-400 flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" /> Forging new questions...
              </div>
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
                <div className="flex items-center gap-4 md:gap-6">
                  {gameMode === 'duel' && duelData && user && Object.entries(duelData.players).filter(([uid]) => uid !== user.uid).map(([uid, p]: any) => (
                    <span key={uid} className="text-indigo-600 dark:text-indigo-400 font-bold hidden md:inline">
                      {p.displayName || 'Opponent'}: {p.score} pts (Q{Math.min(questions.length, p.currentQuestionIndex + 1)})
                    </span>
                  ))}
                  <span className={`flex items-center gap-2 ${timeLeft <= 5 ? 'text-red-500 animate-pulse' : 'text-slate-600 dark:text-slate-300'}`}>
                    <Clock className="w-5 h-5" /> {timeLeft}s
                  </span>
                  <span className="text-rose-500 dark:text-rose-400 text-lg">Score: {score}</span>
                </div>
              </div>
              
              <div className="flex flex-col gap-3">
                <div className="w-full bg-slate-200 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                  <div 
                    className="bg-rose-500 h-full transition-all duration-500"
                    style={{ width: `${((currentIndex) / questions.length) * 100}%` }}
                  />
                </div>
                {/* Streak Bar */}
                <div className="flex items-center gap-2" title={`Current Streak: ${streak}`}>
                  <Flame className={`w-4 h-4 transition-colors duration-300 ${streak >= 5 ? 'text-orange-500 animate-pulse drop-shadow-[0_0_5px_rgba(249,115,22,0.8)]' : 'text-slate-400 dark:text-slate-600'}`} />
                  <div className="flex-1 bg-slate-200 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden relative">
                    <div 
                      className={`h-full transition-all duration-500 ${streak >= 20 ? 'bg-purple-500' : streak >= 10 ? 'bg-rose-500' : streak >= 5 ? 'bg-orange-500' : 'bg-amber-400'}`}
                      style={{ 
                        width: `${Math.min((streak / 20) * 100, 100)}%`,
                        boxShadow: streak >= 20 ? '0 0 10px #a855f7' : streak >= 10 ? '0 0 8px #f43f5e' : streak >= 5 ? '0 0 5px #f97316' : 'none'
                      }}
                    />
                  </div>
                  <span className={`text-xs font-bold transition-colors duration-300 ${streak >= 5 ? 'text-orange-500' : 'text-slate-400 dark:text-slate-600'}`}>
                    x{streak}
                  </span>
                </div>
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
                  <button 
                    onClick={() => toggleFavorite(questions[currentIndex])} 
                    className="p-3 bg-rose-100 hover:bg-rose-200 dark:bg-rose-900/30 dark:hover:bg-rose-800/50 rounded-full text-rose-600 dark:text-rose-400 transition-colors shrink-0"
                    title="Save to Favorites"
                  >
                    <Bookmark className="w-5 h-5" />
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

                {!isAnswered && (
                  <div className="pt-4 flex justify-between items-center">
                    {difficulty !== 'Death Match' ? (
                      <button 
                        onClick={handleSkip}
                        disabled={score < 100}
                        className="inline-flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 hover:text-rose-500 dark:hover:text-rose-400 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                        title={score < 100 ? "Need 100 points to skip" : "Skip Question (-100 pts)"}
                      >
                        Skip Question (-100 pts)
                      </button>
                    ) : (
                      <div></div>
                    )}
                    
                    {!hint && (
                      <button 
                        onClick={getHint}
                        disabled={hintLoading || timeLeft <= 5}
                        className="inline-flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 hover:text-amber-500 dark:hover:text-amber-400 transition-colors disabled:opacity-50"
                      >
                        {hintLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lightbulb className="w-4 h-4" />}
                        Ask Kasugai Crow (-5s)
                      </button>
                    )}
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
                  <div className="flex justify-center items-center gap-4 text-sm font-bold text-slate-500 dark:text-slate-400 mt-2">
                    <span>
                      Accuracy: <span className="text-rose-500 dark:text-rose-400">{Math.round((history.filter(h => h.isCorrect).length / Math.max(1, questions.length)) * 100)}%</span>
                    </span>
                    <span className="flex items-center gap-1 px-2 py-1 bg-slate-100 dark:bg-slate-700 rounded-md">
                      Multiplier: <span className={difficulty === 'Death Match' ? 'text-purple-500 dark:text-purple-400' : (difficulty === 'Hard' ? 'text-red-500 dark:text-red-400' : (difficulty === 'Easy' ? 'text-emerald-500 dark:text-emerald-400' : 'text-amber-500 dark:text-amber-400'))}>
                        {difficulty === 'Death Match' ? 3 : (difficulty === 'Hard' ? 1.5 : (difficulty === 'Medium' ? 1 : 0.5))}x
                      </span>
                    </span>
                  </div>
                </div>
                
                <h2 className="text-2xl font-bold">
                  {score >= 2000 ? "Hashira Level!" : 
                   score >= 1000 ? "Kinoe Rank!" : 
                   "Mizunoto Rank - Keep Training!"}
                </h2>

                {gameMode === 'duel' && duelData && user && (
                  <div className="mt-6 p-4 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-2xl flex flex-col gap-2 w-full max-w-sm mx-auto">
                    <h3 className="font-bold text-lg uppercase tracking-wider text-slate-500">Duel Results</h3>
                    {Object.entries(duelData.players).sort((a: any, b: any) => b[1].score - a[1].score).map(([uid, p]: any) => (
                      <div key={uid} className={`flex justify-between items-center p-3 rounded-xl border-2 ${uid === user.uid ? 'border-rose-500 bg-rose-50 dark:bg-rose-500/10' : 'border-transparent bg-white dark:bg-slate-800'}`}>
                        <span className="font-bold">{p.displayName}</span>
                        <span className={`font-black ${uid === user.uid ? 'text-rose-600' : 'text-slate-600 dark:text-slate-400'}`}>{p.score} pts</span>
                      </div>
                    ))}
                  </div>
                )}
                
                {!user && (
                  <p className="text-amber-600 dark:text-amber-400 text-sm font-medium pt-4">
                    Sign in to save your high score to the global leaderboard!
                  </p>
                )}

                <div className="pt-6 flex flex-col sm:flex-row gap-4 justify-center items-center">
                  <button
                    onClick={() => { audio.playClick(); fetchQuestions(); }}
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

              {/* Quiz History & Favorites */}
              <div className="bg-white/90 dark:bg-slate-800/80 backdrop-blur-md rounded-3xl p-6 md:p-8 border border-slate-200 dark:border-slate-700/50 shadow-2xl space-y-4 text-left">
                <div className="flex justify-between items-center border-b border-slate-200 dark:border-slate-700 mb-4">
                  <div className="flex">
                    <button 
                      onClick={() => setHistoryTab('history')}
                      className={`pb-2 px-4 text-lg font-bold transition-colors ${historyTab === 'history' ? 'text-rose-600 border-b-2 border-rose-600' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'}`}
                    >
                      Quiz History
                    </button>
                    <button 
                      onClick={() => setHistoryTab('favorites')}
                      className={`pb-2 px-4 text-lg font-bold transition-colors ${historyTab === 'favorites' ? 'text-rose-600 border-b-2 border-rose-600' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'}`}
                    >
                      My Favorites
                    </button>
                  </div>
                  {historyTab === 'history' && history.some(h => !h.isCorrect) && (
                    <button
                      onClick={() => {
                        const el = document.getElementById('first-mistake');
                        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                      }}
                      className="text-sm font-bold text-rose-500 hover:text-rose-600 bg-rose-50 dark:bg-rose-500/10 px-3 py-1 rounded-full pb-2 mb-2"
                    >
                      Jump to First Mistake
                    </button>
                  )}
                </div>
                
                <div className="space-y-4 max-h-80 overflow-y-auto pr-2 custom-scrollbar relative">
                  {historyTab === 'history' && history.map((item, idx) => {
                    const isFirstMistake = !item.isCorrect && history.findIndex(h => !h.isCorrect) === idx;
                    return (
                      <div id={isFirstMistake ? 'first-mistake' : undefined} key={idx} className={`p-4 rounded-xl border ${item.isCorrect ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/20' : 'bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/20'}`}>
                        <p className="font-bold text-slate-800 dark:text-slate-200 mb-2">{item.question.question}</p>
                        <div className="text-sm space-y-1">
                          <p className={item.isCorrect ? 'text-emerald-700 dark:text-emerald-400 font-medium' : 'text-red-700 dark:text-red-400 font-medium'}>
                            Your Answer: {item.selectedOption || 'Time Out'} {item.isCorrect && '(Correct)'}
                          </p>
                          {!item.isCorrect && (
                            <p className="text-emerald-700 dark:text-emerald-400 font-medium">
                              Correct Answer: {item.question.correctAnswer}
                            </p>
                          )}
                          <p className="text-slate-500 dark:text-slate-400 text-xs mt-1">Earned: +{item.scoreEarned} pts</p>
                        </div>
                      </div>
                    );
                  })}

                  {historyTab === 'favorites' && favorites.length === 0 && (
                    <div className="text-center p-8 text-slate-500 dark:text-slate-400">
                      <Bookmark className="w-8 h-8 mx-auto mb-2 opacity-50" />
                      No favorite questions saved yet.
                    </div>
                  )}

                  {historyTab === 'favorites' && favorites.map((fav, idx) => (
                    <div key={idx} className="p-4 rounded-xl border bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700">
                      <p className="font-bold text-slate-800 dark:text-slate-200 mb-2">{fav.question}</p>
                      <div className="text-sm space-y-1">
                        <p className="text-emerald-600 dark:text-emerald-400 font-medium">
                          Correct Answer: {fav.correctAnswer}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <Leaderboard isDaily={topic === 'Daily Challenge'} />

            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
