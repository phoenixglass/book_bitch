import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import type { Session } from '@supabase/supabase-js';

export function AuthGate({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null | 'loading'>('loading');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'login' | 'signup' | 'reset'>('login');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session ?? null);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(sess ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  if (session === 'loading') {
    return (
      <div className="fixed inset-0 bg-[#0f0f1a] flex items-center justify-center">
        <div className="text-white/40 text-sm">Loading…</div>
      </div>
    );
  }

  if (session !== null) return <>{children}</>;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setInfo('');
    setLoading(true);
    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) setError(error.message);
      } else if (mode === 'signup') {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) setError(error.message);
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email);
        if (error) setError(error.message);
        else setInfo('Check your email for a password reset link.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-[#0f0f1a] flex items-center justify-center z-50">
      <div className="bg-[#1a1a2e] border border-white/10 rounded-xl p-8 w-full max-w-sm shadow-2xl">
        <h1 className="text-2xl font-bold text-white mb-1">Book Bitch</h1>
        <p className="text-white/50 text-sm mb-6">Sign in to sync your project across devices</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-white/60 text-xs uppercase tracking-wide mb-1 block">Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white placeholder:text-white/30 focus:outline-none focus:border-purple-500"
            />
          </div>
          {mode !== 'reset' && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-white/60 text-xs uppercase tracking-wide">Password</label>
                {mode === 'login' && (
                  <button
                    type="button"
                    onClick={() => { setMode('reset'); setError(''); setInfo(''); }}
                    className="text-purple-400 hover:text-purple-300 text-xs"
                  >
                    Forgot password?
                  </button>
                )}
              </div>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                minLength={6}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white placeholder:text-white/30 focus:outline-none focus:border-purple-500"
              />
            </div>
          )}
          {error && <p className="text-red-400 text-sm">{error}</p>}
          {info && <p className="text-green-400 text-sm">{info}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white font-medium py-2 rounded-lg transition-colors"
          >
            {loading ? 'Please wait…' : mode === 'login' ? 'Sign in' : mode === 'signup' ? 'Create account' : 'Send reset link'}
          </button>
          <p className="text-center text-white/40 text-sm">
            {mode === 'reset' ? (
              <>
                Remember it?{' '}
                <button
                  type="button"
                  onClick={() => { setMode('login'); setError(''); setInfo(''); }}
                  className="text-purple-400 hover:text-purple-300"
                >
                  Sign in
                </button>
              </>
            ) : (
              <>
                {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
                <button
                  type="button"
                  onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(''); setInfo(''); }}
                  className="text-purple-400 hover:text-purple-300"
                >
                  {mode === 'login' ? 'Sign up' : 'Sign in'}
                </button>
              </>
            )}
          </p>
        </form>
      </div>
    </div>
  );
}
