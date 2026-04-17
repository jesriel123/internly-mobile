import { supabase } from '../supabaseConfig';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_FORMATS = ['image/jpeg', 'image/png', 'image/webp'];
const BUCKET_NAME = 'profile-pictures';
const FILE_NAME = 'profile';

function getFileExtension(mimeType) {
  switch (mimeType) {
    case 'image/jpeg':
      return 'jpg';
    case 'image/png':
      return 'png';
    case 'image/webp':
      return 'webp';
    default:
      return 'jpg';
  }
}

/**
 * Validate image file before upload
 */
export const validateImage = (file) => {
  if (!file) {
    return { valid: false, error: 'No file selected' };
  }

  // Check file type
  const mimeType = file.type;
  if (!ALLOWED_FORMATS.includes(mimeType)) {
    return {
      valid: false,
      error: `File must be JPG, PNG, or WebP. You selected ${file.name}`
    };
  }

  // Check file size
  if (file.size > MAX_FILE_SIZE) {
    return {
      valid: false,
      error: `File too large. Maximum size is 5MB. Your file is ${Math.round(file.size / 1024 / 1024)}MB`
    };
  }

  return { valid: true };
};

/**
 * Upload profile picture to Supabase storage and return public URL
 */
export const uploadProfilePicture = async (file, userId) => {
  try {
    const extension = getFileExtension(file.type);
    const filePath = `${userId}/${FILE_NAME}.${extension}`;

    const { data, error } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: true // Replace existing file if exists
      });

    if (error) {
      console.error('Upload error:', error);
      throw new Error(`Upload failed: ${error.message}`);
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from(BUCKET_NAME)
      .getPublicUrl(filePath);

    if (!urlData.publicUrl) {
      throw new Error('Failed to generate public URL');
    }

    console.log('Profile picture uploaded:', urlData.publicUrl);
    return urlData.publicUrl;
  } catch (error) {
    console.error('Complete upload error:', error);
    throw error;
  }
};

/**
 * Update user profile with new picture URL in database
 */
export const updateUserProfilePicture = async (userId, publicUrl) => {
  try {
    const { data, error } = await supabase
      .from('users')
      .update({ profile_picture_url: publicUrl })
      .eq('id', userId)
      .select('id, profile_picture_url')
      .single();

    if (error) {
      console.error('Database update error:', error);
      throw new Error(`Failed to update profile: ${error.message}`);
    }

    console.log('Profile updated in database:', data);
    return data;
  } catch (error) {
    console.error('Complete update error:', error);
    throw error;
  }
};

/**
 * Remove profile picture (delete from storage and clear URL)
 */
export const deleteProfilePicture = async (userId) => {
  try {
    // First clear from database
    const { data: dbData, error: dbError } = await supabase
      .from('users')
      .update({ profile_picture_url: null })
      .eq('id', userId)
      .select('id')
      .single();

    if (dbError) {
      console.error('Database delete error:', dbError);
      throw new Error(`Failed to clear profile URL: ${dbError.message}`);
    }

    // Clean up old files from storage (check common extensions)
    const fileExtensions = ['jpg', 'jpeg', 'png', 'webp'];
    let storageError = null;
    const deletedFiles = [];

    for (const ext of fileExtensions) {
      try {
        const { error: deleteError } = await supabase.storage
          .from(BUCKET_NAME)
          .remove([`${userId}/${FILE_NAME}.${ext}`]);

        if (deleteError && deleteError.code !== 'PGRST116') { // Ignore "file not found"
          storageError = deleteError;
        } else if (!deleteError) {
          deletedFiles.push(`${FILE_NAME}.${ext}`);
        }
      } catch (error) {
        console.error(`Error deleting ${ext}:`, error);
      }
    }

    console.log('Profile picture cleared from database');
    console.log('Deleted files from storage:', deletedFiles);

    if (storageError) {
      console.warn('Storage cleanup warning:', storageError);
    }

    return { success: true, deletedFiles };
  } catch (error) {
    console.error('Complete delete error:', error);
    throw error;
  }
};
