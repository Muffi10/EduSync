// src/lib/auth.ts
import * as admin from "firebase-admin";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

// ✅ Initialize Admin SDK only once
if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: process.env.ADMIN_PROJECT_ID,
      clientEmail: process.env.ADMIN_CLIENT_EMAIL,
      privateKey: process.env.ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    }),
    storageBucket: "edusynctube.firebasestorage.app", // ✅ Fixed bucket name
  });
}

// 🔑 Firebase Auth
export const verifyFirebaseToken = async (token: string) => {
  try {
    const decoded = await getAuth().verifyIdToken(token);
    return decoded;
  } catch {
    return null;
  }
};

// 🔑 Storage Admin - Fixed bucket name
export const adminStorage = admin.storage().bucket("edusynctube.firebasestorage.app"); // ✅ Fixed bucket name
export const adminDb = admin.firestore();