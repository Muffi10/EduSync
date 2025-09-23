// app/search/page.tsx
'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Suspense } from 'react';

interface SearchResult {
  id: string;
  type: 'video' | 'user';
  title: string;
  thumbnail?: string;
  displayName?: string;
  photoURL?: string;
  createdAt?: number;
  views?: number;
  ownerId?: string;
  ownerName?: string;
  ownerPhoto?: string;
}

function SearchResults() {
  const searchParams = useSearchParams();
  const query = searchParams?.get('q') || '';
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'videos' | 'users'>('all');

  useEffect(() => {
    if (query) {
      performSearch(query);
    } else {
      setResults([]);
      setLoading(false);
    }
  }, [query]);

  const performSearch = async (searchQuery: string) => {
    setLoading(true);
    try {
      const response = await fetch(`/api/search?q=${encodeURIComponent(searchQuery)}&limit=20`);
      if (response.ok) {
        const data = await response.json();
        setResults(data.results || []);
      }
    } catch (error) {
      console.error('Search error:', error);
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const formatViews = (views: number = 0) => {
    if (views >= 1000000) return `${(views / 1000000).toFixed(1)}M views`;
    if (views >= 1000) return `${(views / 1000).toFixed(1)}K views`;
    return `${views} views`;
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffInDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

    if (diffInDays === 0) return 'Today';
    if (diffInDays === 1) return 'Yesterday';
    if (diffInDays < 7) return `${diffInDays} days ago`;
    if (diffInDays < 30) return `${Math.floor(diffInDays / 7)} weeks ago`;
    
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: diffInDays > 365 ? 'numeric' : undefined,
    });
  };

  const filteredResults = results.filter(result => {
    if (filter === 'all') return true;
    if (filter === 'videos') return result.type === 'video';
    if (filter === 'users') return result.type === 'user';
    return true;
  });

  const videoCount = results.filter(r => r.type === 'video').length;
  const userCount = results.filter(r => r.type === 'user').length;

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-6">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-48 mb-6"></div>
          <div className="flex space-x-6 border-b border-gray-200 dark:border-gray-700 mb-8">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-16 py-3"></div>
            ))}
          </div>
          <div className="space-y-6">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="flex space-x-4">
                <div className="w-80 h-44 bg-gray-200 dark:bg-gray-700 rounded-lg flex-shrink-0"></div>
                <div className="flex-1">
                  <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-3/4 mb-2"></div>
                  <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/2 mb-2"></div>
                  <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/3"></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <div className="mb-8">
        <h1 className="text-xl font-normal text-gray-900 dark:text-white mb-6">
          Search results for &quot;<span className="font-medium">{query}</span>&quot;
        </h1>

        <div className="flex space-x-8 border-b border-gray-200 dark:border-gray-700">
          <button
            onClick={() => setFilter('all')}
            className={`py-3 px-1 border-b-2 font-medium text-sm transition-colors ${
              filter === 'all'
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200'
            }`}
          >
            All ({results.length})
          </button>
          <button
            onClick={() => setFilter('videos')}
            className={`py-3 px-1 border-b-2 font-medium text-sm transition-colors ${
              filter === 'videos'
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200'
            }`}
          >
            Videos ({videoCount})
          </button>
          <button
            onClick={() => setFilter('users')}
            className={`py-3 px-1 border-b-2 font-medium text-sm transition-colors ${
              filter === 'users'
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200'
            }`}
          >
            Channels ({userCount})
          </button>
        </div>
      </div>

      <div className="space-y-6">
        {filteredResults.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-gray-400 mb-6">
              <svg className="w-24 h-24 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <h3 className="text-xl font-medium text-gray-900 dark:text-white mb-2">
              No results found
            </h3>
            <p className="text-gray-500 dark:text-gray-400 max-w-md mx-auto">
              Try different keywords or remove search filters.
            </p>
          </div>
        ) : (
          filteredResults.map((result) => (
            <div key={`${result.type}-${result.id}`} className="group">
              {result.type === 'video' ? (
                <Link 
                  href={`/watch/${result.id}`} 
                  className="flex space-x-4 p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                >
                  <div className="w-80 h-44 flex-shrink-0 relative bg-gray-200 dark:bg-gray-700 rounded-xl overflow-hidden">
                    <Image
                      src={result.thumbnail || '/placeholder.jpg'}
                      alt={result.title}
                      fill
                      className="object-cover"
                    />
                  </div>
                  
                  <div className="flex-1 min-w-0 py-1">
                    <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-1 line-clamp-2">
                      {result.title}
                    </h3>
                    
                    <div className="flex items-center text-sm text-gray-500 dark:text-gray-400 mb-2">
                      {result.views !== undefined && (
                        <>
                          <span>{formatViews(result.views)}</span>
                          <span className="mx-1">•</span>
                        </>
                      )}
                      {result.createdAt && (
                        <span>{formatDate(result.createdAt)}</span>
                      )}
                    </div>
                    
                    <div className="flex items-center space-x-2 mb-3">
                      <Image
                        src={result.ownerPhoto || '/images/default-avatar.png'}
                        alt={result.ownerName || 'Channel'}
                        width={24}
                        height={24}
                        className="rounded-full object-cover"
                      />
                      <span className="text-sm text-gray-600 dark:text-gray-400">
                        {result.ownerName || 'Unknown Channel'}
                      </span>
                    </div>
                    
                    <p className="text-sm text-gray-600 dark:text-gray-300 line-clamp-2">
                      {result.title}
                    </p>
                  </div>
                </Link>
              ) : (
                <Link 
                  href={`/profile/${result.id}`} 
                  className="flex items-start space-x-6 p-4 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                >
                  <div className="flex-shrink-0">
                    <Image
                      src={result.photoURL || '/images/default-avatar.png'}
                      alt={result.displayName || 'User'}
                      width={88}
                      height={88}
                      className="rounded-full object-cover"
                    />
                  </div>
                  
                  <div className="flex-1 min-w-0 pt-2">
                    <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                      {result.displayName}
                    </h3>
                    
                    <div className="flex items-center text-sm text-gray-500 dark:text-gray-400 mb-2">
                      <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                      <span>Channel</span>
                    </div>
                    
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Educational content creator
                    </p>
                  </div>
                  
                  <div className="flex-shrink-0 pt-2">
                    <button 
                      onClick={(e) => {
                        e.preventDefault();
                        console.log('Subscribe to:', result.id);
                      }}
                      className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-full transition-colors"
                    >
                      Subscribe
                    </button>
                  </div>
                </Link>
              )}
            </div>
          ))
        )}
      </div>

      {filteredResults.length > 0 && (
        <div className="mt-12 pt-6 border-t border-gray-200 dark:border-gray-700">
          <p className="text-sm text-gray-500 dark:text-gray-400 text-center">
            Showing {filteredResults.length} results for &quot;{query}&quot;
          </p>
        </div>
      )}
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={
      <div className="max-w-6xl mx-auto px-4 py-6">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-48 mb-6"></div>
          <div className="h-64 bg-gray-200 dark:bg-gray-700 rounded"></div>
        </div>
      </div>
    }>
      <SearchResults />
    </Suspense>
  );
}