import { Search } from "lucide-react";
import { motion } from "motion/react";
import { Input } from "../components/ui/input";
import { ChatListItem } from "../components/chats/ChatListItem";
import { ThemeToggleCompact } from "../components/ThemeToggle";

const mockChats = [
  {
    id: "1",
    name: "Spring Championship",
    type: "tournament" as const,
    lastMessage: "Good luck everyone! 🎾",
    timestamp: "2m ago",
    unread: 3,
    avatar: "SC"
  },
  {
    id: "2",
    name: "Westside Pickleball Club",
    type: "club" as const,
    lastMessage: "Court 3 available tomorrow at 10am",
    timestamp: "15m ago",
    unread: 0,
    avatar: "WP"
  },
  {
    id: "3",
    name: "4.0+ Division",
    type: "division" as const,
    lastMessage: "Match schedule is out!",
    timestamp: "1h ago",
    unread: 1,
    avatar: "4.0"
  },
  {
    id: "4",
    name: "Valley Pickleball Association",
    type: "club" as const,
    lastMessage: "Thanks for joining us!",
    timestamp: "2h ago",
    unread: 0,
    avatar: "VP"
  },
];

export function ChatsPage() {
  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Theme Toggle - Fixed position */}
      <div className="fixed top-4 right-4 z-50">
        <ThemeToggleCompact />
      </div>

      {/* Header */}
      <div className="sticky top-0 z-40 bg-background/95 backdrop-blur-lg border-b border-border pt-4">
        <div className="px-4 pb-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <Input
              placeholder="Search messages..."
              className="pl-10 bg-[var(--input-background)] border-0 rounded-full h-11"
            />
          </div>
        </div>
      </div>

      {/* Chat List */}
      <div className="divide-y divide-border">
        {mockChats.map((chat, index) => (
          <motion.div
            key={chat.id}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.1 }}
          >
            <ChatListItem {...chat} />
          </motion.div>
        ))}
      </div>
    </div>
  );
}