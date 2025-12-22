# Avatar Upload Setup

## Prerequisites

To enable avatar uploads, you need to create a storage bucket in Supabase.

## Steps to Set Up Supabase Storage

1. **Go to Supabase Dashboard**
   - Navigate to your project
   - Go to "Storage" in the left sidebar

2. **Create a new bucket**
   - Click "New bucket"
   - Name: `avatars`
   - Public bucket: ✅ **Enable** (so images can be accessed via public URL)
   - Click "Create bucket"

3. **Set up bucket policies** (if needed)
   - Go to "Policies" tab in the bucket settings
   - The bucket should be public, so images can be accessed without authentication
   - For uploads, users need to be authenticated (handled by API route)

4. **Verify the setup**
   - The bucket should now be visible in Storage
   - You can test uploading a file manually to ensure it works

## How It Works

1. User clicks the camera icon on the profile page (when editing)
2. File is selected and uploaded via `/api/upload-avatar` route
3. Image is stored in Supabase Storage bucket `avatars`
4. Public URL is returned and saved to user's profile in database
5. Image is displayed from the public URL

## File Limits

- Maximum file size: 5MB
- Allowed file types: Images only (image/*)
- Supported formats: JPG, PNG, GIF, WebP, etc.

## Troubleshooting

If uploads fail:
1. Check that the `avatars` bucket exists in Supabase Storage
2. Verify the bucket is set to "Public"
3. Check that `SUPABASE_SERVICE_ROLE_KEY` is set correctly in environment variables
4. Check browser console and server logs for error messages

