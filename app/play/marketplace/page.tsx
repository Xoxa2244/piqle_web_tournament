'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import {
  MapPin, Calendar, Clock, Users, DollarSign, Star, Zap,
  Search, Filter, ChevronLeft, ArrowRight, Sparkles, TrendingDown,
  Navigation, CheckCircle2, Timer, Flame, Shield
} from 'lucide-react'

// ── Types ──────────────────────────────────────────────────────────────────

type DropInSlot = {
  id: string
  clubName: string
  clubRating: number
  clubReviews: number
  clubImage: string
  address: string
  distance: number // miles
  courtName: string
  date: string
  dateLabel: string
  startTime: string
  endTime: string
  format: string
  skillLevel: string
  spotsLeft: number
  maxPlayers: number
  originalPrice: number
  dropInPrice: number
  isLastMinute: boolean
  isAIRecommended: boolean
  aiReason?: string
  amenities: string[]
  playersBooked: { name: string; dupr: number }[]
}

// ── Mock Data ──────────────────────────────────────────────────────────────

const mockSlots: DropInSlot[] = [
  {
    id: '1',
    clubName: 'Sunset Pickleball Club',
    clubRating: 4.8,
    clubReviews: 124,
    clubImage: '🌅',
    address: '2400 Ocean Dr, Miami Beach',
    distance: 1.2,
    courtName: 'Court 1 & 2',
    date: '2025-03-05',
    dateLabel: 'Tomorrow',
    startTime: '09:00',
    endTime: '11:00',
    format: 'OPEN_PLAY',
    skillLevel: 'INTERMEDIATE',
    spotsLeft: 5,
    maxPlayers: 8,
    originalPrice: 20,
    dropInPrice: 12,
    isLastMinute: true,
    isAIRecommended: true,
    aiReason: 'Matches your skill level (3.5 DUPR) and preferred morning schedule. 3 players at similar level already booked.',
    amenities: ['Covered courts', 'Pro shop', 'Water station'],
    playersBooked: [
      { name: 'Robert C.', dupr: 3.2 },
      { name: 'Patricia L.', dupr: 3.0 },
      { name: 'Helen D.', dupr: 3.1 },
    ],
  },
  {
    id: '2',
    clubName: 'Coral Gables Racquet Club',
    clubRating: 4.6,
    clubReviews: 89,
    clubImage: '🎾',
    address: '800 Catalonia Ave, Coral Gables',
    distance: 3.4,
    courtName: 'Pickleball Courts 3-4',
    date: '2025-03-05',
    dateLabel: 'Tomorrow',
    startTime: '18:00',
    endTime: '20:00',
    format: 'OPEN_PLAY',
    skillLevel: 'ALL_LEVELS',
    spotsLeft: 8,
    maxPlayers: 12,
    originalPrice: 18,
    dropInPrice: 10,
    isLastMinute: true,
    isAIRecommended: false,
    amenities: ['Lights', 'Parking', 'Locker rooms'],
    playersBooked: [
      { name: 'Alex R.', dupr: 3.8 },
      { name: 'Sarah K.', dupr: 4.0 },
      { name: 'Mike T.', dupr: 3.5 },
      { name: 'Emily Z.', dupr: 3.4 },
    ],
  },
  {
    id: '3',
    clubName: 'Brickell Padel & Pickle',
    clubRating: 4.9,
    clubReviews: 201,
    clubImage: '🏙️',
    address: '1200 Brickell Ave, Miami',
    distance: 0.8,
    courtName: 'Court 5',
    date: '2025-03-05',
    dateLabel: 'Tomorrow',
    startTime: '07:00',
    endTime: '08:30',
    format: 'DRILL',
    skillLevel: 'ADVANCED',
    spotsLeft: 2,
    maxPlayers: 6,
    originalPrice: 35,
    dropInPrice: 25,
    isLastMinute: false,
    isAIRecommended: true,
    aiReason: 'Your DUPR rose 0.3 in 2 months — this advanced drill would accelerate your improvement. Coach Maria (4.8★) leads it.',
    amenities: ['Indoor AC', 'Pro coaching', 'Video analysis'],
    playersBooked: [
      { name: 'Carlos M.', dupr: 4.5 },
      { name: 'Tom W.', dupr: 4.8 },
      { name: 'Jake M.', dupr: 4.6 },
      { name: 'Chris L.', dupr: 4.7 },
    ],
  },
  {
    id: '4',
    clubName: 'Coconut Grove Community Center',
    clubRating: 4.3,
    clubReviews: 56,
    clubImage: '🌴',
    address: '3500 Pan American Dr, Coconut Grove',
    distance: 2.1,
    courtName: 'Outdoor Courts',
    date: '2025-03-06',
    dateLabel: 'Thursday',
    startTime: '17:00',
    endTime: '19:00',
    format: 'SOCIAL',
    skillLevel: 'BEGINNER',
    spotsLeft: 10,
    maxPlayers: 16,
    originalPrice: 10,
    dropInPrice: 5,
    isLastMinute: true,
    isAIRecommended: false,
    amenities: ['Free parking', 'Family friendly', 'Picnic area'],
    playersBooked: [
      { name: 'Maria G.', dupr: 2.8 },
      { name: 'Bob J.', dupr: 2.5 },
      { name: 'Amy C.', dupr: 3.0 },
      { name: 'Steve B.', dupr: 2.6 },
      { name: 'New Player', dupr: 0 },
      { name: 'Guest', dupr: 0 },
    ],
  },
  {
    id: '5',
    clubName: 'Sunset Pickleball Club',
    clubRating: 4.8,
    clubReviews: 124,
    clubImage: '🌅',
    address: '2400 Ocean Dr, Miami Beach',
    distance: 1.2,
    courtName: 'Court 3',
    date: '2025-03-07',
    dateLabel: 'Friday',
    startTime: '17:00',
    endTime: '19:00',
    format: 'ROUND_ROBIN',
    skillLevel: 'INTERMEDIATE',
    spotsLeft: 4,
    maxPlayers: 8,
    originalPrice: 25,
    dropInPrice: 18,
    isLastMinute: false,
    isAIRecommended: true,
    aiReason: 'Friday evening Round Robin — perfect for your competitive side. 4 players at your level already in.',
    amenities: ['Covered courts', 'Pro shop', 'Bar & grill'],
    playersBooked: [
      { name: 'Jennifer W.', dupr: 3.6 },
      { name: 'Jason L.', dupr: 3.7 },
      { name: 'Amanda C.', dupr: 3.9 },
      { name: 'Kevin P.', dupr: 3.3 },
    ],
  },
  {
    id: '6',
    clubName: 'Wynwood Pickle House',
    clubRating: 4.7,
    clubReviews: 167,
    clubImage: '🎨',
    address: '300 NW 25th St, Wynwood',
    distance: 4.5,
    courtName: 'All Courts',
    date: '2025-03-08',
    dateLabel: 'Saturday',
    startTime: '08:00',
    endTime: '12:00',
    format: 'OPEN_PLAY',
    skillLevel: 'ALL_LEVELS',
    spotsLeft: 14,
    maxPlayers: 24,
    originalPrice: 22,
    dropInPrice: 22,
    isLastMinute: false,
    isAIRecommended: false,
    amenities: ['Food trucks', 'DJ', 'Beer garden', 'Mural courts'],
    playersBooked: [
      { name: 'Various', dupr: 0 },
    ],
  },
]

