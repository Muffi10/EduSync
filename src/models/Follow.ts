export interface Follow {
    followerId: string;     // The user who follows
    followingId: string;    // The user being followed
    followedAt: number;     // Timestamp (Date.now())
  }
  