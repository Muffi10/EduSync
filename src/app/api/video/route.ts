//api/video/route.ts
import { NextRequest, NextResponse } from "next/server";
import { verifyFirebaseToken } from "@/lib/auth";
import { db } from "@/lib/firebase";
import {
  collection,
  addDoc,
  getDocs,
  query,
  orderBy,
  doc,
  updateDoc,
  serverTimestamp,
  getDoc,
  arrayUnion,
  arrayRemove,
} from "firebase/firestore";

// ----------------- POST: Upload New Video --------------------
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

  const {
    title,
    description = "",
    videoUrl,
    thumbnailUrl = "",
    tags = [],
    visibility = "public",
  } = await req.json();

  if (!title || !videoUrl) {
    return NextResponse.json({ error: "`title` and `videoUrl` are required" }, { status: 400 });
  }
  console.log("Decoded UID:", decoded.uid);
  const docRef = await addDoc(collection(db, "videos"), {
    ownerId: decoded.uid,
    title,
    description,
    videoUrl,
    thumbnailUrl,
    tags,
    visibility,
    likes: [],
    commentsCount: 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return NextResponse.json({ videoId: docRef.id }, { status: 201 });
}

// ----------------- GET: All or Single Video --------------------
export async function GET(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const parts = pathname.split("/"); // ['', 'api', 'video', 'videoId' or nothing]

  const isSingleVideo = parts.length === 4 && parts[3];

  if (isSingleVideo) {
    const videoId = parts[3];
    const ref = doc(db, "videos", videoId);
    const snapshot = await getDoc(ref);

    if (!snapshot.exists()) {
      return NextResponse.json({ error: "Video not found" }, { status: 404 });
    }

    return NextResponse.json({ video: { id: snapshot.id, ...snapshot.data() } });
  }

  // fallback: get all
  const q = query(collection(db, "videos"), orderBy("createdAt", "desc"));
  const snapshot = await getDocs(q);

  const videos = snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data(),
  }));

  return NextResponse.json({ videos });
}

// ----------------- PATCH: Update Video --------------------
export async function PATCH(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const idToken = authHeader.split(" ")[1];
  const decoded = await verifyFirebaseToken(idToken);
  if (!decoded) {
    return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
  }

  const { videoId, title, description, tags, visibility, thumbnailUrl } = await req.json();

  if (!videoId) {
    return NextResponse.json({ error: "`videoId` is required" }, { status: 400 });
  }

  const ref = doc(db, "videos", videoId);
  const snapshot = await getDoc(ref);

  if (!snapshot.exists()) {
    return NextResponse.json({ error: "Video not found" }, { status: 404 });
  }

  if (snapshot.data().ownerId !== decoded.uid) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await updateDoc(ref, {
    title,
    description,
    tags,
    visibility,
    thumbnailUrl,
    updatedAt: serverTimestamp(),
  });

  return NextResponse.json({ message: "Video updated successfully" });
}

// ----------------- PUT: Like / Unlike a video --------------------
export async function PUT(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const idToken = authHeader.split(" ")[1];
  const decoded = await verifyFirebaseToken(idToken);
  if (!decoded) {
    return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
  }

  const { videoId, like } = await req.json();

  if (!videoId || typeof like !== "boolean") {
    return NextResponse.json({ error: "`videoId` and `like` are required" }, { status: 400 });
  }

  const ref = doc(db, "videos", videoId);
  const videoSnap = await getDoc(ref);

  if (!videoSnap.exists()) {
    return NextResponse.json({ error: "Video not found" }, { status: 404 });
  }

  await updateDoc(ref, {
    likes: like ? arrayUnion(decoded.uid) : arrayRemove(decoded.uid),
  });

  // 🔔 Add notification if liked (optional)
  const ownerId = videoSnap.data().ownerId;
  if (like && ownerId && ownerId !== decoded.uid) {
    await addDoc(collection(db, `users/${ownerId}/notifications`), {
      type: "like",
      fromUserId: decoded.uid,
      videoId,
      message: `${decoded.name || "Someone"} liked your video.`,
      read: false,
      createdAt: Date.now(),
    });
  }

  return NextResponse.json({ message: like ? "Liked" : "Unliked" });
}
