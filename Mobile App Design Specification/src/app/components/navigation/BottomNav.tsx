import { Trophy, Users, MessageCircle, Sparkles, Home } from "lucide-react";
import { Link, useLocation } from "react-router";
import { motion } from "motion/react";
import { cn } from "../ui/utils";

const navItems = [
  { icon: Home, label: 'Home', path: '/', type: 'home' as const },
  { icon: Trophy, label: 'Tournaments', path: '/tournaments', type: 'normal' as const },
  { icon: Users, label: 'Clubs', path: '/clubs', type: 'normal' as const },
  { icon: MessageCircle, label: 'Chats', path: '/chats', type: 'normal' as const },
  { icon: Sparkles, label: 'AI', path: '/chats/ai-assistant', type: 'normal' as const },
];

export function BottomNav() {
  const location = useLocation();

  // Hide BottomNav on auth page
  if (location.pathname === '/auth') {
    return null;
  }

  return (
    <motion.nav 
      initial={{ y: 100 }}
      animate={{ y: 0 }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-background/80 backdrop-blur-xl border-t border-border"
    >
      <div className="flex items-center justify-around h-20 px-2">
        {navItems.map((item) => {
          // Special logic for different nav items
          let isActive = false;
          
          if (item.type === 'home') {
            // Home - active only on root path
            isActive = location.pathname === '/';
          } else if (item.path === '/tournaments') {
            // Tournaments - active on /tournaments and /tournaments/*
            isActive = location.pathname === '/tournaments' || location.pathname.startsWith('/tournaments/');
          } else if (item.path === '/chats/ai-assistant') {
            // AI Assistant - exact match only
            isActive = location.pathname === '/chats/ai-assistant';
          } else if (item.path === '/chats') {
            // Chats - exclude AI Assistant path
            isActive = location.pathname === '/chats' || (location.pathname.startsWith('/chats/') && location.pathname !== '/chats/ai-assistant');
          } else {
            // Other items - exact match or starts with path
            isActive = location.pathname === item.path || location.pathname.startsWith(item.path + '/');
          }
          
          return (
            <Link
              key={item.path}
              to={item.path}
              className="flex flex-col items-center justify-center flex-1 gap-1 relative"
            >
              <div className={cn(
                "relative p-2 rounded-2xl transition-all duration-200",
                isActive && "bg-gradient-to-br from-[var(--brand-primary)] to-[var(--brand-purple)]"
              )}>
                <item.icon 
                  className={cn(
                    "w-6 h-6 transition-colors",
                    isActive ? "text-white" : "text-muted-foreground"
                  )} 
                />
                {isActive && (
                  <motion.div
                    layoutId="activeTab"
                    className="absolute inset-0 rounded-2xl bg-gradient-to-br from-[var(--brand-primary)] to-[var(--brand-purple)]"
                    style={{ zIndex: -1 }}
                    transition={{ type: "spring", stiffness: 380, damping: 30 }}
                  />
                )}
              </div>
              <span className={cn(
                "text-xs font-medium transition-colors",
                isActive ? "text-foreground" : "text-muted-foreground"
              )}>
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </motion.nav>
  );
}