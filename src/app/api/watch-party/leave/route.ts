// src/app/api/watch-party/leave/route.ts
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

    // Remove participant
    await adminDb
      .collection("watchParties")
      .doc(partyId)
      .collection("participants")
      .doc(decoded.uid)
      .delete();

    return NextResponse.json({
      success: true,
      message: "Left watch party successfully",
    });

  } catch (error) {
    console.error("Error leaving watch party:", error);
    return NextResponse.json(
      { error: "Failed to leave watch party" },
      { status: 500 }
    );
  }
}