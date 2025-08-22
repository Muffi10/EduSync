export interface Notification {
    id: string;                   // Firestore doc ID
    userId: string;               // Who receives this notification
    type: "like" | "comment" | "follow";  // Type of event
    fromUserId: string;           // Who triggered the notification
    videoId?: string;             // Related video (if any)
    message: string;              // UI message (e.g., "John liked your video")
    read: boolean;                // Has user seen it?
    createdAt: number;            // Timestamp
  }
  