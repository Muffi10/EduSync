// src/app/api/watch-party/end/route.ts
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

    const { partyId } = await req.json();

    if (!partyId) {
      return NextResponse.json({ error: "partyId is required" }, { status: 400 });
    }

    // Verify party exists and user is host
    const partyDoc = await adminDb.collection("watchParties").doc(partyId).get();
    
    if (!partyDoc.exists) {
      return NextResponse.json({ error: "Watch party not found" }, { status: 404 });
    }

    const partyData = partyDoc.data();

    if (partyData?.hostId !== decoded.uid) {
      return NextResponse.json({ error: "Only the host can end the party" }, { status: 403 });
    }

    // Update party status to ended
    await adminDb.collection("watchParties").doc(partyId).update({
      status: "ended",
      endedAt: Date.now(),
    });

    // Delete playback state from Realtime Database
    const rtdb = admin.database();
    await rtdb.ref(`watchParties/${partyId}`).remove();

    // Optional: Delete chat messages and participants (or keep for history)
    // You can choose to keep them or delete them
    const batch = adminDb.batch();
    
    // Delete participants
    const participantsSnapshot = await adminDb
      .collection("watchParties")
      .doc(partyId)
      .collection("participants")
      .get();
    
    participantsSnapshot.docs.forEach((doc) => {
      batch.delete(doc.ref);
    });

    // Delete chat messages
    const chatSnapshot = await adminDb
      .collection("watchParties")
      .doc(partyId)
      .collection("chat")
      .get();
    
    chatSnapshot.docs.forEach((doc) => {
      batch.delete(doc.ref);
    });

    await batch.commit();

    return NextResponse.json({
      success: true,
      message: "Watch party ended successfully",
    });

  } catch (error) {
    console.error("Error ending watch party:", error);
    return NextResponse.json(
      { error: "Failed to end watch party" },
      { status: 500 }
    );
  }
}