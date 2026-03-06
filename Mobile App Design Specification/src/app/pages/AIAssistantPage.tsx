import { ArrowLeft, Send, Sparkles, Lightbulb, Info, Zap } from "lucide-react";
import { Link } from "react-router";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";

interface Message {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  time: string;
}

const suggestedQuestions = [
  { icon: Lightbulb, text: "How do I register for a tournament?" },
  { icon: Info, text: "What are pickleball scoring rules?" },
  { icon: Zap, text: "Tips for improving my game" },
];

export function AIAssistantPage() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 1,
      role: 'assistant',
      content: "Hi! I'm your Piqle AI Assistant 🎾✨\n\nI'm here to help you with:\n• Tournament registration & details\n• Pickleball rules & scoring\n• Finding clubs & leagues\n• Game improvement tips\n• Match scheduling\n• And much more!\n\nHow can I assist you today?",
      time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
    }
  ]);
  const [inputMessage, setInputMessage] = useState("");
  const [isTyping, setIsTyping] = useState(false);

  const handleSend = () => {
    if (!inputMessage.trim()) return;

    const newMessage: Message = {
      id: messages.length + 1,
      role: 'user',
      content: inputMessage,
      time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
    };

    setMessages(prev => [...prev, newMessage]);
    setInputMessage("");
    
    // Simulate AI response
    setIsTyping(true);
    setTimeout(() => {
      const aiResponse: Message = {
        id: messages.length + 2,
        role: 'assistant',
        content: getAIResponse(inputMessage),
        time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
      };
      setMessages(prev => [...prev, aiResponse]);
      setIsTyping(false);
    }, 1500);
  };

  const handleSuggestedQuestion = (question: string) => {
    setInputMessage(question);
  };

  const getAIResponse = (question: string): string => {
    const lowerQ = question.toLowerCase();
    
    if (lowerQ.includes('register') || lowerQ.includes('registration')) {
      return "To register for a tournament:\n\n1. Browse tournaments on the Home or Tournaments tab\n2. Tap on a tournament you're interested in\n3. Click the 'Register Now' button\n4. Select your skill level and division\n5. Complete payment\n\nYou'll receive a confirmation email once registered! 🎉";
    }
    
    if (lowerQ.includes('scoring') || lowerQ.includes('rules') || lowerQ.includes('score')) {
      return "Pickleball scoring basics:\n\n• Games are typically played to 11 points (win by 2)\n• Only the serving team can score points\n• Serve must be underhand and diagonal\n• Both players on a team serve before a side out\n• The two-bounce rule: ball must bounce once on each side before volleying\n\nWant more detailed rules? Let me know! 🎾";
    }
    
    if (lowerQ.includes('tips') || lowerQ.includes('improve') || lowerQ.includes('better')) {
      return "Here are some tips to improve your pickleball game:\n\n🎯 Focus on placement over power\n🏃‍♂️ Work on court positioning - stay ready at the kitchen line\n🎾 Practice your third shot drop\n👀 Keep your eye on the ball\n🤝 Communicate with your partner\n💪 Build consistency before adding power\n\nConsider joining a local club for regular practice! Check the Clubs tab to find one near you.";
    }
    
    if (lowerQ.includes('club') || lowerQ.includes('find')) {
      return "You can find pickleball clubs in the Clubs tab! 🏛️\n\nBrowse by location, check club ratings, view facilities, and read reviews from other players. Many clubs offer:\n\n• Regular practice sessions\n• Skill-based leagues\n• Social events\n• Professional coaching\n\nTap on any club to see details and join! 🎉";
    }
    
    return "That's a great question! I can help you with:\n\n• Tournament registration and details\n• Pickleball rules and scoring\n• Finding clubs and leagues\n• Game improvement tips\n• Match scheduling\n• Payment and refund policies\n\nCould you provide more details about what you'd like to know? 🤔";
  };

  return (
    <div className="flex flex-col h-screen max-w-md mx-auto bg-background">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 pt-6 pb-24">
        <AnimatePresence>
          {messages.map((msg, index) => (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
            >
              {msg.role === 'assistant' && (
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 via-violet-500 to-indigo-500 flex items-center justify-center text-white shrink-0 shadow-lg">
                  <Sparkles className="w-4 h-4" />
                </div>
              )}
              <div className={`flex-1 max-w-[80%] ${msg.role === 'user' ? 'flex flex-col items-end' : ''}`}>
                <div className={`rounded-2xl px-4 py-3 ${
                  msg.role === 'user'
                    ? 'bg-gradient-to-r from-[var(--brand-primary)] to-[var(--brand-purple)] text-white' 
                    : 'bg-gradient-to-br from-purple-50 to-violet-50 dark:from-purple-950/30 dark:to-violet-950/30 border border-purple-200/50 dark:border-purple-800/50'
                }`}>
                  <p className="text-sm whitespace-pre-line leading-relaxed">{msg.content}</p>
                </div>
                <p className="text-xs text-muted-foreground mt-1 px-1">{msg.time}</p>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {/* Typing indicator */}
        {isTyping && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex gap-3"
          >
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 via-violet-500 to-indigo-500 flex items-center justify-center text-white shrink-0">
              <Sparkles className="w-4 h-4" />
            </div>
            <div className="bg-gradient-to-br from-purple-50 to-violet-50 dark:from-purple-950/30 dark:to-violet-950/30 border border-purple-200/50 dark:border-purple-800/50 rounded-2xl px-4 py-3">
              <div className="flex gap-1">
                <motion.div
                  className="w-2 h-2 bg-purple-400 rounded-full"
                  animate={{ y: [0, -6, 0] }}
                  transition={{ duration: 0.6, repeat: Infinity, delay: 0 }}
                />
                <motion.div
                  className="w-2 h-2 bg-violet-400 rounded-full"
                  animate={{ y: [0, -6, 0] }}
                  transition={{ duration: 0.6, repeat: Infinity, delay: 0.2 }}
                />
                <motion.div
                  className="w-2 h-2 bg-indigo-400 rounded-full"
                  animate={{ y: [0, -6, 0] }}
                  transition={{ duration: 0.6, repeat: Infinity, delay: 0.4 }}
                />
              </div>
            </div>
          </motion.div>
        )}

        {/* Suggested Questions (show only at start) */}
        {messages.length === 1 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="pt-4"
          >
            <p className="text-xs text-muted-foreground mb-3 px-1">Suggested questions:</p>
            <div className="space-y-2">
              {suggestedQuestions.map((question, i) => (
                <motion.button
                  key={i}
                  onClick={() => handleSuggestedQuestion(question.text)}
                  className="w-full flex items-center gap-3 p-3 rounded-xl bg-gradient-to-br from-purple-50 to-violet-50 dark:from-purple-950/20 dark:to-violet-950/20 border border-purple-200/50 dark:border-purple-800/30 hover:border-purple-300 dark:hover:border-purple-700 transition-all"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-violet-500 flex items-center justify-center text-white shrink-0">
                    <question.icon className="w-4 h-4" />
                  </div>
                  <span className="text-sm text-left">{question.text}</span>
                </motion.button>
              ))}
            </div>
          </motion.div>
        )}
      </div>

      {/* Input */}
      <div className="sticky bottom-0 border-t border-border bg-background/95 backdrop-blur-lg p-4">
        <div className="flex gap-2">
          <Input
            placeholder="Ask me anything..."
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            className="flex-1 rounded-full bg-[var(--input-background)] border-border"
          />
          <Button 
            size="icon" 
            onClick={handleSend}
            disabled={!inputMessage.trim() || isTyping}
            className="rounded-full bg-gradient-to-r from-purple-500 via-violet-500 to-indigo-500 hover:from-purple-600 hover:via-violet-600 hover:to-indigo-600 shrink-0 shadow-lg"
          >
            <Send className="w-5 h-5" />
          </Button>
        </div>
      </div>
    </div>
  );
}