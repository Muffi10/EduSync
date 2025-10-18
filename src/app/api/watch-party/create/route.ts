// src/app/api/watch-party/create/route.ts
import { NextRequest, NextResponse } from "next/server";
import { verifyFirebaseToken, adminDb } from "@/lib/auth";
import * as admin from "firebase-admin";

export async function POST(req: NextRequest) {
  try {
    // Verify authentication
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const idToken = authHeader.split(" ")[1];
    const decoded = await verifyFirebaseToken(idToken);
    
    if (!decoded) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    const { videoId, title } = await req.json();

    if (!videoId) {
      return NextResponse.json({ error: "videoId is required" }, { status: 400 });
    }

    // Fetch video details
    const videoDoc = await adminDb.collection("videos").doc(videoId).get();
    
    if (!videoDoc.exists) {
      return NextResponse.json({ error: "Video not found" }, { status: 404 });
    }

    const videoData = videoDoc.data();

    // Fetch user data for host name
    const userDoc = await adminDb.collection("users").doc(decoded.uid).get();
    const userData = userDoc.exists ? userDoc.data() : {};

    // Generate unique party ID
    const partyId = adminDb.collection("watchParties").doc().id;

    // Create watch party document in Firestore
    const partyData = {
      partyId,
      videoId,
      videoTitle: videoData?.title || "Untitled Video",
      videoThumbnail: videoData?.thumbnailUrl || "/images/default-thumbnail.png",
      hostId: decoded.uid,
      hostName: userData?.displayName || userData?.username || "Unknown",
      title: title || `${userData?.displayName || "Someone"}'s Watch Party`,
      participants: [decoded.uid],
      status: "active",
      createdAt: Date.now(),
      startedAt: Date.now(),
      maxParticipants: 20,
    };

    await adminDb.collection("watchParties").doc(partyId).set(partyData);

    // Initialize video sync state in Realtime Database using Admin SDK
    const rtdb = admin.database();
    await rtdb.ref(`watchParties/${partyId}/playback`).set({
      action: "pause",
      currentTime: 0,
      timestamp: Date.now(),
      hostId: decoded.uid,
      speed: 1.0,
    });

    // Add host as participant
    await adminDb
      .collection("watchParties")
      .doc(partyId)
      .collection("participants")
      .doc(decoded.uid)
      .set({
        userId: decoded.uid,
        userName: userData?.displayName || userData?.username || "Unknown",
        userPhoto: userData?.photoURL || "/images/default-avatar.png",
        joinedAt: Date.now(),
        lastSeen: Date.now(),
        isActive: true,
      });

    return NextResponse.json({
      success: true,
      partyId,
      message: "Watch party created successfully",
    });

  } catch (error) {
    console.error("Error creating watch party:", error);
    return NextResponse.json(
      { error: "Failed to create watch party" },
      { status: 500 }
    );
  }
}