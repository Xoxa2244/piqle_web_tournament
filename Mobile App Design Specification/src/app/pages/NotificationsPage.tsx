import { Bell, Trophy, Users, MessageCircle, Star, CheckCheck, X } from "lucide-react";
import { useState } from "react";
import { Button } from "../components/ui/button";
import { motion, AnimatePresence } from "motion/react";
import { Link } from "react-router";

interface Notification {
  id: number;
  type: "tournament" | "club" | "message" | "achievement";
  icon: any;
  title: string;
  message: string;
  time: string;
  read: boolean;
  link?: string;
}

const initialNotifications: Notification[] = [
  {
    id: 1,
    type: "tournament",
    icon: Trophy,
    title: "Tournament Registration Confirmed",
    message: "You're registered for Summer Championship 2026",
    time: "5m ago",
    read: false,
    link: "/tournaments/1"
  },
  {
    id: 2,
    type: "message",
    icon: MessageCircle,
    title: "New Message from Sarah",
    message: "Great game today! Want to practice tomorrow?",
    time: "1h ago",
    read: false,
    link: "/chats/1"
  },
  {
    id: 3,
    type: "achievement",
    icon: Star,
    title: "Achievement Unlocked! 🎉",
    message: "You've won 5 tournaments! Keep it up!",
    time: "3h ago",
    read: false,
  },
  {
    id: 4,
    type: "club",
    icon: Users,
    title: "Club Event Tomorrow",
    message: "Downtown Pickleball Club - Saturday Social at 10 AM",
    time: "5h ago",
    read: true,
    link: "/clubs/1"
  },
  {
    id: 5,
    type: "tournament",
    icon: Trophy,
    title: "Match Schedule Updated",
    message: "Your first match is scheduled for 2:00 PM",
    time: "1d ago",
    read: true,
    link: "/tournaments/1/scoreboard"
  },
];

export function NotificationsPage() {
  const [notifications, setNotifications] = useState(initialNotifications);

  const unreadCount = notifications.filter(n => !n.read).length;

  const handleMarkAllRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  };

  const handleMarkRead = (id: number) => {
    setNotifications(prev => prev.map(n => 
      n.id === id ? { ...n, read: true } : n
    ));
  };

  const handleDelete = (id: number) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  const getIconColor = (type: string) => {
    switch (type) {
      case "tournament":
        return "from-yellow-500 to-orange-500";
      case "club":
        return "from-blue-500 to-indigo-500";
      case "message":
        return "from-green-500 to-emerald-500";
      case "achievement":
        return "from-purple-500 to-pink-500";
      default:
        return "from-[var(--brand-primary)] to-[var(--brand-purple)]";
    }
  };

  return (
    <div className="flex flex-col h-screen max-w-md mx-auto bg-background">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-background/80 backdrop-blur-xl border-b border-border">
        <div className="flex items-center justify-between px-4 h-14">
          <div className="flex items-center gap-3">
            <Link to="/">
              <Button variant="ghost" size="icon" className="rounded-full">
                <X className="w-5 h-5" />
              </Button>
            </Link>
            <div>
              <h1 className="text-xl tracking-tight bg-gradient-to-r from-[var(--brand-primary)] to-[var(--brand-purple)] bg-clip-text text-transparent">
                Notifications
              </h1>
              {unreadCount > 0 && (
                <p className="text-xs text-muted-foreground">{unreadCount} unread</p>
              )}
            </div>
          </div>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleMarkAllRead}
              className="text-xs"
            >
              <CheckCheck className="w-4 h-4 mr-1" />
              Mark all read
            </Button>
          )}
        </div>
      </div>

      {/* Notifications List */}
      <div className="flex-1 overflow-y-auto pb-24">
        {notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center p-8">
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-[var(--brand-primary)]/10 to-[var(--brand-purple)]/10 flex items-center justify-center mb-4">
              <Bell className="w-10 h-10 text-muted-foreground" />
            </div>
            <h3 className="font-semibold mb-2">No notifications</h3>
            <p className="text-sm text-muted-foreground">
              You're all caught up! Check back later for updates.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            <AnimatePresence>
              {notifications.map((notification) => (
                <motion.div
                  key={notification.id}
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className={`relative group ${!notification.read ? 'bg-[var(--brand-primary)]/5' : ''}`}
                >
                  {notification.link ? (
                    <Link
                      to={notification.link}
                      onClick={() => handleMarkRead(notification.id)}
                      className="block"
                    >
                      <NotificationItem notification={notification} onDelete={handleDelete} />
                    </Link>
                  ) : (
                    <div onClick={() => handleMarkRead(notification.id)}>
                      <NotificationItem notification={notification} onDelete={handleDelete} />
                    </div>
                  )}
                  {!notification.read && (
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 w-2 h-2 bg-[var(--brand-primary)] rounded-full" />
                  )}
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
}

function NotificationItem({ notification, onDelete }: { notification: Notification; onDelete: (id: number) => void }) {
  const getIconColor = (type: string) => {
    switch (type) {
      case "tournament":
        return "from-yellow-500 to-orange-500";
      case "club":
        return "from-blue-500 to-indigo-500";
      case "message":
        return "from-green-500 to-emerald-500";
      case "achievement":
        return "from-purple-500 to-pink-500";
      default:
        return "from-[var(--brand-primary)] to-[var(--brand-purple)]";
    }
  };

  return (
    <div className="flex items-start gap-3 p-4 pl-8 hover:bg-[var(--card-background)] transition-colors">
      <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${getIconColor(notification.type)} flex items-center justify-center text-white shrink-0`}>
        <notification.icon className="w-5 h-5" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm mb-1">{notification.title}</p>
        <p className="text-sm text-muted-foreground line-clamp-2">{notification.message}</p>
        <p className="text-xs text-muted-foreground mt-1">{notification.time}</p>
      </div>
      <Button
        variant="ghost"
        size="icon"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onDelete(notification.id);
        }}
        className="w-8 h-8 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
      >
        <X className="w-4 h-4" />
      </Button>
    </div>
  );
}
