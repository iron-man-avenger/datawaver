import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Alert, AlertDescription } from '../components/ui/alert';
import { Eye, EyeOff, Github, Mail } from 'lucide-react';
import { Separator } from '../components/ui/separator';

export const LoginPage: React.FC = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [usernameError, setUsernameError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const { login } = useAuth();
  const navigate = useNavigate();

  const validateUsername = () => {
    if (!username.trim()) {
      setUsernameError('Username is required');
      return false;
    }
    setUsernameError('');
    return true;
  };

  const validatePassword = () => {
    if (!password) {
      setPasswordError('Password is required');
      return false;
    }
    setPasswordError('');
    return true;
  };

  const handleUsernameBlur = () => {
    validateUsername();
    setFocusedField(null);
  };

  const handlePasswordBlur = () => {
    validatePassword();
    setFocusedField(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!validateUsername() || !validatePassword()) {
      return;
    }

    setLoading(true);

    try {
      await login(username, password);
      navigate('/');
    } catch (err) {
      setError('Invalid username or password');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-zinc-950">
      {/* Left side - Abstract Data Visualization */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden bg-gradient-to-br from-blue-950 via-zinc-900 to-purple-950 flex-col items-center justify-center p-12">
        {/* Animated mesh gradient background */}
        <svg
          className="absolute inset-0 w-full h-full"
          viewBox="0 0 400 400"
          preserveAspectRatio="none"
        >
          <defs>
            <filter id="glow">
              <feGaussianBlur stdDeviation="4" result="coloredBlur" />
              <feMerge>
                <feMergeNode in="coloredBlur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <linearGradient id="grad1" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.3" />
              <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0.3" />
            </linearGradient>
          </defs>
          {/* Grid pattern */}
          <g opacity="0.1" stroke="#60a5fa" strokeWidth="0.5">
            {Array.from({ length: 20 }).map((_, i) => (
              <line key={`v-${i}`} x1={i * 20} y1="0" x2={i * 20} y2="400" />
            ))}
            {Array.from({ length: 20 }).map((_, i) => (
              <line key={`h-${i}`} x1="0" y1={i * 20} x2="400" y2={i * 20} />
            ))}
          </g>
          {/* Nodes and connections */}
          <circle cx="50" cy="50" r="3" fill="#3b82f6" filter="url(#glow)" />
          <circle cx="350" cy="80" r="3" fill="#8b5cf6" filter="url(#glow)" />
          <circle cx="100" cy="300" r="3" fill="#06b6d4" filter="url(#glow)" />
          <circle cx="350" cy="300" r="3" fill="#3b82f6" filter="url(#glow)" />
          <circle cx="200" cy="200" r="4" fill="#ec4899" filter="url(#glow)" />
          {/* Connection lines */}
          <line x1="50" y1="50" x2="350" y2="80" stroke="#3b82f6" strokeWidth="0.5" opacity="0.2" />
          <line x1="50" y1="50" x2="100" y2="300" stroke="#06b6d4" strokeWidth="0.5" opacity="0.2" />
          <line x1="350" y1="80" x2="350" y2="300" stroke="#8b5cf6" strokeWidth="0.5" opacity="0.2" />
          <line x1="100" y1="300" x2="350" y2="300" stroke="#3b82f6" strokeWidth="0.5" opacity="0.2" />
        </svg>

        {/* Brand message */}
        <div className="relative z-10 text-center">
          <div className="mb-8">
            <h2 className="text-5xl font-bold text-white mb-4 tracking-tight">Data Weaver</h2>
            <p className="text-lg text-zinc-300 max-w-sm leading-relaxed">
              Weave your data into actionable insights. Enterprise-grade data management for the modern era.
            </p>
          </div>
          
          <div className="flex gap-4 justify-center mt-12">
            <div className="flex flex-col items-center">
              <div className="w-12 h-12 rounded-lg bg-blue-500/20 border border-blue-500/40 flex items-center justify-center mb-3">
                <svg className="w-6 h-6 text-blue-400" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" />
                </svg>
              </div>
              <p className="text-sm text-zinc-400">Real-time Sync</p>
            </div>
            <div className="flex flex-col items-center">
              <div className="w-12 h-12 rounded-lg bg-purple-500/20 border border-purple-500/40 flex items-center justify-center mb-3">
                <svg className="w-6 h-6 text-purple-400" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" />
                </svg>
              </div>
              <p className="text-sm text-zinc-400">Secure & Encrypted</p>
            </div>
            <div className="flex flex-col items-center">
              <div className="w-12 h-12 rounded-lg bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center mb-3">
                <svg className="w-6 h-6 text-cyan-400" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" />
                </svg>
              </div>
              <p className="text-sm text-zinc-400">Audit Trail</p>
            </div>
          </div>
        </div>
      </div>

      {/* Right side - Login Form */}
      <div className="w-full lg:w-1/2 flex flex-col items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-sm">
          {/* Mobile brand */}
          <div className="lg:hidden mb-8">
            <h1 className="text-3xl font-bold text-white mb-1">Data Weaver</h1>
            <p className="text-sm text-zinc-400">Sign in to your account</p>
          </div>

          {/* Form Card with Glassmorphism */}
          <div className="rounded-2xl border border-zinc-700/50 bg-zinc-900/40 backdrop-blur-xl p-8 shadow-2xl">
            <h2 className="text-2xl font-bold text-white mb-1 hidden lg:block">Welcome Back</h2>
            <p className="text-zinc-400 text-sm mb-8 hidden lg:block">
              Enter your credentials to continue
            </p>

            {error && (
              <Alert variant="destructive" className="mb-6 bg-red-950/50 border-red-900/50 rounded-lg">
                <AlertDescription className="text-red-200 text-sm">{error}</AlertDescription>
              </Alert>
            )}

            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Username Field */}
              <div className="space-y-2">
                <Label htmlFor="username" className="text-zinc-300 text-sm font-medium flex items-center gap-2">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" />
                  </svg>
                  Username
                </Label>
                <div className="relative">
                  <Input
                    id="username"
                    type="text"
                    value={username}
                    onChange={(e) => {
                      setUsername(e.target.value);
                      if (usernameError) setUsernameError('');
                    }}
                    onFocus={() => setFocusedField('username')}
                    onBlur={handleUsernameBlur}
                    placeholder="your.username"
                    disabled={loading}
                    className={`
                      bg-zinc-800/50 border placeholder-zinc-600 text-white rounded-lg h-11 px-4 py-2.5
                      transition-all duration-200
                      ${focusedField === 'username' 
                        ? 'border-blue-500 ring-2 ring-blue-500/20 shadow-lg shadow-blue-500/10' 
                        : usernameError
                        ? 'border-red-500/50 bg-red-950/20'
                        : 'border-zinc-700/50 hover:border-zinc-600'
                      }
                      focus:outline-none disabled:opacity-50
                    `}
                  />
                </div>
                {usernameError && (
                  <p className="text-red-400 text-xs mt-1 flex items-center gap-1">
                    <span>⚠</span> {usernameError}
                  </p>
                )}
              </div>

              {/* Password Field */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password" className="text-zinc-300 text-sm font-medium flex items-center gap-2">
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                    </svg>
                    Password
                  </Label>
                  <a href="#" className="text-xs text-blue-400 hover:text-blue-300 transition-colors">
                    Forgot?
                  </a>
                </div>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      if (passwordError) setPasswordError('');
                    }}
                    onFocus={() => setFocusedField('password')}
                    onBlur={handlePasswordBlur}
                    placeholder="••••••••"
                    disabled={loading}
                    className={`
                      bg-zinc-800/50 border placeholder-zinc-600 text-white rounded-lg h-11 px-4 py-2.5 pr-12
                      transition-all duration-200
                      ${focusedField === 'password' 
                        ? 'border-blue-500 ring-2 ring-blue-500/20 shadow-lg shadow-blue-500/10' 
                        : passwordError
                        ? 'border-red-500/50 bg-red-950/20'
                        : 'border-zinc-700/50 hover:border-zinc-600'
                      }
                      focus:outline-none disabled:opacity-50
                    `}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    disabled={loading}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors disabled:opacity-50"
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
                {passwordError && (
                  <p className="text-red-400 text-xs mt-1 flex items-center gap-1">
                    <span>⚠</span> {passwordError}
                  </p>
                )}
              </div>

              {/* Sign In Button */}
              <Button
                type="submit"
                disabled={loading}
                className="
                  w-full h-11 rounded-lg font-semibold text-white
                  bg-gradient-to-r from-blue-600 to-blue-700 
                  hover:from-blue-700 hover:to-blue-800
                  shadow-lg shadow-blue-500/25
                  hover:shadow-xl hover:shadow-blue-500/40
                  transition-all duration-300
                  disabled:opacity-50 disabled:cursor-not-allowed
                  group
                "
              >
                {loading ? (
                  <span className="flex items-center gap-2 justify-center">
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                    Authenticating...
                  </span>
                ) : (
                  'Sign In'
                )}
              </Button>
            </form>

            {/* Divider */}
            {/*
            <div className="my-8 flex items-center gap-3">
              <Separator className="bg-zinc-700/50" />
              <span className="text-xs text-zinc-500 whitespace-nowrap">Or continue with</span>
              <Separator className="bg-zinc-700/50" />
            </div>
            */}

            {/* Social Login */}
            {/* <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                disabled={loading}
                className="
                  h-10 rounded-lg border border-zinc-700/50 bg-zinc-800/30 hover:bg-zinc-800/60
                  text-zinc-300 font-medium text-sm
                  transition-colors duration-200
                  disabled:opacity-50 flex items-center justify-center gap-2
                "
              >
                <Mail size={16} />
                <span className="hidden sm:inline">Google</span>
              </button>
              <button
                type="button"
                disabled={loading}
                className="
                  h-10 rounded-lg border border-zinc-700/50 bg-zinc-800/30 hover:bg-zinc-800/60
                  text-zinc-300 font-medium text-sm
                  transition-colors duration-200
                  disabled:opacity-50 flex items-center justify-center gap-2
                "
              >
                <Github size={16} />
                <span className="hidden sm:inline">GitHub</span>
              </button>
            </div> */}

            {/* Footer */}
            <p className="text-center text-xs text-zinc-500 mt-8">
              Protected by industry-standard encryption & security protocols
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
