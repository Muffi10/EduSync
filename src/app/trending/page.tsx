"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";

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

export default function TrendingPage() {
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(1);
  const [timeframe, setTimeframe] = useState<"day" | "week" | "month" | "all">("week");
  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const formatViews = useCallback((views: number = 0): string => {
    if (views >= 1000000) return `${(views / 1000000).toFixed(1)}M views`;
    if (views >= 1000) return `${(views / 1000).toFixed(1)}K views`;
    return `${views} views`;
  }, []);

  const formatDate = useCallback((timestamp: number): string => {
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
  }, []);

  const fetchTrendingVideos = useCallback(async (pageNum: number, append: boolean = false) => {
    try {
      if (append) {
        setLoadingMore(true);
      } else {
        setLoading(true);
      }
      
      const response = await fetch(`/api/trending?timeframe=${timeframe}&limit=12&page=${pageNum}`, {
        headers: {
          "Cache-Control": "no-cache",
          Pragma: "no-cache",
        },
      });

      if (!response.ok) {
        throw new Error("Failed to fetch trending videos");
      }

      const data = await response.json();
      const newVideos = data.trending || [];
      
      if (append) {
        setVideos(prev => [...prev, ...newVideos]);
        setHasMore(newVideos.length === 12);
      } else {
        setVideos(newVideos);
        setHasMore(newVideos.length === 12);
        setPage(1);
      }
    } catch (error) {
      console.error("Error fetching trending videos:", error);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [timeframe]);

  // Initial fetch
  useEffect(() => {
    setPage(1);
    fetchTrendingVideos(1, false);
  }, [timeframe, fetchTrendingVideos]);

  // Load more when page changes
  useEffect(() => {
    if (page > 1) {
      fetchTrendingVideos(page, true);
    }
  }, [page, fetchTrendingVideos]);

  // Intersection Observer for infinite scroll
  useEffect(() => {
    if (!loadMoreRef.current || loading || loadingMore || !hasMore) return;

    observerRef.current = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loadingMore) {
          setPage(prev => prev + 1);
        }
      },
      { threshold: 0.1 }
    );

    observerRef.current.observe(loadMoreRef.current);

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, [loading, loadingMore, hasMore]);

  const handleVideoClick = useCallback((videoId: string) => {
    router.push(`/watch/${videoId}`);
  }, [router]);

  const handleTimeframeChange = useCallback((newTimeframe: typeof timeframe) => {
    setTimeframe(newTimeframe);
    setPage(1);
    setHasMore(true);
  }, []);

  if (loading && videos.length === 0) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {/* Header Skeleton */}
        <div className="mb-6">
          <div className="h-10 w-48 bg-gray-200 dark:bg-gray-700 rounded animate-pulse mb-4"></div>
          <div className="flex gap-2">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-10 w-24 bg-gray-200 dark:bg-gray-700 rounded animate-pulse"></div>
            ))}
          </div>
        </div>

        {/* Videos Grid Skeleton */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {[...Array(12)].map((_, i) => (
            <div key={i} className="animate-pulse">
              <div className="pb-[56.25%] bg-gray-200 dark:bg-gray-700 rounded-xl"></div>
              <div className="mt-3 flex gap-3">
                <div className="w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-700"></div>
                <div className="flex-1">
                  <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-full mb-2"></div>
                  <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-3/4 mb-1"></div>
                  <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/2"></div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
      {/* Header */}
      <div className="mb-6 sticky top-14 bg-white dark:bg-gray-900 z-10 pt-2 pb-4">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
            <svg className="w-8 h-8 text-red-500" fill="currentColor" viewBox="0 0 20 20">
              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
            </svg>
            Trending
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {videos.length} trending videos
          </p>
        </div>

        {/* Timeframe Filters */}
        <div className="flex gap-2 overflow-x-auto scrollbar-hide">
          {[
            { value: "day", label: "Today" },
            { value: "week", label: "This Week" },
            { value: "month", label: "This Month" },
            { value: "all", label: "All Time" },
          ].map((filter) => (
            <button
              key={filter.value}
              onClick={() => handleTimeframeChange(filter.value as typeof timeframe)}
              className={`px-4 py-2 rounded-full font-medium transition-all duration-200 whitespace-nowrap ${
                timeframe === filter.value
                  ? "bg-black dark:bg-white text-white dark:text-black"
                  : "bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-900 dark:text-white"
              }`}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </div>

      {/* Videos Grid */}
      {videos.length === 0 && !loading ? (
        <div className="text-center py-16">
          <div className="w-20 h-20 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-10 h-10 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </div>
          <p className="text-gray-500 dark:text-gray-400 text-lg">No trending videos found</p>
          <p className="text-gray-400 dark:text-gray-500 text-sm mt-2">Try selecting a different timeframe</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {videos.map((video, index) => (
              <div
                key={`${video.id}-${index}`}
                className="cursor-pointer group"
                onClick={() => handleVideoClick(video.id)}
              >
                {/* Thumbnail Container */}
                <div className="relative">
                  {/* Trending Badge */}
                  <div className="absolute top-2 left-2 z-10 bg-gradient-to-r from-red-500 to-pink-500 text-white px-2 py-1 rounded-md text-xs font-bold flex items-center gap-1 shadow-lg">
                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                    </svg>
                    #{index + 1}
                  </div>

                  {/* Duration Badge (if available) */}
                  

                  {/* Thumbnail with Lazy Loading */}
                  <div className="relative pb-[56.25%] overflow-hidden rounded-xl bg-gray-800">
                    {video.thumbnailUrl ? (
                      <Image
                        src={video.thumbnailUrl}
                        alt={video.title}
                        fill
                        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                        className="object-cover transition-transform duration-300 group-hover:scale-105"
                        loading="lazy"
                      />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center text-gray-400">
                        <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                      </div>
                    )}
                  </div>
                </div>

                {/* Video Info */}
                <div className="mt-3 flex gap-3">
                  {/* Channel Avatar */}
                  <div className="flex-shrink-0">
                    {video.owner?.photoURL ? (
                      <Image
                        src={video.owner.photoURL}
                        alt={video.owner.displayName}
                        width={36}
                        height={36}
                        className="w-9 h-9 rounded-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-9 h-9 rounded-full bg-gray-300 dark:bg-gray-700 flex items-center justify-center">
                        <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                      </div>
                    )}
                  </div>
                  
                  {/* Video Details */}
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-sm text-gray-900 dark:text-white line-clamp-2 mb-1 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                      {video.title}
                    </h3>
                    <p className="text-xs text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors">
                      {video.owner?.displayName}
                    </p>
                    <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 mt-1">
                      <span>{formatViews(video.views)}</span>
                      <span>•</span>
                      <span>{formatDate(video.createdAt)}</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Loading More Indicator */}
          {loadingMore && (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-500"></div>
            </div>
          )}

          {/* Load More Trigger */}
          {hasMore && !loadingMore && (
            <div ref={loadMoreRef} className="h-10" />
          )}

          {/* End of Results */}
          {!hasMore && videos.length > 0 && (
            <div className="text-center py-8">
              <p className="text-sm text-gray-500 dark:text-gray-400">
                You've reached the end of trending videos
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}