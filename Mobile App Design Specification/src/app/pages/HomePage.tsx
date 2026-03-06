import { Calendar, Clock, MapPin, Sparkles, Trophy, ChevronRight, Users } from "lucide-react";
import { Link } from "react-router";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { motion } from "motion/react";

export function HomePage() {
  // Mock data for upcoming user events
  const upcomingEvents = [
    {
      id: "1",
      name: "Spring Championship 2026",
      date: "Mar 15, 2026",
      time: "9:00 AM",
      location: "Los Angeles Tennis Club",
      division: "4.0+",
      status: "confirmed",
      type: "tournament",
      matchNumber: "Court 3"
    },
    {
      id: "2",
      name: "Coastal Classic - Round 2",
      date: "Mar 22, 2026",
      time: "2:30 PM",
      location: "San Diego Pickleball Center",
      division: "Open",
      status: "confirmed",
      type: "tournament",
      matchNumber: "Court 1"
    },
    {
      id: "3",
      name: "Valley Club Practice",
      date: "Mar 18, 2026",
      time: "6:00 PM",
      location: "Valley Sports Complex",
      division: "All Levels",
      status: "pending",
      type: "practice",
      matchNumber: null
    }
  ];

  const getStatusColor = (status: string) => {
    if (status === "confirmed") return "bg-[var(--success)]/10 text-[var(--success)] border-[var(--success)]/20";
    if (status === "pending") return "bg-yellow-500/10 text-yellow-600 border-yellow-500/20";
    return "bg-gray-500/10 text-gray-600 border-gray-500/20";
  };

  const getTypeIcon = (type: string) => {
    if (type === "tournament") return Trophy;
    if (type === "practice") return Users;
    return Calendar;
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-[var(--surface-elevated)] pb-20">
      {/* Header Section */}
      <motion.section 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="px-4 pt-6 pb-4"
      >
        <div className="mb-2">
          <h1 className="text-3xl mb-1">Welcome back! 👋</h1>
          <p className="text-muted-foreground">Here's what's coming up</p>
        </div>
      </motion.section>

      {/* AI Assistant Mini Block */}
      <motion.section 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="px-4 pb-6"
      >
        <Link to="/chats/ai-assistant">
          <Card className="p-4 bg-gradient-to-br from-[var(--brand-purple)]/10 to-[var(--brand-accent)]/10 border-[var(--brand-purple)]/20 hover:border-[var(--brand-purple)]/40 transition-all cursor-pointer active:scale-[0.98]">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[var(--brand-purple)] to-[var(--brand-accent)] flex items-center justify-center shrink-0">
                <Sparkles className="w-6 h-6 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold mb-0.5">AI Assistant</h3>
                <p className="text-sm text-muted-foreground line-clamp-1">
                  Get help with strategies, rules, and more
                </p>
              </div>
              <ChevronRight className="w-5 h-5 text-muted-foreground shrink-0" />
            </div>
          </Card>
        </Link>
      </motion.section>

      {/* My Upcoming Events */}
      <section className="px-4 pb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl">My Events</h2>
          <Link to="/profile/events">
            <Button variant="ghost" size="sm" className="text-[var(--brand-primary)] -mr-2">
              View All
            </Button>
          </Link>
        </div>

        {upcomingEvents.length === 0 ? (
          <Card className="p-8 text-center">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[var(--brand-primary)]/10 to-[var(--brand-purple)]/10 flex items-center justify-center mx-auto mb-3">
              <Calendar className="w-8 h-8 text-muted-foreground" />
            </div>
            <h3 className="font-semibold mb-1">No upcoming events</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Register for a tournament to get started
            </p>
            <Link to="/tournaments">
              <Button className="rounded-full bg-gradient-to-r from-[var(--brand-primary)] to-[var(--brand-purple)]">
                Browse Tournaments
              </Button>
            </Link>
          </Card>
        ) : (
          <div className="space-y-3">
            {upcomingEvents.map((event, index) => {
              const TypeIcon = getTypeIcon(event.type);
              
              return (
                <motion.div
                  key={event.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 + index * 0.1 }}
                >
                  <Link to={`/tournaments/${event.id}`}>
                    <Card className="p-4 hover:border-[var(--brand-primary)]/40 transition-all cursor-pointer active:scale-[0.98]">
                      <div className="flex items-start gap-3">
                        {/* Icon */}
                        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[var(--brand-primary)]/10 to-[var(--brand-purple)]/10 flex items-center justify-center shrink-0">
                          <TypeIcon className="w-6 h-6 text-[var(--brand-primary)]" />
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <h3 className="font-semibold line-clamp-1">{event.name}</h3>
                            <Badge className={getStatusColor(event.status)}>
                              {event.status}
                            </Badge>
                          </div>

                          <div className="space-y-1.5">
                            <div className="flex items-center gap-2 text-sm">
                              <Calendar className="w-4 h-4 text-muted-foreground shrink-0" />
                              <span className="text-muted-foreground">{event.date}</span>
                              <span className="text-muted-foreground">•</span>
                              <Clock className="w-4 h-4 text-muted-foreground shrink-0" />
                              <span className="text-muted-foreground">{event.time}</span>
                            </div>

                            <div className="flex items-center gap-2 text-sm">
                              <MapPin className="w-4 h-4 text-muted-foreground shrink-0" />
                              <span className="text-muted-foreground line-clamp-1">{event.location}</span>
                            </div>

                            <div className="flex items-center gap-2 pt-1">
                              <Badge variant="outline" className="text-xs">
                                {event.division}
                              </Badge>
                              {event.matchNumber && (
                                <Badge variant="outline" className="text-xs">
                                  {event.matchNumber}
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </Card>
                  </Link>
                </motion.div>
              );
            })}
          </div>
        )}
      </section>

      {/* Quick Stats Summary */}
      <section className="px-4 pb-8">
        <Card className="p-4 bg-gradient-to-br from-[var(--brand-primary)]/5 to-[var(--brand-purple)]/5 border-[var(--brand-primary)]/20">
          <h3 className="font-semibold mb-3">This Month</h3>
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold bg-gradient-to-r from-[var(--brand-primary)] to-[var(--brand-purple)] bg-clip-text text-transparent">
                3
              </div>
              <div className="text-xs text-muted-foreground mt-1">Events</div>
            </div>
            <div className="text-center border-x border-border">
              <div className="text-2xl font-bold bg-gradient-to-r from-[var(--brand-primary)] to-[var(--brand-purple)] bg-clip-text text-transparent">
                8
              </div>
              <div className="text-xs text-muted-foreground mt-1">Matches</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold bg-gradient-to-r from-[var(--brand-primary)] to-[var(--brand-purple)] bg-clip-text text-transparent">
                75%
              </div>
              <div className="text-xs text-muted-foreground mt-1">Win Rate</div>
            </div>
          </div>
        </Card>
      </section>
    </div>
  );
}
