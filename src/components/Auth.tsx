import React from 'react';
import { signInWithPopup, signOut } from 'firebase/auth';
import { auth, googleProvider } from '../firebase';
import { LogIn, LogOut } from 'lucide-react';
import { useAuthState } from 'react-firebase-hooks/auth';

export function Auth() {
  const [user, loading] = useAuthState(auth);

  if (loading) {
    return <div className="h-10 w-24 bg-slate-200 dark:bg-slate-800 rounded-full animate-pulse" />;
  }

  if (user) {
    return (
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
          {user.displayName?.split(' ')[0]}
        </span>
        <button
          onClick={() => signOut(auth)}
          className="flex items-center gap-2 px-3 py-1.5 text-sm rounded-full bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition-colors border border-slate-200 dark:border-slate-700"
        >
          <LogOut className="w-4 h-4" />
          Sign Out
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => signInWithPopup(auth, googleProvider)}
      className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-full bg-white dark:bg-slate-800 text-slate-900 dark:text-white hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors shadow-sm border border-slate-200 dark:border-slate-700"
    >
      <LogIn className="w-4 h-4" />
      Sign in with Google
    </button>
  );
}
