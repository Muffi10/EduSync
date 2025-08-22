'use client';

import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { useState } from 'react';

export default function Navbar() {
  const { user, loading, isHydrated } = useAuth();
  const router = useRouter();
  const [search, setSearch] = useState('');

  const handleLogout = async () => {
    await signOut(auth);
    router.push('/');
  };

  if (!isHydrated) {
    return (
      <header className="w-full px-4 bg-white dark:bg-black shadow-md sticky top-0 z-50 h-13 flex items-center">
        <div className="max-w-6xl mx-auto flex items-center justify-between w-full">
          <div className="flex items-center space-x-6">
            <div className="w-24 h-6 bg-gray-200 dark:bg-gray-700 animate-pulse"></div>
          </div>
          <div className="hidden md:flex flex-1 mx-6 max-w-2xl">
            <div className="w-full h-8 rounded-full bg-gray-200 dark:bg-gray-700 animate-pulse" />
          </div>
          <div className="flex items-center space-x-4">
            <div className="w-8 h-8 bg-gray-200 dark:bg-gray-700 rounded-full animate-pulse"></div>
          </div>
        </div>
      </header>
    );
  }

  return (
    <header className="w-full px-4 bg-white dark:bg-black shadow-md sticky top-0 z-50 h-13 flex items-center">
      <div className="max-w-6xl mx-auto flex items-center justify-between w-full">
        {/* Left side - Logo */}
        <div className="flex items-center">
          <Link href="/" className="flex items-center">
            <Image 
              src="/images/edusync_logo.png" 
              alt="Edusync Logo" 
              width={90}  // Reduced from 120 to fit better
              height={40} // Reduced from 30 to fit better
              className="h-10" // Fixed height
            />
          </Link>
        </div>

        {/* Middle - Search bar (hidden on mobile) */}
        <div className="hidden md:flex flex-1 mx-6 max-w-2xl">
          <input
            type="text"
            placeholder="Search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-8 px-4 rounded-l-full bg-gray-100 dark:bg-gray-800 text-sm focus:outline-none border border-gray-300 dark:border-gray-600"
          />
          <button className="h-8 px-4 rounded-r-full bg-gray-100 dark:bg-gray-700 border border-l-0 border-gray-300 dark:border-gray-600 hover:bg-gray-200 dark:hover:bg-gray-600 flex items-center">
            <svg 
              xmlns="http://www.w3.org/2000/svg" 
              className="h-4 w-4 text-gray-500 dark:text-gray-400" 
              fill="none" 
              viewBox="0 0 24 24" 
              stroke="currentColor"
            >
              <path 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                strokeWidth={2} 
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" 
              />
            </svg>
          </button>
        </div>

        {/* Right side - Icons */}
        <div className="flex items-center space-x-3">
          {loading ? (
            <div className="flex space-x-3">
              <div className="w-7 h-7 bg-gray-200 dark:bg-gray-700 rounded-full animate-pulse"></div>
            </div>
          ) : user ? (
            <>
              <Link href="/notifications" className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="w-5 h-5 text-gray-700 dark:text-gray-200"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V4a2 2 0 10-4 0v1.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
                  />
                </svg>
              </Link>
              <Link href={`/profile/${user.uid}`} className="hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full">
                <Image
                  src={user.photoURL || '/images/default-avatar.png'}
                  alt="Profile"
                  width={28}
                  height={28}
                  className="rounded-full"
                />
              </Link>
            </>
          ) : (
            <Link
              href="/login"
              className="text-xs px-3 py-1 rounded-full border border-gray-300 hover:border-blue-600"
            >
              Sign In
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}