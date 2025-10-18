//src/app/watch/[videoId]/page.tsx
"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getAuth } from "firebase/auth";
import { db } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore";
import CommentSection from "@/components/CommentSection";
import Image from "next/image";
import Link from "next/link";
import { use } from "react";

export default function WatchPage({ params }: { params: Promise<{ videoId: string }> }) {
  const { videoId } = use(params);
  const router = useRouter();
  const [video, setVideo] = useState<any>(null);
  const [user, setUser] = useState<any>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLiked, setIsLiked] = useState(false);
  const [isFollowing, setIsFollowing] = useState(false);
  const [views, setViews] = useState(0);
  const [likeCount, setLikeCount] = useState(0);
  const [creator, setCreator] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isReporting, setIsReporting] = useState(false);
  const [isCreatingParty, setIsCreatingParty] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const auth = getAuth();
        const currentUser = auth.currentUser;
        setLoading(true);

        // Fetch video data
        const videoRes = await fetch(`/api/video/${videoId}`);
        if (!videoRes.ok) throw new Error("Video not found");
        const { video: videoData } = await videoRes.json();
        setVideo(videoData);
        setViews(videoData.views);
        setLikeCount(videoData.likes?.length || 0);

        // Fetch creator data
        const creatorRes = await fetch(`/api/user/${videoData.ownerId}`);
        const creatorData = await creatorRes.json();
        setCreator(creatorData);

        if (currentUser) {
          const idToken = await currentUser.getIdToken();
          setUser(currentUser);
          setToken(idToken);

          // Check like status
          setIsLiked(videoData.likes?.includes(currentUser.uid) || false);

          // Check follow status if not the creator
          if (videoData.ownerId !== currentUser.uid) {
            const followRes = await fetch(
              `/api/follow/status?userId=${currentUser.uid}&targetUserId=${videoData.ownerId}`,
              {
                headers: { Authorization: `Bearer ${idToken}` },
              }
            );
            const { isFollowing } = await followRes.json();
            setIsFollowing(isFollowing);
          }

          // Check if video is already in history
          const historyDoc = await getDoc(
            doc(db, `users/${currentUser.uid}/history`, videoId)
          );

          // Add to watch history (updates timestamp if already exists)
          await fetch("/api/history", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${idToken}`,
            },
            body: JSON.stringify({ videoId }),
          });

          // Register view only if not already viewed
          if (!historyDoc.exists()) {
            await fetch("/api/video/view", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${idToken}`,
              },
              body: JSON.stringify({ videoId }),
            });
            setViews((prev) => prev + 1);
          }
        }
      } catch (error) {
        console.error("Error fetching data:", error);
        router.push("/");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [videoId, router]);

  const handleLike = async () => {
    if (!token || !video) return;

    const newLikeStatus = !isLiked;
    setIsLiked(newLikeStatus);
    setLikeCount((prev) => (newLikeStatus ? prev + 1 : prev - 1));

    try {
      const response = await fetch("/api/video/like", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          videoId,
          like: newLikeStatus,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to update like");
      }
    } catch (error) {
      console.error("Like error:", error);
      setIsLiked(!newLikeStatus);
      setLikeCount((prev) => (newLikeStatus ? prev - 1 : prev + 1));
    }
  };

  const handleFollow = async () => {
    if (!token || !video || !creator) return;

    const newFollowStatus = !isFollowing;
    setIsFollowing(newFollowStatus);

    try {
      await fetch("/api/follow", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          targetUserId: video.ownerId,
          follow: newFollowStatus,
        }),
      });
    } catch (error) {
      setIsFollowing(!newFollowStatus);
    }
  };

  const handleReport = async () => {
    if (!token || !video) return;

    if (!confirm("Are you sure you want to report this video?")) return;

    setIsReporting(true);

    try {
      const response = await fetch("/api/video/report", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ videoId }),
      });

      if (!response.ok) {
        throw new Error("Failed to report video");
      }

      alert("Video reported successfully. Thank you for helping keep our community safe.");
    } catch (error) {
      console.error("Report error:", error);
      alert("Failed to report video. Please try again.");
    } finally {
      setIsReporting(false);
    }
  };

  const handleCreateWatchParty = async () => {
    if (!token || !video) return;

    setIsCreatingParty(true);

    try {
      const response = await fetch("/api/watch-party/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          videoId,
          title: `Watch Party: ${video.title}`,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to create watch party");
      }

      const { partyId } = await response.json();
      router.push(`/watch-party/${partyId}`);
    } catch (error) {
      console.error("Watch party error:", error);
      alert("Failed to create watch party. Please try again.");
    } finally {
      setIsCreatingParty(false);
    }
  };

  const formatDate = (dateValue: any) => {
    if (!dateValue) return "Date unknown";
    
    try {
      if (dateValue?.toDate && typeof dateValue.toDate === 'function') {
        return dateValue.toDate().toLocaleDateString();
      }
      
      const date = new Date(dateValue);
      if (isNaN(date.getTime())) {
        return "Date unknown";
      }
      
      return date.toLocaleDateString();
    } catch (error) {
      console.error("Error formatting date:", error);
      return "Date unknown";
    }
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto p-4 flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (!video) {
    return (
      <div className="max-w-4xl mx-auto p-4 text-center">
        <p>Video not found</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-4">
      {/* Video Player */}
      <div className="aspect-video bg-black rounded-xl overflow-hidden mb-4">
        <video
          controls
          className="w-full h-full"
          src={video.videoUrl}
          poster={video.thumbnailUrl || ""}
        >
          Your browser does not support the video tag.
        </video>
      </div>

      {/* Video Info Section */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-2">{video.title}</h1>

        {/* Video Stats and Actions */}
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
          <div className="flex items-center space-x-2 text-gray-600 dark:text-gray-400 text-sm">
            <span>{views.toLocaleString()} views</span>
            <span>•</span>
            <span>{formatDate(video.createdAt)}</span>
          </div>

          <div className="flex items-center space-x-2 flex-wrap">
            <button
              onClick={handleLike}
              disabled={!token}
              className={`flex items-center space-x-1 px-3 py-1.5 rounded-full ${
                isLiked
                  ? "bg-blue-500 text-white hover:bg-blue-600"
                  : "bg-gray-200 text-gray-800 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
              } ${!token ? "opacity-50 cursor-not-allowed" : "cursor-pointer"} transition`}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5"
                fill={isLiked ? "currentColor" : "none"}
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2h-.095c-.5 0-.905.405-.905.905 0 .714-.211 1.412-.608 2.006L7 11v9m7-10h-2M7 20H5a2 2 0 01-2-2v-6a2 2 0 012-2h2.5"
                />
              </svg>
              <span>{likeCount.toLocaleString()}</span>
            </button>

            {user?.uid && user.uid !== video.ownerId && (
              <button
                onClick={handleFollow}
                className={`flex items-center space-x-1 px-3 py-1.5 rounded-full ${
                  isFollowing
                    ? "bg-gray-300 text-gray-800 hover:bg-gray-400 dark:bg-gray-600 dark:text-gray-200 dark:hover:bg-gray-500"
                    : "bg-blue-500 text-white hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-700"
                } cursor-pointer transition`}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  {isFollowing ? (
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 13l4 4L19 7"
                    />
                  ) : (
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 4v16m8-8H4"
                    />
                  )}
                </svg>
                <span>{isFollowing ? "Following" : "Follow"}</span>
              </button>
            )}

            {/* NEW: Watch Party Button */}
            {user?.uid && (
              <button
                onClick={handleCreateWatchParty}
                disabled={isCreatingParty}
                className={`flex items-center space-x-1 px-3 py-1.5 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 text-white hover:from-purple-600 hover:to-pink-600 ${
                  isCreatingParty ? "opacity-50 cursor-not-allowed" : "cursor-pointer"
                } transition`}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                  />
                </svg>
                <span>{isCreatingParty ? "Creating..." : "Watch Party"}</span>
              </button>
            )}

            {user?.uid && (
              <button
                onClick={handleReport}
                disabled={isReporting}
                className={`flex items-center space-x-1 px-3 py-1.5 rounded-full bg-red-100 text-red-600 hover:bg-red-200 dark:bg-red-900 dark:text-red-200 dark:hover:bg-red-800 ${
                  isReporting ? "opacity-50 cursor-not-allowed" : "cursor-pointer"
                } transition`}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9"
                  />
                </svg>
                <span>{isReporting ? "Reporting..." : "Report"}</span>
              </button>
            )}
          </div>
        </div>

        {/* Video Description */}
        <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg mb-4">
          <p className="whitespace-pre-line text-gray-800 dark:text-gray-200">
            {video.description || "No description provided"}
          </p>
          {video.tags?.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {video.tags.map((tag: string) => (
                <span
                  key={tag}
                  className="px-2 py-1 bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-200 text-sm rounded-full cursor-pointer hover:bg-blue-200 dark:hover:bg-blue-800"
                >
                  #{tag}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Creator Info */}
      {creator && (
        <div className="flex items-center justify-between mb-6 p-3 border-b border-gray-200 dark:border-gray-700">
          <Link
            href={`/channel/${creator.username}`}
            className="flex items-center space-x-3 cursor-pointer"
          >
            <div className="relative h-10 w-10 rounded-full overflow-hidden">
              <Image
                src={creator.photoURL || "/images/default-avatar.png"}
                alt={`${creator.displayName}'s profile picture`}
                fill
                className="object-cover"
              />
            </div>
            <div>
              <h3 className="font-medium">{creator.displayName}</h3>
              <p className="text-sm text-gray-500">@{creator.username}</p>
            </div>
          </Link>
          {user?.uid && user.uid !== creator.uid && (
            <button
              onClick={handleFollow}
              className={`px-4 py-1.5 rounded-full text-sm font-medium ${
                isFollowing
                  ? "bg-gray-300 text-gray-800 hover:bg-gray-400 dark:bg-gray-600 dark:text-gray-200 dark:hover:bg-gray-500"
                  : "bg-blue-500 text-white hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-700"
              } cursor-pointer transition`}
            >
              {isFollowing ? "Following" : "Follow"}
            </button>
          )}
        </div>
      )}

      {/* Comment Section */}
      <div className="mt-6">
        <CommentSection videoId={videoId} />
      </div>
    </div>
  );
}