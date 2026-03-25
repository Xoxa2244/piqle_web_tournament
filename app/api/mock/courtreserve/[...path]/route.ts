/**
 * Mock CourtReserve API for testing the connector.
 * Handles all CR endpoints via catch-all route.
 *
 * Usage: set baseUrl to https://dev.iqsport.ai/api/mock/courtreserve
 * Any username/password combo works for auth.
 */
import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// ── Mock Data ──

const COURTS = [
  { id: 'court-1', name: 'Court 1', courtType: 'Pickleball', isIndoor: false, isActive: true },
  { id: 'court-2', name: 'Court 2', courtType: 'Pickleball', isIndoor: false, isActive: true },
  { id: 'court-3', name: 'Court 3', courtType: 'Pickleball', isIndoor: true, isActive: true },
  { id: 'court-4', name: 'Court 4', courtType: 'Pickleball', isIndoor: true, isActive: true },
  { id: 'court-5', name: 'Court 5', courtType: 'Tennis', isIndoor: false, isActive: true },
  { id: 'court-6', name: 'Court 6', courtType: 'Tennis', isIndoor: false, isActive: true },
  { id: 'court-7', name: 'Court 7', courtType: 'Tennis', isIndoor: true, isActive: true },
  { id: 'court-8', name: 'Court 8', courtType: 'Padel', isIndoor: false, isActive: true },
]

const FIRST_NAMES = [
  'James', 'Sarah', 'Mike', 'Emily', 'David', 'Lisa', 'Chris', 'Anna',
  'Robert', 'Jessica', 'Tom', 'Rachel', 'Kevin', 'Maria', 'Brian', 'Laura',
  'Steve', 'Nicole', 'Jason', 'Amy', 'Matt', 'Jen', 'Dan', 'Kate',
  'Alex', 'Sophie', 'Ryan', 'Emma', 'Mark', 'Olivia', 'Josh', 'Megan',
  'Andrew', 'Hannah', 'Tyler', 'Chloe', 'Greg', 'Natalie', 'Eric', 'Samantha',
  'Jeff', 'Ashley', 'Derek', 'Brittany', 'Paul', 'Stephanie', 'Tim', 'Heather',
  'Scott', 'Diana',
]

const LAST_NAMES = [
  'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez',
  'Martinez', 'Wilson', 'Anderson', 'Taylor', 'Thomas', 'Moore', 'Jackson', 'Martin',
  'Lee', 'Perez', 'Thompson', 'White', 'Harris', 'Sanchez', 'Clark', 'Ramirez',
  'Lewis', 'Robinson', 'Walker', 'Young', 'Allen', 'King', 'Wright', 'Scott',
  'Torres', 'Nguyen', 'Hill', 'Flores', 'Green', 'Adams', 'Nelson', 'Baker',
  'Hall', 'Rivera', 'Campbell', 'Mitchell', 'Carter', 'Roberts', 'Gomez', 'Phillips',
  'Evans', 'Turner',
]

