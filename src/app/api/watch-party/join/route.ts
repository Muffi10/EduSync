// src/app/api/watch-party/join/route.ts
import { NextRequest, NextResponse } from "next/server";
import { verifyFirebaseToken, adminDb } from "@/lib/auth";

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

    const { partyId } = await req.json();

    if (!partyId) {
      return NextResponse.json({ error: "partyId is required" }, { status: 400 });
    }

    // Verify party exists
    const partyDoc = await adminDb.collection("watchParties").doc(partyId).get();
    
    if (!partyDoc.exists) {
      return NextResponse.json({ error: "Watch party not found" }, { status: 404 });
    }

    const partyData = partyDoc.data();

    // Check if party has ended
    if (partyData?.status === "ended") {
      return NextResponse.json({ error: "This watch party has ended" }, { status: 410 });
    }

    // Fetch user data
    const userDoc = await adminDb.collection("users").doc(decoded.uid).get();
    const userData = userDoc.exists ? userDoc.data() : {};

    // Add user as participant
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
      message: "Joined watch party successfully",
    });

  } catch (error) {
    console.error("Error joining watch party:", error);
    return NextResponse.json(
      { error: "Failed to join watch party" },
      { status: 500 }
    );
  }
}