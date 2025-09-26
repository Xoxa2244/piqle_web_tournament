# Piqle Web Tournament Management System

A comprehensive web console for tournament directors to manage pickleball tournaments with teams of 1v1, 2v2, and 4v4 players.

## Features

- Tournament setup with divisions, constraints, and prizes
- CSV import from PickleballTournaments
- Drag-and-drop team/player management
- Round-robin generation with merged divisions support
- Elimination brackets with play-in rounds
- Real-time public scoreboard
- Role-based access (TD and assistants)
- Audit logging

## Tech Stack

- Next.js 15 (App Router) + TypeScript
- Supabase (Postgres + Auth + Realtime + RLS)
- Prisma ORM
- tRPC for API routes
- TanStack Query for client state
- TailwindCSS + shadcn/ui
- @dnd-kit for drag-and-drop
- Playwright for e2e testing

## Quick Start

1. Install dependencies:
```bash
npm install
```

2. Set up environment variables:
```bash
cp env.template .env.local
# Edit .env.local with your Supabase credentials
```

3. Set up the database:
```bash
npx prisma migrate dev --name init
```

4. Run the development server:
```bash
npm run dev
```

5. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Project Structure

```
/app
  /admin          # Tournament director console
  /(public)       # Public pages
    /t/[slug]     # Public scoreboard
  /api/trpc       # tRPC API routes
/components       # Reusable UI components
/lib             # Utilities and configurations
/server          # Server-side code
/prisma          # Database schema and migrations
/tests           # Test files
```

## Environment Variables

See `env.template` for required environment variables.

## Deployment

The project is configured for automatic deployment on Vercel when pushing to the main branch.

## Testing

- Unit tests: `npm run test`
- E2E tests: `npm run test:e2e`

## Database

- Generate Prisma client: `npm run db:generate`
- Push schema changes: `npm run db:push`
- Run migrations: `npm run db:migrate`
- Open Prisma Studio: `npm run db:studio`
