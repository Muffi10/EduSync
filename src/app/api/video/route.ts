// api/video/route.ts
import { NextRequest, NextResponse } from "next/server";
import { verifyFirebaseToken } from "@/lib/auth";
import { db } from "@/lib/firebase";
import {
  collection,
  addDoc,
  getDocs,
  query,
  orderBy,
  doc,
  updateDoc,
  serverTimestamp,
  getDoc,
  arrayUnion,
  arrayRemove,
  limit,
  startAfter,
  where,
} from "firebase/firestore";

// ----------------- POST: Upload New Video --------------------
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const idToken = authHeader.split(" ")[1];
    const decoded = await verifyFirebaseToken(idToken);
    if (!decoded) {
      return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
    }

    const {
      title,
      description = "",
      videoUrl,
      thumbnailUrl = "",
      tags = [],
      visibility = "public",
    } = await req.json();

    if (!title || !videoUrl) {
      return NextResponse.json({ error: "`title` and `videoUrl` are required" }, { status: 400 });
    }

    const docRef = await addDoc(collection(db, "videos"), {
      ownerId: decoded.uid,
      title,
      description,
      videoUrl,
      thumbnailUrl,
      tags,
      visibility,
      likes: [],
      views: 0,
      commentsCount: 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    return NextResponse.json({ videoId: docRef.id }, { status: 201 });
  } catch (err) {
    console.error("POST /api/video error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ----------------- GET: Fetch Videos with Pagination --------------------
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const limitParam = parseInt(searchParams.get("limit") || "12");
    const lastDocId = searchParams.get("lastDoc");
    const visibility = searchParams.get("visibility") || "public";
    
    // Validate limit
    const validLimit = Math.min(Math.max(limitParam, 1), 50); // Between 1-50

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
        // Continue without personalization if token verification fails
        console.warn("Could not verify token for personalization:", error);
      }
    }

    // Step 1: Get user's watch history and analyze tags (if authenticated)
    const watchedVideoIds = new Set<string>();
    const tagFrequency = new Map<string, number>();
    let hasHistory = false;

    if (userId) {
      console.log(`\n🔍 Fetching recommendations for user: ${userId}`);
      
      // Debug: Check if user has any videos in their collection
      try {
        const userVideosQuery = query(
          collection(db, "videos"),
          where("ownerId", "==", userId),
          limit(5)
        );
        const userVideosSnap = await getDocs(userVideosQuery);
        console.log(`   User has ${userVideosSnap.size} uploaded videos`);
      } catch (e) {
        console.log(`   Could not check user videos`);
      }
      
      try {
        const historySnapshot = await getDocs(
          query(
            collection(db, `users/${userId}/history`),
            orderBy("watchedAt", "desc"),
            limit(30)
          )
        );

        console.log(`   Found ${historySnapshot.docs.length} history items`);

        if (!historySnapshot.empty) {
          hasHistory = true;
          
          for (const historyDoc of historySnapshot.docs) {
            const historyData = historyDoc.data();
            const videoId = historyData.videoId;
            watchedVideoIds.add(videoId);

            console.log(`     Analyzing history item: ${videoId}`);

            // Get video details to extract tags
            const videoDoc = await getDoc(doc(db, "videos", videoId));

            if (videoDoc.exists()) {
              const videoData = videoDoc.data();
              const tags = videoData?.tags || [];

              console.log(`       Video "${videoData?.title}" has tags:`, tags);

              // Count tag frequency (weighted by recency)
              const position = historySnapshot.docs.findIndex(d => d.id === historyDoc.id);
              const recencyWeight = 1.0 / (position + 1); // position is 0-indexed, so first video = 1.0, second = 0.5, etc.

              tags.forEach((tag: string) => {
                const normalizedTag = tag.toLowerCase();
                const currentCount = tagFrequency.get(normalizedTag) || 0;
                tagFrequency.set(normalizedTag, currentCount + recencyWeight);
                console.log(`         Added tag "${normalizedTag}" with weight ${recencyWeight.toFixed(2)}, total: ${(currentCount + recencyWeight).toFixed(2)}`);
              });
            } else {
              console.log(`       ⚠️  Video ${videoId} not found in database`);
              
              // Debug: List all videos to see what IDs exist
              const allVideosQuery = query(collection(db, "videos"), limit(5));
              const allVideosSnap = await getDocs(allVideosQuery);
              console.log(`       📋 Sample video IDs in database:`, allVideosSnap.docs.map(d => d.id).join(', '));
            }
          }

          // Console log user's preferred tags
          const topTags = Array.from(tagFrequency.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10)
            .map(([tag, score]) => ({ tag, score: score.toFixed(2) }));

          console.log(`\n🎯 User ${userId} Preferences:`);
          console.log(`   Watched: ${watchedVideoIds.size} videos`);
          console.log(`   Top Tags:`, topTags);
          console.log(`   All Tags:`, Array.from(tagFrequency.entries()).map(([tag, score]) => `${tag}(${score.toFixed(2)})`).join(', '));
        } else {
          console.log(`   ℹ️  User has history but no valid videos found`);
        }
      } catch (error) {
        console.error("❌ Error fetching user history:", error);
      }
    } else {
      console.log(`\n👤 Anonymous user - using default sorting`);
    }

    // Step 2: Fetch candidate videos
    let candidateVideos: any[] = [];

    if (lastDocId) {
      // Pagination: fetch next batch
      try {
        const lastDocRef = doc(db, "videos", lastDocId);
        const lastDocSnap = await getDoc(lastDocRef);
        
        if (lastDocSnap.exists()) {
          const q = query(
            collection(db, "videos"),
            where("visibility", "==", visibility),
            orderBy("createdAt", "desc"),
            startAfter(lastDocSnap),
            limit(validLimit * 2) // Fetch more to filter watched ones
          );
          
          const snapshot = await getDocs(q);
          candidateVideos = snapshot.docs.map((d) => ({
            id: d.id,
            ...d.data(),
            createdAt: d.data().createdAt?.toDate?.()?.getTime() || Date.now(),
            updatedAt: d.data().updatedAt?.toDate?.()?.getTime() || Date.now(),
          }));
        }
      } catch (error) {
        console.warn("Error with cursor:", error);
      }
    } else {
      // Initial load: fetch more candidates for scoring
      const q = query(
        collection(db, "videos"),
        where("visibility", "==", visibility),
        orderBy("createdAt", "desc"),
        limit(hasHistory ? validLimit * 3 : validLimit) // Fetch more if we have history
      );

      const snapshot = await getDocs(q);
      candidateVideos = snapshot.docs.map((d) => ({
        id: d.id,
        ...d.data(),
        createdAt: d.data().createdAt?.toDate?.()?.getTime() || Date.now(),
        updatedAt: d.data().updatedAt?.toDate?.()?.getTime() || Date.now(),
      }));
    }

    // Step 3: Score videos (don't filter watched ones for now - can be added later)
    let scoredVideos = candidateVideos
      // .filter(video => !watchedVideoIds.has(video.id)) // Commented out for testing
      .map((video) => {
        let score = 0;

        if (hasHistory && tagFrequency.size > 0) {
          // Tag matching score (primary factor)
          const tags = video.tags || [];
          tags.forEach((tag: string) => {
            const normalizedTag = tag.toLowerCase();
            const tagScore = tagFrequency.get(normalizedTag) || 0;
            score += tagScore * 100; // Boost tag matching significantly
          });

          // Engagement score (secondary factor)
          const engagementScore = 
            (video.views || 0) * 0.1 + 
            (video.likes?.length || 0) * 2 + 
            (video.commentsCount || 0) * 1.5;
          score += engagementScore * 0.1;

          // Recency boost (videos from last 7 days)
          const daysSinceCreation = (Date.now() - video.createdAt) / (1000 * 60 * 60 * 24);
          if (daysSinceCreation <= 7) {
            score += (7 - daysSinceCreation) * 2;
          }
        } else {
          // No history: use engagement-based scoring
          score = 
            (video.views || 0) * 0.5 + 
            (video.likes?.length || 0) * 10 + 
            (video.commentsCount || 0) * 5;
        }

        return { ...video, _score: score };
      });

    // Step 4: Sort by score (personalized) or by creation date (default)
    if (hasHistory && tagFrequency.size > 0) {
      scoredVideos.sort((a, b) => (b._score || 0) - (a._score || 0));
      console.log(`   📊 Sorted ${scoredVideos.length} videos by recommendation score`);
      console.log(`   Top 3 scores:`, scoredVideos.slice(0, 3).map(v => ({
        title: v.title?.substring(0, 30),
        score: v._score?.toFixed(2),
        tags: v.tags
      })));
    } else {
      // Fall back to chronological order
      scoredVideos.sort((a, b) => b.createdAt - a.createdAt);
      console.log(`   📅 Sorted ${scoredVideos.length} videos chronologically (no personalization)`);
    }

    // Step 5: Take only the required limit and remove score
    const videos = scoredVideos
      .slice(0, validLimit)
      .map(({ _score, ...video }) => video);

    // Get the last document ID for pagination
    const lastDoc = videos.length > 0 
      ? videos[videos.length - 1].id 
      : null;

    // Set cache headers
    const response = NextResponse.json({ 
      videos, 
      lastDoc,
      hasMore: videos.length === validLimit
    });

    response.headers.set('Cache-Control', 'public, max-age=30, stale-while-revalidate=15');
    
    return response;

  } catch (error) {
    console.error("Error fetching videos:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
// ----------------- PATCH: Update Video --------------------
export async function PATCH(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const idToken = authHeader.split(" ")[1];
    const decoded = await verifyFirebaseToken(idToken);
    if (!decoded) {
      return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
    }

    const { videoId, title, description, tags, visibility, thumbnailUrl } = await req.json();

    if (!videoId) {
      return NextResponse.json({ error: "`videoId` is required" }, { status: 400 });
    }

    const ref = doc(db, "videos", videoId);
    const snapshot = await getDoc(ref);

    if (!snapshot.exists()) {
      return NextResponse.json({ error: "Video not found" }, { status: 404 });
    }

    if (snapshot.data().ownerId !== decoded.uid) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const updateData: any = { updatedAt: serverTimestamp() };
    
    if (title !== undefined) updateData.title = title;
    if (description !== undefined) updateData.description = description;
    if (tags !== undefined) updateData.tags = tags;
    if (visibility !== undefined) updateData.visibility = visibility;
    if (thumbnailUrl !== undefined) updateData.thumbnailUrl = thumbnailUrl;

    await updateDoc(ref, updateData);

    return NextResponse.json({ message: "Video updated successfully" });
  } catch (err) {
    console.error("PATCH /api/video error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ----------------- PUT: Like / Unlike a video --------------------
export async function PUT(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const idToken = authHeader.split(" ")[1];
    const decoded = await verifyFirebaseToken(idToken);
    if (!decoded) {
      return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
    }

    const { videoId, like } = await req.json();

    if (!videoId || typeof like !== "boolean") {
      return NextResponse.json({ error: "`videoId` and `like` are required" }, { status: 400 });
    }

    const ref = doc(db, "videos", videoId);
    const videoSnap = await getDoc(ref);

    if (!videoSnap.exists()) {
      return NextResponse.json({ error: "Video not found" }, { status: 404 });
    }

    await updateDoc(ref, {
      likes: like ? arrayUnion(decoded.uid) : arrayRemove(decoded.uid),
    });

    // Optional notification (only for likes, not unlikes)
    const ownerId = videoSnap.data().ownerId;
    if (like && ownerId && ownerId !== decoded.uid) {
      try {
        await addDoc(collection(db, `users/${ownerId}/notifications`), {
          type: "like",
          fromUserId: decoded.uid,
          videoId,
          message: `${decoded.name || "Someone"} liked your video.`,
          read: false,
          createdAt: serverTimestamp(),
        });
      } catch (notificationError) {
        // Don't fail the like action if notification fails
        console.warn("Failed to create notification:", notificationError);
      }
    }

    return NextResponse.json({ message: like ? "Liked" : "Unliked" });
  } catch (err) {
    console.error("PUT /api/video error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}