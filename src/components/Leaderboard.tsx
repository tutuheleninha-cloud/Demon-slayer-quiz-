import React, { useEffect, useState } from 'react';
import { collection, query, orderBy, limit, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { Trophy, Loader2 } from 'lucide-react';

interface ScoreEntry {
  id: string;
  displayName: string;
  score: number;
}

export function Leaderboard() {
  const [scores, setScores] = useState<ScoreEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchLeaderboard = async () => {
      try {
        const q = query(collection(db, 'leaderboard'), orderBy('score', 'desc'), limit(10));
        const querySnapshot = await getDocs(q);
        const fetchedScores = querySnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as ScoreEntry[];
        setScores(fetchedScores);
      } catch (error) {
        console.error('Error fetching leaderboard:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchLeaderboard();
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center p-8">
        <Loader2 className="w-8 h-8 text-amber-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="bg-white/90 dark:bg-slate-800/80 backdrop-blur-md rounded-3xl p-6 md:p-8 border border-slate-200 dark:border-slate-700/50 shadow-2xl w-full max-w-md mx-auto">
      <div className="flex items-center gap-3 justify-center mb-6 text-amber-500 dark:text-amber-400">
        <Trophy className="w-8 h-8" />
        <h2 className="text-2xl font-bold">Global Top 10</h2>
      </div>
      <div className="space-y-3">
        {scores.length === 0 ? (
          <p className="text-center text-slate-500 dark:text-slate-400">No scores yet. Be the first!</p>
        ) : (
          scores.map((s, index) => (
            <div key={s.id} className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
              <div className="flex items-center gap-3">
                <span className="font-bold text-slate-400 dark:text-slate-500 w-5">{index + 1}.</span>
                <span className="font-medium text-slate-800 dark:text-slate-200">{s.displayName || 'Anonymous Slayer'}</span>
              </div>
              <span className="font-bold text-rose-500 dark:text-rose-400">{s.score} pts</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
