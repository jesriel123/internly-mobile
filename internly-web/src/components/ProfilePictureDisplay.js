import React from 'react';

/**
 * Reusable component to display a profile picture with fallback to initials
 */
export default function ProfilePictureDisplay({
  profilePictureUrl,
  name,
  email,
  size = 40,
  className = '',
}) {
  const getInitials = () => {
    if (name) {
      const parts = name.trim().split(' ');
      if (parts.length >= 2) {
        return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
      }
      return parts[0][0]?.toUpperCase() || 'A';
    }
    if (email) {
      return email.charAt(0).toUpperCase();
    }
    return 'A';
  };

  const initials = getInitials();

  const avatarStyle = {
    width: size,
    height: size,
    background: 'linear-gradient(135deg, #7b68ee 0%, #8b5cf6 100%)',
    color: 'white',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '50%',
    fontWeight: '700',
    fontSize: Math.max(size * 0.3, 12),
    overflow: 'hidden',
    border: '2px solid rgba(255,255,255,0.2)',
  };

  if (profilePictureUrl) {
    return (
      <div style={avatarStyle} className={`profile-picture ${className}`}>
        <img
          src={profilePictureUrl}
          alt={name || email || 'Profile'}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            borderRadius: '50%',
          }}
          onError={(e) => {
            e.target.style.display = 'none';
            const fallback = e.target.nextElementSibling;
            if (fallback) {
              fallback.style.display = 'flex';
            }
          }}
        />
        <div
          style={{
            ...avatarStyle,
            display: 'none'
          }}
          className="profile-picture-fallback"
        >
          {initials}
        </div>
      </div>
    );
  }

  return (
    <div style={avatarStyle} className={`profile-picture ${className}`}>
      {initials}
    </div>
  );
}
