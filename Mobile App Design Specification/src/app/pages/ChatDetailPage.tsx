import { ArrowLeft, Send, Smile } from "lucide-react";
import { Link, useParams } from "react-router";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { useState } from "react";
import { motion } from "motion/react";

export function ChatDetailPage() {
  const { id } = useParams();
  const [message, setMessage] = useState("");

  const messages = [
    { id: 1, user: "Sarah J.", avatar: "SJ", message: "Hey everyone! Excited for tomorrow's tournament!", time: "10:30 AM", isMe: false },
    { id: 2, user: "You", avatar: "AM", message: "Same here! What time should we arrive?", time: "10:32 AM", isMe: true },
    { id: 3, user: "Mike T.", avatar: "MT", message: "Check-in starts at 8:30 AM. See you there! 🎾", time: "10:35 AM", isMe: false },
  ];

  return (
    <div className="flex flex-col h-screen max-w-md mx-auto bg-background">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-background/95 backdrop-blur-lg border-b border-border p-4">
        <div className="flex items-center gap-3">
          <Link to="/chats">
            <Button variant="ghost" size="icon" className="rounded-full">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div className="flex-1">
            <h1 className="font-bold">Spring Championship</h1>
            <p className="text-xs text-muted-foreground">124 members</p>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg, index) => (
          <motion.div
            key={msg.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
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
      </div>

      {/* Input */}
      <div className="sticky bottom-0 border-t border-border bg-background p-4">
        <div className="flex gap-2">
          <Button variant="ghost" size="icon" className="rounded-full shrink-0">
            <Smile className="w-5 h-5" />
          </Button>
          <Input
            placeholder="Type a message..."
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
