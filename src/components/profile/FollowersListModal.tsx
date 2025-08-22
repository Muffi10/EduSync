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
      
      const token = await getAuthToken(); // You'll need to implement this
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
    <div className="fixed inset-0 bg-black/50 flex justify-center items-center z-50 p-4">
      <div className="bg-white rounded-lg w-full max-w-md max-h-[80vh] flex flex-col">
        <div className="p-4 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-center capitalize">{type}</h2>
        </div>
        
        <div className="overflow-y-auto flex-1">
          {loading ? (
            <div className="flex justify-center items-center p-8">
              <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
            </div>
          ) : list.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              No {type} found
            </div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {list.map((user) => (
                <li key={user.id} className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full overflow-hidden bg-gray-100">
                        <Image
                          src={user.profilePic || "/default-avatar.png"}
                          alt={user.username}
                          width={40}
                          height={40}
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <span className="font-medium">{user.username}</span>
                    </div>
                    {user.id !== currentUid && (
                      <button
                        onClick={() => handleToggleFollow(user.id, user.isFollowing)}
                        disabled={updating === user.id}
                        className={`text-sm px-4 py-1.5 rounded-full font-medium ${
                          user.isFollowing
                            ? "bg-gray-100 text-gray-800 hover:bg-gray-200"
                            : "bg-blue-500 text-white hover:bg-blue-600"
                        } transition-colors`}
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
          className="p-4 text-center border-t border-gray-200 text-blue-500 font-medium hover:bg-gray-50 rounded-b-lg"
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