export interface SavedVideo {
    userId: string;       // The user who saved the video
    videoId: string;      // The video being saved
    savedAt: number;      // Timestamp (Date.now())
  }
  