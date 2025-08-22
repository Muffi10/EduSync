// app/api/follow/status/route.ts
import { NextResponse } from "next/server";
import { verifyFirebaseToken } from "@/lib/auth";
import { db } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const userId = url.searchParams.get("userId");
    const targetUserId = url.searchParams.get("targetUserId");

    if (!userId || !targetUserId) {
      return NextResponse.json(
        { error: "Both userId and targetUserId are required" },
        { status: 400 }
      );
    }

    // Verify auth if needed
    const authHeader = req.headers.get("authorization");
    if (authHeader?.startsWith("Bearer ")) {
      const decoded = await verifyFirebaseToken(authHeader.split(" ")[1]);
      if (!decoded) {
        return NextResponse.json(
          { error: "Invalid or expired token" },
          { status: 401 }
        );
      }
    }

    const userDoc = await getDoc(doc(db, "users", userId));
    if (!userDoc.exists()) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    const userData = userDoc.data();
    const isFollowing = (userData.following || []).includes(targetUserId);

    return NextResponse.json({ isFollowing });

  } catch (error) {
    console.error("Error checking follow status:", error);
    return NextResponse.json(
      { error: "Failed to check follow status" },
      { status: 500 }
    );
  }
}