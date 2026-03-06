import { Bell, Search, Settings } from "lucide-react";
import { Link, useLocation } from "react-router";
import { Button } from "../ui/button";
import { motion } from "motion/react";

export function TopBar() {
  const location = useLocation();
  
  // Hide TopBar on auth page
  if (location.pathname === '/auth') {
    return null;
  }
  
  const getTitle = () => {
    if (location.pathname === '/' || location.pathname.startsWith('/tournaments')) return 'Tournaments';
    if (location.pathname.startsWith('/clubs')) return 'Clubs';
    if (location.pathname.startsWith('/chats')) {
      if (location.pathname === '/chats/ai-assistant') return 'AI Assistant';
      return 'Messages';
    }
    if (location.pathname.startsWith('/profile')) return 'Profile';
    if (location.pathname.startsWith('/organizer')) return 'Organizer';
    if (location.pathname.startsWith('/admin')) return 'Admin';
    if (location.pathname.startsWith('/superadmin')) return 'Superadmin';
    return 'Piqle';
  };

  return (
    <motion.header 
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      className="sticky top-0 z-50 bg-background/80 backdrop-blur-xl border-b border-border"
    >
      <div className="flex items-center justify-between px-4 h-14">
        <h1 className="text-xl tracking-tight bg-gradient-to-r from-[var(--brand-primary)] to-[var(--brand-purple)] bg-clip-text text-transparent">
          {getTitle()}
        </h1>
        <div className="flex items-center gap-1">
          <Link to="/search">
            <Button variant="ghost" size="icon" className="rounded-full">
              <Search className="w-5 h-5" />
            </Button>
          </Link>
          <Link to="/notifications">
            <Button variant="ghost" size="icon" className="rounded-full relative">
              <Bell className="w-5 h-5" />
              <span className="absolute top-2 right-2 w-2 h-2 bg-[var(--brand-accent)] rounded-full" />
            </Button>
          </Link>
          <Link to="/profile">
            <motion.div
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="w-9 h-9 rounded-full bg-gradient-to-br from-[var(--brand-primary)] to-[var(--brand-purple)] flex items-center justify-center text-white font-bold text-sm ml-1 cursor-pointer shadow-md"
            >
              AM
            </motion.div>
          </Link>
        </div>
      </div>
    </motion.header>
  );
}