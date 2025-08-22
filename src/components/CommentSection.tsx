"use client";

import { useEffect, useState } from "react";
import axios from "axios";
import Image from "next/image";
import { getAuth } from "firebase/auth";
import { doc, getDoc, onSnapshot, collection, query, where, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase";

interface Comment {
  id: string;
  videoId: string;
  userId: string;
  text: string;
  createdAt: number;
}

interface Props {
  videoId: string;
}

export default function CommentSection({ videoId }: Props) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState("");
  const [loading, setLoading] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [userDisplayNames, setUserDisplayNames] = useState<Record<string, string>>({});
  const [userPhotoURLs, setUserPhotoURLs] = useState<Record<string, string>>({});
  const [authLoading, setAuthLoading] = useState(true);

  // Get auth state
  useEffect(() => {
    const auth = getAuth();
    const unsubscribe = auth.onAuthStateChanged((user) => {
      setCurrentUser(user);
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Set up real-time listener for comments
  useEffect(() => {
    if (!videoId) return;

    const commentsRef = collection(db, "comments");
    const q = query(
      commentsRef,
      where("videoId", "==", videoId),
      orderBy("createdAt", "desc")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const commentsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Comment[];
      setComments(commentsData);
    });

    return () => unsubscribe();
  }, [videoId]);

  // Load user data from Firestore
  useEffect(() => {
    const loadUserData = async () => {
      const userIds = [...new Set(comments.map(c => c.userId))];
      const newUserData: Record<string, string> = {};
      const newPhotoURLs: Record<string, string> = {};

      await Promise.all(
        userIds.map(async (userId) => {
          try {
            const userDoc = await getDoc(doc(db, "users", userId));
            if (userDoc.exists()) {
              const userData = userDoc.data();
              newUserData[userId] = userData.displayName || "Anonymous";
              newPhotoURLs[userId] = userData.photoURL || "/images/default-avatar.png";
            } else {
              newUserData[userId] = userId.substring(0, 8);
              newPhotoURLs[userId] = "/images/default-avatar.png";
            }
          } catch (error) {
            console.error(`Error fetching user ${userId}:`, error);
            newUserData[userId] = "Unknown";
            newPhotoURLs[userId] = "/images/default-avatar.png";
          }
        })
      );

      setUserDisplayNames(prev => ({ ...prev, ...newUserData }));
      setUserPhotoURLs(prev => ({ ...prev, ...newPhotoURLs }));
    };

    if (comments.length > 0) {
      loadUserData();
    }
  }, [comments]);

  const handleSubmit = async () => {
    if (!newComment.trim() || !currentUser) return;

    setLoading(true);
    try {
      const token = await currentUser.getIdToken();
      await axios.post(
        "/api/comment",
        { videoId, text: newComment },
        { 
          headers: { Authorization: `Bearer ${token}` },
          validateStatus: () => true // Prevent automatic redirects
        }
      );
      setNewComment("");
    } catch (err) {
      console.error("Failed to post comment:", err);
    } finally {
      setLoading(false);
    }
  };

  if (authLoading) {
    return <div className="mt-6 p-4 text-center">Loading comments...</div>;
  }

  return (
    <div className="mt-6">
      <h2 className="text-xl font-semibold mb-4">Comments ({comments.length})</h2>

      {currentUser ? (
        <div className="flex gap-3 mb-6">
          <div className="flex-shrink-0">
            <div className="relative h-10 w-10 rounded-full overflow-hidden">
              <Image
                src={currentUser.photoURL || "/images/default-avatar.png"}
                alt="Your profile"
                width={40}
                height={40}
                className="object-cover"
              />
            </div>
          </div>
          <div className="flex-grow">
            <textarea
              className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              rows={3}
              placeholder="Add a comment..."
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
            />
            <div className="flex justify-end mt-2">
              <button
                onClick={handleSubmit}
                disabled={loading || !newComment.trim()}
                className={`px-4 py-2 rounded-full font-medium ${
                  loading || !newComment.trim()
                    ? 'bg-gray-300 dark:bg-gray-700 cursor-not-allowed'
                    : 'bg-blue-600 hover:bg-blue-700 text-white cursor-pointer'
                }`}
              >
                {loading ? "Posting..." : "Comment"}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="mb-6 p-4 bg-gray-100 dark:bg-gray-800 rounded-lg text-center">
          <p className="text-gray-600 dark:text-gray-300">
            Sign in to leave a comment
          </p>
        </div>
      )}

      <div className="space-y-4">
        {comments.map((comment) => (
          <div key={comment.id} className="flex gap-3">
            <div className="flex-shrink-0">
              <div className="relative h-10 w-10 rounded-full overflow-hidden">
                <Image
                  src={userPhotoURLs[comment.userId] || "/images/default-avatar.png"}
                  alt={userDisplayNames[comment.userId] || "User"}
                  width={40}
                  height={40}
                  className="object-cover"
                />
              </div>
            </div>
            <div className="flex-grow">
              <div className="bg-gray-100 dark:bg-gray-800 p-3 rounded-lg">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-medium">
                    {userDisplayNames[comment.userId] || "Anonymous"}
                  </span>
                  <span className="text-xs text-gray-500">
                    {new Date(comment.createdAt).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric'
                    })}
                  </span>
                </div>
                <p className="text-gray-800 dark:text-gray-200">{comment.text}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}