import React from 'react';
import { motion } from 'motion/react';

export function BackgroundParticles({ topic }: { topic: string }) {
  // Config per topic
  let emoji = '⚔️';
  let color = 'text-slate-300';

  switch (topic) {
    case 'Tanjiro Kamado':
      emoji = '🌊';
      color = 'text-blue-500';
      break;
    case 'The Hashira':
      emoji = '✨';
      color = 'text-yellow-400';
      break;
    case 'The Twelve Kizuki':
      emoji = '👁️';
      color = 'text-purple-600';
      break;
    case 'Breathing Styles':
      emoji = '🍃';
      color = 'text-green-500';
      break;
    case 'Mugen Train Arc':
      emoji = '🔥';
      color = 'text-orange-500';
      break;
    case 'Entertainment District Arc':
      emoji = '🎆';
      color = 'text-pink-500';
      break;
    case 'Daily Challenge':
      emoji = '🏆';
      color = 'text-yellow-500';
      break;
    default:
      emoji = '🌸';
      color = 'text-pink-300';
      break;
  }

  const particles = Array.from({ length: 15 }).map((_, i) => ({
    id: i,
    x: Math.random() * 100, // percentage
    delay: Math.random() * 5,
    duration: 10 + Math.random() * 15,
    size: 1 + Math.random() * 1.5
  }));

  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden z-0 opacity-40 dark:opacity-20">
      {particles.map((p) => (
        <motion.div
          key={p.id}
          className={`absolute top-[-10%] ${color}`}
          initial={{ x: `${p.x}vw`, y: '-10vh', rotate: 0 }}
          animate={{ 
            y: '110vh', 
            rotate: 360,
            x: `${p.x + (Math.random() * 20 - 10)}vw`
          }}
          transition={{
            duration: p.duration,
            delay: p.delay,
            repeat: Infinity,
            ease: 'linear'
          }}
          style={{ fontSize: `${p.size}rem` }}
        >
          {emoji}
        </motion.div>
      ))}
    </div>
  );
}
