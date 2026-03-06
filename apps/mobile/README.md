# Piqle Player (Expo)

This folder contains the React Native / Expo client for player-facing flows only.
Tournament director workflows stay in the Next.js web app.

## What is included

- Email/password sign-in for mobile via `/api/mobile/auth/login`
- Email verification sign-up via the existing web endpoints
- Public tournament browsing
- Registration, waitlist, and Stripe checkout handoff
- Club discovery and join/leave requests
- Club chat, tournament chat, and division chat
- Player profile editing on the same user record / database

## What still stays on web

- Tournament director / admin workflows
- Advanced club moderation
- Mobile Google OAuth setup
- Advanced Stripe saved-card management flows

## Run

1. Start the web backend from the repo root.
2. In another terminal, install mobile dependencies:
   `cd apps/mobile && npm install`
3. Set the backend URL for Expo:
   `set EXPO_PUBLIC_API_URL=http://YOUR-LAN-IP:3000`
4. Start Expo:
   `npm run dev`

You can also start from the repo root with:
`npm run mobile:dev`

## Notes

- Use a LAN IP, not `localhost`, when testing from a physical phone.
- The mobile client uses bearer auth for `tRPC`, but the data still comes from the same Next.js server and PostgreSQL database as the web app.
- If a user account exists only through Google sign-in, mobile login needs native OAuth client IDs before that flow can be enabled.
