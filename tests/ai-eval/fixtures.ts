/**
 * Test fixtures for AI quality evaluation.
 * Each fixture contains:
 * - A user question
 * - RAG context (simulated club data)
 * - Expected answer criteria (what a good answer should contain)
 */

export interface EvalFixture {
  id: string
  name: string
  /** The user's question */
  question: string
  /** Simulated RAG context injected into the prompt */
  ragContext: string
  /** Language the question is asked in */
  language: 'en' | 'ru'
  /** Keywords/phrases that SHOULD appear in a good answer */
  expectedContains: string[]
  /** Keywords/phrases that should NOT appear */
  expectedNotContains: string[]
  /** Criteria for LLM-as-judge scoring */
  qualityCriteria: string
}

// ── Sample club data that mimics real RAG chunks ──
const SAMPLE_CLUB_CONTEXT = `## Club Information
Sunset Pickleball Club — Miami, FL. 6 outdoor courts. Hours: 7am-9pm daily.
Members: 142 active, 31 inactive (30+ days). Average session occupancy: 72%.
Monthly revenue: $8,400. Peak hours: 9am-11am weekdays, 8am-12pm weekends.

## Upcoming Sessions
1. "Morning Open Play" — Monday 9:00am. Format: Open Play. Skill: All Levels. 8/16 confirmed. Courts: 2.
2. "Intermediate Drill" — Tuesday 6:00pm. Format: Drill. Skill: Intermediate (3.0-4.0 DUPR). 4/8 confirmed. Courts: 1.
3. "Advanced League" — Wednesday 7:00pm. Format: League Play. Skill: Advanced (4.5+). 12/12 confirmed. Courts: 3.
4. "Beginner Clinic" — Thursday 10:00am. Format: Clinic. Skill: Beginner. 3/12 confirmed. Courts: 2.
5. "Friday Social" — Friday 5:00pm. Format: Social. Skill: All Levels. 10/20 confirmed. Courts: 3.
6. "Saturday Open Play" — Saturday 8:00am. Format: Open Play. Skill: Intermediate. 14/16 confirmed. Courts: 2.
7. "Sunday Mixed" — Sunday 9:00am. Format: Open Play. Skill: All Levels. 6/16 confirmed. Courts: 2.

## Member Profiles
- Maria S. (DUPR 3.8) — Plays 3x/week, prefers mornings, last played 2 days ago. Persona: IMPROVER.
- Jake T. (DUPR 4.6) — Plays 2x/week, prefers evenings, last played 5 days ago. Persona: COMPETITIVE.
- Linda R. (DUPR 2.5) — Plays 1x/week, prefers weekends, last played 14 days ago. Persona: SOCIAL.
- Tom K. (DUPR 5.1) — Plays 4x/week, prefers any time, last played 1 day ago. Persona: COMPETITIVE.
- Susan M. (DUPR 3.2) — Last played 45 days ago. Was playing 2x/week. Persona: CASUAL.

## Booking Trends
Week of Feb 24: Occupancy 68%. Monday and Thursday lowest (55%). Friday highest (85%).
Week of Mar 3: Occupancy 75%. Tuesday evening new high (100%). Weekend steady at 80%.
Monthly trend: Occupancy up 7% month-over-month. Revenue up 12%.`

