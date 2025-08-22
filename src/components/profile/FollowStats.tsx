// src/components/profile/FollowStats.tsx
"use client";

import { useState } from "react";
import FollowersListModal from "./FollowersListModal";

interface Props {
  userId: string;
  followersCount: number;
  followingCount: number;
  currentUid: string | null;
  videosCount: number; // Added videosCount prop
}

export default function FollowStats({
  userId,
  followersCount,
  followingCount,
  currentUid,
  videosCount, // Added videosCount prop
}: Props) {
  const [openModal, setOpenModal] = useState<null | "followers" | "following">(null);

  return (
    <>
      <div className="flex gap-8">
        <div className="text-center">
          <span className="block text-lg font-semibold">{videosCount}</span>
          <span className="text-sm text-gray-500">Videos</span>
        </div>
        <div
          onClick={() => setOpenModal("followers")}
          className="text-center cursor-pointer hover:opacity-80 transition-opacity"
        >
          <span className="block text-lg font-semibold">{followersCount}</span>
          <span className="text-sm text-gray-500">Followers</span>
        </div>
        <div
          onClick={() => setOpenModal("following")}
          className="text-center cursor-pointer hover:opacity-80 transition-opacity"
        >
          <span className="block text-lg font-semibold">{followingCount}</span>
          <span className="text-sm text-gray-500">Following</span>
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