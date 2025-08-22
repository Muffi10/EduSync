// src/app/api/video/[videoId]/route.ts
import { db } from "@/lib/firebase";
import { doc, getDoc, updateDoc, deleteDoc } from "firebase/firestore";
import { NextResponse } from "next/server";
import { ref, deleteObject } from "firebase/storage";
import { storage } from "@/lib/firebase";

import { verifyFirebaseToken, adminDb, adminStorage } from "@/lib/auth";

// ✅ Fixed function to extract storage path from Firebase URL
function getPathFromUrl(url: string): string {
  try {
    console.log("Original URL:", url);
    
    // Handle different Firebase Storage URL formats
    let match;
    
    // Format 1: https://firebasestorage.googleapis.com/v0/b/bucket/o/path%2Ffile.ext?alt=media&token=...
    // Format 1b: https://firebasestorage.googleapis.com/v0/b/bucket.firebasestorage.app/o/path%2Ffile.ext?alt=media&token=...
    match = url.match(/\/o\/(.*?)\?/);
    if (match) {
      const encodedPath = match[1];
      console.log("Encoded path found:", encodedPath);
      // Decode the path (handles %2F -> /)
      const decodedPath = decodeURIComponent(encodedPath);
      console.log("Decoded path:", decodedPath);
      return decodedPath;
    }
    
    // Format 2: gs://bucket/path/file.ext
    match = url.match(/^gs:\/\/[^\/]+\/(.*)/);
    if (match) {
      console.log("GS format path:", match[1]);
      return match[1];
    }
    
    // Format 3: https://bucket.storage.googleapis.com/path/file.ext
    match = url.match(/https:\/\/[^.]+\.storage\.googleapis\.com\/(.*)/);
    if (match) {
      console.log("Storage googleapis format path:", match[1]);
      return match[1];
    }
    
    console.warn("Could not extract path from URL:", url);
    return "";
  } catch (error) {
    console.error("Error parsing storage URL:", error);
    return "";
  }
}

export async function GET(req: Request, context: { params: Promise<{ videoId: string }> }) {
  const { videoId } = await context.params;

  const snap = await getDoc(doc(db, "videos", videoId));

  if (!snap.exists()) {
    return NextResponse.json({ error: "Video not found" }, { status: 404 });
  }

  return NextResponse.json({ video: snap.data() }, { status: 200 });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ videoId: string }> }
) {
  const { videoId } = await params;

  try {
    // ✅ Verify auth
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const token = authHeader.split(" ")[1];
    const decoded = await verifyFirebaseToken(token);
    if (!decoded) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    // ✅ Check if video exists and verify owner
    const snap = await adminDb.collection("videos").doc(videoId).get();
    if (!snap.exists) {
      return NextResponse.json({ error: "Video not found" }, { status: 404 });
    }

    const video = snap.data();
    if (video?.ownerId !== decoded.uid) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // ✅ Update the video
    const body = await req.json();
    await adminDb.collection("videos").doc(videoId).update(body);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error updating video:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ videoId: string }> }
) {
  const { videoId } = await params;

  try {
    // ✅ Verify auth
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const token = authHeader.split(" ")[1];
    const decoded = await verifyFirebaseToken(token);
    if (!decoded) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    // ✅ Fetch video doc
    const snap = await adminDb.collection("videos").doc(videoId).get();
    if (!snap.exists) {
      return NextResponse.json({ error: "Video not found" }, { status: 404 });
    }

    const video = snap.data();

    // ✅ Check owner permission
    if (video?.ownerId !== decoded.uid) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // ✅ Delete from Storage - Enhanced with better debugging
    const storageDeletePromises = [];

    if (video?.videoUrl) {
      const videoPath = getPathFromUrl(video.videoUrl);
      console.log("Video URL:", video.videoUrl);
      console.log("Extracted video path:", videoPath);
      
      if (videoPath) {
        storageDeletePromises.push(
          (async () => {
            try {
              // Try Admin SDK first
              console.log("Attempting to delete video with Admin SDK...");
              await adminStorage.file(videoPath).delete();
              console.log("✅ Video deleted successfully with Admin SDK");
            } catch (adminError) {
              console.error("❌ Admin SDK deletion failed:", adminError);
              
              // Try with client SDK as fallback
              try {
                console.log("Attempting to delete video with Client SDK...");
                const videoRef = ref(storage, videoPath);
                await deleteObject(videoRef);
                console.log("✅ Video deleted successfully with Client SDK");
              } catch (clientError) {
                console.error("❌ Client SDK deletion also failed:", clientError);
                
                // Try different path variations
                console.log("Trying different path variations...");
                const pathVariations = [
                  videoPath,
                  `/${videoPath}`,
                  videoPath.replace(/^\//, ''), // Remove leading slash if exists
                ];
                
                for (const variation of pathVariations) {
                  try {
                    console.log(`Trying path variation: "${variation}"`);
                    await adminStorage.file(variation).delete();
                    console.log("✅ Video deleted with path variation:", variation);
                    break;
                  } catch (variationError) {
                    console.error(`❌ Failed with variation "${variation}":`, variationError);
                  }
                }
              }
            }
          })()
        );
      } else {
        console.error("❌ Could not extract video path from URL");
      }
    }

    if (video?.thumbnailUrl) {
      const thumbnailPath = getPathFromUrl(video.thumbnailUrl);
      console.log("Thumbnail URL:", video.thumbnailUrl);
      console.log("Extracted thumbnail path:", thumbnailPath);
      
      if (thumbnailPath) {
        storageDeletePromises.push(
          (async () => {
            try {
              console.log("Attempting to delete thumbnail with Admin SDK...");
              await adminStorage.file(thumbnailPath).delete();
              console.log("✅ Thumbnail deleted successfully with Admin SDK");
            } catch (adminError) {
              console.error("❌ Admin SDK thumbnail deletion failed:", adminError);
              
              try {
                console.log("Attempting to delete thumbnail with Client SDK...");
                const thumbnailRef = ref(storage, thumbnailPath);
                await deleteObject(thumbnailRef);
                console.log("✅ Thumbnail deleted successfully with Client SDK");
              } catch (clientError) {
                console.error("❌ Client SDK thumbnail deletion also failed:", clientError);
              }
            }
          })()
        );
      } else {
        console.error("❌ Could not extract thumbnail path from URL");
      }
    }

    // Wait for storage deletions (don't fail if they don't work)
    await Promise.allSettled(storageDeletePromises);

    // ✅ Delete related comments (batch delete)
    const commentsSnap = await adminDb
      .collection("comments")
      .where("videoId", "==", videoId)
      .get();

    if (!commentsSnap.empty) {
      const batch = adminDb.batch();
      commentsSnap.forEach((doc) => batch.delete(doc.ref));
      await batch.commit();
    }

    // ✅ Delete Firestore video doc
    await adminDb.collection("videos").doc(videoId).delete();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting video:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}