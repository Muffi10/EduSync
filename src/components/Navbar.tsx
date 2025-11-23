'use client';

import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { useState, useEffect, useRef, useCallback } from 'react';

interface SearchResult {
  id: string;
  title: string;
  type: 'video' | 'user';
  thumbnail?: string;
  displayName?: string;
  photoURL?: string;
}

export default function Navbar() {
  const { user, loading, isHydrated } = useAuth();
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showMobileSearch, setShowMobileSearch] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);
  const mobileSearchRef = useRef<HTMLDivElement>(null);

  // Debounced search
  const debounceTimeout = useRef<NodeJS.Timeout | null>(null);

  const performSearch = useCallback(async (query: string) => {
    if (!query.trim()) {
      setSearchResults([]);
      setShowResults(false);
      return;
    }

    setSearchLoading(true);
    try {
      const response = await fetch(`/api/search?q=${encodeURIComponent(query)}&limit=8`);
      if (response.ok) {
        const data = await response.json();
        setSearchResults(data.results || []);
        setShowResults(true);
      }
    } catch (error) {
      console.error('Search error:', error);
      setSearchResults([]);
    } finally {
      setSearchLoading(false);
    }
  }, []);

  useEffect(() => {
    if (debounceTimeout.current) {
      clearTimeout(debounceTimeout.current);
    }

    debounceTimeout.current = setTimeout(() => {
      performSearch(search);
    }, 300);

    return () => {
      if (debounceTimeout.current) {
        clearTimeout(debounceTimeout.current);
      }
    };
  }, [search, performSearch]);

  // Handle click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowResults(false);
      }
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
        setShowProfileMenu(false);
      }
      if (mobileSearchRef.current && !mobileSearchRef.current.contains(event.target as Node)) {
        setShowMobileSearch(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (search.trim()) {
      setShowResults(false);
      setShowMobileSearch(false);
      router.push(`/search?q=${encodeURIComponent(search.trim())}`);
    }
  };

  const handleMobileSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (search.trim()) {
      setShowMobileSearch(false);
      router.push(`/search?q=${encodeURIComponent(search.trim())}`);
    }
  };

  const handleSearchResultClick = (result: SearchResult) => {
    setShowResults(false);
    setShowMobileSearch(false);
    setSearch('');
    
    if (result.type === 'video') {
      router.push(`/watch/${result.id}`);
    } else if (result.type === 'user') {
      router.push(`/profile/${result.id}`);
    }
  };

  const handleLogout = async () => {
    setShowProfileMenu(false);
    await signOut(auth);
    router.push('/');
  };

  if (!isHydrated) {
    return (
      <header className="w-full h-14 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-50">
        <div className="h-full px-4 flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="w-32 h-8 bg-gray-200 dark:bg-gray-700 rounded animate-pulse"></div>
          </div>
          <div className="hidden md:flex flex-1 max-w-2xl mx-8">
            <div className="w-full h-10 bg-gray-200 dark:bg-gray-700 rounded-full animate-pulse"></div>
          </div>
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-gray-200 dark:bg-gray-700 rounded-full animate-pulse"></div>
          </div>
        </div>
      </header>
    );
  }

  return (
    <header className="w-full h-14 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-50">
      {/* Mobile Search Overlay */}
      {showMobileSearch && (
        <div className="md:hidden absolute top-0 left-0 right-0 bottom-0 bg-white dark:bg-gray-900 z-50 p-4 flex items-center">
          <div className="flex items-center w-full" ref={mobileSearchRef}>
            <button
              onClick={() => setShowMobileSearch(false)}
              className="p-2 mr-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <form onSubmit={handleMobileSearch} className="flex-1 flex">
              <input
                type="text"
                placeholder="Search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="flex-1 h-10 px-4 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-l-full focus:outline-none focus:border-blue-500 dark:focus:border-blue-400 text-sm"
                autoFocus
              />
              <button
                type="submit"
                className="h-10 px-4 bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 border border-l-0 border-gray-300 dark:border-gray-600 rounded-r-full"
              >
                <svg className="w-5 h-5 text-gray-600 dark:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </button>
            </form>
          </div>
        </div>
      )}

      <div className="h-full px-4 flex items-center justify-between">
        {/* Left side - Menu & Logo */}
        <div className="flex items-center space-x-4 min-w-0 flex-shrink-0">
          <button className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full md:hidden">
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M3 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 10a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 15a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
            </svg>
          </button>
          
          <Link href="/" className="flex items-center space-x-1 flex-shrink-0">
            <Image 
              src="/images/edusync_logo.png" 
              alt="EduSync" 
              width={120}
              height={40}
              className="h-10 w-auto object-contain"
              priority
            />
          </Link>
        </div>

        {/* Center - Search bar (Desktop) */}
        {!showMobileSearch && (
          <>
            <div className="hidden md:flex flex-1 max-w-2xl mx-8 relative" ref={searchRef}>
              <form onSubmit={handleSearch} className="flex w-full">
                <div className="flex-1 relative">
                  <input
                    type="text"
                    placeholder="Search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    onFocus={() => search && setShowResults(true)}
                    className="w-full h-10 pl-4 pr-10 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-l-full focus:outline-none focus:border-blue-500 dark:focus:border-blue-400 text-sm"
                  />
                  {searchLoading && (
                    <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                      <svg className="animate-spin h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                    </div>
                  )}
                </div>
                <button
                  type="submit"
                  className="h-10 px-6 bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 border border-l-0 border-gray-300 dark:border-gray-600 rounded-r-full flex items-center justify-center"
                >
                  <svg className="w-5 h-5 text-gray-600 dark:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </button>
              </form>

              {/* Search Results Dropdown */}
              {showResults && searchResults.length > 0 && (
                <div className="absolute top-full left-0 right-12 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg max-h-80 overflow-y-auto z-50">
                  {searchResults.map((result) => (
                    <button
                      key={`${result.type}-${result.id}`}
                      onClick={() => handleSearchResultClick(result)}
                      className="w-full p-3 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center space-x-3 text-left"
                    >
                      {result.type === 'video' ? (
                        <>
                          <svg className="w-5 h-5 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                          </svg>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                              {result.title}
                            </p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">Video</p>
                          </div>
                          {result.thumbnail && (
                            <Image
                              src={result.thumbnail}
                              alt={result.title}
                              width={60}
                              height={34}
                              className="rounded object-cover flex-shrink-0"
                            />
                          )}
                        </>
                      ) : (
                        <>
                          <svg className="w-5 h-5 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                          </svg>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                              {result.displayName || result.title}
                            </p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">User</p>
                          </div>
                          <Image
                            src={result.photoURL || '/images/default-avatar.png'}
                            alt={result.displayName || 'User'}
                            width={32}
                            height={32}
                            className="rounded-full object-cover flex-shrink-0"
                          />
                        </>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Mobile Search Button */}
            <button 
              onClick={() => setShowMobileSearch(true)}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full md:hidden ml-auto mr-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </button>
          </>
        )}

        {/* Right side - User actions */}
        {!showMobileSearch && (
          <div className="flex items-center space-x-2 flex-shrink-0">
            {loading ? (
              <div className="w-8 h-8 bg-gray-200 dark:bg-gray-700 rounded-full animate-pulse"></div>
            ) : user ? (
              <>
                {/* Create Video Button */}
                <Link 
                  href="/upload" 
                  className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full"
                  title="Create"
                >
                  <svg className="w-6 h-6 text-gray-600 dark:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                </Link>

                {/* Notifications */}
                <Link 
                  href="/notifications" 
                  className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full relative"
                  title="Notifications"
                >
                  <svg className="w-6 h-6 text-gray-600 dark:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V4a2 2 0 10-4 0v1.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                  </svg>
                </Link>

                {/* Profile Menu */}
                <div className="relative" ref={profileRef}>
                  <button
                    onClick={() => setShowProfileMenu(!showProfileMenu)}
                    className="p-0.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full"
                  >
                    <Image
                      src={user.photoURL || '/images/default-avatar.png'}
                      alt="Profile"
                      width={32}
                      height={32}
                      className="rounded-full"
                    />
                  </button>

                  {showProfileMenu && (
                    <div className="absolute right-0 mt-2 w-64 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg py-2 z-50">
                      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-600">
                        <div className="flex items-center space-x-3">
                          <Image
                            src={user.photoURL || '/images/default-avatar.png'}
                            alt="Profile"
                            width={40}
                            height={40}
                            className="rounded-full"
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                              {user.displayName || 'User'}
                            </p>
                            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                              {user.email}
                            </p>
                          </div>
                        </div>
                      </div>

                      <Link
                        href={`/profile/${user.uid}`}
                        className="block px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
                        onClick={() => setShowProfileMenu(false)}
                      >
                        Your channel
                      </Link>
                      <Link
                        href="/settings"
                        className="block px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
                        onClick={() => setShowProfileMenu(false)}
                      >
                        Settings
                      </Link>
                      <hr className="my-2 border-gray-200 dark:border-gray-600" />
                      <button
                        onClick={handleLogout}
                        className="block w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
                      >
                        Sign out
                      </button>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <Link
                href="/login"
                className="flex items-center space-x-2 px-4 py-2 text-sm font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 border border-gray-300 dark:border-gray-600 rounded-full hover:bg-gray-50 dark:hover:bg-gray-800"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                <span>Sign in</span>
              </Link>
            )}
          </div>
        )}
      </div>
    </header>
  );
}