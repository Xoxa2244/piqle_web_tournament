# Piqle Player (Expo)

This folder contains the React Native / Expo client for player-facing flows only.
Tournament director workflows stay in the Next.js web app.

## What is included

- Email/password sign-in for mobile via `/api/mobile/auth/login`
- Native Google sign-in for mobile via `/api/mobile/auth/google/native`
- Native Apple sign-in for iOS via `/api/mobile/auth/apple/native`
- Email verification sign-up via the existing web endpoints
- Public tournament browsing
- Registration, waitlist, and Stripe checkout handoff
- Club discovery and join/leave requests
- Club chat, tournament chat, and division chat
- Player profile editing on the same user record / database

## What still stays on web

- Tournament director / admin workflows
- Advanced club moderation
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
- Native Google sign-in reads `GOOGLE_CLIENT_ID` from the backend automatically, so `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` is only needed if you want to override it locally.
- iOS still needs `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` or `EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME` so the Expo config plugin can register the callback scheme in the native build.
- Apple sign-in requires `ios.usesAppleSignIn = true`, the Apple capability enabled for the App ID, and a rebuilt iOS dev client.
- After adding a native auth package or changing native auth capabilities/client IDs, rebuild the dev client. A plain Metro reload is not enough.
