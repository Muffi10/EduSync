import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebase";
import { doc, getDoc, updateDoc, arrayUnion, arrayRemove } from "firebase/firestore";
import { verifyFirebaseToken } from "@/lib/auth";

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const userId = url.searchParams.get("userId");
    const type = url.searchParams.get("type");
    const viewer = url.searchParams.get("viewer");

    if (!userId || !type || (type !== "followers" && type !== "following")) {
      return NextResponse.json({ error: "Missing or invalid parameters" }, { status: 400 });
    }

    const userRef = doc(db, "users", userId);
    const userSnap = await getDoc(userRef);

    if (!userSnap.exists()) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const userData = userSnap.data();
    const listUids: string[] = userData[type] || [];

    const usersData = await Promise.all(
      listUids.map(async (uid) => {
        const uSnap = await getDoc(doc(db, "users", uid));
        if (!uSnap.exists()) return null;
        const uData = uSnap.data();

        let isFollowing = false;
        if (viewer) {
          const viewerSnap = await getDoc(doc(db, "users", viewer));
          if (viewerSnap.exists()) {
            const viewerData = viewerSnap.data();
            isFollowing = viewerData.following?.includes(uid) ?? false;
          }
        }

        return {
          id: uid,
          username: uData.username || uData.displayName || "Unknown",
          profilePic: uData.photoURL || "/default-avatar.png",
          isFollowing,
        };
      })
    );

    return NextResponse.json({ [type]: usersData.filter(Boolean) });
  } catch (error) {
    console.error("Error fetching follow list:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  return handleFollowAction(req, true);
}

export async function DELETE(req: NextRequest) {
  return handleFollowAction(req, false);
}

async function handleFollowAction(req: NextRequest, follow: boolean) {
  try {
    const token = req.headers.get("authorization")?.split("Bearer ")[1];
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const decodedToken = await verifyFirebaseToken(token);
    if (!decodedToken) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const currentUserId = decodedToken.uid;
    const { targetUserId } = await req.json();

    if (!targetUserId || targetUserId === currentUserId) {
      return NextResponse.json({ error: "Invalid target user" }, { status: 400 });
    }

    const currentUserRef = doc(db, "users", currentUserId);
    const targetUserRef = doc(db, "users", targetUserId);

    const targetSnap = await getDoc(targetUserRef);
    if (!targetSnap.exists()) {
      return NextResponse.json({ error: "Target user not found" }, { status: 404 });
    }

    if (follow) {
      await updateDoc(currentUserRef, { following: arrayUnion(targetUserId) });
      await updateDoc(targetUserRef, { followers: arrayUnion(currentUserId) });
    } else {
      await updateDoc(currentUserRef, { following: arrayRemove(targetUserId) });
      await updateDoc(targetUserRef, { followers: arrayRemove(currentUserId) });
    }

    return NextResponse.json({ success: true, following: follow });
  } catch (error) {
    console.error("Follow API error:", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}