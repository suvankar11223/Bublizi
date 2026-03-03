# Cloudinary Setup Guide for Voice Messages

## Issue
Voice message uploads are failing because Cloudinary credentials are not configured on Render.

## Quick Fix - Add to Render Environment Variables

Go to your Render dashboard and add these environment variables:

1. Go to: https://dashboard.render.com
2. Select your backend service (chatzi backend)
3. Click "Environment" in the left sidebar
4. Add these three variables:

```
CLOUDINARY_CLOUD_NAME=your_cloud_name_here
CLOUDINARY_API_KEY=your_api_key_here
CLOUDINARY_API_SECRET=your_api_secret_here
```

## How to Get Cloudinary Credentials

### Option 1: Use Existing Cloudinary Account
If you already have a Cloudinary account:

1. Go to: https://cloudinary.com/console
2. Login to your account
3. On the dashboard, you'll see:
   - **Cloud Name**: (top of page)
   - **API Key**: (in API Keys section)
   - **API Secret**: (click "Reveal" to see it)

### Option 2: Create New Cloudinary Account (Free)
If you don't have a Cloudinary account:

1. Go to: https://cloudinary.com/users/register_free
2. Sign up for a free account (no credit card required)
3. After signup, you'll be on the dashboard
4. Copy the credentials:
   - **Cloud Name**
   - **API Key**
   - **API Secret**

Free tier includes:
- 25 GB storage
- 25 GB bandwidth/month
- More than enough for voice messages

## Add to Local Development

Also add these to your local `backend/.env` file:

```env
# Cloudinary Configuration (for voice messages)
CLOUDINARY_CLOUD_NAME=your_cloud_name_here
CLOUDINARY_API_KEY=your_api_key_here
CLOUDINARY_API_SECRET=your_api_secret_here
```

## Verify Configuration

After adding to Render:

1. Render will automatically redeploy (takes ~2 minutes)
2. Check Render logs for this line:
   ```
   [Upload] Cloudinary config: {
     cloud_name: '✅ set',
     api_key: '✅ set',
     api_secret: '✅ set'
   }
   ```
3. If you see `❌ missing`, the env vars weren't set correctly

## Test Voice Upload

Once configured, test by:

1. Recording a voice message in the app
2. Check logs for successful upload:
   ```
   [AudioService] Upload successful: https://res.cloudinary.com/...
   ```

## Troubleshooting

### Still getting "Upload failed"?
- Check Render logs for the exact Cloudinary error
- Verify credentials are correct (no extra spaces)
- Make sure you clicked "Save Changes" in Render

### Getting "Invalid credentials"?
- Double-check API Key and API Secret
- Make sure you copied the full secret (it's long)
- Try regenerating credentials in Cloudinary dashboard

### Getting "Resource not found"?
- Check Cloud Name is correct
- Cloud Name is case-sensitive

## Security Note

Never commit Cloudinary credentials to Git! They're in `.env` which is in `.gitignore`.
