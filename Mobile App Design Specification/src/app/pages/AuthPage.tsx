import { useState } from "react";
import { motion } from "motion/react";
import { Mail, Lock, Eye, EyeOff } from "lucide-react";
import { useNavigate } from "react-router";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { useTheme } from "../contexts/ThemeContext";

export function AuthPage() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const navigate = useNavigate();
  const { theme } = useTheme();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Mock authentication - переход в приложение
    navigate('/tournaments');
  };

  const handleGoogleSignIn = () => {
    // Mock Google auth
    navigate('/tournaments');
  };

  const isDark = theme === 'dark';

  return (
    <div className={`min-h-screen ${isDark ? 'bg-[#000]' : 'bg-[#F5F5F7]'} relative overflow-hidden flex flex-col`}>
      {/* Gradient background */}
      <div className={`absolute inset-0 ${
        isDark 
          ? 'bg-gradient-to-br from-[#28CD41]/20 via-[#000] to-[#52E068]/10'
          : 'bg-gradient-to-br from-[#28CD41]/10 via-[#F5F5F7] to-[#52E068]/5'
      }`} />
      <div className={`absolute top-0 left-0 w-96 h-96 ${isDark ? 'bg-[#28CD41]/30' : 'bg-[#28CD41]/20'} rounded-full blur-[120px]`} />
      <div className={`absolute bottom-0 right-0 w-96 h-96 ${isDark ? 'bg-[#52E068]/20' : 'bg-[#52E068]/15'} rounded-full blur-[100px]`} />

      {/* Content */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-6 py-12">
        {/* Logo & Title */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-center mb-12"
        >
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="inline-flex items-center justify-center w-24 h-24 rounded-3xl bg-gradient-to-br from-[#28CD41] to-[#52E068] mb-6 shadow-2xl shadow-[#28CD41]/50"
          >
            <div className="text-5xl font-bold text-white">P</div>
          </motion.div>
          <h1 className={`text-5xl font-bold ${
            isDark 
              ? 'bg-gradient-to-r from-white to-white/80 bg-clip-text text-transparent'
              : 'bg-gradient-to-r from-black to-black/80 bg-clip-text text-transparent'
          } mb-3`}>
            Piqle
          </h1>
          <p className={`text-lg ${isDark ? 'text-white/60' : 'text-black/60'}`}>
            Your pickleball journey starts here
          </p>
        </motion.div>

        {/* Auth Form */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="w-full max-w-md"
        >
          {/* Mode Toggle */}
          <div className={`flex gap-2 p-1 mb-8 rounded-full ${
            isDark 
              ? 'bg-white/5 border-white/10' 
              : 'bg-black/5 border-black/10'
          } backdrop-blur-xl border`}>
            <button
              onClick={() => setMode('signin')}
              className={`flex-1 py-3 px-6 rounded-full font-medium transition-all ${
                mode === 'signin'
                  ? 'bg-gradient-to-r from-[#28CD41] to-[#52E068] text-white shadow-lg shadow-[#28CD41]/30'
                  : isDark 
                    ? 'text-white/60 hover:text-white/80'
                    : 'text-black/60 hover:text-black/80'
              }`}
            >
              Sign In
            </button>
            <button
              onClick={() => setMode('signup')}
              className={`flex-1 py-3 px-6 rounded-full font-medium transition-all ${
                mode === 'signup'
                  ? 'bg-gradient-to-r from-[#28CD41] to-[#52E068] text-white shadow-lg shadow-[#28CD41]/30'
                  : isDark 
                    ? 'text-white/60 hover:text-white/80'
                    : 'text-black/60 hover:text-black/80'
              }`}
            >
              Sign Up
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Email */}
            <div>
              <label 
                htmlFor="email" 
                className={`block text-sm font-medium mb-2 ml-1 ${
                  isDark ? 'text-white/80' : 'text-black/80'
                }`}
              >
                Email
              </label>
              <div className="relative">
                <Mail className={`absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 ${
                  isDark ? 'text-white/40' : 'text-black/40'
                }`} />
                <Input
                  id="email"
                  type="email"
                  placeholder="your@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={`pl-12 h-14 rounded-2xl ${
                    isDark 
                      ? 'bg-white/5 border-white/10 text-white placeholder:text-white/30 focus:bg-white/10 focus:border-[#28CD41]/50'
                      : 'bg-white/80 border-black/10 text-black placeholder:text-black/30 focus:bg-white focus:border-[#28CD41]/50'
                  } transition-all`}
                  required
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label 
                htmlFor="password" 
                className={`block text-sm font-medium mb-2 ml-1 ${
                  isDark ? 'text-white/80' : 'text-black/80'
                }`}
              >
                Password
              </label>
              <div className="relative">
                <Lock className={`absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 ${
                  isDark ? 'text-white/40' : 'text-black/40'
                }`} />
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={`pl-12 pr-12 h-14 rounded-2xl ${
                    isDark 
                      ? 'bg-white/5 border-white/10 text-white placeholder:text-white/30 focus:bg-white/10 focus:border-[#28CD41]/50'
                      : 'bg-white/80 border-black/10 text-black placeholder:text-black/30 focus:bg-white focus:border-[#28CD41]/50'
                  } transition-all`}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className={`absolute right-4 top-1/2 -translate-y-1/2 transition-colors ${
                    isDark 
                      ? 'text-white/40 hover:text-white/60'
                      : 'text-black/40 hover:text-black/60'
                  }`}
                >
                  {showPassword ? (
                    <EyeOff className="w-5 h-5" />
                  ) : (
                    <Eye className="w-5 h-5" />
                  )}
                </button>
              </div>
            </div>

            {/* Forgot Password */}
            {mode === 'signin' && (
              <div className="text-right">
                <button
                  type="button"
                  className="text-sm text-[#28CD41] hover:text-[#52E068] transition-colors"
                >
                  Forgot password?
                </button>
              </div>
            )}

            {/* Submit Button */}
            <Button
              type="submit"
              className="w-full h-14 rounded-2xl text-base font-semibold bg-gradient-to-r from-[#28CD41] to-[#52E068] hover:shadow-xl hover:shadow-[#28CD41]/30 transition-all text-white border-0"
            >
              {mode === 'signin' ? 'Sign In' : 'Create Account'}
            </Button>
          </form>

          {/* Google Sign In */}
          <button
            onClick={handleGoogleSignIn}
            className={`w-full h-14 rounded-2xl backdrop-blur-xl border transition-all flex items-center justify-center gap-3 font-medium group mt-4 ${
              isDark 
                ? 'bg-white/5 border-white/10 hover:bg-white/10 text-white'
                : 'bg-white/80 border-black/10 hover:bg-white text-black'
            }`}
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path
                fill="#EA4335"
                d="M5.26620003,9.76452941 C6.19878754,6.93863203 8.85444915,4.90909091 12,4.90909091 C13.6909091,4.90909091 15.2181818,5.50909091 16.4181818,6.49090909 L19.9090909,3 C17.7818182,1.14545455 15.0545455,0 12,0 C7.27006974,0 3.1977497,2.69829785 1.23999023,6.65002441 L5.26620003,9.76452941 Z"
              />
              <path
                fill="#34A853"
                d="M16.0407269,18.0125889 C14.9509167,18.7163016 13.5660892,19.0909091 12,19.0909091 C8.86648613,19.0909091 6.21911939,17.076871 5.27698177,14.2678769 L1.23746264,17.3349879 C3.19279051,21.2936293 7.26500293,24 12,24 C14.9328362,24 17.7353462,22.9573905 19.834192,20.9995801 L16.0407269,18.0125889 Z"
              />
              <path
                fill="#4A90E2"
                d="M19.834192,20.9995801 C22.0291676,18.9520994 23.4545455,15.903663 23.4545455,12 C23.4545455,11.2909091 23.3454545,10.5272727 23.1818182,9.81818182 L12,9.81818182 L12,14.4545455 L18.4363636,14.4545455 C18.1187732,16.013626 17.2662994,17.2212117 16.0407269,18.0125889 L19.834192,20.9995801 Z"
              />
              <path
                fill="#FBBC05"
                d="M5.27698177,14.2678769 C5.03832634,13.556323 4.90909091,12.7937589 4.90909091,12 C4.90909091,11.2182781 5.03443647,10.4668121 5.26620003,9.76452941 L1.23999023,6.65002441 C0.43658717,8.26043162 0,10.0753848 0,12 C0,13.9195484 0.444780743,15.7301709 1.23746264,17.3349879 L5.27698177,14.2678769 Z"
              />
            </svg>
            <span className={isDark ? 'group-hover:text-white/90' : 'group-hover:text-black/90'}>Continue with Google</span>
          </button>

          {/* Terms */}
          {mode === 'signup' && (
            <p className={`text-xs text-center mt-6 leading-relaxed ${
              isDark ? 'text-white/40' : 'text-black/40'
            }`}>
              By signing up, you agree to our{' '}
              <a href="#" className="text-[#28CD41] hover:text-[#52E068] transition-colors">
                Terms of Service
              </a>
              {' '}and{' '}
              <a href="#" className="text-[#28CD41] hover:text-[#52E068] transition-colors">
                Privacy Policy
              </a>
            </p>
          )}
        </motion.div>
      </div>
    </div>
  );
}
