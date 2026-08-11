import React, { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { useAuthState } from 'react-firebase-hooks/auth';
import { Medal, Star, Shield } from 'lucide-react';
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, Tooltip } from 'recharts';

export function ProfileStats() {
  const [user] = useAuthState(auth);
  const [stats, setStats] = useState<any>(null);

  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(doc(db, 'users', user.uid), (doc) => {
      if (doc.exists()) {
        setStats(doc.data());
      }
    });
    return () => unsub();
  }, [user]);

  if (!user || !stats) return null;

  const badges = [];
  if (stats.totalQuizzes >= 1) badges.push({ name: 'First Trial', icon: <Shield className="w-4 h-4 text-slate-500 dark:text-slate-400" /> });
  if (stats.totalQuizzes >= 5) badges.push({ name: 'Veteran', icon: <Medal className="w-4 h-4 text-amber-500" /> });
  if (stats.maxScore >= 2000) badges.push({ name: 'Hashira', icon: <Star className="w-4 h-4 text-rose-500" /> });
  if (stats.maxScore >= 3500) badges.push({ name: 'Demon King', icon: <Star className="w-4 h-4 text-purple-500" /> });

  const radarData = Object.keys(stats.topicStats || {}).map(topic => {
    const { correct, total } = stats.topicStats[topic];
    return {
      subject: topic.replace('Arc', '').trim(), // Shorten long names
      score: Math.round((correct / Math.max(total, 1)) * 100),
      fullMark: 100
    };
  });

  return (
    <div className="bg-white/60 dark:bg-slate-800/40 p-6 rounded-2xl border border-slate-200 dark:border-slate-700/50 max-w-md mx-auto w-full">
      <div className="flex flex-wrap items-center justify-center gap-4 mb-4">
        <div className="text-sm">
          <span className="text-slate-500 dark:text-slate-400">Total Trials:</span>
          <span className="font-bold ml-1">{stats.totalQuizzes}</span>
        </div>
        <div className="text-sm">
          <span className="text-slate-500 dark:text-slate-400">Best Score:</span>
          <span className="font-bold ml-1">{stats.maxScore}</span>
        </div>
        {badges.length > 0 && (
          <div className="flex gap-2 items-center pl-4 border-l border-slate-300 dark:border-slate-600">
            {badges.map(b => (
              <div key={b.name} className="flex items-center gap-1 bg-slate-100 dark:bg-slate-700 px-2 py-1 rounded-full text-xs font-medium" title={b.name}>
                {b.icon} <span className="hidden sm:inline">{b.name}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {radarData.length > 2 && (
        <div className="w-full h-64 mt-4 relative">
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart cx="50%" cy="50%" outerRadius="80%" data={radarData}>
              <PolarGrid strokeOpacity={0.3} />
              <PolarAngleAxis dataKey="subject" tick={{ fill: '#888', fontSize: 10 }} />
              <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
              <Tooltip 
                contentStyle={{ borderRadius: '8px', backgroundColor: 'rgba(15, 23, 42, 0.9)', border: 'none', color: '#fff' }}
                itemStyle={{ color: '#fff' }}
                formatter={(value: number) => [`${value}%`, 'Accuracy']}
              />
              <Radar name="Accuracy" dataKey="score" stroke="#f43f5e" fill="#f43f5e" fillOpacity={0.4} />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
