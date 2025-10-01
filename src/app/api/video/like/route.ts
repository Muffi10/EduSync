// src/app/api/video/like/route.ts
import { NextResponse } from "next/server";
import { verifyFirebaseToken } from "@/lib/auth";
import { db } from "@/lib/firebase";
import { doc, updateDoc, arrayUnion, arrayRemove, getDoc, addDoc, collection, serverTimestamp } from "firebase/firestore";

export async function POST(req: Request) {
  try {
    // 1. Verify authentication
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const token = authHeader.split(" ")[1];
    const decoded = await verifyFirebaseToken(token);
    if (!decoded) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    // 2. Parse request body
    const { videoId, like } = await req.json();
    if (!videoId || typeof like !== "boolean") {
      return NextResponse.json(
        { error: "videoId and like (boolean) are required" },
        { status: 400 }
      );
    }

    // 3. Update video likes
    const videoRef = doc(db, "videos", videoId);
    await updateDoc(videoRef, {
      likes: like ? arrayUnion(decoded.uid) : arrayRemove(decoded.uid),
    });

    // 4. Create notification if liking (not unliking)
    if (like) {
      const videoSnap = await getDoc(videoRef);
      if (videoSnap.exists()) {
        const videoData = videoSnap.data();
        const ownerId = videoData.ownerId;

        // Don't notify if user likes their own video
        if (ownerId && ownerId !== decoded.uid) {
          await addDoc(collection(db, `users/${ownerId}/notifications`), {
            type: "like",
            fromUserId: decoded.uid,
            videoId,
            message: `liked your video "${videoData.title}"`,
            read: false,
            createdAt: Date.now(),
          });
        }
      }
    }

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error("Error updating like:", error);
    return NextResponse.json(
      { error: "Failed to update like" },
      { status: 500 }
    );
  }
}