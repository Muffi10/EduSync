"use client";
import { useEffect, useState } from "react";
import { getAuth } from "firebase/auth";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";

interface Notification {
  id: string;
  type: "like" | "comment" | "follow";
  message: string;
  read: boolean;
  createdAt: number;
  fromUser: {
    id: string;
    username: string;
    displayName: string;
    photoURL: string;
  } | null;
  videoInfo?: {
    id: string;
    title: string;
    thumbnailUrl: string;
  } | null;
  commentInfo?: {
    id: string;
    text: string;
  } | null;
}

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"all" | "unread">("all");
  const router = useRouter();

  useEffect(() => {
    const auth = getAuth();
    const user = auth.currentUser;

    if (!user) {
      router.push("/login");
      return;
    }

    const fetchNotifications = async () => {
      try {
        const idToken = await user.getIdToken();
        setToken(idToken);

        const response = await fetch("/api/notifications", {
          headers: {
            Authorization: `Bearer ${idToken}`,
          },
        });

        if (!response.ok) throw new Error("Failed to fetch notifications");

        const data = await response.json();
        setNotifications(data.notifications);
      } catch (error) {
        console.error("Error fetching notifications:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchNotifications();
  }, [router]);

  const markAsRead = async (notificationIds: string[]) => {
    if (!token) return;

    try {
      await fetch("/api/notifications", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ notificationIds }),
      });

      setNotifications((prev) =>
        prev.map((notif) =>
          notificationIds.includes(notif.id) ? { ...notif, read: true } : notif
        )
      );
    } catch (error) {
      console.error("Error marking as read:", error);
    }
  };

  const markAllAsRead = async () => {
    const unreadIds = notifications.filter((n) => !n.read).map((n) => n.id);
    if (unreadIds.length > 0) {
      await markAsRead(unreadIds);
    }
  };

  const clearAllNotifications = async () => {
    if (!token) return;

    if (!confirm("Are you sure you want to clear all notifications?")) return;

    try {
      await fetch("/api/notifications", {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      setNotifications([]);
    } catch (error) {
      console.error("Error clearing notifications:", error);
    }
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case "like":
        return (
          <div className="flex-shrink-0">
            <svg className="w-4 h-4 text-red-500" fill="currentColor" viewBox="0 0 20 20">
              <path d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" />
            </svg>
          </div>
        );
      case "comment":
        return (
          <div className="flex-shrink-0">
            <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
          </div>
        );
      case "follow":
        return (
          <div className="flex-shrink-0">
            <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
            </svg>
          </div>
        );
      default:
        return null;
    }
  };

  const getTimeAgo = (timestamp: number) => {
    const now = Date.now();
    const diff = now - timestamp;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    const weeks = Math.floor(days / 7);

    if (weeks > 0) return `${weeks}w`;
    if (days > 0) return `${days}d`;
    if (hours > 0) return `${hours}h`;
    if (minutes > 0) return `${minutes}m`;
    return "Just now";
  };

  const getNotificationLink = (notification: Notification) => {
    if (notification.type === "like" || notification.type === "comment") {
      return notification.videoInfo ? `/watch/${notification.videoInfo.id}` : "#";
    }
    if (notification.type === "follow") {
      return notification.fromUser ? `/channel/${notification.fromUser.username}` : "#";
    }
    return "#";
  };

  const filteredNotifications = notifications.filter(notification => 
    activeTab === "all" ? true : !notification.read
  );

  if (loading) {
    return (
      <div className="max-w-lg mx-auto p-4">
        {/* Header Skeleton */}
        <div className="flex items-center justify-between mb-6">
          <div className="h-8 w-32 bg-gray-200 dark:bg-gray-700 rounded animate-pulse"></div>
          <div className="flex gap-2">
            <div className="h-8 w-24 bg-gray-200 dark:bg-gray-700 rounded animate-pulse"></div>
            <div className="h-8 w-20 bg-gray-200 dark:bg-gray-700 rounded animate-pulse"></div>
          </div>
        </div>
        
        {/* Tab Skeleton */}
        <div className="flex border-b border-gray-200 dark:border-gray-700 mb-6">
          <div className="h-10 w-20 bg-gray-200 dark:bg-gray-700 rounded-t animate-pulse mr-4"></div>
          <div className="h-10 w-24 bg-gray-200 dark:bg-gray-700 rounded-t animate-pulse"></div>
        </div>
        
        {/* Notification Skeletons */}
        {[...Array(5)].map((_, i) => (
          <div key={i} className="flex items-center gap-3 p-3 mb-3">
            <div className="w-12 h-12 bg-gray-200 dark:bg-gray-700 rounded-full animate-pulse"></div>
            <div className="flex-1 space-y-2">
              <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4 animate-pulse"></div>
              <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/4 animate-pulse"></div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Notifications</h1>
        <div className="flex gap-2">
          {notifications.some((n) => !n.read) && (
            <button
              onClick={markAllAsRead}
              className="px-3 py-1.5 text-sm font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition"
            >
              Mark all read
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 dark:border-gray-700 mb-6">
        <button
          onClick={() => setActiveTab("all")}
          className={`px-4 py-3 font-medium text-sm border-b-2 transition ${
            activeTab === "all"
              ? "border-black dark:border-white text-black dark:text-white"
              : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
          }`}
        >
          All
        </button>
        <button
          onClick={() => setActiveTab("unread")}
          className={`px-4 py-3 font-medium text-sm border-b-2 transition ${
            activeTab === "unread"
              ? "border-black dark:border-white text-black dark:text-white"
              : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
          }`}
        >
          Unread
        </button>
      </div>

      {/* Notifications List */}
      {filteredNotifications.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
            <svg className="w-10 h-10 text-gray-400 dark:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
          </div>
          <p className="text-gray-900 dark:text-white text-lg font-medium mb-2">
            {activeTab === "all" ? "No notifications yet" : "No unread notifications"}
          </p>
          <p className="text-gray-500 dark:text-gray-400 text-sm">
            {activeTab === "all" 
              ? "When someone interacts with your content, you'll see it here."
              : "You're all caught up!"}
          </p>
        </div>
      ) : (
        <div className="space-y-1">
          {filteredNotifications.map((notification) => (
            <Link
              key={notification.id}
              href={getNotificationLink(notification)}
              onClick={() => {
                if (!notification.read) {
                  markAsRead([notification.id]);
                }
              }}
              className={`flex items-start gap-3 p-3 cursor-pointer transition ${
                notification.read
                  ? "bg-transparent hover:bg-gray-50 dark:hover:bg-gray-800/50"
                  : "bg-blue-50 dark:bg-blue-900/10 hover:bg-blue-100 dark:hover:bg-blue-900/20"
              } rounded-lg`}
            >
              {/* Profile Picture */}
              <div className="flex-shrink-0">
                <div className="relative w-12 h-12 rounded-full overflow-hidden border border-gray-200 dark:border-gray-700">
                  <Image
                    src={notification.fromUser?.photoURL || "/images/default-avatar.png"}
                    alt={`${notification.fromUser?.displayName || "User"}'s profile picture`}
                    fill
                    className="object-cover"
                  />
                </div>
              </div>

              {/* Notification Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-semibold text-gray-900 dark:text-white hover:underline">
                        {notification.fromUser?.displayName || "Someone"}
                      </span>
                      {getNotificationIcon(notification.type)}
                    </div>
                    
                    <p className="text-sm text-gray-600 dark:text-gray-300 mb-1">
                      {notification.message}
                    </p>
                    
                    {/* Comment preview */}
                    {notification.commentInfo && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-2 rounded mt-2">
                        {notification.commentInfo.text}
                      </p>
                    )}
                    
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                      {getTimeAgo(notification.createdAt)}
                    </p>
                  </div>
                  
                  {/* Unread indicator */}
                  {!notification.read && (
                    <div className="flex-shrink-0 w-2 h-2 bg-blue-500 rounded-full mt-2"></div>
                  )}
                </div>

                {/* Video Thumbnail (for likes and comments) */}
                {notification.videoInfo && (notification.type === "like" || notification.type === "comment") && (
                  <div className="mt-3 flex items-center gap-3">
                    <div className="relative w-16 h-9 rounded overflow-hidden flex-shrink-0 border border-gray-200 dark:border-gray-700">
                      <Image
                        src={notification.videoInfo.thumbnailUrl}
                        alt={notification.videoInfo.title}
                        fill
                        className="object-cover"
                      />
                    </div>
                    <p className="text-xs text-gray-600 dark:text-gray-400 line-clamp-2 flex-1">
                      {notification.videoInfo.title}
                    </p>
                  </div>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Clear All Button */}
      {notifications.length > 0 && (
        <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={clearAllNotifications}
            className="w-full py-2.5 text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 border border-gray-200 dark:border-gray-700 rounded-lg hover:border-red-200 dark:hover:border-red-800 transition"
          >
            Clear All Notifications
          </button>
        </div>
      )}
    </div>
  );
}