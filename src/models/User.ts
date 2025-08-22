//src/models/User.ts
export interface User {
  uid: string;                   // Firebase Auth UID
  username: string;             // Unique username (e.g. @mufaddal)
  displayName: string;          // Full name or chosen name
  email: string;
  photoURL?: string;            // Profile picture
  bio?: string;                 // Optional short bio

  followers: string[];          // List of UIDs of followers
  following: string[];          // List of UIDs this user follows

  // 🔽 Optionally keep list of recent video IDs here too (redundant with subcollection)
  // watchHistory?: string[];

  createdAt: number;            // Timestamp (Date.now())
  updatedAt: number;            // Timestamp
}