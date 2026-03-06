import { Moon, Sun } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      onClick={toggleTheme}
      className="relative flex items-center gap-3 w-full p-4 rounded-2xl bg-card hover:bg-muted/50 transition-all duration-300 border border-border group"
      aria-label="Toggle theme"
    >
      <div className="relative w-12 h-12 rounded-xl bg-gradient-to-br from-brand-primary to-brand-purple p-0.5 overflow-hidden">
        <div className="w-full h-full rounded-xl bg-card flex items-center justify-center">
          <div className="relative w-6 h-6">
            <Sun 
              className={`absolute inset-0 w-6 h-6 text-warning transition-all duration-500 ${
                theme === 'light' 
                  ? 'opacity-100 rotate-0 scale-100' 
                  : 'opacity-0 rotate-180 scale-0'
              }`}
            />
            <Moon 
              className={`absolute inset-0 w-6 h-6 text-brand-primary transition-all duration-500 ${
                theme === 'dark' 
                  ? 'opacity-100 rotate-0 scale-100' 
                  : 'opacity-0 -rotate-180 scale-0'
              }`}
            />
          </div>
        </div>
      </div>
      
      <div className="flex-1 text-left">
        <div className="font-semibold text-foreground">
          {theme === 'light' ? 'Light Mode' : 'Dark Mode'}
        </div>
        <div className="text-sm text-muted-foreground">
          {theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme'}
        </div>
      </div>

      <div className={`w-14 h-8 rounded-full relative transition-all duration-300 ${
        theme === 'dark' ? 'bg-gradient-to-r from-brand-primary to-brand-purple' : 'bg-switch-background'
      }`}>
        <div className={`absolute top-1 w-6 h-6 rounded-full bg-white shadow-md transition-all duration-300 ${
          theme === 'dark' ? 'left-7' : 'left-1'
        }`} />
      </div>
    </button>
  );
}

export function ThemeToggleCompact() {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      onClick={toggleTheme}
      className="relative p-3 rounded-xl bg-surface-elevated hover:bg-muted transition-all duration-300"
      aria-label="Toggle theme"
    >
      <div className="relative w-6 h-6">
        <Sun 
          className={`absolute inset-0 w-6 h-6 text-warning transition-all duration-500 ${
            theme === 'light' 
              ? 'opacity-100 rotate-0 scale-100' 
              : 'opacity-0 rotate-180 scale-0'
          }`}
        />
        <Moon 
          className={`absolute inset-0 w-6 h-6 text-brand-primary transition-all duration-500 ${
            theme === 'dark' 
              ? 'opacity-100 rotate-0 scale-100' 
              : 'opacity-0 -rotate-180 scale-0'
          }`}
        />
      </div>
    </button>
  );
}
