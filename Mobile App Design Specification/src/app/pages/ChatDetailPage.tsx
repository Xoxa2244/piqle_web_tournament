import { ArrowLeft, Send, Smile, Hash, Trophy, Users, ChevronDown } from "lucide-react";
import { Link, useParams } from "react-router";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Badge } from "../components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../components/ui/dropdown-menu";

type ChatTopic = {
  id: string;
  name: string;
  icon: "trophy" | "hash";
  type: "general" | "division";
  unreadCount?: number;
  memberCount: number;
};

type Message = {
  id: number;
  user: string;
  avatar: string;
  message: string;
  time: string;
  isMe: boolean;
};

export function ChatDetailPage() {
  const { id } = useParams();
  const [message, setMessage] = useState("");
  const [selectedTopic, setSelectedTopic] = useState("general");

  // Mock topics for tournament chat
  const topics: ChatTopic[] = [
    { id: "general", name: "General Chat", icon: "trophy", type: "general", memberCount: 124 },
    { id: "open", name: "Open Division", icon: "hash", type: "division", unreadCount: 3, memberCount: 24 },
    { id: "4.0", name: "4.0+ Division", icon: "hash", type: "division", memberCount: 18 },
    { id: "3.5", name: "3.5 Division", icon: "hash", type: "division", unreadCount: 1, memberCount: 32 },
    { id: "3.0", name: "3.0 Division", icon: "hash", type: "division", memberCount: 28 },
  ];

  // Mock messages data - different for each topic
  const messagesData: Record<string, Message[]> = {
    general: [
      { id: 1, user: "Sarah J.", avatar: "SJ", message: "Hey everyone! Excited for tomorrow's tournament!", time: "10:30 AM", isMe: false },
      { id: 2, user: "You", avatar: "AM", message: "Same here! What time should we arrive?", time: "10:32 AM", isMe: true },
      { id: 3, user: "Mike T.", avatar: "MT", message: "Check-in starts at 8:30 AM. See you there! 🎾", time: "10:35 AM", isMe: false },
      { id: 4, user: "Tournament Admin", avatar: "TA", message: "Weather forecast looks perfect! ☀️", time: "10:40 AM", isMe: false },
    ],
    open: [
      { id: 1, user: "Alex R.", avatar: "AR", message: "Good luck everyone in the Open division!", time: "9:15 AM", isMe: false },
      { id: 2, user: "Jessica M.", avatar: "JM", message: "Who's ready for some intense matches? 🔥", time: "9:20 AM", isMe: false },
      { id: 3, user: "You", avatar: "AM", message: "Let's bring our A-game!", time: "9:22 AM", isMe: true },
    ],
    "4.0": [
      { id: 1, user: "Tom W.", avatar: "TW", message: "4.0+ players, let's warm up together at 8:00 AM", time: "Yesterday", isMe: false },
      { id: 2, user: "Emma S.", avatar: "ES", message: "Sounds good! See you there", time: "Yesterday", isMe: false },
    ],
    "3.5": [
      { id: 1, user: "Chris L.", avatar: "CL", message: "Anyone want to practice serves before the tournament?", time: "11:00 AM", isMe: false },
      { id: 2, user: "Nina P.", avatar: "NP", message: "I'm in! What time?", time: "11:05 AM", isMe: false },
    ],
    "3.0": [
      { id: 1, user: "David K.", avatar: "DK", message: "First tournament, pretty nervous 😅", time: "Yesterday", isMe: false },
      { id: 2, user: "Rachel G.", avatar: "RG", message: "Don't worry, everyone is super friendly! You'll do great", time: "Yesterday", isMe: false },
    ],
  };

  const currentTopic = topics.find(t => t.id === selectedTopic) || topics[0];
  const messages = messagesData[selectedTopic] || [];

  const getTopicIcon = (icon: ChatTopic["icon"]) => {
    switch (icon) {
      case "trophy":
        return <Trophy className="w-4 h-4" />;
      case "hash":
        return <Hash className="w-4 h-4" />;
    }
  };

  return (
    <div className="flex flex-col h-screen max-w-md mx-auto bg-background">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-background/95 backdrop-blur-lg border-b border-border">
        <div className="p-4">
          <div className="flex items-center gap-3">
            <Link to="/chats">
              <Button variant="ghost" size="icon" className="rounded-full">
                <ArrowLeft className="w-5 h-5" />
              </Button>
            </Link>
            <div className="flex-1">
              <h1 className="font-bold">Spring Championship</h1>
              <p className="text-xs text-muted-foreground">Tournament Chat</p>
            </div>
          </div>
        </div>

        {/* Topics Bar */}
        <div className="px-4 pb-3">
          <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-2">
            {topics.slice(0, 3).map((topic) => (
              <button
                key={topic.id}
                onClick={() => setSelectedTopic(topic.id)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-full whitespace-nowrap transition-all shrink-0 ${
                  selectedTopic === topic.id
                    ? 'bg-gradient-to-r from-[var(--brand-primary)] to-[var(--brand-purple)] text-white'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
                }`}
              >
                {getTopicIcon(topic.icon)}
                <span className="text-sm font-medium">{topic.name}</span>
                {topic.unreadCount && topic.unreadCount > 0 && selectedTopic !== topic.id && (
                  <Badge className="h-5 min-w-5 px-1.5 bg-destructive text-white text-xs">
                    {topic.unreadCount}
                  </Badge>
                )}
              </button>
            ))}
            
            {/* More Topics Dropdown */}
            {topics.length > 3 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="rounded-full px-3 shrink-0 bg-muted hover:bg-muted/80"
                  >
                    <ChevronDown className="w-4 h-4 mr-1" />
                    More
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  {topics.slice(3).map((topic) => (
                    <DropdownMenuItem
                      key={topic.id}
                      onClick={() => setSelectedTopic(topic.id)}
                      className={selectedTopic === topic.id ? "bg-accent" : ""}
                    >
                      <div className="flex items-center gap-2 flex-1">
                        {getTopicIcon(topic.icon)}
                        <span>{topic.name}</span>
                      </div>
                      {topic.unreadCount && topic.unreadCount > 0 && (
                        <Badge variant="destructive" className="ml-auto h-5 min-w-5 px-1.5 text-xs">
                          {topic.unreadCount}
                        </Badge>
                      )}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>

        {/* Topic Info */}
        <div className="px-4 pb-3 flex items-center gap-2 text-xs text-muted-foreground">
          {getTopicIcon(currentTopic.icon)}
          <span className="font-medium">{currentTopic.name}</span>
          <span>•</span>
          <Users className="w-3 h-3" />
          <span>{currentTopic.memberCount} members</span>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <AnimatePresence mode="wait">
          <motion.div
            key={selectedTopic}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.2 }}
            className="space-y-4"
          >
            {messages.map((msg, index) => (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                className={`flex gap-3 ${msg.isMe ? 'flex-row-reverse' : ''}`}
              >
                {!msg.isMe && (
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[var(--brand-primary)] to-[var(--brand-purple)] flex items-center justify-center text-white text-xs font-bold shrink-0">
                    {msg.avatar}
                  </div>
                )}
                <div className={`flex-1 max-w-[75%] ${msg.isMe ? 'flex flex-col items-end' : ''}`}>
                  {!msg.isMe && <p className="text-xs font-semibold mb-1">{msg.user}</p>}
                  <div className={`rounded-2xl px-4 py-2 ${
                    msg.isMe 
                      ? 'bg-gradient-to-r from-[var(--brand-primary)] to-[var(--brand-purple)] text-white' 
                      : 'bg-[var(--muted)]'
                  }`}>
                    <p className="text-sm">{msg.message}</p>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{msg.time}</p>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Input */}
      <div className="sticky bottom-0 border-t border-border bg-background p-4">
        <div className="flex gap-2">
          <Button variant="ghost" size="icon" className="rounded-full shrink-0">
            <Smile className="w-5 h-5" />
          </Button>
          <Input
            placeholder={`Message ${currentTopic.name}...`}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            className="flex-1 rounded-full bg-[var(--input-background)] border-0"
          />
          <Button size="icon" className="rounded-full bg-gradient-to-r from-[var(--brand-primary)] to-[var(--brand-purple)] shrink-0">
            <Send className="w-5 h-5" />
          </Button>
        </div>
      </div>
    </div>
  );
}