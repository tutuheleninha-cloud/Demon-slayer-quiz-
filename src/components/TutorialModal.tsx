import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sword, Flame, Lightbulb, Keyboard, X } from 'lucide-react';

export function TutorialModal() {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const hasSeen = localStorage.getItem('hasSeenTutorial');
    if (!hasSeen) {
      setIsOpen(true);
    }
  }, []);

  const close = () => {
    localStorage.setItem('hasSeenTutorial', 'true');
    setIsOpen(false);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl p-6 md:p-8 max-w-lg w-full relative"
          >
            <button onClick={close} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
              <X className="w-6 h-6" />
            </button>
            <h2 className="text-2xl font-bold mb-6 flex items-center gap-2 text-rose-600 dark:text-rose-400">
              <Sword className="w-6 h-6" />
              How to Play
            </h2>
            
            <div className="space-y-6 text-slate-700 dark:text-slate-300">
              <div className="flex gap-4">
                <div className="shrink-0 pt-1"><Flame className="w-6 h-6 text-orange-500" /></div>
                <div>
                  <h3 className="font-bold text-lg mb-1">Streaks & Combos</h3>
                  <p className="text-sm">Answer questions correctly in a row to build your streak. Higher streaks multiply your earned points! A single mistake resets it.</p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="shrink-0 pt-1"><Lightbulb className="w-6 h-6 text-yellow-500" /></div>
                <div>
                  <h3 className="font-bold text-lg mb-1">Kasugai Crow Hints</h3>
                  <p className="text-sm">Stuck? Use the hint button. The Kasugai Crow will give you a cryptic clue (costs some time, though!).</p>
                </div>
              </div>

              <div className="flex gap-4">
                <div className="shrink-0 pt-1"><Keyboard className="w-6 h-6 text-slate-500" /></div>
                <div>
                  <h3 className="font-bold text-lg mb-1">Power Controls</h3>
                  <p className="text-sm">Use your keyboard for speed: <br/>
                    • <b>1-4</b> to select answers<br/>
                    • <b>H</b> for a hint<br/>
                    • <b>Enter</b> to instantly skip to the next question<br/>
                    • <b>Voice</b>: Tap the mic icon to answer with your voice!
                  </p>
                </div>
              </div>
            </div>

            <button 
              onClick={close}
              className="mt-8 w-full py-3 bg-rose-600 hover:bg-rose-500 text-white rounded-xl font-bold transition-all active:scale-95"
            >
              I'm Ready!
            </button>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
