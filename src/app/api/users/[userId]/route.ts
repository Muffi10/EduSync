// src/app/api/users/[userId]/route.ts
import { db } from "@/lib/firebase";
import { doc, getDoc, collection, getDocs, updateDoc, setDoc } from "firebase/firestore";
import { NextRequest, NextResponse } from "next/server";

// Fix: Update the RouteParams interface to expect a Promise
interface RouteParams {
  params: Promise<{ userId: string }>
}

export async function GET(
  req: NextRequest,
  { params }: RouteParams
) {
  // Await params as required by Next.js
  const resolvedParams = await params;
  
  // Add validation for userId
  if (!resolvedParams?.userId) {
    return NextResponse.json(
      { error: "User ID is required" }, 
      { status: 400 }
    );
  }

  const { userId } = resolvedParams;

  // Add basic validation
  if (typeof userId !== 'string' || userId.trim().length === 0) {
    return NextResponse.json(
      { error: "Invalid user ID" }, 
      { status: 400 }
    );
  }

  try {
    console.log(`Fetching user profile for userId: ${userId}`);
    
    // Fetch main profile
    const userSnap = await getDoc(doc(db, "users", userId));
    if (!userSnap.exists()) {
      console.log(`User not found: ${userId}`);
      return NextResponse.json(
        { error: "User not found" }, 
        { status: 404 }
      );
    }

    const userData = userSnap.data();
    console.log(`User data fetched successfully for: ${userId}`);

    // Fetch followers & following subcollections with error handling
    let followersCount = 0;
    let followingCount = 0;

    try {
      const [followersSnap, followingSnap] = await Promise.all([
        getDocs(collection(db, "users", userId, "followers")),
        getDocs(collection(db, "users", userId, "following"))
      ]);
      
      followersCount = followersSnap.size;
      followingCount = followingSnap.size;
    } catch (subcollectionError) {
      console.warn(`Error fetching subcollections for ${userId}:`, subcollectionError);
      // Continue without subcollection data rather than failing completely
    }

    const response = {
      id: userId,
      ...userData,
      followersCount,
      followingCount,
    };

    return NextResponse.json(response, {
      status: 200,
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    });

  } catch (error) {
    console.error(`Error fetching user profile for ${userId}:`, error);
    
    // Check if it's a Firebase connection issue
    if (error instanceof Error) {
      if (error.message.includes('network')) {
        return NextResponse.json(
          { error: "Network error, please try again" }, 
          { status: 503 }
        );
      }
      
      if (error.message.includes('permission')) {
        return NextResponse.json(
          { error: "Access denied" }, 
          { status: 403 }
        );
      }
    }

    return NextResponse.json(
      { error: "Internal server error" }, 
      { status: 500 }
    );
  }
}

// PATCH → partial update (update only provided fields)
export async function PATCH(
  req: NextRequest,
  { params }: RouteParams
) {
  // Await params as required by Next.js
  const resolvedParams = await params;
  
  if (!resolvedParams?.userId) {
    return NextResponse.json(
      { error: "User ID is required" }, 
      { status: 400 }
    );
  }

  const { userId } = resolvedParams;

  try {
    const body = await req.json();
    
    // Basic validation
    if (!body || typeof body !== 'object') {
      return NextResponse.json(
        { error: "Request body is required" }, 
        { status: 400 }
      );
    }

    // TODO: Add authentication check here
    // const authHeader = req.headers.get('authorization');
    // if (!authHeader) {
    //   return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    // }

    await updateDoc(doc(db, "users", userId), {
      ...body,
      updatedAt: Date.now(),
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error updating profile:", error);
    return NextResponse.json(
      { error: "Internal server error" }, 
      { status: 500 }
    );
  }
}

// PUT → full update/replace (or upsert)
export async function PUT(
  req: NextRequest,
  { params }: RouteParams
) {
  // Await params as required by Next.js
  const resolvedParams = await params;
  
  if (!resolvedParams?.userId) {
    return NextResponse.json(
      { error: "User ID is required" }, 
      { status: 400 }
    );
  }

  const { userId } = resolvedParams;

  try {
    const body = await req.json();
    
    // Basic validation
    if (!body || typeof body !== 'object') {
      return NextResponse.json(
        { error: "Request body is required" }, 
        { status: 400 }
      );
    }

    // TODO: Add authentication check here
    // const authHeader = req.headers.get('authorization');
    // if (!authHeader) {
    //   return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    // }

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
    return NextResponse.json(
      { error: "Internal server error" }, 
      { status: 500 }
    );
  }
}