// ── Test fixtures ──
export const EVAL_FIXTURES: EvalFixture[] = [
  {
    id: 'weakest-day',
    name: 'Identify weakest day of the week',
    question: 'What is my weakest day of the week?',
    ragContext: SAMPLE_CLUB_CONTEXT,
    language: 'en',
    expectedContains: ['Monday', 'Thursday'],
    expectedNotContains: ['Friday', 'Saturday'],
    qualityCriteria: `The answer should:
1. Identify Monday and/or Thursday as the weakest days (55% occupancy)
2. Reference specific occupancy numbers from the data
3. Suggest at least one actionable strategy to improve those days
4. Not claim Friday or Saturday are weak (they are strong days)`
  },
  {
    id: 'churn-analysis',
    name: 'Analyze member churn',
    question: 'What does my churn look like?',
    ragContext: SAMPLE_CLUB_CONTEXT,
    language: 'en',
    expectedContains: ['inactive', '31'],
    expectedNotContains: [],
    qualityCriteria: `The answer should:
1. Reference the 31 inactive members (30+ days)
2. Mention Susan M. as a specific churn risk (45 days inactive, was 2x/week)
3. Possibly mention Linda R. as at-risk (14 days, declining)
4. Suggest a re-engagement strategy
5. Not fabricate statistics not present in the data`
  },
  {
    id: 'underfilled-sessions',
    name: 'Identify underfilled sessions',
    question: 'Which sessions are underfilled?',
    ragContext: SAMPLE_CLUB_CONTEXT,
    language: 'en',
    expectedContains: ['Beginner Clinic', 'Thursday'],
    expectedNotContains: ['Advanced League'],
    qualityCriteria: `The answer should:
1. Identify "Beginner Clinic" (3/12 = 25% filled) as the most underfilled
2. Mention "Morning Open Play" (8/16 = 50%) and "Sunday Mixed" (6/16 = 38%)
3. NOT mention "Advanced League" as underfilled (12/12 = full)
4. Provide fill rates or ratios
5. Suggest strategies to fill underfilled sessions`
  },
  {
    id: 'peak-hours',
    name: 'Identify peak and dead hours',
    question: 'When are my peak and dead hours?',
    ragContext: SAMPLE_CLUB_CONTEXT,
    language: 'en',
    expectedContains: ['9am', 'morning'],
    expectedNotContains: [],
    qualityCriteria: `The answer should:
1. Identify peak hours: 9am-11am weekdays, 8am-12pm weekends
2. Reference Friday 5pm as popular (85% occupancy week 1)
3. Mention that Tuesday evening hit 100%
4. Identify weaker time slots (Monday/Thursday have lowest occupancy)
5. Be based on the actual data provided, not generic assumptions`
  },
  {
    id: 'revenue-improvement',
    name: 'Revenue improvement suggestions',
    question: 'How can I improve revenue?',
    ragContext: SAMPLE_CLUB_CONTEXT,
    language: 'en',
    expectedContains: [],
    expectedNotContains: [],
    qualityCriteria: `The answer should:
1. Acknowledge current revenue ($8,400/month) and positive trend (+12%)
2. Identify filling underfilled sessions (Beginner Clinic, Sunday Mixed) as opportunity
3. Suggest strategies relevant to pickleball (not generic business advice)
4. Consider the 31 inactive members as potential revenue recovery
5. Be actionable and specific, not vague platitudes`
  },
  {
    id: 'active-members',
    name: 'Identify most active members',
    question: 'Who are my most active members?',
    ragContext: SAMPLE_CLUB_CONTEXT,
    language: 'en',
    expectedContains: ['Tom'],
    expectedNotContains: ['Susan'],
    qualityCriteria: `The answer should:
1. Identify Tom K. as the most active (4x/week, played 1 day ago)
2. Mention Maria S. (3x/week, played 2 days ago)
3. NOT list Susan M. as active (45 days inactive)
4. Reference actual play frequency data
5. Be factual, based on provided data`
  },
  {
    id: 'russian-question',
    name: 'Answer in Russian when asked in Russian',
    question: 'Какой у нас процент заполняемости сессий?',
    ragContext: SAMPLE_CLUB_CONTEXT,
    language: 'ru',
    expectedContains: ['72'],
    expectedNotContains: [],
    qualityCriteria: `The answer should:
1. Be written in Russian (since the question is in Russian)
2. Reference the 72% average occupancy
3. Mention specific session fill rates
4. Be helpful and data-driven
5. Not randomly switch to English mid-response`
  },
  {
    id: 'no-data-honest',
    name: 'Honest when data is missing',
    question: 'What is the average age of my members?',
    ragContext: SAMPLE_CLUB_CONTEXT,
    language: 'en',
    expectedContains: [],
    expectedNotContains: [],
    qualityCriteria: `The answer should:
1. Clearly state that age data is NOT available in the current data
2. NOT make up or guess age statistics
3. Suggest how the manager could collect this data
4. Be honest and transparent about limitations`
  },
]

export { SAMPLE_CLUB_CONTEXT }
