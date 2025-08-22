'use client';

import {
  onAuthStateChanged,
  getIdToken,
  User as FirebaseUser,
} from 'firebase/auth';
import { createContext, useContext, useEffect, useState } from 'react';
import { auth } from '@/lib/firebase';

interface AuthContextType {
  user: FirebaseUser | null;
  token: string | null;
  loading: boolean;
  isHydrated: boolean;
  refreshUser: () => Promise<void>; // Add this
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  token: null,
  loading: true,
  isHydrated: false,
  refreshUser: async () => {}, // Add this
});

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isHydrated, setIsHydrated] = useState(false);

  // Add refreshUser function
  const refreshUser = async () => {
    if (auth.currentUser) {
      try {
        await auth.currentUser.reload();
        const freshUser = auth.currentUser;
        setUser({ ...freshUser }); // Force re-render with spread operator
        
        const idToken = await getIdToken(freshUser, true);
        setToken(idToken);
      } catch (error) {
        console.error('Error refreshing user:', error);
      }
    }
  };

  useEffect(() => {
    setIsHydrated(true);

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        try {
          // 🔑 force refresh user so photoURL / displayName updates
          await firebaseUser.reload();
          setUser(auth.currentUser);

          const idToken = await getIdToken(firebaseUser, true);
          setToken(idToken);
        } catch (error) {
          console.error('Error getting token:', error);
          setToken(null);
          setUser(firebaseUser);
        }
      } else {
        setUser(null);
        setToken(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, loading, isHydrated, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);