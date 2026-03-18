// Generate realistic pickleball club CSV data — 18 months, ~1500 sessions
const courts = ['Court 1', 'Court 2', 'Court 3', 'Court 4', 'Court 5', 'Court 6'];
const formats = ['OPEN_PLAY', 'CLINIC', 'DRILL', 'LEAGUE_PLAY', 'SOCIAL'];
const skills = ['ALL_LEVELS', 'BEGINNER', 'INTERMEDIATE', 'ADVANCED'];
const names = [
  'Sarah Mitchell', 'James Wilson', 'Rachel Kim', 'Emma Johnson', 'Lisa Park',
  'David Brown', 'Anna Garcia', 'Tom Rivera', 'Maria Santos', 'Kevin Lee',
  'Chris Taylor', 'Mike Chen', 'Priya Sharma', 'Alex Rivera', 'Sophie Taylor',
  'Mark Johnson', 'Jennifer Liu', 'Ryan Foster', 'Kelly Wright', 'Brandon Hall',
  'Megan Scott', 'Jake Rodriguez', 'Diana Park', 'Sam Roberts', 'Nina Lopez',
  'Liam Nelson', 'Olivia Turner', 'Ethan Moore', 'Ava White', 'Noah Harris',
  'Isabella Clark', 'Lucas Martin', 'Sophia Lee', 'Mason Brown', 'Charlotte Davis',
  'Logan Garcia', 'Amelia Wilson', 'Aiden Thomas', 'Harper Jackson', 'Elijah Anderson',
  'Evelyn Martinez', 'Carter Thompson', 'Abigail Robinson', 'Sebastian Wright', 'Emily Hill',
  'Jack Scott', 'Ella Green', 'Owen Adams', 'Scarlett Baker', 'Henry Nelson',
  'Grace Hall', 'Caleb King', 'Chloe Allen', 'Wyatt Young', 'Victoria Hernandez',
  'Benjamin Walker', 'Penelope Lewis', 'Leo Robinson', 'Layla Campbell', 'Levi Mitchell',
  'Riley Stewart', 'Daniel Rogers', 'Zoey Reed', 'Gabriel Cook', 'Nora Morgan',
  'Matthew Bell', 'Lily Murphy', 'Jackson Bailey', 'Hannah Rivera', 'Samuel Cox',
  'Addison Howard', 'Jayden Ward', 'Aurora Torres', 'Julian Peterson', 'Stella Gray',
  'Josiah Ramirez', 'Maya Collins', 'Joshua Ross', 'Savannah Sanders', 'Lincoln Price',
  'Bella Bennett', 'Theodore Wood', 'Paisley Barnes', 'Jaxon Ross', 'Hazel Fisher',
  'Mateo Cruz', 'Ruby Bryant', 'Ezra Griffin', 'Willow Diaz', 'Luke Hayes',
  'Ellie Russell', 'Asher Sullivan', 'Violet Reynolds', 'Andrew Simmons', 'Leah Foster',
  'Grayson Powell', 'Aria Long', 'Nathan Patterson', 'Nova Hughes', 'Thomas Flores',
  'Emilia Washington', 'Anthony Butler', 'Claire Barnes', 'Isaiah Coleman', 'Mila Jenkins',
  'Christopher Perry', 'Audrey Evans', 'Eli Torres', 'Skylar Edwards', 'Miles Collins',
  'Brooklyn Murphy', 'Dominic Reed', 'Lucy Cook', 'Jeremiah Morgan', 'Aaliyah Bell',
  'Cameron Howard', 'Eleanor Ward', 'Adrian Brooks', 'Natalie Gray', 'Easton Sanders',
  'Kinsley Bennett', 'Colton Wood', 'Naomi Barnes', 'Robert Ross', 'Alice Fisher',
];

const timeSlots = [
  { start: '06:00', end: '07:30', weight: 0.3 },
  { start: '07:30', end: '09:00', weight: 0.5 },
  { start: '09:00', end: '10:30', weight: 0.8 },
  { start: '10:30', end: '12:00', weight: 0.7 },
  { start: '12:00', end: '13:30', weight: 0.5 },
  { start: '13:30', end: '15:00', weight: 0.4 },
  { start: '15:00', end: '16:30', weight: 0.6 },
  { start: '16:30', end: '18:00', weight: 0.9 },
  { start: '18:00', end: '19:30', weight: 1.0 },
  { start: '19:30', end: '21:00', weight: 0.8 },
  { start: '21:00', end: '22:00', weight: 0.4 },
];

