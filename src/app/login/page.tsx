'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup,
} from 'firebase/auth';
import { auth, db } from '@/lib/firebase';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import Image from 'next/image';
import { FirebaseError } from 'firebase/app';

export default function LoginPage() {
  const router = useRouter();
  const [hasMounted, setHasMounted] = useState(false);
  const [isSignup, setIsSignup] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [emailValid, setEmailValid] = useState(true);
  const [passwordValid, setPasswordValid] = useState(true);

  useEffect(() => {
    setHasMounted(true);
  }, []);

  useEffect(() => {
    // Basic email validation
    setEmailValid(email === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email));
  }, [email]);

  useEffect(() => {
    // Password length validation (min 6 chars)
    setPasswordValid(password === '' || password.length >= 6);
  }, [password]);

  if (!hasMounted) return null;

  const resetForm = () => {
    setEmail('');
    setPassword('');
    setDisplayName('');
    setUsername('');
    setError('');
  };

  const handleEmailAuth = async () => {
    if (!emailValid || !passwordValid) return;
    
    setLoading(true);
    setError('');
    
    try {
      let userCredential;
      if (isSignup) {
        if (!username || !displayName) {
          setError('Please fill all fields');
          setLoading(false);
          return;
        }

        userCredential = await createUserWithEmailAndPassword(auth, email, password);

        await setDoc(doc(db, 'users', userCredential.user.uid), {
          uid: userCredential.user.uid,
          email: userCredential.user.email,
          username,
          displayName,
          photoURL: userCredential.user.photoURL || null,
          bio: '',
          updatedAt: Date.now(),
          createdAt: serverTimestamp(),
          followers: [],
          following: [],
        });
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }

      resetForm();
      router.push('/');
    } catch (err: unknown) {
      let errorMessage = 'An error occurred';
      
      if (err instanceof FirebaseError) {
        switch (err.code) {
          case 'auth/invalid-email':
            errorMessage = 'Invalid email address';
            break;
          case 'auth/user-disabled':
            errorMessage = 'Account disabled';
            break;
          case 'auth/user-not-found':
            errorMessage = 'Account not found';
            break;
          case 'auth/wrong-password':
            errorMessage = 'Incorrect password';
            break;
          case 'auth/email-already-in-use':
            errorMessage = 'Email already in use';
            break;
          case 'auth/weak-password':
            errorMessage = 'Password should be at least 6 characters';
            break;
          default:
            errorMessage = err.message;
        }
      } else if (err instanceof Error) {
        errorMessage = err.message;
      }
      
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleAuth = async () => {
    setLoading(true);
    setError('');
    
    try {
      const result = await signInWithPopup(auth, new GoogleAuthProvider());

      await setDoc(doc(db, 'users', result.user.uid), {
        uid: result.user.uid,
        email: result.user.email,
        username: result.user.displayName?.toLowerCase().replace(/\s+/g, '') || `user${Date.now()}`,
        displayName: result.user.displayName || '',
        photoURL: result.user.photoURL,
        bio: '',
        updatedAt: Date.now(),
        createdAt: serverTimestamp(),
        followers: [],
        following: [],
      }, { merge: true });

      resetForm();
      router.push('/');
    } catch (err: unknown) {
      setError(err instanceof FirebaseError ? err.message : 'Failed to sign in with Google');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-4">
      <div className="w-full max-w-md bg-white dark:bg-gray-800 rounded-xl shadow-lg p-8 space-y-6">
        <div className="flex justify-center">
          <Image 
            src="/images/edusync_logo.png" 
            alt="Edusync" 
            width={48} 
            height={48}
            className="dark:invert"
          />
        </div>

        <h2 className="text-center text-2xl font-semibold text-gray-900 dark:text-white">
          {isSignup ? 'Create your account' : 'Sign in to Edusync'}
        </h2>

        <div className="space-y-4">
          {isSignup && (
            <>
              <div className="space-y-1">
                <label htmlFor="displayName" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Display Name
                </label>
                <input
                  id="displayName"
                  type="text"
                  placeholder="Enter your name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full px-4 py-2 border rounded-lg bg-gray-50 dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="username" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Username
                </label>
                <input
                  id="username"
                  type="text"
                  placeholder="Choose a username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full px-4 py-2 border rounded-lg bg-gray-50 dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                />
              </div>
            </>
          )}

          <div className="space-y-1">
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Email
            </label>
            <input
              id="email"
              type="email"
              placeholder="Enter your email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={`w-full px-4 py-2 border rounded-lg bg-gray-50 dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                !emailValid ? 'border-red-500' : ''
              }`}
              required
              autoFocus
            />
            {!emailValid && (
              <p className="text-sm text-red-500">Please enter a valid email</p>
            )}
          </div>

          <div className="space-y-1">
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Password
            </label>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={`w-full px-4 py-2 border rounded-lg bg-gray-50 dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                  !passwordValid ? 'border-red-500' : ''
                }`}
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-2.5 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
            {!passwordValid && (
              <p className="text-sm text-red-500">Password must be at least 6 characters</p>
            )}
          </div>

          {error && (
            <div className="p-3 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-lg">
              {error}
            </div>
          )}

          <button
            onClick={handleEmailAuth}
            disabled={loading || !emailValid || !passwordValid || (isSignup && (!username || !displayName))}
            className={`w-full py-2 rounded-lg text-white font-medium transition ${
              loading || !emailValid || !passwordValid || (isSignup && (!username || !displayName))
                ? 'bg-blue-400 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-700 cursor-pointer'
            }`}
          >
            {loading ? (
              <span className="flex items-center justify-center">
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Processing...
              </span>
            ) : isSignup ? (
              'Sign Up'
            ) : (
              'Sign In'
            )}
          </button>
        </div>

        <div className="flex items-center space-x-2">
          <hr className="flex-1 border-gray-300 dark:border-gray-600" />
          <span className="text-xs text-gray-500">OR</span>
          <hr className="flex-1 border-gray-300 dark:border-gray-600" />
        </div>

        <button
          onClick={handleGoogleAuth}
          disabled={loading}
          className="w-full py-2 flex items-center justify-center space-x-2 rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 transition cursor-pointer disabled:cursor-not-allowed disabled:opacity-70"
        >
          <Image 
            src="/images/google.png" 
            alt="Google" 
            width={20} 
            height={20} 
            className="dark:invert"
          />
          <span>Continue with Google</span>
        </button>

        <p className="text-center text-sm text-gray-600 dark:text-gray-400">
          {isSignup ? 'Already have an account?' : "Don't have an account?"}{' '}
          <button
            onClick={() => {
              setIsSignup(!isSignup);
              resetForm();
            }}
            className="text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
          >
            {isSignup ? 'Sign in' : 'Sign up'}
          </button>
        </p>
      </div>
    </div>
  );
}