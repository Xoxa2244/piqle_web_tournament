# DUPR Integration Testing Guide

## Test Keys

```
clientId: 7094449209
clientKey: test-ck-77f42fa9-c96b-45b7-ffb2-7f1d83376a82
clientSecret: test-cs-6b6b282898b14680ff7cad0883631fa2
```

## Setup

1. **Add environment variables to `.env.local`:**
   ```bash
   NEXT_PUBLIC_DUPR_CLIENT_KEY="test-ck-77f42fa9-c96b-45b7-ffb2-7f1d83376a82"
   DUPR_CLIENT_ID="7094449209"
   DUPR_CLIENT_SECRET="test-cs-6b6b282898b14680ff7cad0883631fa2"
   ```

2. **Apply database migration:**
   ```bash
   # Option 1: Using Prisma migrate
   npx prisma migrate dev
   
   # Option 2: Manual SQL (if migrate doesn't work)
   # Run the SQL from: prisma/migrations/20251208184221_add_dupr_fields_to_user/migration.sql
   ```

3. **Restart development server:**
   ```bash
   npm run dev
   ```

## Testing Steps

### 1. Test Login Modal URL

The login URL should be:
```
https://uat.dupr.gg/login-external-app/test-ck-77f42fa9-c96b-45b7-ffb2-7f1d83376a82
```

**Manual test:**
- Open this URL directly in browser
- Should show DUPR login page
- If it works, the iframe will work too

### 2. Test Profile Page Integration

1. **Navigate to profile page:**
   ```
   http://localhost:3000/profile
   ```

2. **Check DUPR Link section:**
   - Should show "Not linked" and "Connect DUPR" button
   - If already linked, should show DUPR ID and ratings

3. **Click "Connect DUPR" button:**
   - Modal should open
   - Iframe should load DUPR login page
   - URL in iframe should match the test URL above

### 3. Test Login Flow

1. **In the modal iframe:**
   - Enter DUPR test account credentials
   - Complete login process

2. **After successful login:**
   - DUPR should send `postMessage` with:
     ```javascript
     {
       duprId: "...",
       userToken: "...",
       refreshToken: "...",
       stats: {
         rating: ...,
         singlesRating: ...,
         doublesRating: ...,
         name: "..."
       }
     }
     ```

3. **Expected behavior:**
   - Modal closes automatically
   - Profile page shows "Linked: <DUPR ID>"
   - Ratings displayed if available
   - Data saved to database

### 4. Verify Database

Check that data was saved:
```sql
SELECT 
  id, 
  email, 
  name, 
  dupr_id, 
  dupr_rating_singles, 
  dupr_rating_doubles 
FROM users 
WHERE dupr_id IS NOT NULL;
```

## Debugging

### Check Browser Console

Open browser DevTools (F12) and check:
- Console for any errors
- Network tab for API calls to `/api/dupr/link`
- PostMessage events (add listener in console):
  ```javascript
  window.addEventListener('message', (e) => {
    console.log('PostMessage received:', e.origin, e.data);
  });
  ```

### Check Server Logs

Look for:
- API endpoint calls: `POST /api/dupr/link`
- Any errors in terminal where `npm run dev` is running

### Common Issues

1. **Modal doesn't open:**
   - Check `NEXT_PUBLIC_DUPR_CLIENT_KEY` is set
   - Check browser console for errors
   - Verify iframe URL is correct

2. **PostMessage not received:**
   - Check origin validation in `DUPRLoginModal.tsx`
   - Verify DUPR is sending from `https://uat.dupr.gg`
   - Check browser console for postMessage events

3. **API call fails:**
   - Check authentication (must be logged in)
   - Check server logs for errors
   - Verify database migration was applied

4. **Data not saving:**
   - Check database migration
   - Verify Prisma schema matches database
   - Check server logs for database errors

## Testing Checklist

- [ ] Environment variables set in `.env.local`
- [ ] Database migration applied
- [ ] Development server restarted
- [ ] Can access profile page
- [ ] "Connect DUPR" button visible
- [ ] Modal opens when clicking button
- [ ] DUPR login page loads in iframe
- [ ] Can login with test account
- [ ] PostMessage received after login
- [ ] Modal closes after successful login
- [ ] Profile shows linked status
- [ ] DUPR ID displayed correctly
- [ ] Ratings displayed (if available)
- [ ] Data persists after page refresh
- [ ] Database contains DUPR data

## Next Steps

After successful testing:
1. Test with production keys (when available)
2. Add error handling for edge cases
3. Add "Reconnect" / "Unlink" functionality (optional)
4. Add token refresh logic (if needed)