// ── Helpers ─────────────────────────────────────────────────────────────────

const formatLabel = (f: string) => f.replace(/_/g, ' ')

const getFormatColor = (f: string) => {
  const m: Record<string, string> = {
    OPEN_PLAY: 'bg-blue-100 text-blue-800',
    DRILL: 'bg-orange-100 text-orange-800',
    CLINIC: 'bg-purple-100 text-purple-800',
    SOCIAL: 'bg-green-100 text-green-800',
    LEAGUE_PLAY: 'bg-red-100 text-red-800',
    ROUND_ROBIN: 'bg-indigo-100 text-indigo-800',
  }
  return m[f] || 'bg-gray-100 text-gray-800'
}

const getSkillColor = (s: string) => {
  const m: Record<string, string> = {
    BEGINNER: 'bg-emerald-100 text-emerald-700',
    INTERMEDIATE: 'bg-amber-100 text-amber-700',
    ADVANCED: 'bg-red-100 text-red-700',
    ALL_LEVELS: 'bg-gray-100 text-gray-700',
  }
  return m[s] || 'bg-gray-100 text-gray-700'
}

// ── Component ──────────────────────────────────────────────────────────────

export default function MarketplacePage() {
  const [searchQuery, setSearchQuery] = useState('')
  const [filterFormat, setFilterFormat] = useState<string>('all')
  const [filterSkill, setFilterSkill] = useState<string>('all')
  const [sortBy, setSortBy] = useState<'recommended' | 'price' | 'distance' | 'date'>('recommended')
  const [bookedIds, setBookedIds] = useState<Set<string>>(new Set())

  const filteredSlots = useMemo(() => {
    let slots = [...mockSlots]

    // Search
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      slots = slots.filter(s =>
        s.clubName.toLowerCase().includes(q) ||
        s.address.toLowerCase().includes(q) ||
        s.format.toLowerCase().includes(q)
      )
    }

    // Filter format
    if (filterFormat !== 'all') {
      slots = slots.filter(s => s.format === filterFormat)
    }

    // Filter skill
    if (filterSkill !== 'all') {
      slots = slots.filter(s => s.skillLevel === filterSkill || s.skillLevel === 'ALL_LEVELS')
    }

    // Sort
    switch (sortBy) {
      case 'price':
        slots.sort((a, b) => a.dropInPrice - b.dropInPrice)
        break
      case 'distance':
        slots.sort((a, b) => a.distance - b.distance)
        break
      case 'date':
        slots.sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime))
        break
      case 'recommended':
      default:
        slots.sort((a, b) => {
          if (a.isAIRecommended && !b.isAIRecommended) return -1
          if (!a.isAIRecommended && b.isAIRecommended) return 1
          if (a.isLastMinute && !b.isLastMinute) return -1
          if (!a.isLastMinute && b.isLastMinute) return 1
          return a.distance - b.distance
        })
    }

    return slots
  }, [searchQuery, filterFormat, filterSkill, sortBy])

  const handleBook = (id: string) => {
    setBookedIds(prev => new Set([...Array.from(prev), id]))
  }

  const lastMinuteCount = mockSlots.filter(s => s.isLastMinute).length
  const aiRecommendedCount = mockSlots.filter(s => s.isAIRecommended).length
  const avgSavings = Math.round(
    mockSlots.filter(s => s.dropInPrice < s.originalPrice)
      .reduce((s, x) => s + (x.originalPrice - x.dropInPrice), 0) /
    mockSlots.filter(s => s.dropInPrice < s.originalPrice).length
  )

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border bg-card">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center gap-4 mb-6">
            <Link
              href="/play"
              className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
              <span className="text-sm">Back to Play</span>
            </Link>
          </div>

          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 bg-gradient-to-br from-lime-500/20 to-green-500/10 rounded-lg">
                  <Navigation className="w-6 h-6 text-lime-600" />
                </div>
                <h1 className="text-3xl font-bold text-foreground">Drop-In Courts</h1>
                <Badge className="bg-lime-100 text-lime-800">Near You</Badge>
              </div>
              <p className="text-muted-foreground">
                Open slots at clubs nearby. No membership required — just show up and play.
              </p>
            </div>
          </div>

          {/* Quick Stats */}
          <div className="flex flex-wrap gap-4 mt-4">
            <div className="flex items-center gap-2 text-sm">
              <Timer className="w-4 h-4 text-red-500" />
              <span><strong>{lastMinuteCount}</strong> last-minute deals</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Sparkles className="w-4 h-4 text-primary" />
              <span><strong>{aiRecommendedCount}</strong> AI picks for you</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <TrendingDown className="w-4 h-4 text-green-600" />
              <span>Avg <strong>${avgSavings} off</strong> vs member price</span>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Search + Filters */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search clubs, locations..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <div className="flex gap-2">
            <select
              value={filterFormat}
              onChange={e => setFilterFormat(e.target.value)}
              className="px-3 py-2 border rounded-md text-sm bg-background"
            >
              <option value="all">All Formats</option>
              <option value="OPEN_PLAY">Open Play</option>
              <option value="DRILL">Drill</option>
              <option value="SOCIAL">Social</option>
              <option value="ROUND_ROBIN">Round Robin</option>
              <option value="CLINIC">Clinic</option>
            </select>
            <select
              value={filterSkill}
              onChange={e => setFilterSkill(e.target.value)}
              className="px-3 py-2 border rounded-md text-sm bg-background"
            >
              <option value="all">All Levels</option>
              <option value="BEGINNER">Beginner</option>
              <option value="INTERMEDIATE">Intermediate</option>
              <option value="ADVANCED">Advanced</option>
            </select>
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value as typeof sortBy)}
              className="px-3 py-2 border rounded-md text-sm bg-background"
            >
              <option value="recommended">Recommended</option>
              <option value="price">Cheapest</option>
              <option value="distance">Nearest</option>
              <option value="date">Soonest</option>
            </select>
          </div>
        </div>

        {/* Slots */}
        <div className="space-y-4">
          {filteredSlots.map(slot => {
            const isBooked = bookedIds.has(slot.id)
            const hasDiscount = slot.dropInPrice < slot.originalPrice
            const discountPercent = hasDiscount
              ? Math.round(((slot.originalPrice - slot.dropInPrice) / slot.originalPrice) * 100)
              : 0

            return (
              <Card key={slot.id} className={cn(
                'transition-all',
                isBooked && 'border-green-300 bg-green-50/30',
                slot.isAIRecommended && !isBooked && 'border-primary/30',
              )}>
                <CardContent className="py-5">
                  <div className="flex flex-col lg:flex-row gap-4">
                    {/* Left: Club info */}
                    <div className="flex-1">
                      <div className="flex items-start gap-3">
                        <span className="text-3xl">{slot.clubImage}</span>
                        <div className="flex-1 min-w-0">
                          {/* Top badges */}
                          <div className="flex flex-wrap items-center gap-2 mb-1">
                            {slot.isAIRecommended && (
                              <Badge className="bg-primary/10 text-primary text-xs">
                                <Sparkles className="w-3 h-3 mr-1" />
                                AI Pick
                              </Badge>
                            )}
                            {slot.isLastMinute && (
                              <Badge className="bg-red-100 text-red-700 text-xs">
                                <Flame className="w-3 h-3 mr-1" />
                                Last Minute Deal
                              </Badge>
                            )}
                          </div>

                          {/* Club name + rating */}
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-semibold text-base">{slot.clubName}</h3>
                            <div className="flex items-center gap-1 text-sm">
                              <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                              <span className="font-medium">{slot.clubRating}</span>
                              <span className="text-muted-foreground">({slot.clubReviews})</span>
                            </div>
                          </div>

                          {/* Address + distance */}
                          <div className="flex items-center gap-1 text-sm text-muted-foreground mb-3">
                            <MapPin className="w-3.5 h-3.5" />
                            {slot.address} · {slot.distance} mi
                          </div>

                          {/* Session details */}
                          <div className="flex flex-wrap items-center gap-2 mb-2">
                            <Badge className={getFormatColor(slot.format)}>
                              {formatLabel(slot.format)}
                            </Badge>
                            <Badge variant="outline" className={getSkillColor(slot.skillLevel)}>
                              {formatLabel(slot.skillLevel)}
                            </Badge>
                            <span className="text-sm text-muted-foreground">{slot.courtName}</span>
                          </div>

                          <div className="flex items-center gap-4 text-sm text-muted-foreground mb-3">
                            <span className="flex items-center gap-1">
                              <Calendar className="w-3.5 h-3.5" />
                              {slot.dateLabel}
                            </span>
                            <span className="flex items-center gap-1">
                              <Clock className="w-3.5 h-3.5" />
                              {slot.startTime}–{slot.endTime}
                            </span>
                            <span className="flex items-center gap-1">
                              <Users className="w-3.5 h-3.5" />
                              {slot.spotsLeft} spots left
                            </span>
                          </div>

                          {/* Players already in */}
                          {slot.playersBooked.length > 0 && slot.playersBooked[0].dupr > 0 && (
                            <div className="flex flex-wrap gap-1.5 mb-3">
                              {slot.playersBooked.filter(p => p.dupr > 0).map((p, i) => (
                                <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 bg-muted rounded text-xs">
                                  {p.name}
                                  <span className="text-muted-foreground">({p.dupr})</span>
                                </span>
                              ))}
                            </div>
                          )}

                          {/* AI reason */}
                          {slot.isAIRecommended && slot.aiReason && (
                            <div className="bg-primary/5 rounded-lg p-3 mt-2">
                              <div className="flex items-center gap-1.5 mb-1">
                                <Sparkles className="w-3.5 h-3.5 text-primary" />
                                <span className="text-xs font-medium text-primary">Why AI picked this</span>
                              </div>
                              <p className="text-xs text-muted-foreground">{slot.aiReason}</p>
                            </div>
                          )}

                          {/* Amenities */}
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            {slot.amenities.map((a, i) => (
                              <span key={i} className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">
                                {a}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Right: Price + Book */}
                    <div className="flex flex-col items-end justify-between gap-3 lg:min-w-[160px]">
                      <div className="text-right">
                        {hasDiscount && (
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-sm text-muted-foreground line-through">${slot.originalPrice}</span>
                            <Badge className="bg-red-100 text-red-700 text-xs">-{discountPercent}%</Badge>
                          </div>
                        )}
                        <p className="text-2xl font-bold">${slot.dropInPrice}</p>
                        <p className="text-xs text-muted-foreground">drop-in / person</p>
                      </div>

                      {/* Spots indicator */}
                      <div className="w-full">
                        <div className="flex items-center justify-between mb-1">
                          <span className={cn(
                            'text-xs font-medium',
                            slot.spotsLeft <= 2 ? 'text-red-600' : slot.spotsLeft <= 5 ? 'text-orange-600' : 'text-green-600'
                          )}>
                            {slot.spotsLeft} of {slot.maxPlayers} open
                          </span>
                        </div>
                        <div className="w-full bg-secondary rounded-full h-1.5">
                          <div
                            className={cn(
                              'rounded-full h-1.5',
                              slot.spotsLeft <= 2 ? 'bg-red-500' : slot.spotsLeft <= 5 ? 'bg-orange-500' : 'bg-green-500'
                            )}
                            style={{ width: `${((slot.maxPlayers - slot.spotsLeft) / slot.maxPlayers) * 100}%` }}
                          />
                        </div>
                      </div>

                      {!isBooked ? (
                        <Button
                          onClick={(e) => { e.stopPropagation(); handleBook(slot.id) }}
                          className="w-full gap-2"
                          size="lg"
                        >
                          <Zap className="w-4 h-4" />
                          Book Drop-In
                        </Button>
                      ) : (
                        <div className="w-full text-center">
                          <div className="flex items-center justify-center gap-2 text-green-600 mb-1">
                            <CheckCircle2 className="w-5 h-5" />
                            <span className="font-medium">Booked!</span>
                          </div>
                          <p className="text-xs text-muted-foreground">Check-in code sent to your email</p>
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>

        {filteredSlots.length === 0 && (
          <Card className="text-center py-16">
            <Search className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">No drop-in slots match your filters.</p>
            <p className="text-sm text-muted-foreground mt-1">Try expanding your search or check back later.</p>
          </Card>
        )}
      </div>
    </div>
  )
}
