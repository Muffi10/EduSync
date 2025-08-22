//src/models/Video.ts
export interface Video {
  id: string;                     // Firestore doc ID
  ownerId: string;                // UID of the user who uploaded the video
  title: string;
  description?: string;
  videoUrl: string;              // Firebase Storage URL
  thumbnailUrl?: string;
  tags?: string[];               // e.g., ["math", "physics"]
  visibility: "public" | "private";

  likes: string[];               // UIDs of users who liked the video
  commentsCount: number;         // Number of comments

  views: number;                 // 👈 NEW: Total views
  createdAt: number;
  updatedAt: number;
}