function rand(min: number, max: number) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }
function pickN<T>(arr: T[], n: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, n);
}

const rows: string[] = ['date,startTime,endTime,court,format,skillLevel,registered,capacity,pricePerPlayer,playerNames'];

const startDate = new Date('2024-09-01');
const endDate = new Date('2026-03-18');

// Member activity patterns — some are regulars, some casual, some churned
const memberPool = names.slice(0, 127);
const powerPlayers = memberPool.slice(0, 15);  // 4+ per week
const regulars = memberPool.slice(15, 55);     // 2-3 per week
const casuals = memberPool.slice(55, 90);      // 1 per week
const occasionals = memberPool.slice(90, 127); // <1 per week

for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
  const dayOfWeek = d.getDay(); // 0=Sun
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
  const dateStr = d.toISOString().slice(0, 10);
  const monthIdx = (d.getFullYear() - 2024) * 12 + d.getMonth();
  
  // Growth: more sessions in later months
  const growthFactor = 1 + monthIdx * 0.03;
  
  // Seasonal: summer busier, winter slower
  const month = d.getMonth();
  const seasonFactor = [0.7, 0.7, 0.85, 0.95, 1.0, 1.1, 1.15, 1.1, 1.0, 0.9, 0.8, 0.7][month];
  
  // How many sessions today
  const baseSessions = isWeekend ? rand(6, 10) : rand(3, 7);
  const sessionsToday = Math.round(baseSessions * growthFactor * seasonFactor);
  
  // Pick which time slots
  const availableSlots = timeSlots.filter(() => Math.random() < 0.7);
  const todaysSlots = availableSlots.slice(0, sessionsToday);
  
  for (const slot of todaysSlots) {
    const court = pick(courts);
    const format = Math.random() < 0.4 ? 'OPEN_PLAY' 
      : Math.random() < 0.25 ? 'CLINIC'
      : Math.random() < 0.2 ? 'LEAGUE_PLAY'
      : Math.random() < 0.3 ? 'DRILL'
      : 'SOCIAL';
    
    const skill = format === 'CLINIC' ? pick(['BEGINNER', 'INTERMEDIATE']) 
      : format === 'LEAGUE_PLAY' ? pick(['INTERMEDIATE', 'ADVANCED'])
      : 'ALL_LEVELS';
    
    const capacity = format === 'OPEN_PLAY' ? pick([8, 12]) 
      : format === 'CLINIC' ? pick([8, 12, 16])
      : format === 'LEAGUE_PLAY' ? 4
      : format === 'DRILL' ? pick([6, 8])
      : pick([8, 16]);
    
    // Occupancy depends on time, day, growth
    const timeWeight = slot.weight;
    const dayWeight = isWeekend ? 1.2 : 1.0;
    const occupancyRate = Math.min(1, timeWeight * dayWeight * seasonFactor * (0.6 + Math.random() * 0.4));
    const registered = Math.min(capacity, Math.max(1, Math.round(capacity * occupancyRate)));
    
    // Price varies by format
    const price = format === 'OPEN_PLAY' ? pick([12, 15, 18])
      : format === 'CLINIC' ? pick([20, 25, 30])
      : format === 'LEAGUE_PLAY' ? pick([35, 40, 50])
      : format === 'DRILL' ? pick([15, 18, 20])
      : pick([10, 15]);
    
    // Pick players with realistic patterns
    const playerPool: string[] = [];
    // Power players show up often
    powerPlayers.forEach(p => { if (Math.random() < 0.15) playerPool.push(p); });
    regulars.forEach(p => { if (Math.random() < 0.06) playerPool.push(p); });
    casuals.forEach(p => { if (Math.random() < 0.02) playerPool.push(p); });
    occasionals.forEach(p => { if (Math.random() < 0.005) playerPool.push(p); });
    
    const players = pickN(playerPool.length > 0 ? playerPool : memberPool, registered);
    const playerStr = players.join('; ');
    
    rows.push(`${dateStr},${slot.start},${slot.end},${court},${format},${skill},${registered},${capacity},${price},"${playerStr}"`);
  }
}

const fs = require('fs');
fs.writeFileSync('/Users/vasilykozlov/Documents/GitHub/piqle-club-intelligence/piqle_web_tournament/demo-club-data.csv', rows.join('\n'));
console.log(`Generated ${rows.length - 1} sessions`);
