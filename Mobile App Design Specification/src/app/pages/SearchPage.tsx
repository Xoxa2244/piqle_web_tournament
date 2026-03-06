import { Search, TrendingUp, Clock, Trophy, Users, MapPin, X } from "lucide-react";
import { useState } from "react";
import { Input } from "../components/ui/input";
import { Button } from "../components/ui/button";
import { motion, AnimatePresence } from "motion/react";
import { Link } from "react-router";

const trendingSearches = [
  { icon: Trophy, text: "Summer Championship 2026", type: "tournament" },
  { icon: Users, text: "Downtown Pickleball Club", type: "club" },
  { icon: MapPin, text: "Tournaments near me", type: "location" },
];

const recentSearches = [
  "Beginner tournaments",
  "Advanced mixed doubles",
  "Weekend leagues",
];

export function SearchPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [recentList, setRecentList] = useState(recentSearches);

  const handleClearRecent = (index: number) => {
    setRecentList(prev => prev.filter((_, i) => i !== index));
  };

  const handleClearAll = () => {
    setRecentList([]);
  };

  return (
    <div className="flex flex-col h-screen max-w-md mx-auto bg-background">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-background/80 backdrop-blur-xl border-b border-border p-4">
        <div className="flex items-center gap-3">
          <Link to="/">
            <Button variant="ghost" size="icon" className="rounded-full shrink-0">
              <X className="w-5 h-5" />
            </Button>
          </Link>
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Search tournaments, clubs, players..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 rounded-full bg-[var(--input-background)]"
              autoFocus
            />
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6 pb-24">
        {!searchQuery ? (
          <>
            {/* Trending Searches */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
            >
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp className="w-4 h-4 text-[var(--brand-primary)]" />
                <h2 className="font-semibold">Trending</h2>
              </div>
              <div className="space-y-2">
                {trendingSearches.map((item, i) => (
                  <motion.button
                    key={i}
                    onClick={() => setSearchQuery(item.text)}
                    className="w-full flex items-center gap-3 p-3 rounded-xl bg-gradient-to-br from-[var(--brand-primary)]/5 to-[var(--brand-purple)]/5 border border-border hover:border-[var(--brand-primary)]/30 transition-all"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[var(--brand-primary)] to-[var(--brand-purple)] flex items-center justify-center text-white shrink-0">
                      <item.icon className="w-5 h-5" />
                    </div>
                    <div className="flex-1 text-left">
                      <p className="text-sm font-medium">{item.text}</p>
                      <p className="text-xs text-muted-foreground capitalize">{item.type}</p>
                    </div>
                  </motion.button>
                ))}
              </div>
            </motion.div>

            {/* Recent Searches */}
            {recentList.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-muted-foreground" />
                    <h2 className="font-semibold">Recent</h2>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleClearAll}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    Clear all
                  </Button>
                </div>
                <div className="space-y-2">
                  <AnimatePresence>
                    {recentList.map((item, i) => (
                      <motion.div
                        key={item}
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="flex items-center gap-3 p-3 rounded-xl bg-[var(--card-background)] border border-border group"
                      >
                        <Clock className="w-4 h-4 text-muted-foreground shrink-0" />
                        <button
                          onClick={() => setSearchQuery(item)}
                          className="flex-1 text-left text-sm"
                        >
                          {item}
                        </button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleClearRecent(i)}
                          className="w-8 h-8 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              </motion.div>
            )}
          </>
        ) : (
          /* Search Results */
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-12 text-muted-foreground"
          >
            <Search className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>Search results for "{searchQuery}"</p>
            <p className="text-sm mt-2">This feature is coming soon!</p>
          </motion.div>
        )}
      </div>
    </div>
  );
}
