"use client";

import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import Image from "next/image";
import { useParams, useRouter } from "next/navigation";
import { getAuth, onAuthStateChanged, signOut } from "firebase/auth";
import FollowStats from "@/components/profile/FollowStats";
import { auth } from "@/lib/firebase";

interface Video {
  id: string;
  title: string;
  thumbnailUrl?: string;
  ownerId: string;
  views?: number;
  createdAt?: any;
  duration?: string;
}

interface UserProfile {
  id: string;
  displayName: string;
  photoURL?: string;
  bio?: string;
  followers?: string[];
  following?: string[];
}

export default function ProfilePage() {
  const { id } = useParams();
  const router = useRouter();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [currentUid, setCurrentUid] = useState<string | null>(null);
  const [showSidebar, setShowSidebar] = useState(false);
  const [isFollowing, setIsFollowing] = useState<boolean | null>(null);
  const [followersCount, setFollowersCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);

  const sidebarRef = useRef<HTMLDivElement>(null);

  // hydration guard
  const [isClient, setIsClient] = useState(false);
  useEffect(() => setIsClient(true), []);

  // Convert Firestore timestamp to readable date
  const formatDate = useCallback((timestamp: any): string => {
    try {
      if (!timestamp) return "";

      // Firestore Timestamp
      if (timestamp?.seconds) {
        return new Date(timestamp.seconds * 1000).toLocaleDateString("en-US", {
          year: "numeric",
          month: "short",
          day: "numeric"
        });
      }

      // String date
      if (typeof timestamp === "string") {
        const parsed = new Date(timestamp);
        if (!isNaN(parsed.getTime())) {
          return parsed.toLocaleDateString("en-US", {
            year: "numeric",
            month: "short",
            day: "numeric"
          });
        }
      }

      // JS Date
      if (timestamp instanceof Date) {
        return timestamp.toLocaleDateString("en-US", {
          year: "numeric",
          month: "short",
          day: "numeric"
        });
      }

      return "";
    } catch {
      return "";
    }
  }, []);

  const formatDuration = useCallback((duration: any) => {
    if (!duration) return "0:00";

    const sec = Number(duration);
    if (isNaN(sec)) return "0:00";

    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60).toString().padStart(2, "0");

    return `${m}:${s}`;
  }, []);

  // Close sidebar when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (sidebarRef.current && !sidebarRef.current.contains(event.target as Node)) {
        setShowSidebar(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Memoize fetch function to prevent re-creation
  const fetchProfileData = useCallback(async () => {
    if (!id) return null;

    try {
      console.log(`Fetching profile for ID: ${id}`);
      const profileRes = await fetch(`/api/users/${id}`);

      if (!profileRes.ok) {
        const errorText = await profileRes.text();
        console.error(`Profile fetch failed with status ${profileRes.status}: ${errorText}`);
        if (profileRes.status === 404) throw new Error("User not found");
        if (profileRes.status >= 500) throw new Error("Server error. Please try again later.");
        if (profileRes.status === 429) throw new Error("Too many requests. Please wait a moment.");
        throw new Error(`Failed to fetch profile (${profileRes.status})`);
      }

      const profileJson = await profileRes.json();
      return profileJson;
    } catch (err) {
      console.error("Error fetching profile:", err);
      throw err;
    }
  }, [id]);

  const fetchVideosData = useCallback(async (userId: string) => {
    try {
      console.log(`Fetching videos for ID: ${userId}`);
      const videosRes = await fetch(`/api/users/${userId}/videos`);

      if (!videosRes.ok) {
        const errorText = await videosRes.text();
        console.error(`Videos fetch failed with status ${videosRes.status}: ${errorText}`);
        return [];
      }

      const videosJson = await videosRes.json();
      return Array.isArray(videosJson) ? videosJson : [];
    } catch (err) {
      console.error("Error fetching videos:", err);
      return [];
    }
  }, []);

  // Fetch profile and videos
  useEffect(() => {
    if (!isClient || !id) return;

    const fetchAll = async () => {
      setLoading(true);
      setError(null);

      try {
        const profileData = await fetchProfileData();
        setUser(profileData);
        
        if (profileData) {
          setFollowersCount(profileData.followers?.length || 0);
          setFollowingCount(profileData.following?.length || 0);
        }

        const videosData = await fetchVideosData(id as string);
        setVideos(videosData);
      } catch (err: unknown) {
        console.error("Error fetching profile/videos:", err);
        if (err instanceof Error) {
          if (err.message.includes("fetch")) {
            setError("Network error. Please check your connection and try again.");
          } else {
            setError(err.message);
          }
        } else {
          setError("An unexpected error occurred. Please try again.");
        }
      } finally {
        setLoading(false);
      }
    };

    const timeoutId = setTimeout(fetchAll, 100);

    const auth = getAuth();
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUid(user?.uid || null);
    });

    return () => {
      clearTimeout(timeoutId);
      unsubscribe();
    };
  }, [id, isClient, fetchProfileData, fetchVideosData]);

  useEffect(() => {
    if (!user || !currentUid) return;
    setIsFollowing(user.followers?.includes(currentUid) ?? false);
  }, [user, currentUid]);

  const isOwner = useMemo(() => currentUid && currentUid === id, [currentUid, id]);

  const handleDelete = async (videoId: string) => {
    const confirmDel = confirm("Delete this video? This action cannot be undone.");
    if (!confirmDel) return;

    try {
      setDeletingId(videoId);
      setError(null);

      const auth = getAuth();
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) throw new Error("Not authenticated");

      const res = await fetch(`/api/video/${videoId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${idToken}`,
          "Content-Type": "application/json",
        },
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || err.message || "Failed to delete video");
      }

      setVideos((prev) => prev.filter((v) => v.id !== videoId));
    } catch (err: unknown) {
      console.error("Delete failed:", err);
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeletingId(null);
    }
  };

  const handleEdit = (videoId: string) => {
    router.push(`/video/edit/${videoId}`);
  };

  const toggleFollow = async () => {
    if (!currentUid || !user) return;
    
    // Save current state for rollback in case of error
    const previousIsFollowing = isFollowing;
    const previousFollowersCount = followersCount;
    
    // Optimistic update - immediate UI change
    const newIsFollowing = !previousIsFollowing;
    setIsFollowing(newIsFollowing);
    
    if (newIsFollowing) {
      setFollowersCount(prev => prev + 1);
      // Add current user to followers list
      setUser(prev => prev ? {
        ...prev,
        followers: [...(prev.followers || []), currentUid]
      } : prev);
    } else {
      setFollowersCount(prev => Math.max(0, prev - 1));
      // Remove current user from followers list
      setUser(prev => prev ? {
        ...prev,
        followers: (prev.followers || []).filter(fid => fid !== currentUid)
      } : prev);
    }

    // Send API request in background
    try {
      const auth = getAuth();
      const idToken = await auth.currentUser?.getIdToken();

      if (!idToken) {
        throw new Error("Not authenticated");
      }

      const res = await fetch(`/api/follow`, {
        method: newIsFollowing ? "POST" : "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`
        },
        body: JSON.stringify({ targetUserId: user.id })
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to update follow state");
      }

      // Success - no need to do anything since we already updated optimistically
      console.log("Follow action successful");
      
    } catch (error) {
      console.error("Follow action failed:", error);
      
      // Rollback on error
      setIsFollowing(previousIsFollowing);
      setFollowersCount(previousFollowersCount);
      
      // Rollback user followers list
      if (previousIsFollowing) {
        setUser(prev => prev ? {
          ...prev,
          followers: [...(prev.followers || []), currentUid]
        } : prev);
      } else {
        setUser(prev => prev ? {
          ...prev,
          followers: (prev.followers || []).filter(fid => fid !== currentUid)
        } : prev);
      }
      
      // Show error to user
      setError("Could not update follow status. Please try again.");
      
      // Auto-clear error after 3 seconds
      setTimeout(() => setError(null), 3000);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      router.push("/login");
    } catch (error) {
      console.error("Error signing out:", error);
    }
  };

  const handleRetry = () => {
    window.location.reload();
  };

  // Memoize the profile header to prevent unnecessary re-renders
  const profileHeader = useMemo(() => {
    if (!user) return null;

    return (
      <div className="flex flex-col md:flex-row items-start gap-6 mb-8 relative">
        {/* Profile Picture */}
        
<div className="w-24 h-24 md:w-32 md:h-32 rounded-full overflow-hidden border-4 border-white shadow-lg relative flex-shrink-0">
  <Image
    src={user.photoURL || "/images/default-avatar.png"}
    alt={user.displayName}
    width={128}
    height={128}
    className="w-full h-full object-cover"
    // Remove either priority or loading='lazy' - choose one:
    
    // Option 1: Keep priority (for above-the-fold images)
    priority={true}
    // Remove loading="lazy"
    
    // OR Option 2: Keep lazy loading (for below-the-fold images)
    // loading="lazy"
    // Remove priority={true}
  />
</div>

        {/* Profile Info - Aligned to left */}
        <div className="flex-1">
          <div className="flex flex-col items-start gap-4 mb-3">
            <h1 className="text-2xl md:text-3xl font-bold">{user.displayName}</h1>
            
            {/* Bio */}
            {user.bio && (
              <p className="text-gray-700 dark:text-gray-300 max-w-2xl text-left">{user.bio}</p>
            )}

            {/* Stats - Left aligned */}
            <div className="flex justify-start w-full">
              <FollowStats
                userId={user.id}
                followersCount={followersCount}
                followingCount={followingCount}
                currentUid={currentUid}
                videosCount={videos.length}
              />
            </div>

            {/* Follow/Unfollow Button - Same size as settings button */}
            {!isOwner && isFollowing !== null && (
              <div className="mt-2 w-full max-w-xs">
                <button
                  onClick={toggleFollow}
                  className={`w-full px-8 py-2 font-medium rounded-lg transition-colors
                    ${isFollowing 
                      ? "bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-900 dark:text-white" 
                      : "bg-blue-600 hover:bg-blue-700 text-white"
                    }`}
                >
                  {isFollowing ? "Unfollow" : "Follow"}
                </button>
              </div>
            )}

            {/* Settings Button - Same container size */}
            {isOwner && (
              <div className="mt-2 w-full max-w-xs">
                <button
                  onClick={() => setShowSidebar(true)}
                  className="w-full px-8 py-2 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 rounded-lg font-medium transition-colors flex items-center gap-2 justify-center"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  Settings
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }, [user, followersCount, followingCount, currentUid, videos.length, isOwner, isFollowing, toggleFollow]);

  // Don't render until hydrated to prevent SSR/client mismatch
  if (!isClient) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Profile Header Skeleton */}
        <div className="flex flex-col md:flex-row items-center gap-8 mb-8">
          <div className="w-32 h-32 rounded-full bg-gray-200 dark:bg-gray-700 animate-pulse" />
          <div className="flex-1 space-y-4">
            <div className="h-8 w-64 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
            <div className="h-4 w-48 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
            <div className="h-4 w-96 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
          </div>
        </div>
        
        {/* Videos Grid Skeleton */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="space-y-2">
              <div className="aspect-video bg-gray-200 dark:bg-gray-700 rounded-lg animate-pulse" />
              <div className="h-4 w-full bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
              <div className="h-4 w-3/4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (loading) return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Profile Header Skeleton */}
      <div className="flex flex-col md:flex-row items-center gap-8 mb-8">
        <div className="w-32 h-32 rounded-full bg-gray-200 dark:bg-gray-700 animate-pulse" />
        <div className="flex-1 space-y-4">
          <div className="h-8 w-64 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
          <div className="h-4 w-48 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
          <div className="h-4 w-96 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
        </div>
      </div>
      
      {/* Videos Grid Skeleton */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="space-y-2">
            <div className="aspect-video bg-gray-200 dark:bg-gray-700 rounded-lg animate-pulse" />
            <div className="h-4 w-full bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
            <div className="h-4 w-3/4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  );

  // Enhanced error state with retry option
  if (error && !user) return (
    <div className="flex flex-col justify-center items-center h-screen px-4">
      <div className="text-center max-w-md">
        <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mb-4 mx-auto">
          <svg className="w-8 h-8 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h2 className="text-xl font-semibold mb-2">Unable to Load Profile</h2>
        <p className="text-gray-600 dark:text-gray-400 mb-6">{error}</p>
        <div className="space-x-4">
          <button
            onClick={handleRetry}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors"
          >
            Try Again
          </button>
          <button
            onClick={() => router.push('/')}
            className="px-4 py-2 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-md transition-colors"
          >
            Go Home
          </button>
        </div>
      </div>
    </div>
  );

  if (!user) return (
    <div className="flex justify-center items-center h-screen">
      <p className="text-xl">User not found</p>
    </div>
  );

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Profile Header - Memoized */}
      {profileHeader}

      {/* Settings Sidebar */}
      {isOwner && (
        <div
          ref={sidebarRef}
          className={`fixed top-0 right-0 h-full w-64 bg-white dark:bg-gray-800 shadow-xl z-50 transform transition-transform duration-300 ease-in-out ${
            showSidebar ? "translate-x-0" : "translate-x-full"
          }`}
        >
          <div className="p-4 border-b border-gray-200 dark:border-gray-700">
            <h3 className="text-lg font-semibold">Settings</h3>
            <button
              onClick={() => setShowSidebar(false)}
              className="absolute top-4 right-4 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="p-4 space-y-2">
            <button
              onClick={() => {
                router.push('/upload');
                setShowSidebar(false);
              }}
              className="w-full flex items-center gap-3 px-4 py-3 text-left rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              <span>Upload Video</span>
            </button>
            <button
              onClick={() => {
                router.push(`/history/${currentUid}`);
                setShowSidebar(false);
              }}
              className="w-full flex items-center gap-3 px-4 py-3 text-left rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>Watch History</span>
            </button>
            <button
              onClick={() => {
                router.push('/edit-profile');
                setShowSidebar(false);
              }}
              className="w-full flex items-center gap-3 px-4 py-3 text-left rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span>Edit Profile</span>
            </button>
            <button
              onClick={() => {
                handleLogout();
                setShowSidebar(false);
              }}
              className="w-full flex items-center gap-3 px-4 py-3 text-left rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              <span>Log Out</span>
            </button>
          </div>
        </div>
      )}

      {/* Error Display (non-fatal errors) */}
      {error && user && (
        <div className="mb-6 p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-md">
          <div className="flex items-start">
            <svg className="w-5 h-5 text-yellow-400 mr-3 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.5 0L4.314 18.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
            <div>
              <h4 className="text-sm font-medium text-yellow-800 dark:text-yellow-200">Notice</h4>
              <p className="text-sm text-yellow-700 dark:text-yellow-300 mt-1">{error}</p>
            </div>
          </div>
        </div>
      )}

      {/* Videos Grid */}
      <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
        <h2 className="text-xl font-semibold mb-6">Videos</h2>
        {videos.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12">
            <div className="w-16 h-16 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center mb-4">
              <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </div>
            <p className="text-gray-500 dark:text-gray-400">No videos uploaded yet</p>
            {isOwner && (
              <button
                onClick={() => router.push('/upload')}
                className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors"
              >
                Upload Your First Video
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {videos.map((video) => (
              <div key={video.id} className="video-card">
                {/* Video Thumbnail */}
                <div className="relative aspect-video bg-gray-100 dark:bg-gray-800 rounded-lg overflow-hidden mb-2">
                  <div
                    onClick={() => router.push(`/watch/${video.id}`)}
                    className="absolute inset-0 cursor-pointer"
                  >
                    {video.thumbnailUrl ? (
                      <Image
                        src={video.thumbnailUrl}
                        alt={video.title}
                        fill
                        className="object-cover"
                        loading="lazy"
                        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          target.style.display = 'none';
                        }}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-400">
                        <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                      </div>
                    )}
                    <div className="absolute bottom-1 right-1 bg-black/70 text-white text-xs px-1.5 py-0.5 rounded">
                      {formatDuration(Number(video.duration)) || "0:00"}
                    </div>
                  </div>
                </div>

                {/* Video Info */}
                <div className="flex gap-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-sm line-clamp-2 mb-1">
                      {video.title}
                    </h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {video.views?.toLocaleString() || 0} views • {formatDate(video.createdAt)}
                    </p>
                  </div>
                  
                  {/* Edit/Delete Buttons (for owner) */}
                  {isOwner && (
                    <div className="flex flex-col gap-1">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleEdit(video.id);
                        }}
                        className="p-1 text-gray-500 hover:text-blue-500 dark:hover:text-blue-400 transition-colors"
                        title="Edit"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(video.id);
                        }}
                        disabled={deletingId === video.id}
                        className="p-1 text-gray-500 hover:text-red-500 dark:hover:text-red-400 transition-colors disabled:opacity-50"
                        title="Delete"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}//the end