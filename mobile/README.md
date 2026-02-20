# Piqle Mobile MVP

This folder contains an isolated Expo app scaffold for the mobile product.

- Architecture and screen map: `/Users/vasilykozlov/Documents/GitHub/piqle_web_tournament/mobile/ARCHITECTURE.md`

## Included now

- React Native + Expo project shell.
- Real mobile sign-in flow (email + password) using dedicated mobile auth API (currently not blocking app entry).
- In-app mobile sign-up flow with OTP (request code + complete sign-up).
- Bottom-tab navigation with core product surfaces:
  - `Home` (dashboard + starting soon + deep-link quick filters)
  - `Tournaments` (search + filters + pull-to-refresh + infinite scroll via server cursor pagination)
  - `Chats`
  - `My Tournaments` (organizer)
- Stack screens:
  - `Tournament Details`
  - `Registration`
- Product policy mocked in UI:
  - `MLP` and `INDY_LEAGUE` => `WEB_ONLY` management
  - all other formats => `MOBILE_ALLOWED`

## Run locally

1. `cd /Users/vasilykozlov/Documents/GitHub/piqle_web_tournament/mobile`
2. `npm install`
3. `npm run start`

### Optional env for live API

- `EXPO_PUBLIC_API_BASE_URL` (example: `http://localhost:3000`)
- `EXPO_PUBLIC_NEXT_AUTH_SESSION_TOKEN` (optional debug override; normal flow uses in-app sign-in)

## Next integration steps

1. Add Google sign-in for mobile (optional, via deep link).
2. Move rate limiting from in-memory to Redis for multi-instance deployments.
3. Add dedicated mobile router whitelist (currently guarded by access policy).
4. Expand organizer actions for small tournaments only.

## Mobile auth endpoints

- `POST /api/mobile/auth/signin/password`
- `GET /api/mobile/auth/session`
- `POST /api/mobile/auth/signout`
- `POST /api/mobile/auth/signup/request-code`
- `POST /api/mobile/auth/signup/complete`

## Auth rate limits

- Sign-in: `30 / 15m` per IP, `8 / 15m` per IP+email.
- Sign-up request code: `20 / 15m` per IP, `4 / 15m` per IP+email.
- Sign-up complete: `25 / 15m` per IP, `8 / 15m` per IP+email.
- Block duration after hitting limit: `20m`.
