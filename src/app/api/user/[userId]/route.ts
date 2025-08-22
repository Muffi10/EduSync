// app/api/user/[userId]/route.ts
import { NextResponse } from "next/server";
import { getDoc, doc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { User } from "@/models/User";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    // Await the params Promise
    const { userId } = await params;

    if (!userId) {
      return NextResponse.json(
        { error: "User ID is required" },
        { status: 400 }
      );
    }

    const userDoc = await getDoc(doc(db, "users", userId));

    if (!userDoc.exists()) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    const userData = userDoc.data() as User;

    return NextResponse.json({
      user: {
        uid: userId,
        displayName: userData.displayName,
        username: userData.username,
        photoURL: userData.photoURL || "/default-avatar.jpg",
        bio: userData.bio || "",
      },
    });
  } catch (error) {
    console.error("Error fetching user data:", error);
    return NextResponse.json(
      { error: "Failed to fetch user data" },
      { status: 500 }
    );
  }
}