// src/app/api/notifications/route.ts
import { NextRequest, NextResponse } from "next/server";
import { verifyFirebaseToken } from "@/lib/auth";
import { db } from "@/lib/firebase";
import {
  collection,
  query,
  orderBy,
  getDocs,
  doc,
  getDoc,
  writeBatch,
  limit,
} from "firebase/firestore";

// GET: Fetch user's notifications
export async function GET(req: NextRequest) {
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

    // Fetch notifications for the user
    const notificationsRef = collection(db, `users/${decoded.uid}/notifications`);
    const q = query(notificationsRef, orderBy("createdAt", "desc"), limit(50));
    
    const snapshot = await getDocs(q);
    
    const notifications = await Promise.all(
      snapshot.docs.map(async (docSnap) => {
        const data = docSnap.data();
        
        // Fetch the user who triggered the notification
        let fromUser = null;
        if (data.fromUserId) {
          try {
            const userDocRef = doc(db, "users", data.fromUserId);
            const userDoc = await getDoc(userDocRef);
            
            if (userDoc.exists()) {
              const userData = userDoc.data();
              fromUser = {
                id: data.fromUserId,
                username: userData.username || userData.displayName || "Unknown User",
                displayName: userData.displayName || "Unknown User",
                photoURL: userData.photoURL || "/images/default-avatar.png",
              };
            }
          } catch (error) {
            console.error("Error fetching user data:", error);
          }
        }

        // Fetch video info if applicable (for likes and comments)
        let videoInfo = null;
        if (data.videoId) {
          try {
            const videoDocRef = doc(db, "videos", data.videoId);
            const videoDoc = await getDoc(videoDocRef);
            
            if (videoDoc.exists()) {
              const videoData = videoDoc.data();
              videoInfo = {
                id: data.videoId,
                title: videoData.title,
                thumbnailUrl: videoData.thumbnailUrl || "/images/default-thumbnail.png",
              };
            }
          } catch (error) {
            console.error("Error fetching video data:", error);
          }
        }

        // Fetch comment info if applicable (for comment notifications)
        let commentInfo = null;
        if (data.commentId) {
          try {
            const commentDocRef = doc(db, "comments", data.commentId);
            const commentDoc = await getDoc(commentDocRef);
            
            if (commentDoc.exists()) {
              const commentData = commentDoc.data();
              commentInfo = {
                id: data.commentId,
                text: commentData.text,
              };
            }
          } catch (error) {
            console.error("Error fetching comment data:", error);
          }
        }

        return {
          id: docSnap.id,
          type: data.type, // "like", "comment", "follow"
          message: data.message,
          read: data.read || false,
          createdAt: data.createdAt,
          fromUser,
          videoInfo,
          commentInfo,
        };
      })
    );

    return NextResponse.json({ notifications });
  } catch (error) {
    console.error("Error fetching notifications:", error);
    return NextResponse.json({ error: "Failed to fetch notifications" }, { status: 500 });
  }
}

// PATCH: Mark notifications as read
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

    const { notificationIds } = await req.json();

    if (!notificationIds || !Array.isArray(notificationIds)) {
      return NextResponse.json({ error: "notificationIds array is required" }, { status: 400 });
    }

    // Batch update notifications as read
    const batch = writeBatch(db);
    
    notificationIds.forEach((notifId) => {
      const notifRef = doc(db, `users/${decoded.uid}/notifications`, notifId);
      batch.update(notifRef, { read: true });
    });

    await batch.commit();

    return NextResponse.json({ success: true, message: "Notifications marked as read" });
  } catch (error) {
    console.error("Error marking notifications as read:", error);
    return NextResponse.json({ error: "Failed to update notifications" }, { status: 500 });
  }
}

// DELETE: Clear all notifications
export async function DELETE(req: NextRequest) {
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

    const notificationsRef = collection(db, `users/${decoded.uid}/notifications`);
    const snapshot = await getDocs(notificationsRef);

    const batch = writeBatch(db);
    snapshot.docs.forEach((docSnap) => {
      batch.delete(docSnap.ref);
    });

    await batch.commit();

    return NextResponse.json({ success: true, message: "All notifications cleared" });
  } catch (error) {
    console.error("Error clearing notifications:", error);
    return NextResponse.json({ error: "Failed to clear notifications" }, { status: 500 });
  }
}