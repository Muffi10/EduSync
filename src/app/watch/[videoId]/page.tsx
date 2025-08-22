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

          // Register view if not already viewed
          const historyDoc = await getDoc(
            doc(db, `users/${currentUser.uid}/history`, videoId)
          );
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
    // Revert UI if API call fails
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
      // Revert if failed
      setIsFollowing(!newFollowStatus);
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
        />
      </div>

      {/* Video Info Section */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-2">{video.title}</h1>

        {/* Video Stats and Actions */}
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
          <div className="flex items-center space-x-2 text-gray-600 text-sm">
            <span>{views.toLocaleString()} views</span>
            <span>•</span>
            <span>{new Date(video.createdAt).toLocaleDateString()}</span>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={handleLike}
              className={`flex items-center space-x-1 px-3 py-1.5 rounded-full ${
                isLiked
                  ? "bg-blue-100 text-blue-600"
                  : "bg-gray-100 hover:bg-gray-200"
              } cursor-pointer transition`}
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
                  isFollowing ? "bg-gray-200" : "bg-gray-100 hover:bg-gray-200"
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
                      d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"
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
                  className="px-2 py-1 bg-gray-200 dark:bg-gray-700 text-sm rounded-full cursor-pointer hover:bg-gray-300 dark:hover:bg-gray-600"
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
                alt={creator.displayName}
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
                  ? "bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600"
                  : "bg-black text-white hover:bg-gray-800 dark:bg-white dark:text-black dark:hover:bg-gray-200"
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