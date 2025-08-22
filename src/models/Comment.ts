export interface Comment {
    id: string;             // Firestore doc ID
    videoId: string;        // The video this comment belongs to
    userId: string;         // UID of the commenter
    text: string;           // Comment content
    createdAt: number;      // Timestamp (Date.now())
  }
  