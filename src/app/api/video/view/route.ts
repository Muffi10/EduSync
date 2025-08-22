//api/video/view/route.ts
import { NextRequest, NextResponse } from "next/server";
import { verifyFirebaseToken } from "@/lib/auth";
import { db } from "@/lib/firebase";
import {
  doc,
  getDoc,
  updateDoc,
  increment,
  setDoc,
  serverTimestamp
} from "firebase/firestore";

export async function POST(req: NextRequest) {
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
    return NextResponse.json({ error: "`videoId` is required" }, { status: 400 });
  }

  const videoRef = doc(db, "videos", videoId);
  const videoSnap = await getDoc(videoRef);
  if (!videoSnap.exists()) {
    return NextResponse.json({ error: "Video not found" }, { status: 404 });
  }

  // 🔢 Increment views
  await updateDoc(videoRef, { views: increment(1) });

  // 🕓 Add to watch history (one doc per video per user)
  const historyRef = doc(db, `users/${decoded.uid}/history`, videoId);
  await setDoc(historyRef, {
    videoId,
    watchedAt: serverTimestamp(),
  });

  return NextResponse.json({ message: "View recorded" });
}
