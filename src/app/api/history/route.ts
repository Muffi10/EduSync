// src/app/api/history/route.ts
import { NextRequest, NextResponse } from "next/server";
import { verifyFirebaseToken } from "@/lib/auth";
import { db } from "@/lib/firebase";
import {
  collection,
  query,
  orderBy,
  getDocs,
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  writeBatch,
  limit,
} from "firebase/firestore";

// GET: Fetch user's watch history with video details
export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const idToken = authHeader.split(" ")[1];
    const decoded = await verifyFirebaseToken(idToken);
    if (!decoded) {
      return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
    }

    const historyRef = collection(db, `users/${decoded.uid}/history`);
    const q = query(historyRef, orderBy("watchedAt", "desc"), limit(100));
    const snapshot = await getDocs(q);

    const history = await Promise.all(
      snapshot.docs.map(async (docSnap) => {
        const historyData = docSnap.data();
        const videoId = historyData.videoId;

        try {
          const videoRef = doc(db, "videos", videoId);
          const videoSnap = await getDoc(videoRef);
          if (!videoSnap.exists()) return null;

          const videoData = videoSnap.data();

          const channelRef = doc(db, "users", videoData.ownerId);
          const channelSnap = await getDoc(channelRef);
          const channelData = channelSnap.exists() ? channelSnap.data() : {};

          // ✅ Convert watchedAt to milliseconds if it's a Firestore Timestamp
          const watchedAt =
            typeof historyData.watchedAt === "number"
              ? historyData.watchedAt
              : historyData.watchedAt?.toMillis?.() || 0;

          return {
            id: docSnap.id,
            videoId,
            watchedAt,
            videoTitle: videoData.title || "Untitled Video",
            videoThumbnail: videoData.thumbnailUrl || "/images/default-thumbnail.png",
            videoDuration: videoData.duration || 0,
            channelId: videoData.ownerId,
            channelName: channelData.displayName || channelData.username || "Unknown Channel",
            channelPhoto: channelData.photoURL || "/images/default-avatar.png",
          };
        } catch (error) {
          console.error(`Error fetching video ${videoId}:`, error);
          return null;
        }
      })
    );

    const validHistory = history.filter((item) => item !== null);
    return NextResponse.json({ history: validHistory });
  } catch (error) {
    console.error("Error fetching watch history:", error);
    return NextResponse.json({ error: "Failed to fetch watch history" }, { status: 500 });
  }
}

// POST: Add/Update watch history entry
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const idToken = authHeader.split(" ")[1];
    const decoded = await verifyFirebaseToken(idToken);
    if (!decoded) {
      return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
    }

    const { videoId } = await req.json();
    if (!videoId) {
      return NextResponse.json({ error: "videoId is required" }, { status: 400 });
    }

    const videoRef = doc(db, "videos", videoId);
    const videoSnap = await getDoc(videoRef);
    if (!videoSnap.exists()) {
      return NextResponse.json({ error: "Video not found" }, { status: 404 });
    }

    const historyDocRef = doc(db, `users/${decoded.uid}/history`, videoId);
    await setDoc(historyDocRef, {
      videoId,
      watchedAt: Date.now(),
    });

    return NextResponse.json({ success: true, message: "Watch history updated" });
  } catch (error) {
    console.error("Error updating watch history:", error);
    return NextResponse.json({ error: "Failed to update watch history" }, { status: 500 });
  }
}

// DELETE: Clear all watch history or remove specific video
export async function DELETE(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const idToken = authHeader.split(" ")[1];
    const decoded = await verifyFirebaseToken(idToken);
    if (!decoded) {
      return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
    }

    const { videoId } = await req.json();

    if (videoId) {
      const historyDocRef = doc(db, `users/${decoded.uid}/history`, videoId);
      await deleteDoc(historyDocRef);
      return NextResponse.json({ success: true, message: "Video removed from history" });
    } else {
      const historyRef = collection(db, `users/${decoded.uid}/history`);
      const snapshot = await getDocs(historyRef);
      const batch = writeBatch(db);

      snapshot.docs.forEach((docSnap) => batch.delete(docSnap.ref));
      await batch.commit();

      return NextResponse.json({ success: true, message: "All watch history cleared" });
    }
  } catch (error) {
    console.error("Error deleting watch history:", error);
    return NextResponse.json({ error: "Failed to delete watch history" }, { status: 500 });
  }
}
