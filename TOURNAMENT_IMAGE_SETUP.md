# Tournament Image Upload Setup

## Prerequisites

To enable tournament image uploads, you need to create a storage bucket in Supabase.

## Steps to Set Up Supabase Storage

1. **Go to Supabase Dashboard**
   - Navigate to your project
   - Go to "Storage" in the left sidebar

2. **Create a new bucket**
   - Click "New bucket"
   - Name: `tournament-images`
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

1. User selects an image file when creating a tournament
2. Image is automatically resized to max 1920px (width or height) on client side
3. User crops the image to square using the cropper component
4. Cropped image is automatically resized again to max 1920px before upload
5. Image is uploaded via `/api/upload-tournament-image` route
6. Image is stored in Supabase Storage bucket `tournament-images`
7. Public URL is returned and saved to tournament's `image` field in database
8. Image is displayed from the public URL on tournament cards and detail pages

## File Limits

- Maximum file size: 5MB (before resize)
- Maximum image dimensions after resize: 1920px (width or height)
- Crop size: 300x300px (square)
- Supported formats: JPG, PNG, GIF, WebP, etc.

## Image Processing

- Images are automatically resized on the client side before upload
- Cropping is done with a square aspect ratio (1:1)
- The cropper ensures the crop area never goes outside image bounds
- Final image is saved as JPEG with 85% quality

## Troubleshooting

If uploads fail:
1. Check that the `tournament-images` bucket exists in Supabase Storage
2. Verify the bucket is set to "Public"
3. Check that `SUPABASE_SERVICE_ROLE_KEY` is set correctly in environment variables
4. Check browser console and server logs for error messages

