import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Code, LogIn, UserPlus, BookOpen, Award, Users } from 'lucide-react';

export default function Login() {
  const [isLogin, setIsLogin] = useState(true);
  const [formData, setFormData] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const { login } = useAuth();

  const handleToggle = () => {
    setIsLogin(!isLogin);
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    
    const endpoint = isLogin ? '/api/auth/login' : '/api/auth/signup';
    
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData)
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        if (data.error === 'You already have an account, please log in!') {
          setIsLogin(true);
        }
        throw new Error(data.error || 'Authentication failed');
      }
      
      login(data.user, data.token);
      navigate('/dashboard');
      
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex">
      {/* Left Side: Animated Flash Cards */}
      <div className="hidden lg:flex relative overflow-hidden w-1/2 flex-col justify-center items-center border-r border-white/10 p-12 bg-slate-900/50">
        {/* Background ambient light */}
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-indigo-500/20 rounded-full blur-3xl pointer-events-none"></div>
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-500/20 rounded-full blur-3xl pointer-events-none"></div>

        <div className="relative z-10 w-full max-w-md space-y-6">
          <div className="text-center mb-10 animate-fade-in-up">
            <h2 className="text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 to-purple-400">Welcome to Skill Exchange</h2>
            <p className="text-slate-400 mt-4 text-lg">Trade skills, earn credits, and grow together using our professional community network.</p>
          </div>

          {/* Flash Card 1 */}
          <div className="glass p-6 rounded-2xl relative overflow-hidden animate-fade-in-up animate-float-slow delay-100 hover:border-indigo-500/50 transition-colors shadow-2xl">
            <div className="absolute -top-6 -right-4 text-9xl font-black text-slate-800/40 select-none z-0">01</div>
            <div className="relative z-10">
              <div className="w-12 h-12 bg-indigo-500/20 rounded-xl flex items-center justify-center mb-4 border border-indigo-500/30 text-indigo-400 shadow-[0_0_15px_rgba(99,102,241,0.2)]">
                <BookOpen size={24} />
              </div>
              <h3 className="text-xl font-bold text-white mb-2">Publish Skills</h3>
              <p className="text-slate-300">Share your expertise with eager learners across the globe and build your teaching reputation.</p>
            </div>
          </div>

          {/* Flash Card 2 */}
          <div className="glass p-6 rounded-2xl relative overflow-hidden animate-fade-in-up animate-float-medium delay-300 hover:border-purple-500/50 transition-colors ml-12 shadow-2xl">
            <div className="absolute -top-6 -right-4 text-9xl font-black text-slate-800/40 select-none z-0">02</div>
            <div className="relative z-10">
              <div className="w-12 h-12 bg-purple-500/20 rounded-xl flex items-center justify-center mb-4 border border-purple-500/30 text-purple-400 shadow-[0_0_15px_rgba(168,85,247,0.2)]">
                <Award size={24} />
              </div>
              <h3 className="text-xl font-bold text-white mb-2">Earn Credits</h3>
              <p className="text-slate-300">Get rewarded for every hour you teach. Credits are our built-in community currency.</p>
            </div>
          </div>

          {/* Flash Card 3 */}
          <div className="glass p-6 rounded-2xl relative overflow-hidden animate-fade-in-up animate-float-fast delay-500 hover:border-emerald-500/50 transition-colors shadow-2xl">
            <div className="absolute -top-6 -right-4 text-9xl font-black text-slate-800/40 select-none z-0">03</div>
            <div className="relative z-10">
              <div className="w-12 h-12 bg-emerald-500/20 rounded-xl flex items-center justify-center mb-4 border border-emerald-500/30 text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.2)]">
                <Users size={24} />
              </div>
              <h3 className="text-xl font-bold text-white mb-2">Learn a Skill</h3>
              <p className="text-slate-300">Spend your earned credits to join classes from other experts securely via escrow.</p>
            </div>
          </div>
        </div>
      </div>

      {/* Right Side: Login Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-4 lg:p-12 relative overflow-hidden">
        {/* Mobile background ambient light */}
        <div className="lg:hidden absolute top-1/4 left-1/4 w-96 h-96 bg-indigo-500/20 rounded-full blur-3xl pointer-events-none"></div>
        <div className="lg:hidden absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-500/20 rounded-full blur-3xl pointer-events-none"></div>

        <div className="glass w-full max-w-md p-8 sm:p-10 rounded-3xl relative z-10 transition-all duration-300 shadow-2xl border-t border-white/20">
          <div className="flex flex-col items-center mb-10">
              <div className="w-16 h-16 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl flex items-center justify-center mb-5 shadow-lg shadow-indigo-500/40 transform -rotate-6 hover:rotate-0 transition-transform duration-300">
                  <Code size={32} className="text-white" />
              </div>
              <h1 className="text-3xl font-bold text-center text-white mb-1">
                  {isLogin ? 'Welcome Back' : 'Create Account'}
              </h1>
              <p className="text-slate-400 text-sm text-center">
                  {isLogin ? 'Enter your details to access your dashboard.' : 'Sign up to start trading skills today.'}
              </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {!isLogin && (
              <div className="animate-fade-in-up" style={{ animationDuration: '0.4s' }}>
                <label className="block text-sm font-medium text-slate-300 mb-1.5 ml-1">Full Name</label>
                <input
                  type="text"
                  required
                  placeholder="John Doe"
                  className="w-full bg-slate-800/60 border border-slate-700/50 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all shadow-inner"
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                />
              </div>
            )}
            
            <div className="animate-fade-in-up" style={{ animationDuration: '0.5s' }}>
              <label className="block text-sm font-medium text-slate-300 mb-1.5 ml-1">Email Address</label>
              <input
                type="email"
                required
                placeholder="you@example.com"
                className="w-full bg-slate-800/60 border border-slate-700/50 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all shadow-inner"
                value={formData.email}
                onChange={(e) => setFormData({...formData, email: e.target.value})}
              />
            </div>

            <div className="animate-fade-in-up" style={{ animationDuration: '0.6s' }}>
              <label className="block text-sm font-medium text-slate-300 mb-1.5 ml-1">Password</label>
              <input
                type="password"
                required
                placeholder="••••••••"
                className="w-full bg-slate-800/60 border border-slate-700/50 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all shadow-inner"
                value={formData.password}
                onChange={(e) => setFormData({...formData, password: e.target.value})}
              />
            </div>

            {error && (
              <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm animate-fade-in-up">
                {error}
              </div>
            )}

            <button
              type="submit"
              className="w-full bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-400 hover:to-purple-500 text-white font-bold py-3.5 rounded-xl flex items-center justify-center gap-2 transition-all transform hover:-translate-y-1 active:scale-95 shadow-[0_0_20px_rgba(99,102,241,0.4)] hover:shadow-[0_0_25px_rgba(99,102,241,0.6)] mt-2 border border-indigo-400/20 animate-fade-in-up"
              style={{ animationDuration: '0.7s' }}
            >
              {isLogin ? <><LogIn size={20} /> Sign In</> : <><UserPlus size={20} /> Sign Up Free</>}
            </button>
          </form>

          <div className="mt-8 text-center text-sm text-slate-400 border-t border-slate-700/50 pt-6 animate-fade-in-up" style={{ animationDuration: '0.8s' }}>
            {isLogin ? "Don't have an account? " : "Already have an account? "}
            <button
              onClick={handleToggle}
              className="text-indigo-400 hover:text-indigo-300 font-bold transition-colors focus:outline-none"
            >
              {isLogin ? 'Sign up' : 'Log in'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
