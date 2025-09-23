// src/app/api/users/[userId]/videos/route.ts
import { db } from "@/lib/firebase";
import { collection, getDocs, query, where, orderBy, limit } from "firebase/firestore";
import { NextResponse } from "next/server";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  const { userId } = await params;

  try {
    const videosRef = collection(db, "videos");
    const q = query(
      videosRef,
      where("ownerId", "==", userId),
      orderBy("createdAt", "desc"),
      limit(10) // ✅ smaller batch (first 10)
    );

    const snap = await getDocs(q);

    const videos = snap.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        createdAt: data.createdAt?.toDate?.().toISOString?.() || null,
      };
    });

    return NextResponse.json(videos, { status: 200 });
  } catch (error) {
    console.error("Error fetching user videos:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
