# User Role System

## Overview

The application now supports a three-tier user role system:

1. **PLAYER** (default) - Regular users who can view and participate in tournaments
2. **TD** (Tournament Director) - Can create and manage tournaments
3. **ASSISTANT** - Can help manage tournaments (assigned by TDs)

## User Roles

### PLAYER
- Default role for all new users
- Can view public tournaments
- Can register for tournaments (when feature is implemented)
- Can view their profile and update personal information
- **Can upgrade to Tournament Director**

### TD (Tournament Director)
- All PLAYER permissions
- Can create new tournaments
- Can manage their own tournaments
- Can assign assistants
- Access to TD Console (`/admin`)

### ASSISTANT
- Assigned by Tournament Directors
- Can help manage specific tournaments
- Limited administrative access

## How to Become a Tournament Director

### Option 1: Through Profile Page

1. Log in to your account
2. Go to **Profile** page
3. Click **"Become a Tournament Director"** button
4. Confirm the action
5. You will immediately be upgraded to TD role
6. Access the TD Console through the link or navigate to `/admin`

### Option 2: Manual Database Update (for admins)

```sql
UPDATE users 
SET role = 'TD' 
WHERE email = 'user@example.com';
```

## Database Migration

To apply the PLAYER role to your existing database, run the SQL migration:

### Using Supabase Dashboard (Recommended)

1. Open Supabase Dashboard → SQL Editor
2. Copy and execute the contents of `add-player-role-migration.sql`
3. Verify the changes with the provided queries

### Using Prisma

```bash
npx prisma generate
npx prisma db push
```

## Technical Details

### Schema Changes

**`prisma/schema.prisma`:**
```prisma
model User {
  // ...
  role UserRole @default(PLAYER)
  // ...
}

enum UserRole {
  PLAYER
  TD
  ASSISTANT
}
```

### tRPC Endpoint

**`server/routers/user.ts`:**
- `becomeTournamentDirector` - Upgrades a PLAYER to TD role

### UI Changes

**`app/profile/page.tsx`:**
- Displays current user role
- Shows "Become a Tournament Director" button for PLAYER role
- Shows info card with role-specific information
- Link to TD Console for TD users

## Testing

1. Create a new account (will be PLAYER by default)
2. Go to Profile page
3. Verify role is shown as "Player"
4. Click "Become a Tournament Director"
5. Confirm the action
6. Verify role changes to "Tournament Director"
7. Access TD Console via the link

## Future Enhancements

- Email verification before upgrading to TD
- TD application/approval process
- Role-based dashboard customization
- Player statistics and tournament history

