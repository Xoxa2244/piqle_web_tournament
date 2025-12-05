'use client'

import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { trpc } from '@/lib/trpc'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import interactionPlugin from '@fullcalendar/interaction'
import { Calendar, ArrowLeft, Trophy, Users, MapPin } from 'lucide-react'
import Link from 'next/link'

export default function CalendarPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [selectedEvent, setSelectedEvent] = useState<any>(null)

  // Redirect if not TD
  useEffect(() => {
    if (status === 'authenticated' && session?.user?.role !== 'TD') {
      router.push('/')
    }
  }, [session, status, router])

  const { data: events, isLoading } = trpc.dashboard.getCalendarEvents.useQuery({
    startDate: undefined,
    endDate: undefined,
  })

  if (status === 'loading' || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading calendar...</p>
        </div>
      </div>
    )
  }

  if (!session || session.user.role !== 'TD') {
    return null
  }

  // Format events for FullCalendar
  const calendarEvents = events?.map((event) => ({
    id: event.id,
    title: event.title,
    start: event.start,
    end: event.end,
    allDay: event.allDay,
    backgroundColor: getEventColor(event.type, event.status),
    borderColor: getEventColor(event.type, event.status),
    extendedProps: {
      type: event.type,
      status: event.status,
      tournamentId: event.tournamentId,
      location: event.location,
      playersCount: event.playersCount,
    },
  }))

  function getEventColor(type: string, status: string) {
    if (type === 'registration_deadline') {
      return '#f59e0b' // Orange
    }

    switch (status) {
      case 'IN_PROGRESS':
        return '#10b981' // Green
      case 'REGISTRATION':
        return '#3b82f6' // Blue
      case 'COMPLETED':
        return '#6b7280' // Gray
      case 'DRAFT':
        return '#9ca3af' // Light gray
      default:
        return '#3b82f6'
    }
  }

  function handleEventClick(clickInfo: any) {
    setSelectedEvent({
      title: clickInfo.event.title,
      start: clickInfo.event.start,
      end: clickInfo.event.end,
      ...clickInfo.event.extendedProps,
    })
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <Link
                href="/dashboard"
                className="text-gray-400 hover:text-gray-600"
              >
                <ArrowLeft className="w-6 h-6" />
              </Link>
              <div>
                <h1 className="text-3xl font-bold text-gray-900 flex items-center">
                  <Calendar className="w-8 h-8 mr-3 text-blue-600" />
                  Tournament Calendar
                </h1>
                <p className="mt-1 text-sm text-gray-500">
                  View and manage all your tournaments
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Calendar */}
          <div className="lg:col-span-3">
            <div className="bg-white shadow rounded-lg p-6">
              <FullCalendar
                plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
                initialView="dayGridMonth"
                headerToolbar={{
                  left: 'prev,next today',
                  center: 'title',
                  right: 'dayGridMonth,timeGridWeek,timeGridDay',
                }}
                events={calendarEvents}
                eventClick={handleEventClick}
                height="auto"
                aspectRatio={1.8}
                eventDisplay="block"
                displayEventTime={false}
              />
            </div>

            {/* Legend */}
            <div className="mt-6 bg-white shadow rounded-lg p-6">
              <h3 className="text-sm font-medium text-gray-900 mb-4">Legend</h3>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <div className="flex items-center">
                  <div className="w-4 h-4 rounded bg-blue-500 mr-2"></div>
                  <span className="text-sm text-gray-700">Registration Open</span>
                </div>
                <div className="flex items-center">
                  <div className="w-4 h-4 rounded bg-green-500 mr-2"></div>
                  <span className="text-sm text-gray-700">In Progress</span>
                </div>
                <div className="flex items-center">
                  <div className="w-4 h-4 rounded bg-gray-500 mr-2"></div>
                  <span className="text-sm text-gray-700">Completed</span>
                </div>
                <div className="flex items-center">
                  <div className="w-4 h-4 rounded bg-orange-500 mr-2"></div>
                  <span className="text-sm text-gray-700">Reg Deadline</span>
                </div>
                <div className="flex items-center">
                  <div className="w-4 h-4 rounded bg-gray-300 mr-2"></div>
                  <span className="text-sm text-gray-700">Draft</span>
                </div>
              </div>
            </div>
          </div>

          {/* Event Details Sidebar */}
          <div className="lg:col-span-1">
            <div className="bg-white shadow rounded-lg p-6 sticky top-8">
              {selectedEvent ? (
                <div>
                  <h3 className="text-lg font-medium text-gray-900 mb-4">
                    Event Details
                  </h3>
                  <div className="space-y-4">
                    <div>
                      <div className="text-sm font-medium text-gray-500">Title</div>
                      <div className="mt-1 text-sm text-gray-900">{selectedEvent.title}</div>
                    </div>

                    {selectedEvent.type === 'tournament' && (
                      <>
                        <div>
                          <div className="text-sm font-medium text-gray-500 flex items-center">
                            <Users className="w-4 h-4 mr-1" />
                            Players
                          </div>
                          <div className="mt-1 text-sm text-gray-900">
                            {selectedEvent.playersCount || 0} registered
                          </div>
                        </div>

                        {selectedEvent.location && (
                          <div>
                            <div className="text-sm font-medium text-gray-500 flex items-center">
                              <MapPin className="w-4 h-4 mr-1" />
                              Location
                            </div>
                            <div className="mt-1 text-sm text-gray-900">
                              {selectedEvent.location}
                            </div>
                          </div>
                        )}
                      </>
                    )}

                    <div>
                      <div className="text-sm font-medium text-gray-500">Date</div>
                      <div className="mt-1 text-sm text-gray-900">
                        {new Date(selectedEvent.start).toLocaleDateString('en-US', {
                          weekday: 'long',
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric',
                        })}
                      </div>
                    </div>

                    <div>
                      <div className="text-sm font-medium text-gray-500">Status</div>
                      <div className="mt-1">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            selectedEvent.status === 'IN_PROGRESS'
                              ? 'bg-green-100 text-green-800'
                              : selectedEvent.status === 'REGISTRATION'
                              ? 'bg-blue-100 text-blue-800'
                              : selectedEvent.status === 'COMPLETED'
                              ? 'bg-gray-100 text-gray-800'
                              : 'bg-gray-100 text-gray-600'
                          }`}
                        >
                          {selectedEvent.status}
                        </span>
                      </div>
                    </div>

                    {selectedEvent.type === 'tournament' && (
                      <div className="pt-4 border-t">
                        <Link
                          href={`/admin/${selectedEvent.tournamentId}`}
                          className="w-full inline-flex justify-center items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
                        >
                          <Trophy className="w-4 h-4 mr-2" />
                          View Tournament
                        </Link>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="text-center py-12">
                  <Calendar className="w-12 h-12 mx-auto text-gray-400 mb-4" />
                  <p className="text-sm text-gray-500">
                    Click on an event to see details
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

