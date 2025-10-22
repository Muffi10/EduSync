// src/components/RecommendedVideos.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getAuth } from "firebase/auth";

interface Video {
  id: string;
  title: string;
  description: string;
  thumbnailUrl: string;
  videoUrl: string;
  ownerId: string;
  tags: string[];
  views: number;
  likes: string[];
  commentsCount: number;
  createdAt: number;
  owner?: {
    displayName: string;
    photoURL: string;
    username: string;
  };
}

interface RecommendedVideosProps {
  currentVideoId: string;
}

export default function RecommendedVideos({ currentVideoId }: RecommendedVideosProps) {
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const handleImageError = (e: React.SyntheticEvent<HTMLImageElement, Event>) => {
    const target = e.target as HTMLImageElement;
    target.src = "/images/default-avatar.png";
  };

  useEffect(() => {
    const fetchRecommendations = async () => {
      try {
        setLoading(true);

        const auth = getAuth();
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
          "Content-Type": "application/json",
        };

        if (idToken) {
          headers["Authorization"] = `Bearer ${idToken}`;
        }

        const response = await fetch("/api/video/recommendations", {
          method: "POST",
          headers,
          body: JSON.stringify({
            currentVideoId,
            limit: 12,
          }),
        });

        if (!response.ok) {
          throw new Error("Failed to fetch recommendations");
        }

        const data = await response.json();
        setVideos(data.recommendations || []);
      } catch (error) {
        console.error("Error fetching recommendations:", error);
      } finally {
        setLoading(false);
      }
    };

    const timer = setTimeout(fetchRecommendations, 500);
    return () => clearTimeout(timer);
  }, [currentVideoId]);

  const formatViews = (views: number = 0): string => {
    if (views >= 1000000) return `${(views / 1000000).toFixed(1)}M views`;
    if (views >= 1000) return `${(views / 1000).toFixed(1)}K views`;
    return `${views} views`;
  };

  const formatDate = (timestamp: number): string => {
    try {
      const date = new Date(timestamp);
      const now = new Date();
      const diffInDays = Math.floor(
        (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24)
      );

      if (diffInDays === 0) return "Today";
      if (diffInDays === 1) return "Yesterday";
      if (diffInDays < 7) return `${diffInDays} days ago`;
      if (diffInDays < 30) return `${Math.floor(diffInDays / 7)} weeks ago`;
      if (diffInDays < 365) return `${Math.floor(diffInDays / 30)} months ago`;
      return `${Math.floor(diffInDays / 365)} years ago`;
    } catch (error) {
      return "Some time ago";
    }
  };

  const handleVideoClick = (videoId: string) => {
    router.push(`/watch/${videoId}`);
  };

  if (loading) {
    return (
      <div className="px-4 sm:px-6 py-4">
        <h2 className="text-lg font-bold mb-4 text-gray-900 dark:text-white">Recommended Videos</h2>
        <div className="space-y-4">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="animate-pulse">
              <div className="flex gap-3">
                <div className="flex-shrink-0 w-40 h-24 bg-gray-300 dark:bg-gray-700 rounded-lg"></div>
                <div className="flex-1 min-w-0">
                  <div className="h-4 bg-gray-300 dark:bg-gray-700 rounded w-full mb-2"></div>
                  <div className="h-3 bg-gray-300 dark:bg-gray-700 rounded w-3/4 mb-2"></div>
                  <div className="h-3 bg-gray-300 dark:bg-gray-700 rounded w-1/2"></div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (videos.length === 0) {
    return (
      <div className="px-4 sm:px-6 py-4">
        <h2 className="text-lg font-bold mb-4 text-gray-900 dark:text-white">Recommended Videos</h2>
        <p className="text-gray-500 dark:text-gray-400 text-sm">No recommendations available</p>
      </div>
    );
  }

  return (
    <div className="px-4 sm:px-6 py-4">
      <h2 className="text-lg font-bold mb-4 text-gray-900 dark:text-white">Recommended Videos</h2>
      <div className="space-y-4">
        {videos.map((video) => (
          <div
            key={video.id}
            className="cursor-pointer group"
            onClick={() => handleVideoClick(video.id)}
          >
            <div className="flex gap-3">
              {/* Thumbnail */}
              <div className="flex-shrink-0 relative w-40 h-24 overflow-hidden rounded-lg bg-gray-800">
                <img
                  src={video.thumbnailUrl || "/placeholder.jpg"}
                  alt={video.title}
                  loading="lazy"
                  className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                />
              </div>

              {/* Video Info */}
              <div className="flex-1 min-w-0">
                <h3 className="font-medium text-sm text-gray-900 dark:text-white line-clamp-2 leading-tight group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                  {video.title}
                </h3>
                {video.owner && (
                  <p className="text-gray-600 dark:text-gray-400 text-xs mt-1">
                    {video.owner.displayName}
                  </p>
                )}
                <p className="text-gray-500 dark:text-gray-500 text-xs mt-1">
                  {formatViews(video.views)} • {formatDate(video.createdAt)}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}