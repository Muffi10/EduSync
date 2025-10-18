// src/app/api/watch-party/heartbeat/route.ts
import { NextRequest, NextResponse } from "next/server";
import { verifyFirebaseToken, adminDb } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
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

    // Update participant's lastSeen
    await adminDb
      .collection("watchParties")
      .doc(partyId)
      .collection("participants")
      .doc(decoded.uid)
      .update({
        lastSeen: Date.now(),
        isActive: true,
      });

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error("Error updating heartbeat:", error);
    return NextResponse.json(
      { error: "Failed to update heartbeat" },
      { status: 500 }
    );
  }
}