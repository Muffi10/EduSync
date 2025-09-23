// api/video/route.ts
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
  limit,
  startAfter,
  where,
} from "firebase/firestore";

// ----------------- POST: Upload New Video --------------------
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

    const docRef = await addDoc(collection(db, "videos"), {
      ownerId: decoded.uid,
      title,
      description,
      videoUrl,
      thumbnailUrl,
      tags,
      visibility,
      likes: [],
      views: 0,
      commentsCount: 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    return NextResponse.json({ videoId: docRef.id }, { status: 201 });
  } catch (err) {
    console.error("POST /api/video error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ----------------- GET: Fetch Videos with Pagination --------------------
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const limitParam = parseInt(searchParams.get("limit") || "12");
    const lastDocId = searchParams.get("lastDoc");
    const visibility = searchParams.get("visibility") || "public";
    
    // Validate limit
    const validLimit = Math.min(Math.max(limitParam, 1), 50); // Between 1-50

    let q = query(
      collection(db, "videos"),
      where("visibility", "==", visibility),
      orderBy("createdAt", "desc"),
      limit(validLimit)
    );

    // If we have a cursor, start after it
    if (lastDocId) {
      try {
        const lastDocRef = doc(db, "videos", lastDocId);
        const lastDocSnap = await getDoc(lastDocRef);
        
        if (lastDocSnap.exists()) {
          q = query(
            collection(db, "videos"),
            where("visibility", "==", visibility),
            orderBy("createdAt", "desc"),
            startAfter(lastDocSnap),
            limit(validLimit)
          );
        }
      } catch (error) {
        console.warn("Error with cursor, ignoring:", error);
        // Fall back to query without cursor
      }
    }

    const snapshot = await getDocs(q);

    const videos = snapshot.docs.map((d) => ({
      id: d.id,
      ...d.data(),
      // Convert server timestamps to serializable format
      createdAt: d.data().createdAt?.toDate?.()?.getTime() || Date.now(),
      updatedAt: d.data().updatedAt?.toDate?.()?.getTime() || Date.now(),
    }));

    // Get the last document ID for pagination cursor
    const lastDoc = snapshot.docs.length > 0 
      ? snapshot.docs[snapshot.docs.length - 1].id 
      : null;

    // Set cache headers for better performance
    const response = NextResponse.json({ 
      videos, 
      lastDoc,
      hasMore: snapshot.docs.length === validLimit
    });

    response.headers.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=30');
    
    return response;

  } catch (error) {
    console.error("Error fetching videos:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// ----------------- PATCH: Update Video --------------------
export async function PATCH(req: NextRequest) {
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

    const updateData: any = { updatedAt: serverTimestamp() };
    
    if (title !== undefined) updateData.title = title;
    if (description !== undefined) updateData.description = description;
    if (tags !== undefined) updateData.tags = tags;
    if (visibility !== undefined) updateData.visibility = visibility;
    if (thumbnailUrl !== undefined) updateData.thumbnailUrl = thumbnailUrl;

    await updateDoc(ref, updateData);

    return NextResponse.json({ message: "Video updated successfully" });
  } catch (err) {
    console.error("PATCH /api/video error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ----------------- PUT: Like / Unlike a video --------------------
export async function PUT(req: NextRequest) {
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

    // Optional notification (only for likes, not unlikes)
    const ownerId = videoSnap.data().ownerId;
    if (like && ownerId && ownerId !== decoded.uid) {
      try {
        await addDoc(collection(db, `users/${ownerId}/notifications`), {
          type: "like",
          fromUserId: decoded.uid,
          videoId,
          message: `${decoded.name || "Someone"} liked your video.`,
          read: false,
          createdAt: serverTimestamp(),
        });
      } catch (notificationError) {
        // Don't fail the like action if notification fails
        console.warn("Failed to create notification:", notificationError);
      }
    }

    return NextResponse.json({ message: like ? "Liked" : "Unliked" });
  } catch (err) {
    console.error("PUT /api/video error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}