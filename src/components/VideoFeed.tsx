
// src/components/VideoFeed.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Video } from "@/models/Video";

interface VideoWithOwner extends Video {
  owner?: {
    displayName: string;
    photoURL?: string;
  };
}

export default function VideoFeed() {
  const [videos, setVideos] = useState<VideoWithOwner[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const router = useRouter();

  // Improved timestamp conversion function
  const convertFirestoreTimestamp = (timestamp: any): Date => {
    // If it's a Firestore Timestamp object
    if (timestamp && typeof timestamp === 'object' && 'seconds' in timestamp) {
      return new Date(timestamp.seconds * 1000);
    }
    // If it's a number (could be seconds or milliseconds)
    if (typeof timestamp === 'number') {
      // Check if it's in seconds (Firestore) or milliseconds
      return new Date(timestamp > 1e10 ? timestamp : timestamp * 1000);
    }
    // If it's already a Date object
    if (timestamp instanceof Date) {
      return timestamp;
    }
    // If it's a string that can be parsed
    if (typeof timestamp === 'string') {
      return new Date(timestamp);
    }
    // If we can't determine, return current date as fallback
    return new Date();
  };

  const formatViews = (views: number): string => {
    if (views >= 1000000) {
      return `${(views / 1000000).toFixed(1)}M views`;
    } else if (views >= 1000) {
      return `${(views / 1000).toFixed(1)}K views`;
    }
    return `${views} views`;
  };

  const formatDate = (timestamp: any): string => {
    try {
      const date = convertFirestoreTimestamp(timestamp);
      const now = new Date();
      const diffInDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
      
      if (diffInDays === 0) return "Today";
      if (diffInDays === 1) return "Yesterday";
      if (diffInDays < 7) return `${diffInDays} days ago`;
      if (diffInDays < 30) return `${Math.floor(diffInDays / 7)} weeks ago`;
      
      return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: timestamp && timestamp.seconds < new Date().getTime() / 1000 - 31536000 ? 'numeric' : undefined
      });
    } catch (error) {
      console.error("Error formatting date:", error);
      return "Some time ago";
    }
  };

  useEffect(() => {
    const fetchVideosWithOwners = async () => {
      try {
        setLoading(true);
        const res = await fetch(`/api/video?page=${page}`);
        if (!res.ok) throw new Error("Failed to fetch videos");
        const data = await res.json();
        
        const videosWithOwners = await Promise.all(
          data.videos.map(async (video: Video) => {
            try {
              const ownerRes = await fetch(`/api/user/${video.ownerId}`);
              if (!ownerRes.ok) throw new Error("Failed to fetch owner");
              const ownerData = await ownerRes.json();
              return {
                ...video,
                owner: {
                  displayName: ownerData.user?.displayName || "Unknown Creator",
                  photoURL: ownerData.user?.photoURL || "/default-avatar.jpg"
                }
              };
            } catch (err) {
              console.error("Error fetching owner:", err);
              return {
                ...video,
                owner: {
                  displayName: "Unknown Creator",
                  photoURL: "/default-avatar.jpg"
                }
              };
            }
          })
        );

        setVideos(prev => page === 1 ? videosWithOwners : [...prev, ...videosWithOwners]);
        setHasMore(data.hasMore);
      } catch (err) {
        console.error("Error fetching videos:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchVideosWithOwners();
  }, [page]);

  useEffect(() => {
    if (!hasMore) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = document.documentElement;
      if (scrollTop + clientHeight >= scrollHeight - 100) {
        setPage(prev => prev + 1);
      }
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [hasMore]);

  return (
    <div className="px-4 sm:px-6 py-4 max-w-7xl mx-auto">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {videos.map((video) => (
          <div
            key={video.id}
            className="cursor-pointer group"
            onClick={() => router.push(`/watch/${video.id}`)}
          >
            {/* Video thumbnail */}
            <div className="relative pb-[56.25%] overflow-hidden rounded-xl bg-gray-800">
              <img
                src={video.thumbnailUrl || "/placeholder.jpg"}
                alt={video.title}
                loading="lazy"
                className="absolute inset-0 w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
              />
            </div>
            
            {/* Video info */}
            <div className="mt-3 flex gap-3">
              <div className="flex-shrink-0">
                <img
                  src={video.owner?.photoURL || "/images/default-avatar.png"}
                  alt={video.owner?.displayName}
                  className="w-10 h-10 rounded-full object-cover"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = "/images/default-avatar.png";
                  }}
                />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-medium text-[15px] text-white line-clamp-2">
                  {video.title}
                </h3>
                <p className="text-gray-300 text-[13px] mt-1">
                  {video.owner?.displayName}
                </p>
                <p className="text-gray-400 text-[12px]">
                  {formatViews(video.views)} • {formatDate(video.createdAt)}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Loading state */}
      {loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mt-6">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="animate-pulse">
              <div className="pb-[56.25%] bg-gray-800 rounded-xl"></div>
              <div className="mt-3 flex gap-3">
                <div className="w-10 h-10 rounded-full bg-gray-800"></div>
                <div className="flex-1">
                  <div className="h-4 bg-gray-800 rounded w-full mb-2"></div>
                  <div className="h-3 bg-gray-800 rounded w-3/4 mb-1"></div>
                  <div className="h-3 bg-gray-800 rounded w-1/2"></div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* No more videos */}
      {!hasMore && videos.length > 0 && (
        <div className="text-center py-8 text-gray-400">
          No more videos to load
        </div>
      )}
    </div>
  );
}