import { ArrowLeft, MapPin, Users, Calendar, Share2, Bell } from "lucide-react";
import { Link, useParams } from "react-router";
import { Button } from "../components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { Card } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { ImageWithFallback } from "../components/figma/ImageWithFallback";

export function ClubDetailPage() {
  const { id } = useParams();

  return (
    <div className="min-h-screen bg-background pb-20">
      <div className="relative h-56 bg-gradient-to-br from-[var(--muted)] to-[var(--surface-elevated)]">
        <ImageWithFallback
          src="https://images.unsplash.com/photo-1761775446030-5e1fdd4166a5?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxzcG9ydHMlMjBjbHViJTIwZmFjaWxpdHl8ZW58MXx8fHwxNzcyMTM4MTAyfDA&ixlib=rb-4.1.0&q=80&w=1080"
          alt="Club"
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent" />
        
        <div className="absolute top-4 left-0 right-0 flex items-center justify-between px-4">
          <Link to="/clubs">
            <Button variant="ghost" size="icon" className="rounded-full bg-black/40 backdrop-blur-sm text-white">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div className="flex gap-2">
            <Button variant="ghost" size="icon" className="rounded-full bg-black/40 backdrop-blur-sm text-white">
              <Bell className="w-5 h-5" />
            </Button>
            <Button variant="ghost" size="icon" className="rounded-full bg-black/40 backdrop-blur-sm text-white">
              <Share2 className="w-5 h-5" />
            </Button>
          </div>
        </div>

        <div className="absolute bottom-0 left-0 right-0 p-4 text-white">
          <h1 className="text-2xl mb-2">Westside Pickleball Club</h1>
          <div className="flex items-center gap-3 text-sm text-white/80">
            <div className="flex items-center gap-1">
              <MapPin className="w-4 h-4" />
              Los Angeles, CA
            </div>
            <div className="flex items-center gap-1">
              <Users className="w-4 h-4" />
              342 members
            </div>
          </div>
        </div>
      </div>

      <div className="p-4">
        <Tabs defaultValue="feed" className="w-full">
          <TabsList className="w-full grid grid-cols-3">
            <TabsTrigger value="feed">Feed</TabsTrigger>
            <TabsTrigger value="events">Events</TabsTrigger>
            <TabsTrigger value="members">Members</TabsTrigger>
          </TabsList>

          <TabsContent value="feed" className="space-y-3 mt-4">
            <Card className="p-4">
              <div className="text-center py-8">
                <Calendar className="w-12 h-12 mx-auto mb-3 text-muted-foreground" />
                <h3 className="font-semibold mb-2">Welcome to the Club!</h3>
                <p className="text-sm text-muted-foreground mb-4">Stay updated with announcements and events</p>
                <Button className="rounded-full bg-gradient-to-r from-[var(--brand-primary)] to-[var(--brand-purple)]">
                  Join Club Chat
                </Button>
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="events" className="space-y-3 mt-4">
            <Card className="p-4">
              <div className="flex items-start gap-3 mb-3">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[var(--brand-primary)] to-[var(--brand-purple)] flex items-center justify-center text-white font-bold">
                  20
                </div>
                <div className="flex-1">
                  <h4 className="font-semibold">Tournament Night</h4>
                  <p className="text-sm text-muted-foreground">March 20, 2026 • 6:00 PM</p>
                </div>
                <Badge variant="secondary">Upcoming</Badge>
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="members" className="mt-4">
            <Card className="p-8 text-center">
              <Users className="w-12 h-12 mx-auto mb-3 text-muted-foreground" />
              <h3 className="font-semibold mb-2">342 Members</h3>
              <p className="text-sm text-muted-foreground">View full member list</p>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
