// src/app/api/video/report/route.ts
import { NextResponse } from "next/server";
import { verifyFirebaseToken, adminDb } from "@/lib/auth";
import { FieldValue } from "firebase-admin/firestore";

export async function POST(req: Request) {
  try {
    // Verify authentication
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const token = authHeader.split(" ")[1];
    const decoded = await verifyFirebaseToken(token);
    
    if (!decoded) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    // Get videoId from request body
    const { videoId } = await req.json();
    
    if (!videoId) {
      return NextResponse.json({ error: "Video ID is required" }, { status: 400 });
    }

    // Check if video exists
    const videoRef = adminDb.collection("videos").doc(videoId);
    const videoDoc = await videoRef.get();

    if (!videoDoc.exists) {
      return NextResponse.json({ error: "Video not found" }, { status: 404 });
    }

    const videoData = videoDoc.data();
    
    // Initialize or increment reportCount
    const currentReportCount = videoData?.reportCount || 0;
    
    await videoRef.update({
      reportCount: currentReportCount + 1,
      lastReportedAt: FieldValue.serverTimestamp(),
    });

    // Optional: Create a separate reports collection for tracking
    await adminDb.collection("reports").add({
      videoId,
      reportedBy: decoded.uid,
      reportedAt: FieldValue.serverTimestamp(),
      videoOwnerId: videoData?.ownerId,
      videoTitle: videoData?.title,
    });

    return NextResponse.json({ 
      success: true, 
      reportCount: currentReportCount + 1 
    });
    
  } catch (error) {
    console.error("Error reporting video:", error);
    return NextResponse.json(
      { error: "Internal server error" }, 
      { status: 500 }
    );
  }
}