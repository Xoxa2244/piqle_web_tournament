import { Calendar, Clock, MapPin, Trophy, Users, ArrowLeft, Medal, Target } from "lucide-react";
import { Link, useNavigate } from "react-router";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { motion } from "motion/react";

export function MyEventsPage() {
  const navigate = useNavigate();

  // Mock data for upcoming events
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
    },
    {
      id: "4",
      name: "Phoenix Open",
      date: "Apr 5, 2026",
      time: "10:00 AM",
      location: "Phoenix Sports Arena",
      division: "4.5+",
      status: "confirmed",
      type: "tournament",
      matchNumber: "Court 5"
    },
    {
      id: "5",
      name: "Sunset League Match",
      date: "Mar 12, 2026",
      time: "7:00 PM",
      location: "Sunset Recreation Center",
      division: "4.0",
      status: "confirmed",
      type: "league",
      matchNumber: "Court 2"
    }
  ];

  // Mock data for past events
  const pastEvents = [
    {
      id: "6",
      name: "Winter Classic 2026",
      date: "Feb 15, 2026",
      location: "Downtown Sports Complex",
      division: "4.0+",
      place: "1st",
      type: "tournament",
      points: "+15"
    },
    {
      id: "7",
      name: "Valley Open",
      date: "Feb 28, 2026",
      location: "Valley Pickleball Center",
      division: "4.0",
      place: "3rd",
      type: "tournament",
      points: "+8"
    },
    {
      id: "8",
      name: "Coastal Championship",
      date: "Feb 8, 2026",
      location: "Coastal Sports Arena",
      division: "4.0+",
      place: "2nd",
      type: "tournament",
      points: "+12"
    },
    {
      id: "9",
      name: "New Year Tournament",
      date: "Jan 20, 2026",
      location: "City Recreation Center",
      division: "Open",
      place: "5th",
      type: "tournament",
      points: "+3"
    },
    {
      id: "10",
      name: "Holiday Showdown",
      date: "Dec 28, 2025",
      location: "Metro Sports Complex",
      division: "4.0",
      place: "1st",
      type: "tournament",
      points: "+15"
    },
    {
      id: "11",
      name: "Fall Championship",
      date: "Nov 18, 2025",
      location: "Riverside Pickleball Club",
      division: "4.0+",
      place: "4th",
      type: "tournament",
      points: "+5"
    }
  ];

  const getStatusColor = (status: string) => {
    if (status === "confirmed") return "bg-[var(--success)]/10 text-[var(--success)] border-[var(--success)]/20";
    if (status === "pending") return "bg-yellow-500/10 text-yellow-600 border-yellow-500/20";
    return "bg-gray-500/10 text-gray-600 border-gray-500/20";
  };

  const getPlaceColor = (place: string) => {
    if (place === "1st") return "bg-yellow-500/10 text-yellow-600 border-yellow-500/20";
    if (place === "2nd") return "bg-gray-400/10 text-gray-600 border-gray-400/20";
    if (place === "3rd") return "bg-orange-600/10 text-orange-700 border-orange-600/20";
    return "bg-blue-500/10 text-blue-600 border-blue-500/20";
  };

  const getTypeIcon = (type: string) => {
    if (type === "tournament") return Trophy;
    if (type === "practice") return Users;
    if (type === "league") return Target;
    return Calendar;
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-[var(--surface-elevated)] pb-20">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-background/95 backdrop-blur-lg border-b border-border">
        <div className="flex items-center justify-between px-4 h-14">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate(-1)}
            className="rounded-full"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h2 className="font-semibold">My Events</h2>
          <div className="w-10" /> {/* Spacer for centering */}
        </div>
      </div>

      {/* Content */}
      <div className="px-4 pt-6">
        <Tabs defaultValue="upcoming" className="w-full">
          <TabsList className="w-full mb-6">
            <TabsTrigger value="upcoming" className="flex-1">
              Upcoming & Current
            </TabsTrigger>
            <TabsTrigger value="past" className="flex-1">
              Past Events
            </TabsTrigger>
          </TabsList>

          {/* Upcoming Events Tab */}
          <TabsContent value="upcoming" className="space-y-3">
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
              upcomingEvents.map((event, index) => {
                const TypeIcon = getTypeIcon(event.type);
                
                return (
                  <motion.div
                    key={event.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
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
              })
            )}
          </TabsContent>

          {/* Past Events Tab */}
          <TabsContent value="past" className="space-y-3">
            {pastEvents.length === 0 ? (
              <Card className="p-8 text-center">
                <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[var(--brand-primary)]/10 to-[var(--brand-purple)]/10 flex items-center justify-center mx-auto mb-3">
                  <Trophy className="w-8 h-8 text-muted-foreground" />
                </div>
                <h3 className="font-semibold mb-1">No past events</h3>
                <p className="text-sm text-muted-foreground">
                  Your tournament history will appear here
                </p>
              </Card>
            ) : (
              pastEvents.map((event, index) => {
                const TypeIcon = getTypeIcon(event.type);
                
                return (
                  <motion.div
                    key={event.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
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
                              <div className="flex items-center gap-1.5">
                                <Badge className={getPlaceColor(event.place)}>
                                  {event.place === "1st" && "🥇"}
                                  {event.place === "2nd" && "🥈"}
                                  {event.place === "3rd" && "🥉"}
                                  {!["1st", "2nd", "3rd"].includes(event.place) && event.place}
                                </Badge>
                              </div>
                            </div>

                            <div className="space-y-1.5">
                              <div className="flex items-center gap-2 text-sm">
                                <Calendar className="w-4 h-4 text-muted-foreground shrink-0" />
                                <span className="text-muted-foreground">{event.date}</span>
                              </div>

                              <div className="flex items-center gap-2 text-sm">
                                <MapPin className="w-4 h-4 text-muted-foreground shrink-0" />
                                <span className="text-muted-foreground line-clamp-1">{event.location}</span>
                              </div>

                              <div className="flex items-center gap-2 pt-1">
                                <Badge variant="outline" className="text-xs">
                                  {event.division}
                                </Badge>
                                <Badge 
                                  variant="outline" 
                                  className="text-xs text-[var(--brand-primary)] border-[var(--brand-primary)]/30"
                                >
                                  <Medal className="w-3 h-3 mr-1" />
                                  {event.points} pts
                                </Badge>
                              </div>
                            </div>
                          </div>
                        </div>
                      </Card>
                    </Link>
                  </motion.div>
                );
              })
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
