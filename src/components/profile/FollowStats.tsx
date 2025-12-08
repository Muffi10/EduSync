// src/components/profile/FollowStats.tsx
"use client";

import { useState } from "react";
import FollowersListModal from "./FollowersListModal";

interface Props {
  userId: string;
  followersCount: number;
  followingCount: number;
  currentUid: string | null;
  videosCount: number;
}

export default function FollowStats({
  userId,
  followersCount,
  followingCount,
  currentUid,
  videosCount,
}: Props) {
  const [openModal, setOpenModal] = useState<null | "followers" | "following">(null);

  return (
    <>
      <div className="flex gap-12">
        <div className="text-center cursor-default">
          <span className="block text-2xl font-bold text-white">{videosCount}</span>
          <span className="text-sm text-gray-400">Videos</span>
        </div>
        <div
          onClick={() => currentUid && setOpenModal("followers")}
          className={`text-center transition-all duration-200 ${
            currentUid 
              ? "cursor-pointer hover:scale-105 transform" 
              : "cursor-default"
          }`}
        >
          <span className="block text-2xl font-bold text-white">{followersCount}</span>
          <span className="text-sm text-gray-400">Followers</span>
        </div>
        <div
          onClick={() => currentUid && setOpenModal("following")}
          className={`text-center transition-all duration-200 ${
            currentUid 
              ? "cursor-pointer hover:scale-105 transform" 
              : "cursor-default"
          }`}
        >
          <span className="block text-2xl font-bold text-white">{followingCount}</span>
          <span className="text-sm text-gray-400">Following</span>
        </div>
      </div>

      {openModal && currentUid && (
        <FollowersListModal
          type={openModal}
          userId={userId}
          currentUid={currentUid}
          onClose={() => setOpenModal(null)}
        />
      )}
    </>
  );
}