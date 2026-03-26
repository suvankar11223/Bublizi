// Cloudinary configuration
export const CLOUDINARY_CLOUD_NAME = "dx6n5pj46";
export const CLOUDINARY_UPLOAD_PRESET = "Images";
export const CLOUDINARY_API_URL = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`;

export const getAvatarPath = (file: any, isGroup = false) => {
  // If file is a string (URL), return it as uri
  if (file && typeof file === 'string') return { uri: file };

  // If file is already an object with uri property
  if (file && typeof file === 'object') return file;

  // Return default avatars - using remote URLs to avoid build issues
  if (isGroup) {
    return { uri: 'https://ui-avatars.com/api/?name=Group&size=200&background=6366f1&color=fff' };
  }

  return { uri: 'https://ui-avatars.com/api/?name=User&size=200&background=94a3b8&color=fff' };
};

export const uploadImageToCloudinary = async (imageUri: string): Promise<string> => {
  console.log('='.repeat(60));
  console.log('[DEBUG] Cloudinary: Starting upload...');
  console.log('[DEBUG] Cloudinary: Image URI:', imageUri);
  console.log('='.repeat(60));

  try {
    const formData = new FormData();
    
    // Create file object for upload
    const file: any = {
      uri: imageUri,
      type: 'image/jpeg',
      name: `avatar_${Date.now()}.jpg`,
    };
    
    formData.append('file', file);
    formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
    formData.append('cloud_name', CLOUDINARY_CLOUD_NAME);

    console.log('[DEBUG] Cloudinary: Uploading to:', CLOUDINARY_API_URL);
    console.log('[DEBUG] Cloudinary: Upload preset:', CLOUDINARY_UPLOAD_PRESET);

    const response = await fetch(CLOUDINARY_API_URL, {
      method: 'POST',
      body: formData,
      headers: {
        'Accept': 'application/json',
      },
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('[DEBUG] Cloudinary: Upload failed');
      console.error('[DEBUG] Cloudinary: Response:', data);
      throw new Error(data.error?.message || 'Failed to upload image');
    }

    console.log('='.repeat(60));
    console.log('[DEBUG] Cloudinary: Upload successful!');
    console.log('[DEBUG] Cloudinary: Secure URL:', data.secure_url);
    console.log('='.repeat(60));

    return data.secure_url;
  } catch (error: any) {
    console.error('='.repeat(60));
    console.error('[DEBUG] Cloudinary: Upload error:', error);
    console.error('='.repeat(60));
    throw new Error('Failed to upload image to Cloudinary');
  }
};
