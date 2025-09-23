// app/api/search/route.ts
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebase";
import {
  collection,
  query,
  where,
  orderBy,
  limit as firestoreLimit,
  getDocs,
  or,
} from "firebase/firestore";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const searchQuery = searchParams.get("q");
    const limitParam = parseInt(searchParams.get("limit") || "10");
    
    if (!searchQuery || searchQuery.trim().length < 2) {
      return NextResponse.json({ results: [] });
    }

    const searchTerm = searchQuery.trim().toLowerCase();
    const validLimit = Math.min(Math.max(limitParam, 1), 20);

    // Search videos
    const videoResults = await searchVideos(searchTerm, Math.ceil(validLimit * 0.7));
    
    // Search users
    const userResults = await searchUsers(searchTerm, Math.floor(validLimit * 0.3));

    // Combine and limit results
    const allResults = [...videoResults, ...userResults].slice(0, validLimit);

    return NextResponse.json({ 
      results: allResults,
      total: allResults.length 
    });

  } catch (error) {
    console.error("Search API error:", error);
    return NextResponse.json(
      { error: "Internal server error", results: [] },
      { status: 500 }
    );
  }
}

async function searchVideos(searchTerm: string, limitCount: number) {
  try {
    // Simple approach: search by title with basic filtering
    // This avoids complex composite indexes
    const videosQuery = query(
      collection(db, "videos"),
      where("visibility", "==", "public"),
      orderBy("createdAt", "desc"),
      firestoreLimit(limitCount * 3) // Get more to filter client-side
    );

    const videosSnapshot = await getDocs(videosQuery);
    
    // Filter results client-side for better flexibility
    const filteredDocs = videosSnapshot.docs.filter(doc => {
      const title = doc.data().title?.toLowerCase() || '';
      const tags = doc.data().tags || [];
      const description = doc.data().description?.toLowerCase() || '';
      
      // Check if search term appears in title, tags, or description
      return title.includes(searchTerm) || 
             tags.some((tag: string) => tag.toLowerCase().includes(searchTerm)) ||
             description.includes(searchTerm);
    }).slice(0, limitCount); // Limit to requested count

    const videoResults = await Promise.all(
      filteredDocs.map(async (doc) => {
        const videoData = doc.data();
        
        // Fetch owner data for each video
        let ownerName = "Unknown Creator";
        let ownerPhoto = "/images/default-avatar.png";
        
        if (videoData.ownerId) {
          try {
            const ownerDoc = await getDocs(query(
              collection(db, "users"),
              where("__name__", "==", videoData.ownerId),
              firestoreLimit(1)
            ));
            
            if (!ownerDoc.empty) {
              const ownerData = ownerDoc.docs[0].data();
              ownerName = ownerData.displayName || ownerName;
              ownerPhoto = ownerData.photoURL || ownerPhoto;
            }
          } catch (ownerError) {
            console.error("Error fetching video owner:", ownerError);
          }
        }

        return {
          id: doc.id,
          type: "video" as const,
          title: videoData.title,
          thumbnail: videoData.thumbnailUrl,
          views: videoData.views || 0,
          createdAt: videoData.createdAt?.toDate?.()?.getTime() || Date.now(),
          ownerId: videoData.ownerId,
          ownerName,
          ownerPhoto,
        };
      })
    );

    return videoResults;

  } catch (error) {
    console.error("Error searching videos:", error);
    
    // Simple fallback: just get recent public videos
    try {
      const fallbackQuery = query(
        collection(db, "videos"),
        where("visibility", "==", "public"),
        orderBy("createdAt", "desc"),
        firestoreLimit(limitCount)
      );

      const fallbackSnapshot = await getDocs(fallbackQuery);
      
      const fallbackResults = await Promise.all(
        fallbackSnapshot.docs.map(async (doc) => {
          const videoData = doc.data();
          
          let ownerName = "Unknown Creator";
          let ownerPhoto = "/images/default-avatar.png";
          
          if (videoData.ownerId) {
            try {
              const ownerDoc = await getDocs(query(
                collection(db, "users"),
                where("__name__", "==", videoData.ownerId),
                firestoreLimit(1)
              ));
              
              if (!ownerDoc.empty) {
                const ownerData = ownerDoc.docs[0].data();
                ownerName = ownerData.displayName || ownerName;
                ownerPhoto = ownerData.photoURL || ownerPhoto;
              }
            } catch (ownerError) {
              console.error("Error fetching video owner:", ownerError);
            }
          }

          return {
            id: doc.id,
            type: "video" as const,
            title: videoData.title,
            thumbnail: videoData.thumbnailUrl,
            views: videoData.views || 0,
            createdAt: videoData.createdAt?.toDate?.()?.getTime() || Date.now(),
            ownerId: videoData.ownerId,
            ownerName,
            ownerPhoto,
          };
        })
      );

      return fallbackResults;
      
    } catch (fallbackError) {
      console.error("Fallback video search failed:", fallbackError);
      return [];
    }
  }
}

async function searchUsers(searchTerm: string, limitCount: number) {
  try {
    // Simple approach: get users and filter client-side
    const usersQuery = query(
      collection(db, "users"),
      firestoreLimit(limitCount * 2) // Get more to filter client-side
    );

    const usersSnapshot = await getDocs(usersQuery);
    
    // Filter users client-side
    const filteredUsers = usersSnapshot.docs.filter(doc => {
      const displayName = doc.data().displayName?.toLowerCase() || '';
      const email = doc.data().email?.toLowerCase() || '';
      
      return displayName.includes(searchTerm) || email.includes(searchTerm);
    }).slice(0, limitCount);
    
    return filteredUsers.map(doc => ({
      id: doc.id,
      type: "user" as const,
      title: doc.data().displayName,
      displayName: doc.data().displayName,
      photoURL: doc.data().photoURL,
    }));

  } catch (error) {
    console.error("Error searching users:", error);
    return [];
  }
}