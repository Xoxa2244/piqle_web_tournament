import { MessageCircle, Users, Trophy, Sparkles } from "lucide-react";
import { Link } from "react-router";
import { motion } from "motion/react";
import { Badge } from "../ui/badge";
import { cn } from "../ui/utils";

interface ChatListItemProps {
  id: string;
  name: string;
  type: 'tournament' | 'club' | 'division' | 'ai';
  lastMessage: string;
  timestamp: string;
  unread: number;
  avatar: string;
}

export function ChatListItem({
  id,
  name,
  type,
  lastMessage,
  timestamp,
  unread,
  avatar
}: ChatListItemProps) {
  const getIcon = () => {
    switch (type) {
      case 'tournament':
        return Trophy;
      case 'club':
        return Users;
      case 'division':
        return MessageCircle;
      case 'ai':
        return Sparkles;
    }
  };

  const Icon = getIcon();
  
  const gradients = {
    tournament: 'from-[var(--brand-primary)] to-[var(--brand-purple)]',
    club: 'from-[var(--brand-accent)] to-[var(--brand-purple)]',
    division: 'from-[var(--brand-secondary)] to-[var(--brand-primary)]',
    ai: 'from-purple-500 via-violet-500 to-indigo-500'
  };

  const isAI = type === 'ai';

  return (
    <Link to={`/chats/${id}`}>
      <motion.div
        whileHover={{ backgroundColor: 'var(--surface-elevated)' }}
        whileTap={{ scale: 0.99 }}
        className={cn(
          "p-4 transition-colors",
          isAI && "relative overflow-hidden"
        )}
      >
        {/* AI Assistant special background effect */}
        {isAI && (
          <div className="absolute inset-0 bg-gradient-to-r from-purple-500/5 via-violet-500/5 to-indigo-500/5 pointer-events-none" />
        )}
        
        <div className="flex items-start gap-3 relative">
          {/* Avatar */}
          <div className={cn(
            "w-12 h-12 rounded-full shrink-0 flex items-center justify-center font-bold text-sm relative",
            `bg-gradient-to-br ${gradients[type]}`,
            isAI && "shadow-lg shadow-purple-500/20"
          )}>
            {isAI ? (
              <Sparkles className="w-6 h-6 text-white" />
            ) : (
              <span className="text-white">{avatar}</span>
            )}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between mb-1">
              <div className="flex items-center gap-2">
                <h4 className={cn(
                  "font-semibold truncate",
                  isAI && "bg-gradient-to-r from-purple-600 to-indigo-600 dark:from-purple-400 dark:to-indigo-400 bg-clip-text text-transparent"
                )}>
                  {name}
                </h4>
                {!isAI && <Icon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
              </div>
              <span className="text-xs text-muted-foreground shrink-0 ml-2">
                {timestamp}
              </span>
            </div>
            
            <div className="flex items-center justify-between">
              <p className={cn(
                "text-sm truncate",
                unread > 0 ? "font-medium text-foreground" : "text-muted-foreground"
              )}>
                {lastMessage}
              </p>
              {unread > 0 && (
                <Badge className="ml-2 shrink-0 bg-[var(--brand-accent)] text-white border-0 w-5 h-5 p-0 flex items-center justify-center rounded-full text-xs">
                  {unread}
                </Badge>
              )}
            </div>
          </div>
        </div>
      </motion.div>
    </Link>
  );
}