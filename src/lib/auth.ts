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
    storageBucket: "edusynctube.firebasestorage.app",
    databaseURL: "https://edusynctube-default-rtdb.asia-southeast1.firebasedatabase.app", // ✅ Added Realtime Database URL
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

// 🔑 Storage Admin
export const adminStorage = admin.storage().bucket("edusynctube.firebasestorage.app");

// 🔑 Firestore Admin
export const adminDb = admin.firestore();

// 🔑 Realtime Database Admin
export const adminRtdb = admin.database();