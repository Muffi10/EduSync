//src/components/videoFeed.tsx
"use client";

import { useEffect, useState, useCallback } from "react";
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
  const [loadingMore, setLoadingMore] = useState(false);
  const [lastDoc, setLastDoc] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [screenFilled, setScreenFilled] = useState(false);
  const [isClient, setIsClient] = useState(false);
  const [initialLoadSize, setInitialLoadSize] = useState(12);
  const router = useRouter();

  // Handle client-side hydration
  useEffect(() => {
    setIsClient(true);
    
    // Calculate initial load size based on screen after hydration
    const calculateInitialLoadSize = () => {
      const screenHeight = window.innerHeight;
      const screenWidth = window.innerWidth;
      
      // Estimate videos per row based on screen width
      let videosPerRow = 1;
      if (screenWidth >= 1024) videosPerRow = 3; // lg breakpoint
      else if (screenWidth >= 640) videosPerRow = 2; // sm breakpoint
      
      // Estimate video card height (thumbnail + info)
      const videoCardHeight = 280; // approximate height including thumbnail and info
      const rowsNeeded = Math.ceil(screenHeight / videoCardHeight) + 1; // +1 for buffer
      
      return Math.max(videosPerRow * rowsNeeded, 12); // minimum 12 videos
    };

    setInitialLoadSize(calculateInitialLoadSize());
  }, []);

  const convertFirestoreTimestamp = useCallback((timestamp: any): Date => {
    if (timestamp && typeof timestamp === "object" && "seconds" in timestamp) {
      return new Date(timestamp.seconds * 1000);
    }
    if (typeof timestamp === "number") {
      return new Date(timestamp > 1e10 ? timestamp : timestamp * 1000);
    }
    if (timestamp instanceof Date) {
      return timestamp;
    }
    if (typeof timestamp === "string") {
      return new Date(timestamp);
    }
    return new Date();
  }, []);

  const formatViews = useCallback((views: number = 0): string => {
    if (views >= 1000000) return `${(views / 1000000).toFixed(1)}M views`;
    if (views >= 1000) return `${(views / 1000).toFixed(1)}K views`;
    return `${views} views`;
  }, []);

  const formatDate = useCallback((timestamp: any): string => {
    try {
      const date = convertFirestoreTimestamp(timestamp);
      const now = new Date();
      const diffInDays = Math.floor(
        (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24)
      );

      if (diffInDays === 0) return "Today";
      if (diffInDays === 1) return "Yesterday";
      if (diffInDays < 7) return `${diffInDays} days ago`;
      if (diffInDays < 30) return `${Math.floor(diffInDays / 7)} weeks ago`;

      return date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year:
          timestamp && timestamp.seconds <
            new Date().getTime() / 1000 - 31536000
            ? "numeric"
            : undefined,
      });
    } catch (error) {
      console.error("Error formatting date:", error);
      return "Some time ago";
    }
  }, [convertFirestoreTimestamp]);