function generateMembers(count: number) {
  const members = []
  for (let i = 0; i < count; i++) {
    const firstName = FIRST_NAMES[i % FIRST_NAMES.length]
    const lastName = LAST_NAMES[i % LAST_NAMES.length]
    const email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}${i > 49 ? i : ''}@email.com`
    members.push({
      organizationMemberId: `member-${i + 1}`,
      email,
      firstName,
      lastName,
      phonenumber: `+1${String(2125550100 + i)}`,
      gender: i % 3 === 0 ? 'Female' : 'Male',
      city: ['Miami', 'Austin', 'Denver', 'Seattle', 'Nashville'][i % 5],
      state: ['FL', 'TX', 'CO', 'WA', 'TN'][i % 5],
      membershipTypeName: i < 30 ? 'Premium' : i < 80 ? 'Standard' : 'Basic',
      ratings: [
        { ratingTypeName: 'Singles Rating', ratingValue: 2.5 + (i % 20) * 0.15 },
        { ratingTypeName: 'Doubles Rating', ratingValue: 2.8 + (i % 18) * 0.15 },
      ],
      createdDateTime: new Date(Date.now() - (180 - i) * 86400000).toISOString(),
      updatedDateTime: new Date(Date.now() - (i % 30) * 86400000).toISOString(),
    })
  }
  return members
}

const ALL_MEMBERS = generateMembers(150)

const RESERVATION_TYPES = [
  'Open Play', 'Open Play', 'Open Play', 'Clinic', 'Drill Session',
  'League Play', 'Social Mixer', 'Open Play', 'Open Play', 'Clinic',
]

const TIME_SLOTS = [
  { start: '06:00', end: '07:30' },
  { start: '07:30', end: '09:00' },
  { start: '09:00', end: '10:30' },
  { start: '10:30', end: '12:00' },
  { start: '13:00', end: '14:30' },
  { start: '14:30', end: '16:00' },
  { start: '16:00', end: '17:30' },
  { start: '17:30', end: '19:00' },
  { start: '19:00', end: '20:30' },
]

function generateReservations(fromDate: string, toDate: string) {
  const from = new Date(fromDate)
  const to = new Date(toDate)
  const reservations = []
  let id = 1

  const current = new Date(from)
  while (current <= to) {
    const dayOfWeek = current.getDay()
    // More sessions on weekdays, fewer on weekends
    const sessionsPerDay = dayOfWeek === 0 || dayOfWeek === 6 ? 4 : 7

    for (let s = 0; s < sessionsPerDay; s++) {
      const court = COURTS[s % COURTS.length]
      const slot = TIME_SLOTS[s % TIME_SLOTS.length]
      const type = RESERVATION_TYPES[s % RESERVATION_TYPES.length]
      const memberCount = 2 + Math.floor(Math.random() * 6) // 2-8 players

      // Pick random members for this session
      const sessionMembers = []
      const used = new Set<number>()
      for (let m = 0; m < memberCount; m++) {
        let idx: number
        do { idx = Math.floor(Math.random() * ALL_MEMBERS.length) } while (used.has(idx))
        used.add(idx)
        const member = ALL_MEMBERS[idx]
        sessionMembers.push({
          organizationMemberId: member.organizationMemberId,
          memberName: `${member.firstName} ${member.lastName}`,
          email: member.email,
        })
      }

      reservations.push({
        reservationId: `res-${id++}`,
        courtId: court.id,
        courtName: court.name,
        reservationDate: current.toISOString().split('T')[0],
        startTime: slot.start,
        endTime: slot.end,
        reservationType: type,
        members: sessionMembers,
        isCancelled: false,
      })
    }

    current.setDate(current.getDate() + 1)
  }

  return reservations
}

function generateCancelledReservations(fromDate: string, toDate: string) {
  const all = generateReservations(fromDate, toDate)
  // ~10% cancellation rate
  return all
    .filter((_, i) => i % 10 === 3)
    .map(r => ({
      ...r,
      reservationId: `${r.reservationId}-cancelled`,
      isCancelled: true,
      cancelledDate: r.reservationDate,
    }))
}

function generateAttendance(fromDate: string, toDate: string) {
  const reservations = generateReservations(fromDate, toDate)
  const attendance = []
  for (const res of reservations) {
    for (const member of res.members || []) {
      // 85% check-in rate
      if (Math.random() < 0.85) {
        attendance.push({
          organizationMemberId: member.organizationMemberId,
          memberName: member.memberName,
          checkInDateTime: `${res.reservationDate}T${res.startTime}:00`,
          checkOutDateTime: `${res.reservationDate}T${res.endTime}:00`,
          courtName: res.courtName,
        })
      }
    }
  }
  return attendance
}

// ── Auth check ──

function checkAuth(request: NextRequest): boolean {
  const auth = request.headers.get('authorization')
  if (!auth?.startsWith('Basic ')) return false
  // Accept any username:password for mock
  try {
    const decoded = Buffer.from(auth.slice(6), 'base64').toString()
    return decoded.includes(':')
  } catch {
    return false
  }
}

// ── Route handler ──

export async function GET(request: NextRequest) {
  if (!checkAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams, pathname } = request.nextUrl
  // Extract the CR API path after /api/mock/courtreserve
  const crPath = pathname.replace('/api/mock/courtreserve', '')

  // Courts
  if (crPath === '/api/v1/reservation/courts') {
    return NextResponse.json(COURTS)
  }

  // Members
  if (crPath === '/api/v1/member/get') {
    const page = parseInt(searchParams.get('pageNumber') || '1')
    const pageSize = parseInt(searchParams.get('pageSize') || '100')
    const updatedFrom = searchParams.get('createdOrUpdatedFrom')

    let filtered = ALL_MEMBERS
    if (updatedFrom) {
      const from = new Date(updatedFrom)
      filtered = ALL_MEMBERS.filter(m => new Date(m.updatedDateTime) >= from)
    }

    const start = (page - 1) * pageSize
    const items = filtered.slice(start, start + pageSize)

    return NextResponse.json({
      items,
      totalCount: filtered.length,
      pageNumber: page,
      pageSize,
    })
  }

  // Active reservations
  if (crPath === '/api/v1/reservationreport/listactive') {
    const from = searchParams.get('reservationsFromDate') || new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0]
    const to = searchParams.get('reservationsToDate') || new Date().toISOString().split('T')[0]
    return NextResponse.json(generateReservations(from, to))
  }

  // Cancelled reservations
  if (crPath === '/api/v1/reservationreport/listcancelled') {
    const from = searchParams.get('reservationsFromDate') || new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0]
    const to = searchParams.get('reservationsToDate') || new Date().toISOString().split('T')[0]
    return NextResponse.json(generateCancelledReservations(from, to))
  }

  // Attendance
  if (crPath === '/api/v1/attendancereport/detailed') {
    const from = searchParams.get('reservationsFromDate') || new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0]
    const to = searchParams.get('reservationsToDate') || new Date().toISOString().split('T')[0]
    return NextResponse.json(generateAttendance(from, to))
  }

  // Who is here today
  if (crPath === '/api/v1/reservationreport/whoisheretoday') {
    const today = new Date().toISOString().split('T')[0]
    const att = generateAttendance(today, today)
    return NextResponse.json(att.slice(0, 12))
  }

  // Events
  if (crPath === '/api/v1/eventcalendar/eventlist') {
    return NextResponse.json([])
  }

  // Event registrations
  if (crPath === '/api/v1/eventregistrationreport/listactive') {
    return NextResponse.json([])
  }

  // Reservation types
  if (crPath === '/api/v1/reservation/reservationtypes') {
    return NextResponse.json([
      { id: 1, name: 'Open Play' },
      { id: 2, name: 'Clinic' },
      { id: 3, name: 'Drill Session' },
      { id: 4, name: 'League Play' },
      { id: 5, name: 'Social Mixer' },
    ])
  }

  return NextResponse.json({ error: 'Endpoint not found', path: crPath }, { status: 404 })
}
