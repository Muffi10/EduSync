// src/app/api/trending/route.ts
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebase";
import {
  collection,
  getDocs,
  query,
  where,
  orderBy,
  limit as firestoreLimit,
  getDoc,
  doc,
} from "firebase/firestore";

interface Video {
  id: string;
  title: string;
  description: string;
  thumbnailUrl: string;
  videoUrl: string;
  ownerId: string;
  tags: string[];
  views: number;
  likes: string[];
  commentsCount: number;
  createdAt: number;
  trendingScore?: number;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const limitParam = parseInt(searchParams.get("limit") || "20");
    const timeframe = searchParams.get("timeframe") || "week"; // day, week, month, all
    
    const validLimit = Math.min(Math.max(limitParam, 1), 50);

    console.log(`\n🔥 Fetching trending videos (timeframe: ${timeframe}, limit: ${validLimit})`);

    // Calculate cutoff time based on timeframe
    const now = Date.now();
    let cutoffTime = 0;
    
    switch (timeframe) {
      case "day":
        cutoffTime = now - (24 * 60 * 60 * 1000);
        break;
      case "week":
        cutoffTime = now - (7 * 24 * 60 * 60 * 1000);
        break;
      case "month":
        cutoffTime = now - (30 * 24 * 60 * 60 * 1000);
        break;
      default:
        cutoffTime = 0; // All time
    }

    // Fetch all public videos
    const videosQuery = query(
      collection(db, "videos"),
      where("visibility", "==", "public"),
      firestoreLimit(100) // Fetch more to score them
    );

    const videosSnapshot = await getDocs(videosQuery);

    if (videosSnapshot.empty) {
      return NextResponse.json({
        success: true,
        trending: [],
        message: "No videos found",
      });
    }

    // Fetch owner data for all videos
    const ownerIds = new Set<string>();
    videosSnapshot.docs.forEach((doc) => {
      ownerIds.add(doc.data().ownerId);
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

    // Process and score videos
    const scoredVideos: Video[] = [];

    videosSnapshot.docs.forEach((videoDoc) => {
      const data = videoDoc.data();
      
      // Convert timestamp
      let createdAtMs = data.createdAt?.toDate?.()?.getTime() || Date.now();
      
      // Skip videos outside timeframe
      if (timeframe !== "all" && createdAtMs < cutoffTime) {
        return;
      }

      // Calculate video age in days
      const ageInDays = (now - createdAtMs) / (1000 * 60 * 60 * 24);
      
      // Calculate trending score
      const views = data.views || 0;
      const likes = data.likes?.length || 0;
      const comments = data.commentsCount || 0;
      
      // Trending Score Formula:
      // Score = (Views * 1) + (Likes * 5) + (Comments * 10) / (age + 2)^1.5
      // The denominator gives newer videos a boost
      const engagementScore = (views * 1) + (likes * 5) + (comments * 10);
      const timeDecay = Math.pow(ageInDays + 2, 1.5);
      const trendingScore = engagementScore / timeDecay;

      scoredVideos.push({
        id: videoDoc.id,
        title: data.title,
        description: data.description,
        thumbnailUrl: data.thumbnailUrl,
        videoUrl: data.videoUrl,
        ownerId: data.ownerId,
        tags: data.tags || [],
        views,
        likes: data.likes || [],
        commentsCount: comments,
        createdAt: createdAtMs,
        trendingScore,
        owner: ownersMap.get(data.ownerId),
      });
    });

    // Sort by trending score (descending)
    scoredVideos.sort((a, b) => (b.trendingScore || 0) - (a.trendingScore || 0));

    // Log top 5 trending scores
    console.log(`   📊 Top 5 Trending Scores:`);
    scoredVideos.slice(0, 5).forEach((video, index) => {
      const ageInDays = ((now - video.createdAt) / (1000 * 60 * 60 * 24)).toFixed(1);
      console.log(`      ${index + 1}. "${video.title.substring(0, 40)}" - Score: ${video.trendingScore?.toFixed(2)} (${video.views}v, ${video.likes.length}l, ${video.commentsCount}c, ${ageInDays}d old)`);
    });

    // Take top N videos
    const trendingVideos = scoredVideos
      .slice(0, validLimit)
      .map(({ trendingScore, ...video }) => video); // Remove score from response

    return NextResponse.json({
      success: true,
      trending: trendingVideos,
      count: trendingVideos.length,
      timeframe,
    });

  } catch (error) {
    console.error("❌ Error fetching trending videos:", error);
    return NextResponse.json(
      { error: "Failed to fetch trending videos" },
      { status: 500 }
    );
  }
}