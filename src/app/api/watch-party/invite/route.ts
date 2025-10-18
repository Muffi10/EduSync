// src/app/api/watch-party/invite/route.ts
import { NextRequest, NextResponse } from "next/server";
import { verifyFirebaseToken, adminDb } from "@/lib/auth";
import { FieldValue } from "firebase-admin/firestore";

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

    const { partyId, inviteeIds } = await req.json();

    if (!partyId || !inviteeIds || !Array.isArray(inviteeIds)) {
      return NextResponse.json({ error: "partyId and inviteeIds array are required" }, { status: 400 });
    }

    // Verify party exists and user is host
    const partyDoc = await adminDb.collection("watchParties").doc(partyId).get();
    
    if (!partyDoc.exists) {
      return NextResponse.json({ error: "Watch party not found" }, { status: 404 });
    }

    const partyData = partyDoc.data();

    if (partyData?.hostId !== decoded.uid) {
      return NextResponse.json({ error: "Only the host can send invites" }, { status: 403 });
    }

    // Send notifications to all invitees
    const invitePromises = inviteeIds.map(async (inviteeId) => {
      // Add to party participants list using FieldValue
      await adminDb.collection("watchParties").doc(partyId).update({
        participants: FieldValue.arrayUnion(inviteeId),
      });

      // Create notification
      return adminDb
        .collection(`users/${inviteeId}/notifications`)
        .add({
          type: "watch_party_invite",
          fromUserId: decoded.uid,
          partyId,
          message: `invited you to watch party "${partyData?.title}"`,
          partyTitle: partyData?.title,
          videoTitle: partyData?.videoTitle,
          videoThumbnail: partyData?.videoThumbnail,
          partyLink: `/watch-party/${partyId}`,
          read: false,
          createdAt: Date.now(),
        });
    });

    await Promise.all(invitePromises);

    return NextResponse.json({
      success: true,
      message: `Invited ${inviteeIds.length} user(s) to watch party`,
    });

  } catch (error) {
    console.error("Error sending invites:", error);
    return NextResponse.json(
      { error: "Failed to send invites" },
      { status: 500 }
    );
  }
}