// src/app/api/users/[userId]/route.ts
import { db } from "@/lib/firebase";
import { doc, getDoc, collection, getDocs, updateDoc, setDoc } from "firebase/firestore";
import { NextResponse } from "next/server";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  const { userId } = await params;

  try {
    // Fetch main profile
    const userSnap = await getDoc(doc(db, "users", userId));
    if (!userSnap.exists()) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const userData = userSnap.data();

    // Followers & following subcollections
    const followersSnap = await getDocs(collection(db, "users", userId, "followers"));
    const followingSnap = await getDocs(collection(db, "users", userId, "following"));

    return NextResponse.json({
      id: userId,
      ...userData,
      followersCount: followersSnap.size,
      followingCount: followingSnap.size,
    });
  } catch (error) {
    console.error("Error fetching user profile:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// PATCH → partial update (update only provided fields)
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  const { userId } = await params;

  try {
    const body = await req.json();
    // TODO: auth check (ensure requester === userId)

    await updateDoc(doc(db, "users", userId), {
      ...body,
      updatedAt: Date.now(),
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error updating profile:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// PUT → full update/replace (or upsert)
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  const { userId } = await params;

  try {
    const body = await req.json();
    // TODO: auth check (ensure requester === userId)

    await setDoc(
      doc(db, "users", userId),
      {
        ...body,
        updatedAt: Date.now(),
      },
      { merge: true } // ensures we don't wipe the doc completely
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error replacing profile:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}