// src/app/api/watch-party/chat/route.ts
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

    const { partyId, message } = await req.json();

    if (!partyId || !message) {
      return NextResponse.json({ error: "partyId and message are required" }, { status: 400 });
    }

    // Verify party exists
    const partyDoc = await adminDb.collection("watchParties").doc(partyId).get();
    
    if (!partyDoc.exists) {
      return NextResponse.json({ error: "Watch party not found" }, { status: 404 });
    }

    const partyData = partyDoc.data();

    // Verify user is a participant
    if (!partyData?.participants?.includes(decoded.uid)) {
      return NextResponse.json({ error: "You are not a participant in this party" }, { status: 403 });
    }

    // Fetch user data
    const userDoc = await adminDb.collection("users").doc(decoded.uid).get();
    const userData = userDoc.exists ? userDoc.data() : {};

    // Add message to chat
    await adminDb
      .collection("watchParties")
      .doc(partyId)
      .collection("chat")
      .add({
        userId: decoded.uid,
        userName: userData?.displayName || userData?.username || "Unknown",
        userPhoto: userData?.photoURL || "/images/default-avatar.png",
        message: message.trim(),
        timestamp: Date.now(),
        type: "message",
      });

    return NextResponse.json({ success: true, message: "Message sent" });

  } catch (error) {
    console.error("Error sending chat message:", error);
    return NextResponse.json(
      { error: "Failed to send message" },
      { status: 500 }
    );
  }
}