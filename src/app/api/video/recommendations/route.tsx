// src/app/api/video/recommendations/route.ts
import { NextRequest, NextResponse } from "next/server";
import { verifyFirebaseToken } from "@/lib/auth";
import { db } from "@/lib/firebase";
import {
  collection,
  getDocs,
  query,
  orderBy,
  limit,
  where,
  getDoc,
  doc,
} from "firebase/firestore";

export async function POST(req: NextRequest) {
  try {
    const { currentVideoId, limit: requestLimit = 12 } = await req.json();

    if (!currentVideoId) {
      return NextResponse.json(
        { error: "currentVideoId is required" },
        { status: 400 }
      );
    }

    // Try to get user for personalized recommendations
    const authHeader = req.headers.get("authorization");
    let userId: string | null = null;

    if (authHeader?.startsWith("Bearer ")) {
      try {
        const idToken = authHeader.split(" ")[1];
        const decoded = await verifyFirebaseToken(idToken);
        if (decoded) {
          userId = decoded.uid;
        }
      } catch (error) {
        console.warn("Could not verify token for recommendations:", error);
      }
    }

    // Step 1: Get current video data to extract tags
    const currentVideoDoc = await getDoc(doc(db, "videos", currentVideoId));
    let currentVideoTags: string[] = [];

    if (currentVideoDoc.exists()) {
      currentVideoTags = currentVideoDoc.data()?.tags || [];
    }

    console.log(
      `\n🎬 Getting recommendations for video: ${currentVideoId} (tags: ${currentVideoTags.join(", ")})`
    );

    // Step 2: Get user's watch history and analyze tags (if authenticated)
    const watchedVideoIds = new Set<string>();
    const tagFrequency = new Map<string, number>();
    watchedVideoIds.add(currentVideoId); // Exclude current video
    let hasHistory = false;

    if (userId) {
      try {
        const historySnapshot = await getDocs(
          query(
            collection(db, `users/${userId}/history`),
            orderBy("watchedAt", "desc"),
            limit(20)
          )
        );

        if (!historySnapshot.empty) {
          hasHistory = true;

          for (const historyDoc of historySnapshot.docs) {
            const historyData = historyDoc.data();
            const videoId = historyData.videoId;
            watchedVideoIds.add(videoId);

            // Get video details to extract tags
            const videoDoc = await getDoc(doc(db, "videos", videoId));

            if (videoDoc.exists()) {
              const videoData = videoDoc.data();
              const tags = videoData?.tags || [];

              // Count tag frequency (weighted by recency)
              const position = historySnapshot.docs.findIndex(
                (d) => d.id === historyDoc.id
              );
              const recencyWeight = 1.0 / (position + 1);

              tags.forEach((tag: string) => {
                const normalizedTag = tag.toLowerCase();
                const currentCount = tagFrequency.get(normalizedTag) || 0;
                tagFrequency.set(normalizedTag, currentCount + recencyWeight);
              });
            }
          }
        }
      } catch (error) {
        console.error("Error fetching user history:", error);
      }
    }

    // Step 3: Boost current video tags in frequency map
    currentVideoTags.forEach((tag: string) => {
      const normalizedTag = tag.toLowerCase();
      const currentCount = tagFrequency.get(normalizedTag) || 0;
      tagFrequency.set(normalizedTag, currentCount + 3); // Boost by 3 to prioritize similar videos
    });

    console.log(
      `   User preferences: ${Array.from(tagFrequency.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([tag, score]) => `${tag}(${score.toFixed(2)})`)
        .join(", ")}`
    );

    // Step 4: Fetch candidate videos
    const candidateVideos: any[] = [];
    const videosQuery = query(
      collection(db, "videos"),
      where("visibility", "==", "public"),
      orderBy("createdAt", "desc"),
      limit(50) // Fetch more candidates for better scoring
    );

    const videosSnapshot = await getDocs(videosQuery);

    // Step 5: Fetch owner data for all videos
    const ownerIds = new Set<string>();
    videosSnapshot.docs.forEach((doc) => {
      const data = doc.data();
      ownerIds.add(data.ownerId);
    });

    const ownersMap = new Map();
    await Promise.all(
      Array.from(ownerIds).map(async (ownerId) => {
        try {
          const ownerDoc = await getDoc(doc(db, "users", ownerId));
          if (ownerDoc.exists()) {
            const ownerData = ownerDoc.data();
            ownersMap.set(ownerId, {
              displayName: ownerData.displayName || "Unknown Creator",
              photoURL: ownerData.photoURL || "/images/default-avatar.png",
              username: ownerData.username || "unknown",
            });
          }
        } catch (error) {
          console.error(`Error fetching owner ${ownerId}:`, error);
        }
      })
    );

    videosSnapshot.docs.forEach((d) => {
      const data = d.data();

      // Skip current video
      if (d.id === currentVideoId) return;

      candidateVideos.push({
        id: d.id,
        title: data.title,
        description: data.description,
        thumbnailUrl: data.thumbnailUrl,
        videoUrl: data.videoUrl,
        ownerId: data.ownerId,
        tags: data.tags || [],
        views: data.views || 0,
        likes: data.likes || [],
        commentsCount: data.commentsCount || 0,
        createdAt: data.createdAt?.toDate?.()?.getTime() || Date.now(),
        owner: ownersMap.get(data.ownerId),
      });
    });

    // Step 6: Score videos
    const scoredVideos = candidateVideos.map((video) => {
      let score = 0;

      // Tag matching score (primary factor)
      const tags = video.tags || [];
      tags.forEach((tag: string) => {
        const normalizedTag = tag.toLowerCase();
        const tagScore = tagFrequency.get(normalizedTag) || 0;
        score += tagScore * 100;
      });

      // Engagement score (secondary factor)
      const engagementScore =
        video.views * 0.1 + video.likes.length * 2 + video.commentsCount * 1.5;
      score += engagementScore * 0.1;

      // Recency boost (videos from last 7 days)
      const daysSinceCreation =
        (Date.now() - video.createdAt) / (1000 * 60 * 60 * 24);
      if (daysSinceCreation <= 7) {
        score += (7 - daysSinceCreation) * 2;
      }

      return { ...video, _score: score };
    });

    // Step 7: Sort by score and limit results
    scoredVideos.sort((a, b) => (b._score || 0) - (a._score || 0));

    console.log(
      `   Top 3 recommended:`,
      scoredVideos.slice(0, 3).map((v) => ({
        title: v.title.substring(0, 30),
        score: v._score?.toFixed(2),
        tags: v.tags,
      }))
    );

    const recommendations = scoredVideos
      .slice(0, requestLimit)
      .map(({ _score, ...video }) => video);

    return NextResponse.json({
      success: true,
      recommendations,
    });
  } catch (error) {
    console.error("Error generating recommendations:", error);
    return NextResponse.json(
      { error: "Failed to generate recommendations" },
      { status: 500 }
    );
  }
}