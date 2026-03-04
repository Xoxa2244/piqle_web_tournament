'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Settings, ArrowLeft, Minus, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from '@/components/ui/use-toast'

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const TIMES = [
  { id: 'morning', label: 'Morning', time: '6am - 12pm' },
  { id: 'afternoon', label: 'Afternoon', time: '12pm - 5pm' },
  { id: 'evening', label: 'Evening', time: '5pm - 10pm' },
]
const SKILL_LEVELS = ['Beginner', 'Intermediate', 'Advanced', 'All Levels']
const FORMATS = [
  { id: 'open_play', label: 'Open Play' },
  { id: 'clinic', label: 'Clinic' },
  { id: 'drill', label: 'Drill' },
  { id: 'league_play', label: 'League Play' },
  { id: 'social', label: 'Social' },
]

export default function PreferencesPage() {
  const [selectedDays, setSelectedDays] = useState<Set<string>>(
    new Set(['Mon', 'Wed', 'Fri', 'Sat'])
  )
  const [selectedTimes, setSelectedTimes] = useState<Set<string>>(
    new Set(['morning', 'evening'])
  )
  const [selectedSkillLevel, setSelectedSkillLevel] = useState('Intermediate')
  const [selectedFormats, setSelectedFormats] = useState<Set<string>>(
    new Set(['open_play', 'clinic'])
  )
  const [sessionsPerWeek, setSessionsPerWeek] = useState(3)
  const [isSaving, setIsSaving] = useState(false)

  const toggleDay = (day: string) => {
    const newDays = new Set(selectedDays)
    if (newDays.has(day)) {
      newDays.delete(day)
    } else {
      newDays.add(day)
    }
    setSelectedDays(newDays)
  }

  const toggleTime = (timeId: string) => {
    const newTimes = new Set(selectedTimes)
    if (newTimes.has(timeId)) {
      newTimes.delete(timeId)
    } else {
      newTimes.add(timeId)
    }
    setSelectedTimes(newTimes)
  }

  const toggleFormat = (formatId: string) => {
    const newFormats = new Set(selectedFormats)
    if (newFormats.has(formatId)) {
      newFormats.delete(formatId)
    } else {
      newFormats.add(formatId)
    }
    setSelectedFormats(newFormats)
  }

  const handleSave = async () => {
    setIsSaving(true)
    await new Promise((resolve) => setTimeout(resolve, 800))
    toast({
      title: 'Preferences saved!',
      description: 'Your weekly plan will update with new recommendations.',
    })
    setIsSaving(false)
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20 p-4 md:p-6">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-start gap-4 mb-8">
          <Link href="/play">
            <Button variant="ghost" size="sm" className="mt-0.5">
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back
            </Button>
          </Link>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <Settings className="h-5 w-5 text-primary" />
              <h1 className="text-3xl font-bold tracking-tight">Play Preferences</h1>
            </div>
            <p className="text-sm text-muted-foreground">
              Customize your play experience to match your schedule and style
            </p>
          </div>
        </div>

        {/* Preferred Days */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Preferred Days</CardTitle>
            <CardDescription>Which days work best for you?</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-7 gap-2">
              {DAYS.map((day) => (
                <button
                  key={day}
                  onClick={() => toggleDay(day)}
                  className={cn(
                    'h-10 rounded-lg font-medium text-sm transition-all duration-200 border-2',
                    selectedDays.has(day)
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-muted text-muted-foreground border-muted hover:border-muted-foreground/50'
                  )}
                >
                  {day}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-4">
              Selected: {selectedDays.size > 0 ? Array.from(selectedDays).join(', ') : 'None'}
            </p>
          </CardContent>
        </Card>

        {/* Preferred Times */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Preferred Times</CardTitle>
            <CardDescription>What time of day do you prefer to play?</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-2">
              {TIMES.map((time) => (
                <button
                  key={time.id}
                  onClick={() => toggleTime(time.id)}
                  className={cn(
                    'p-4 rounded-lg border-2 transition-all duration-200 text-left',
                    selectedTimes.has(time.id)
                      ? 'bg-primary/10 border-primary'
                      : 'bg-muted/50 border-muted hover:border-muted-foreground/50'
                  )}
                >
                  <div className="font-medium text-sm">{time.label}</div>
                  <div className="text-xs text-muted-foreground">{time.time}</div>
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-4">
              Selected: {selectedTimes.size > 0 ? Array.from(selectedTimes).join(', ') : 'None'}
            </p>
          </CardContent>
        </Card>

        {/* Skill Level */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Skill Level</CardTitle>
            <CardDescription>What's your current playing level?</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-2">
              {SKILL_LEVELS.map((level) => (
                <button
                  key={level}
                  onClick={() => setSelectedSkillLevel(level)}
                  className={cn(
                    'p-4 rounded-lg border-2 transition-all duration-200',
                    selectedSkillLevel === level
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-muted text-muted-foreground border-muted hover:border-muted-foreground/50'
                  )}
                >
                  <div className="font-medium text-sm">{level}</div>
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-4">
              Selected: {selectedSkillLevel}
            </p>
          </CardContent>
        </Card>

        {/* Preferred Formats */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Preferred Formats</CardTitle>
            <CardDescription>Which play styles interest you?</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {FORMATS.map((format) => (
                <button
                  key={format.id}
                  onClick={() => toggleFormat(format.id)}
                  className={cn(
                    'p-4 rounded-lg border-2 transition-all duration-200 text-left',
                    selectedFormats.has(format.id)
                      ? 'bg-primary/10 border-primary'
                      : 'bg-muted/50 border-muted hover:border-muted-foreground/50'
                  )}
                >
                  <div className="font-medium text-sm">{format.label}</div>
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-4">
              Selected: {selectedFormats.size > 0 ? Array.from(selectedFormats).join(', ') : 'None'}
            </p>
          </CardContent>
        </Card>

        {/* Sessions Per Week */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Target Sessions Per Week</CardTitle>
            <CardDescription>How many sessions do you want to book weekly?</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4 justify-center py-6">
              <Button
                variant="outline"
                size="icon"
                onClick={() => setSessionsPerWeek(Math.max(1, sessionsPerWeek - 1))}
                disabled={sessionsPerWeek <= 1}
              >
                <Minus className="h-4 w-4" />
              </Button>
              <div className="text-center min-w-[100px]">
                <div className="text-4xl font-bold text-primary">{sessionsPerWeek}</div>
                <div className="text-xs text-muted-foreground">sessions/week</div>
              </div>
              <Button
                variant="outline"
                size="icon"
                onClick={() => setSessionsPerWeek(Math.min(7, sessionsPerWeek + 1))}
                disabled={sessionsPerWeek >= 7}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Save Button */}
        <Button
          onClick={handleSave}
          disabled={isSaving}
          className="w-full"
          size="lg"
        >
          {isSaving ? 'Saving...' : 'Save Preferences'}
        </Button>
      </div>
    </div>
  )
}
