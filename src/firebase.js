import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const apiKey = import.meta.env.VITE_FIREBASE_API_KEY;

if (!apiKey) {
  throw new Error("VITE_FIREBASE_API_KEY 환경변수가 필요합니다.");
}

const firebaseConfig = {
  apiKey,
  authDomain: "mullohagi-652c3.firebaseapp.com",
  projectId: "mullohagi-652c3",
  storageBucket: "mullohagi-652c3.firebasestorage.app",
  messagingSenderId: "895117799817",
  appId: "1:895117799817:web:8821ee17cfe87a4f817158",
  measurementId: "G-LLC7PPJHN8",
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// Analytics는 핵심 화면과 Firestore 로딩을 막지 않도록 지연해서 불러옵니다.
async function initializeAnalytics() {
  const { getAnalytics, isSupported } = await import("firebase/analytics");
  return (await isSupported()) ? getAnalytics(app) : null;
}

if (import.meta.env.PROD) {
  void initializeAnalytics().catch((error) => {
    console.warn("Firebase Analytics initialization skipped:", error);
  });
}
