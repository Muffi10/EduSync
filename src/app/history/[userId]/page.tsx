"use client";
import { useEffect, useState } from "react";
import { getAuth } from "firebase/auth";
import { useRouter, useParams } from "next/navigation";
import Image from "next/image";
import Link from "next/link";

interface HistoryItem {
  id: string;
  videoId: string;
  watchedAt: number;
  videoTitle: string;
  videoThumbnail: string;
  videoDuration: number;
  channelId: string;
  channelName: string;
  channelPhoto: string;
}

export default function WatchHistoryPage() {
  const params = useParams();
  const userId = params?.userId as string;
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isOwnHistory, setIsOwnHistory] = useState(false);
  const router = useRouter();

  // Hydration guard
  const [isClient, setIsClient] = useState(false);
  useEffect(() => setIsClient(true), []);

  useEffect(() => {
    if (!isClient || !userId) return;

    const fetchData = async () => {
      const auth = getAuth();
      const user = auth.currentUser;

      if (!user) {
        router.push("/login");
        return;
      }

      setCurrentUserId(user.uid);
      
      // Check if viewing own history
      const isOwn = user.uid === userId;
      setIsOwnHistory(isOwn);

      // Only fetch if it's own history
      if (!isOwn) {
        setLoading(false);
        return;
      }

      try {
        const idToken = await user.getIdToken();
        setToken(idToken);

        const response = await fetch("/api/history", {
          headers: {
            Authorization: `Bearer ${idToken}`,
          },
        });

        if (!response.ok) throw new Error("Failed to fetch history");

        const data = await response.json();
        setHistory(data.history || []);
      } catch (error) {
        console.error("Error fetching history:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [router, userId, isClient]);

  const clearAllHistory = async () => {
    if (!token || !isOwnHistory) return;

    if (!confirm("Are you sure you want to clear all watch history? This cannot be undone.")) return;

    try {
      const response = await fetch("/api/history", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({}),
      });

      if (!response.ok) throw new Error("Failed to clear history");

      setHistory([]);
    } catch (error) {
      console.error("Error clearing history:", error);
      alert("Failed to clear history. Please try again.");
    }
  };

  const removeVideo = async (videoId: string) => {
    if (!token || !isOwnHistory) return;

    try {
      const response = await fetch("/api/history", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ videoId }),
      });

      if (!response.ok) throw new Error("Failed to remove video");

      setHistory((prev) => prev.filter((item) => item.videoId !== videoId));
    } catch (error) {
      console.error("Error removing video:", error);
      alert("Failed to remove video. Please try again.");
    }
  };

  const formatDuration = (seconds: number) => {
    if (!seconds || seconds <= 0) return "0:00";
    
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
    }
    return `${minutes}:${secs.toString().padStart(2, "0")}`;
  };

  const getTimeAgo = (timestamp: number) => {
    if (!timestamp) return "Unknown time";
    
    const now = Date.now();
    const diff = now - timestamp;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    const weeks = Math.floor(days / 7);
    const months = Math.floor(days / 30);
    const years = Math.floor(days / 365);

    if (years > 0) return `${years} year${years > 1 ? "s" : ""} ago`;
    if (months > 0) return `${months} month${months > 1 ? "s" : ""} ago`;
    if (weeks > 0) return `${weeks} week${weeks > 1 ? "s" : ""} ago`;
    if (days > 0) return `${days} day${days > 1 ? "s" : ""} ago`;
    if (hours > 0) return `${hours} hour${hours > 1 ? "s" : ""} ago`;
    if (minutes > 0) return `${minutes} minute${minutes > 1 ? "s" : ""} ago`;
    return "Just now";
  };

  const groupByDate = (items: HistoryItem[]) => {
    const groups: { [key: string]: HistoryItem[] } = {
      Today: [],
      Yesterday: [],
      "This Week": [],
      "This Month": [],
      Older: [],
    };

    const now = Date.now();
    const today = new Date(now).setHours(0, 0, 0, 0);
    const yesterday = today - 86400000;
    const weekAgo = today - 7 * 86400000;
    const monthAgo = today - 30 * 86400000;

    items.forEach((item) => {
      if (!item.watchedAt) return;
      
      const itemDate = new Date(item.watchedAt).setHours(0, 0, 0, 0);

      if (itemDate === today) {
        groups["Today"].push(item);
      } else if (itemDate === yesterday) {
        groups["Yesterday"].push(item);
      } else if (item.watchedAt >= weekAgo) {
        groups["This Week"].push(item);
      } else if (item.watchedAt >= monthAgo) {
        groups["This Month"].push(item);
      } else {
        groups["Older"].push(item);
      }
    });

    return groups;
  };

  const filteredHistory = history.filter((item) =>
    (item.videoTitle?.toLowerCase() || "").includes(searchQuery.toLowerCase()) ||
    (item.channelName?.toLowerCase() || "").includes(searchQuery.toLowerCase())
  );

  const groupedHistory = groupByDate(filteredHistory);

  // Don't render until hydrated to prevent SSR/client mismatch
  if (!isClient) {
    return (
      <div className="max-w-6xl mx-auto p-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
          <div className="h-8 w-48 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
          <div className="h-10 w-64 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
        </div>
        <div className="space-y-4">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex gap-4 p-3">
              <div className="w-48 h-27 bg-gray-200 dark:bg-gray-700 rounded-lg animate-pulse" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-full bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                <div className="h-4 w-3/4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto p-4">
        <div className="flex items-center justify-between mb-6">
          <div className="h-8 w-48 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
          <div className="h-10 w-64 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
        </div>
        <div className="space-y-6">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="flex gap-4">
              <div className="w-64 h-36 bg-gray-200 dark:bg-gray-700 rounded-xl animate-pulse" />
              <div className="flex-1 space-y-3">
                <div className="h-5 w-3/4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                <div className="h-4 w-1/2 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                <div className="h-4 w-1/3 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Not own history and trying to view
  if (!isOwnHistory) {
    return (
      <div className="max-w-4xl mx-auto p-4 flex flex-col items-center justify-center min-h-[60vh]">
        <div className="w-24 h-24 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mb-6">
          <svg className="w-12 h-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        </div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-3">This page is private</h2>
        <p className="text-gray-600 dark:text-gray-400 text-center mb-6 max-w-md">
          Watch history is private and can only be viewed by the account owner
        </p>
        <button
          onClick={() => router.push("/")}
          className="px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium"
        >
          Go Home
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-4">
      {/* Header - YouTube Style */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">Watch history</h1>
          <p className="text-gray-600 dark:text-gray-400 text-sm">
            {history.length} videos • Only you can see what you've watched
          </p>
        </div>
        
        <div className="flex items-center gap-3">
          {/* Search Bar */}
          <div className="relative flex-1 md:w-80">
            <input
              type="text"
              placeholder="Search watch history"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-4 py-2.5 pl-11 border border-gray-300 dark:border-gray-600 rounded-full bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
            />
            <svg
              className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          
          {history.length > 0 && (
            <button
              onClick={clearAllHistory}
              className="px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition whitespace-nowrap"
            >
              Clear all watch history
            </button>
          )}
        </div>
      </div>

      {/* Empty State */}
      {history.length === 0 ? (
        <div className="text-center py-20">
          <div className="w-32 h-32 mx-auto mb-6 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center">
            <svg className="w-16 h-16 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-3">
            No watch history yet
          </h2>
          <p className="text-gray-600 dark:text-gray-400 mb-6 max-w-md mx-auto">
            Videos you watch will appear here. Start watching videos to build your history.
          </p>
          <button
            onClick={() => router.push("/")}
            className="px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium"
          >
            Explore Videos
          </button>
        </div>
      ) : filteredHistory.length === 0 ? (
        <div className="text-center py-20">
          <div className="w-24 h-24 mx-auto mb-6 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center">
            <svg className="w-12 h-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">
            No videos found
          </h2>
          <p className="text-gray-600 dark:text-gray-400">
            No videos matching "{searchQuery}" in your watch history
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {Object.entries(groupedHistory).map(([dateGroup, items]) => {
            if (items.length === 0) return null;

            return (
              <div key={dateGroup} className="border-b border-gray-200 dark:border-gray-700 pb-8 last:border-b-0">
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-6 sticky top-0 bg-white dark:bg-gray-900 py-2 z-10">
                  {dateGroup}
                </h2>
                <div className="grid gap-4">
                  {items.map((item) => (
                    <div
                      key={item.id}
                      className="flex gap-4 p-3 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition group"
                    >
                      {/* Video Thumbnail - YouTube Style */}
                      <Link 
                        href={`/watch/${item.videoId}`} 
                        className="flex-shrink-0 relative w-64 aspect-video rounded-xl overflow-hidden bg-gray-200 dark:bg-gray-700"
                      >
                        <Image
                          src={item.videoThumbnail || "/images/default-thumbnail.png"}
                          alt={item.videoTitle || "Video thumbnail"}
                          fill
                          className="object-cover group-hover:scale-105 transition-transform duration-200"
                          sizes="256px"
                          onError={(e) => {
                            (e.target as HTMLImageElement).src = "/images/default-thumbnail.png";
                          }}
                        />
                        {item.videoDuration > 0 && (
                          <div className="absolute bottom-2 right-2 bg-black bg-opacity-80 text-white text-xs px-1.5 py-0.5 rounded">
                            {formatDuration(item.videoDuration)}
                          </div>
                        )}
                      </Link>

                      {/* Video Info - YouTube Style */}
                      <div className="flex-1 min-w-0 flex gap-3">
                        <div className="flex-1">
                          <Link href={`/watch/${item.videoId}`}>
                            <h3 className="font-medium text-gray-900 dark:text-white line-clamp-2 hover:text-blue-600 dark:hover:text-blue-400 cursor-pointer text-lg mb-2">
                              {item.videoTitle || "Untitled Video"}
                            </h3>
                          </Link>

                          <div className="flex items-center gap-2 mb-2">
                            <Link
                              href={`/channel/${item.channelId}`}
                              className="flex items-center gap-2 hover:text-blue-600 dark:hover:text-blue-400"
                            >
                              <div className="relative w-6 h-6 rounded-full overflow-hidden flex-shrink-0">
                                <Image
                                  src={item.channelPhoto || "/images/default-avatar.png"}
                                  alt={`${item.channelName}'s profile`}
                                  fill
                                  className="object-cover"
                                  onError={(e) => {
                                    (e.target as HTMLImageElement).src = "/images/default-avatar.png";
                                  }}
                                />
                              </div>
                              <span className="text-sm text-gray-600 dark:text-gray-400 font-medium">
                                {item.channelName || "Unknown Channel"}
                              </span>
                            </Link>
                          </div>

                          <p className="text-sm text-gray-500 dark:text-gray-500">
                            Watched {getTimeAgo(item.watchedAt)}
                          </p>
                        </div>

                        {/* Remove Button - YouTube Style */}
                        <button
                          onClick={() => removeVideo(item.videoId)}
                          className="flex-shrink-0 p-2 rounded-full opacity-0 group-hover:opacity-100 hover:bg-gray-200 dark:hover:bg-gray-700 transition self-start"
                          title="Remove from history"
                        >
                          <svg
                            className="w-5 h-5 text-gray-600 dark:text-gray-400"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M6 18L18 6M6 6l12 12"
                            />
                          </svg>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}