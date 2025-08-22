//src/app/api/users/[userId]/videos/route.ts
import { db } from "@/lib/firebase";
import { collection, getDocs, query, where, orderBy } from "firebase/firestore";
import { NextResponse } from "next/server";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  const { userId } = await params;

  try {
    const videosRef = collection(db, "videos");
    const q = query(videosRef, where("ownerId", "==", userId), orderBy("createdAt", "desc"));
    const snap = await getDocs(q);

    const videos = snap.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));

    return NextResponse.json(videos);
  } catch (error) {
    console.error("Error fetching user videos:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}