const fetchVideosWithOwners = useCallback(async (isInitial: boolean = false) => {
  if (!hasMore && !isInitial) return;
  
  try {
    if (isInitial) {
      setLoading(true);
    } else {
      setLoadingMore(true);
    }

    const limit = isInitial ? initialLoadSize : 9;
    const url = lastDoc && !isInitial 
      ? `/api/video?lastDoc=${lastDoc}&limit=${limit}` 
      : `/api/video?limit=${limit}`;
    
    // Get auth token for personalized recommendations
    const auth = (await import("firebase/auth")).getAuth();
    const user = auth.currentUser;
    let idToken = null;
    
    if (user) {
      try {
        idToken = await user.getIdToken();
      } catch (error) {
        console.warn("Could not get auth token:", error);
      }
    }
    
    const headers: HeadersInit = {
      "Cache-Control": "no-cache",
      Pragma: "no-cache",
    };
    
    if (idToken) {
      headers["Authorization"] = `Bearer ${idToken}`;
    }
    
    const res = await fetch(url, { headers });

    if (!res.ok) {
      console.warn("Failed to fetch videos, status:", res.status);
      setHasMore(false);
      return;
    }

    const data = await res.json();
    
    if (!data.videos || data.videos.length === 0) {
      setHasMore(false);
      return;
    }

    // Batch fetch owner data for better performance
    const ownerIds = [...new Set(data.videos.map((v: Video) => v.ownerId))];
    const ownerPromises = ownerIds.map(async (ownerId) => {
      try {
        const ownerRes = await fetch(`/api/user/${ownerId}`, {
          headers: {
            "Cache-Control": "public, max-age=300", // Cache owner data for 5 minutes
          },
        });
        
        if (!ownerRes.ok) throw new Error("Failed to fetch owner");
        const ownerData = await ownerRes.json();
        
        return {
          id: ownerId,
          displayName: ownerData.user?.displayName || "Unknown Creator",
          photoURL: ownerData.user?.photoURL || "/images/default-avatar.png",
        };
      } catch (err) {
        console.error("Error fetching owner:", err);
        return {
          id: ownerId,
          displayName: "Unknown Creator",
          photoURL: "/images/default-avatar.png",
        };
      }
    });

    const owners = await Promise.all(ownerPromises);
    const ownersMap = new Map(owners.map(owner => [owner.id, owner]));

    const videosWithOwners = data.videos.map((video: Video) => ({
      ...video,
      owner: ownersMap.get(video.ownerId) || {
        displayName: "Unknown Creator",
        photoURL: "/images/default-avatar.png",
      },
    }));

    if (isInitial) {
      setVideos(videosWithOwners);
      setScreenFilled(true);
    } else {
      setVideos((prev) => [
        ...prev,
        ...videosWithOwners.filter(
          (v: VideoWithOwner) => !prev.some((p: VideoWithOwner) => p.id === v.id)
        ),
      ]);
    }

    setLastDoc(data.lastDoc || null);
    setHasMore(!!data.lastDoc && data.videos.length === limit);
    
  } catch (err) {
    console.error("Error fetching videos:", err);
    setHasMore(false);
  } finally {
    if (isInitial) {
      setLoading(false);
    } else {
      setLoadingMore(false);
    }
  }
}, [lastDoc, hasMore, initialLoadSize]);

  // Initial load - only after client hydration
  useEffect(() => {
    if (isClient) {
      fetchVideosWithOwners(true);
    }
  }, [isClient]);

  // Infinite scroll
  useEffect(() => {
    if (!screenFilled || !hasMore) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = document.documentElement;
      
      if (
        scrollTop + clientHeight >= scrollHeight - 500 && 
        !loadingMore && 
        hasMore
      ) {
        fetchVideosWithOwners(false);
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [screenFilled, hasMore, loadingMore, fetchVideosWithOwners]);

  const handleVideoClick = useCallback((videoId: string) => {
    router.push(`/watch/${videoId}`);
  }, [router]);

  const handleImageError = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    (e.target as HTMLImageElement).src = "/images/default-avatar.png";
  }, []);

  // Show loading state during SSR and initial client hydration
  if (loading || !isClient) {
    return (
      <div className="px-4 sm:px-6 py-4 max-w-7xl mx-auto">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {[...Array(12)].map((_, i) => (
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
      </div>
    );
  }

  return (
    <div className="px-4 sm:px-6 py-4 max-w-7xl mx-auto">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {videos.map((video) => (
          <div
            key={video.id}
            className="cursor-pointer group"
            onClick={() => handleVideoClick(video.id)}
          >
            {/* Thumbnail */}
            <div className="relative pb-[56.25%] overflow-hidden rounded-xl bg-gray-800">
              <img
                src={video.thumbnailUrl || "/placeholder.jpg"}
                alt={video.title}
                loading="lazy"
                className="absolute inset-0 w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
              />
            </div>

            {/* Info */}
            <div className="mt-3 flex gap-3">
              <div className="flex-shrink-0">
                <img
                  src={video.owner?.photoURL || "/images/default-avatar.png"}
                  alt={video.owner?.displayName}
                  className="w-10 h-10 rounded-full object-cover"
                  onError={handleImageError}
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

      {/* Loading more skeletons */}
      {loadingMore && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mt-6">
          {[...Array(6)].map((_, i) => (
            <div key={`skeleton-${i}`} className="animate-pulse">
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

      {!hasMore && videos.length > 0 && (
        <div className="text-center py-8 text-gray-400">
          No more videos to load
        </div>
      )}

      {videos.length === 0 && !loading && (
        <div className="text-center py-16 text-gray-400">
          <p className="text-xl">No videos found</p>
          <p className="mt-2">Be the first to upload a video!</p>
        </div>
      )}
    </div>
  );
}