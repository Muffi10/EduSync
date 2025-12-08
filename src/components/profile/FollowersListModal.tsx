"use client";

import { useEffect, useState } from "react";
import Image from "next/image";

interface Props {
  type: "followers" | "following";
  userId: string;
  currentUid: string;
  onClose: () => void;
}

interface FollowUser {
  id: string;
  username: string;
  profilePic?: string;
  isFollowing: boolean;
}

export default function FollowersListModal({ type, userId, onClose, currentUid }: Props) {
  const [list, setList] = useState<FollowUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);

  useEffect(() => {
    async function fetchList() {
      try {
        const res = await fetch(`/api/follow?userId=${userId}&type=${type}&viewer=${currentUid}`);
        const data = await res.json();
        if (res.ok) setList(data[type]);
      } catch (err) {
        console.error("Error fetching follow list:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchList();
  }, [type, userId, currentUid]);

  const handleToggleFollow = async (targetId: string, isFollowing: boolean) => {
    try {
      setUpdating(targetId);
      
      const token = await getAuthToken();
      if (!token) throw new Error("Not authenticated");

      const method = isFollowing ? "DELETE" : "POST";
      const res = await fetch("/api/follow", {
        method,
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ targetUserId: targetId }),
      });

      if (res.ok) {
        setList(prev =>
          prev.map(user =>
            user.id === targetId ? { ...user, isFollowing: !isFollowing } : user
          )
        );
      } else {
        const err = await res.json();
        console.error("Follow toggle failed:", err.message || "Unknown error");
      }
    } catch (err) {
      console.error("Error toggling follow:", err);
    } finally {
      setUpdating(null);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex justify-center items-center z-50 p-4">
      <div className="bg-black border border-gray-800 rounded-lg w-full max-w-md max-h-[80vh] flex flex-col">
        <div className="p-6 border-b border-gray-800">
          <h2 className="text-xl font-semibold text-center capitalize text-white">
            {type === 'followers' ? 'Followers' : 'Following'}
          </h2>
        </div>
        
        <div className="overflow-y-auto flex-1">
          {loading ? (
            <div className="flex justify-center items-center p-8">
              <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
            </div>
          ) : list.length === 0 ? (
            <div className="p-8 text-center text-gray-400">
              No {type} found
            </div>
          ) : (
            <ul className="divide-y divide-gray-800">
              {list.map((user) => (
                <li key={user.id} className="p-4 hover:bg-gray-900 transition-colors">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-full overflow-hidden bg-gray-800 flex-shrink-0">
                        <Image
                          src={user.profilePic || "/images/default-avatar.png"}
                          alt={user.username}
                          width={48}
                          height={48}
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <span className="font-medium text-white">{user.username}</span>
                    </div>
                    {user.id !== currentUid && (
                      <button
                        onClick={() => handleToggleFollow(user.id, user.isFollowing)}
                        disabled={updating === user.id}
                        className={`text-sm px-6 py-2 rounded-full font-medium transition-all duration-200 ${
                          user.isFollowing
                            ? "bg-gray-800 text-white hover:bg-gray-700 border border-gray-700"
                            : "bg-blue-600 text-white hover:bg-blue-700"
                        } disabled:opacity-50 disabled:cursor-not-allowed min-w-[100px]`}
                      >
                        {updating === user.id ? "..." : user.isFollowing ? "Unfollow" : "Follow"}
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <button
          onClick={onClose}
          className="p-6 text-center border-t border-gray-800 text-blue-500 font-medium hover:bg-gray-900 transition-colors rounded-b-lg text-lg"
        >
          Close
        </button>
      </div>
    </div>
  );
}

// Helper function to get auth token
async function getAuthToken(): Promise<string | null> {
  const auth = (await import("@/lib/firebase")).auth;
  return auth.currentUser?.getIdToken() || null;
}