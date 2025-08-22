//api/comment/route.ts
import { NextRequest, NextResponse } from "next/server";
import { verifyFirebaseToken } from "@/lib/auth";
import { db } from "@/lib/firebase";
import {
  collection,
  addDoc,
  query,
  where,
  orderBy,
  getDocs,
  getDoc,
  doc,
  updateDoc,
  serverTimestamp,
  increment,
} from "firebase/firestore";

// ------------- POST: Add a Comment -----------------------
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

  const { videoId, text } = await req.json();

  if (!videoId || !text) {
    return NextResponse.json({ error: "`videoId` and `text` are required" }, { status: 400 });
  }

  const docRef = await addDoc(collection(db, "comments"), {
    videoId,
    userId: decoded.uid,
    text,
    createdAt: serverTimestamp(),
  });
  const videoSnap = await getDoc(doc(db, "videos", videoId));
if (videoSnap.exists()) {
  const ownerId = videoSnap.data().ownerId;
  if (ownerId && ownerId !== decoded.uid) {
    await addDoc(collection(db, `users/${ownerId}/notifications`), {
      type: "comment",
      fromUserId: decoded.uid,
      videoId,
      message: `${decoded.name || "Someone"} commented on your video.`,
      read: false,
      createdAt: Date.now(),
    });
  }
}
await updateDoc(doc(db, "videos", videoId), {
  commentsCount: increment(1),
});

  return NextResponse.json({ message: "Comment added", commentId: docRef.id });
}

// ------------- GET: Comments for a Video -----------------------
export async function GET(req: NextRequest) {
  const videoId = req.nextUrl.searchParams.get("videoId");

  if (!videoId) {
    return NextResponse.json({ error: "`videoId` is required" }, { status: 400 });
  }

  const q = query(
    collection(db, "comments"),
    where("videoId", "==", videoId),
    orderBy("createdAt", "desc")
  );

  const snapshot = await getDocs(q);

  const comments = snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data(),
  }));

  return NextResponse.json({ comments });
}
