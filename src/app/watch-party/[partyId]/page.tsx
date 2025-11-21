// src/app/watch-party/[partyId]/page.tsx
"use client";
import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { getAuth } from "firebase/auth";
import { db, realtimeDb } from "@/lib/firebase";
import { doc, getDoc, collection, query, orderBy, limit, onSnapshot, addDoc } from "firebase/firestore";
import { ref, onValue, set } from "firebase/database";
import Image from "next/image";

interface PartyData {
  partyId: string;
  videoId: string;
  videoTitle: string;
  videoThumbnail: string;
  hostId: string;
  hostName: string;
  title: string;
  participants: string[];
  status: string;
  createdAt: number;
}

interface PlaybackState {
  action: string;
  currentTime: number;
  timestamp: number;
  hostId: string;
  speed: number;
}

interface ChatMessage {
  id: string;
  userId: string;
  userName: string;
  userPhoto: string;
  message: string;
  timestamp: number;
}

interface Participant {
  userId: string;
  userName: string;
  userPhoto: string;
  isActive: boolean;
}

interface Following {
  id: string;
  username: string;
  displayName: string;
  photoURL: string;
}

interface Popup {
  id: string;
  type: 'info' | 'success' | 'error' | 'warning';
  title: string;
  message: string;
  duration?: number;
}

export default function WatchPartyPage() {
  const params = useParams();
  const partyId = params?.partyId as string;
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  const [party, setParty] = useState<PartyData | null>(null);
  const [video, setVideo] = useState<any>(null);
  const [user, setUser] = useState<any>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isHost, setIsHost] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [playbackState, setPlaybackState] = useState<PlaybackState | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [following, setFollowing] = useState<Following[]>([]);
  const [selectedInvitees, setSelectedInvitees] = useState<string[]>([]);
  const [isSendingInvites, setIsSendingInvites] = useState(false);
  const [isEndingParty, setIsEndingParty] = useState(false);
  const [showParticipants, setShowParticipants] = useState(false);
  const [partyEnded, setPartyEnded] = useState(false);
  const [popups, setPopups] = useState<Popup[]>([]);
  const [showEndPartyConfirm, setShowEndPartyConfirm] = useState(false);
  const [isSendingMessage, setIsSendingMessage] = useState(false);

  const [isClient, setIsClient] = useState(false);
  useEffect(() => setIsClient(true), []);

  // Add popup function
  const addPopup = useCallback((popup: Omit<Popup, 'id'>) => {
    const id = `popup-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const newPopup = { ...popup, id };
    setPopups(prev => [...prev, newPopup]);
    
    // Auto remove after duration
    const duration = popup.duration || 5000;
    setTimeout(() => {
      setPopups(prev => prev.filter(p => p.id !== id));
    }, duration);
  }, []);

  // Remove popup
  const removePopup = useCallback((id: string) => {
    setPopups(prev => prev.filter(p => p.id !== id));
  }, []);

  // Auto-scroll chat to bottom
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [chatMessages]);

  // Fetch party data
  useEffect(() => {
    if (!isClient || !partyId) return;

    const fetchPartyData = async () => {
      const auth = getAuth();
      
      await new Promise<void>((resolve) => {
        const unsubscribe = auth.onAuthStateChanged(() => {
          unsubscribe();
          resolve();
        });
      });

      const currentUser = auth.currentUser;
      
      if (!currentUser) {
        router.push("/login");
        return;
      }

      try {
        const idToken = await currentUser.getIdToken();
        setUser(currentUser);
        setToken(idToken);

        const partyDoc = await getDoc(doc(db, "watchParties", partyId));
        
        if (!partyDoc.exists()) {
          addPopup({
            type: 'error',
            title: 'Party Not Found',
            message: 'The watch party you are looking for does not exist.',
            duration: 4000
          });
          setTimeout(() => router.push("/"), 2000);
          return;
        }

        const partyData = partyDoc.data() as PartyData;
        
        // Check if party status is ended
        if (partyData.status === "ended") {
          setPartyEnded(true);
          addPopup({
            type: 'info',
            title: 'Party Ended',
            message: 'This watch party has ended by the host.',
            duration: 5000
          });
          return;
        }

        setParty(partyData);
        setIsHost(partyData.hostId === currentUser.uid);

        const videoDoc = await getDoc(doc(db, "videos", partyData.videoId));
        if (videoDoc.exists()) {
          setVideo(videoDoc.data());
        }

        // Fetch following list for invites
        if (partyData.hostId === currentUser.uid) {
          const userDoc = await getDoc(doc(db, "users", currentUser.uid));
          const userData = userDoc.data();
          const followingIds = userData?.following || [];

          const followingData = await Promise.all(
            followingIds.map(async (uid: string) => {
              const followDoc = await getDoc(doc(db, "users", uid));
              if (followDoc.exists()) {
                const data = followDoc.data();
                return {
                  id: uid,
                  username: data.username,
                  displayName: data.displayName,
                  photoURL: data.photoURL,
                };
              }
              return null;
            })
          );

          setFollowing(followingData.filter(Boolean) as Following[]);
        }

        // Add current user as participant if not already added
        const participantDoc = await getDoc(
          doc(db, `watchParties/${partyId}/participants`, currentUser.uid)
        );

        if (!participantDoc.exists()) {
          // Add user as participant using the API
          await fetch("/api/watch-party/join", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${idToken}`,
            },
            body: JSON.stringify({ partyId }),
          });
        }

        addPopup({
          type: 'success',
          title: 'Joined Party',
          message: `You've joined ${partyData.title}`,
          duration: 3000
        });

        setLoading(false);
      } catch (error) {
        console.error("Error fetching party data:", error);
        addPopup({
          type: 'error',
          title: 'Connection Error',
          message: 'Failed to connect to the watch party.',
          duration: 4000
        });
        router.push("/");
      }
    };

    const timeoutId = setTimeout(fetchPartyData, 100);
    return () => clearTimeout(timeoutId);
  }, [partyId, router, isClient, addPopup]);

  // Listen to party status changes (for when host ends party)
  useEffect(() => {
    if (!partyId || !isClient || !user) return;

    const partyRef = doc(db, "watchParties", partyId);
    const unsubscribe = onSnapshot(partyRef, (snapshot) => {
      if (!snapshot.exists()) {
        setPartyEnded(true);
        addPopup({
          type: 'info',
          title: 'Party Ended',
          message: 'This watch party has been ended.',
          duration: 5000
        });
        return;
      }

      const data = snapshot.data() as PartyData;
      
      if (data.status === "ended" && !isHost) {
        setPartyEnded(true);
        addPopup({
          type: 'info',
          title: 'Party Ended',
          message: 'The host has ended this watch party.',
          duration: 5000
        });
      }
    });

    return () => unsubscribe();
  }, [partyId, isClient, user, isHost, addPopup]);

  // Show party ended modal
  useEffect(() => {
    if (partyEnded && !isHost) {
      const timer = setTimeout(() => {
        router.push("/");
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [partyEnded, isHost, router]);

  // Listen to playback state
  useEffect(() => {
    if (!partyId || !isClient) return;

    const playbackRef = ref(realtimeDb, `watchParties/${partyId}/playback`);
    
    const unsubscribe = onValue(playbackRef, (snapshot) => {
      const data = snapshot.val() as PlaybackState;
      if (data) {
        setPlaybackState(data);
        syncVideo(data);
      }
    });

    return () => unsubscribe();
  }, [partyId, isClient]);

  // Listen to chat messages
  useEffect(() => {
    if (!partyId) return;

    const chatRef = collection(db, `watchParties/${partyId}/chat`);
    const q = query(chatRef, orderBy("timestamp", "desc"), limit(50));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const messages: ChatMessage[] = [];
      snapshot.forEach((doc) => {
        messages.push({ id: doc.id, ...doc.data() } as ChatMessage);
      });
      setChatMessages(messages.reverse());
    });

    return () => unsubscribe();
  }, [partyId]);

  // Listen to participants (real-time updates)
  useEffect(() => {
    if (!partyId) return;

    const participantsRef = collection(db, `watchParties/${partyId}/participants`);

    const unsubscribe = onSnapshot(participantsRef, (snapshot) => {
      const parts: Participant[] = [];
      snapshot.forEach((doc) => {
        parts.push(doc.data() as Participant);
      });
      setParticipants(parts);
    });

    return () => unsubscribe();
  }, [partyId]);

  // Heartbeat to update lastSeen
  useEffect(() => {
    if (!partyId || !user) return;

    const updateLastSeen = async () => {
      try {
        const participantRef = doc(db, `watchParties/${partyId}/participants`, user.uid);
        const participantDoc = await getDoc(participantRef);
        
        if (participantDoc.exists()) {
          await fetch("/api/watch-party/heartbeat", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ partyId }),
          }).catch(console.error);
        }
      } catch (error) {
        console.error("Error updating heartbeat:", error);
      }
    };

    // Update every 10 seconds
    const interval = setInterval(updateLastSeen, 10000);
    updateLastSeen(); // Call immediately

    return () => clearInterval(interval);
  }, [partyId, user, token]);

  // Cleanup on unmount - remove participant
  useEffect(() => {
    if (!partyId || !user) return;

    return () => {
      // Remove participant when leaving
      if (!isHost) {
        fetch("/api/watch-party/leave", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ partyId }),
        }).catch(console.error);
      }
    };
  }, [partyId, user, isHost, token]);

  const syncVideo = (state: PlaybackState) => {
    if (!videoRef.current || !state) return;

    const timeSinceUpdate = (Date.now() - state.timestamp) / 1000;
    const expectedTime = state.currentTime + (state.action === "play" ? timeSinceUpdate : 0);
    const currentTime = videoRef.current.currentTime;
    const drift = Math.abs(expectedTime - currentTime);

    if (drift > 1) {
      videoRef.current.currentTime = expectedTime;
    }

    if (state.action === "play" && videoRef.current.paused) {
      videoRef.current.play().catch(console.error);
    } else if (state.action === "pause" && !videoRef.current.paused) {
      videoRef.current.pause();
    }
  };

  const updatePlaybackState = async (action: string, currentTime?: number) => {
    if (!isHost || !partyId || !videoRef.current) return;

    const playbackRef = ref(realtimeDb, `watchParties/${partyId}/playback`);
    await set(playbackRef, {
      action,
      currentTime: currentTime ?? videoRef.current.currentTime,
      timestamp: Date.now(),
      hostId: user.uid,
      speed: 1.0,
    });
  };

  // Handle fullscreen for participants
  const handleFullscreen = useCallback(() => {
    if (!videoRef.current) return;
    
    const videoElement = videoRef.current;
    
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(console.error);
    } else {
      videoElement.requestFullscreen().catch(console.error);
    }
  }, []);

  const sendMessage = async () => {
    if (!newMessage.trim() || !partyId || !user || isSendingMessage) return;

    const messageText = newMessage.trim();
    const tempId = `temp-${Date.now()}`;

    setIsSendingMessage(true);

    // Optimistically add message to UI
    const optimisticMessage: ChatMessage = {
      id: tempId,
      userId: user.uid,
      userName: user.displayName || user.email || "You",
      userPhoto: user.photoURL || "/images/default-avatar.png",
      message: messageText,
      timestamp: Date.now(),
    };

    setChatMessages((prev) => [...prev, optimisticMessage]);
    setNewMessage("");

    // Send to backend
    try {
      if (token) {
        await fetch("/api/watch-party/chat", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            partyId,
            message: messageText,
          }),
        });
      } else {
        // Fallback: directly add to Firestore
        await addDoc(collection(db, `watchParties/${partyId}/chat`), {
          userId: user.uid,
          userName: user.displayName || user.email || "You",
          userPhoto: user.photoURL || "/images/default-avatar.png",
          message: messageText,
          timestamp: Date.now(),
          type: "message",
        });
      }
    } catch (error) {
      console.error("Error sending message:", error);
      // Remove optimistic message on error
      setChatMessages((prev) => prev.filter((msg) => msg.id !== tempId));
      addPopup({
        type: 'error',
        title: 'Message Failed',
        message: 'Failed to send message. Please try again.',
        duration: 3000
      });
    } finally {
      setIsSendingMessage(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const sendInvites = async () => {
    if (selectedInvitees.length === 0 || !token) return;

    setIsSendingInvites(true);

    try {
      await fetch("/api/watch-party/invite", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          partyId,
          inviteeIds: selectedInvitees,
        }),
      });

      addPopup({
        type: 'success',
        title: 'Invites Sent',
        message: `Invited ${selectedInvitees.length} friend${selectedInvitees.length !== 1 ? 's' : ''} to the watch party!`,
        duration: 4000
      });
      setShowInviteModal(false);
      setSelectedInvitees([]);
    } catch (error) {
      console.error("Error sending invites:", error);
      addPopup({
        type: 'error',
        title: 'Invite Failed',
        message: 'Failed to send invites. Please try again.',
        duration: 4000
      });
    } finally {
      setIsSendingInvites(false);
    }
  };

  const endParty = async () => {
    if (!isHost || !token) return;

    setIsEndingParty(true);

    try {
      await fetch("/api/watch-party/end", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ partyId }),
      });

      addPopup({
        type: 'success',
        title: 'Party Ended',
        message: 'Watch party has been ended successfully.',
        duration: 3000
      });

      router.push(`/watch/${party?.videoId}`);
    } catch (error) {
      console.error("Error ending party:", error);
      addPopup({
        type: 'error',
        title: 'Failed to End Party',
        message: 'Please try again.',
        duration: 4000
      });
    } finally {
      setIsEndingParty(false);
      setShowEndPartyConfirm(false);
    }
  };

  if (!isClient) {
    return (
      <div className="h-screen bg-gray-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-purple-500"></div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="h-screen bg-gray-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-purple-500"></div>
      </div>
    );
  }

  // Party Ended Modal for non-hosts
  if (partyEnded && !isHost) {
    return (
      <div className="h-screen bg-gray-900 flex items-center justify-center p-4">
        <div className="bg-gray-800 rounded-2xl p-8 max-w-md w-full text-center border border-gray-700">
          <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">Watch Party Ended</h2>
          <p className="text-gray-400 mb-6">The host has ended this watch party.</p>
          <p className="text-gray-500 text-sm">Redirecting to home page in 5 seconds...</p>
        </div>
      </div>
    );
  }

  if (!party || !video) {
    return (
      <div className="h-screen bg-gray-900 flex items-center justify-center text-white">
        <p>Party not found</p>
      </div>
    );
  }

  return (
    <div className="h-screen bg-gray-900 flex flex-col">
      {/* Popup Container */}
      <div className="fixed top-4 right-4 z-50 space-y-2 max-w-sm w-full sm:w-auto">
        {popups.map((popup) => (
          <div
            key={popup.id}
            className={`p-4 rounded-xl border backdrop-blur-lg shadow-lg transform transition-all duration-300 ${
              popup.type === 'success' 
                ? 'bg-green-500/20 border-green-500/50 text-green-100' 
                : popup.type === 'error'
                ? 'bg-red-500/20 border-red-500/50 text-red-100'
                : popup.type === 'warning'
                ? 'bg-yellow-500/20 border-yellow-500/50 text-yellow-100'
                : 'bg-blue-500/20 border-blue-500/50 text-blue-100'
            }`}
          >
            <div className="flex items-start gap-3">
              <div className="flex-1">
                <h3 className="font-semibold text-sm">{popup.title}</h3>
                <p className="text-xs mt-1 opacity-90">{popup.message}</p>
              </div>
              <button
                onClick={() => removePopup(popup.id)}
                className="flex-shrink-0 text-current hover:opacity-70 transition-opacity"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Header - Mobile Optimized */}
      <div className="bg-gray-800 border-b border-gray-700 px-4 sm:px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="w-10 h-10 bg-gradient-to-r from-purple-500 to-pink-500 rounded-xl flex items-center justify-center shadow-lg flex-shrink-0">
            <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
              <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z" />
            </svg>
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-white font-semibold text-base sm:text-lg truncate">{party.title}</h1>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <button
                onClick={() => setShowParticipants(!showParticipants)}
                className="text-gray-400 hover:text-white transition flex items-center gap-1 text-xs bg-gray-700/50 px-2 py-1 rounded-full"
              >
                <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse"></span>
                {participants.length}
                <svg className={`w-3 h-3 transition-transform ${showParticipants ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              <span className="text-gray-500 text-xs">•</span>
              <span className="text-gray-300 text-xs truncate">{isHost ? "You are hosting" : `Host: ${party.hostName}`}</span>
            </div>
          </div>
        </div>
        
        <div className="flex gap-2 ml-3 flex-shrink-0">
          {isHost && (
            <>
              <button
                onClick={() => setShowInviteModal(true)}
                className="px-3 py-2 sm:px-4 sm:py-2 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white rounded-xl transition-all duration-200 text-xs sm:text-sm font-medium shadow-lg hover:shadow-purple-500/25 flex items-center gap-1.5"
              >
                <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                <span className="hidden sm:inline">Invite</span>
              </button>
              <button
                onClick={() => setShowEndPartyConfirm(true)}
                disabled={isEndingParty}
                className="px-3 py-2 sm:px-4 sm:py-2 bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-700 hover:to-orange-700 text-white rounded-xl transition-all duration-200 text-xs sm:text-sm font-medium shadow-lg hover:shadow-red-500/25 disabled:opacity-50 flex items-center gap-1.5"
              >
                {isEndingParty ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    <span className="hidden sm:inline">Ending...</span>
                  </>
                ) : (
                  <>
                    <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    <span className="hidden sm:inline">End</span>
                  </>
                )}
              </button>
            </>
          )}
          {!isHost && (
            <button
              onClick={() => router.push(`/watch/${party.videoId}`)}
              className="px-3 py-2 sm:px-4 sm:py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-xl transition-all duration-200 text-xs sm:text-sm font-medium shadow-lg flex items-center gap-1.5"
            >
              <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
              <span className="hidden sm:inline">Leave</span>
            </button>
          )}
        </div>
      </div>

      {/* Participants Dropdown */}
      {showParticipants && (
        <div className="bg-gray-800 border-b border-gray-700">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 py-3">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
              {participants.map((participant) => (
                <div key={participant.userId} className="flex items-center gap-2 p-2 rounded-xl bg-gray-700/30 hover:bg-gray-700/50 transition-all duration-200">
                  <div className="relative w-8 h-8 rounded-xl overflow-hidden border-2 border-gray-600">
                    <Image
                      src={participant.userPhoto}
                      alt={participant.userName}
                      fill
                      className="object-cover"
                      sizes="32px"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-medium text-xs truncate">{participant.userName}</p>
                    {participant.userId === party.hostId && (
                      <span className="text-[10px] bg-gradient-to-r from-purple-500 to-pink-500 text-white px-1.5 py-0.5 rounded-full">Host</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Main Content - Mobile Responsive */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* Video Section */}
        <div className="flex-1 flex flex-col bg-black">
          <div className="flex-1 flex items-center justify-center p-2 sm:p-4">
            <div className="w-full max-w-6xl aspect-video bg-black rounded-xl overflow-hidden shadow-2xl border border-gray-700 relative">
              <video
                ref={videoRef}
                className="w-full h-full object-contain"
                src={video.videoUrl}
                poster={video.thumbnailUrl}
                controls={isHost}
                controlsList={isHost ? undefined : "nodownload nofullscreen noremoteplayback"}
                disablePictureInPicture={!isHost}
                disableRemotePlayback={!isHost}
                onPlay={() => isHost && updatePlaybackState("play")}
                onPause={() => isHost && updatePlaybackState("pause")}
                onSeeked={() => isHost && videoRef.current && updatePlaybackState("seek", videoRef.current.currentTime)}
                onContextMenu={(e) => !isHost && e.preventDefault()}
              >
                Your browser does not support the video tag.
              </video>
              
              {/* Fullscreen button for participants */}
              {!isHost && (
                <button
                  onClick={handleFullscreen}
                  className="absolute bottom-3 right-3 bg-black/60 hover:bg-black/80 text-white p-2 rounded-lg backdrop-blur-sm transition-all duration-200 z-10"
                >
                  <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                  </svg>
                </button>
              )}
              
              {/* Host badge */}
              {isHost && (
                <div className="absolute top-3 left-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white px-3 py-1.5 rounded-full text-xs font-medium backdrop-blur-sm">
                  Controlling Playback
                </div>
              )}
            </div>
          </div>
          
          <div className="bg-gray-800 p-4 border-t border-gray-700">
            <h2 className="text-white font-semibold text-lg sm:text-xl mb-2 line-clamp-2">{video.title}</h2>
            <p className="text-gray-400 text-sm">
              {isHost 
                ? "You are controlling playback for everyone" 
                : "Host is controlling playback - Use fullscreen for better experience"
              }
            </p>
          </div>
        </div>

        {/* Chat Sidebar - Hidden on mobile by default, can be toggled */}
        <div className="w-full lg:w-96 bg-gray-800 border-l border-gray-700 flex flex-col">
          <div className="p-4 border-b border-gray-700">
            <h3 className="text-white font-semibold text-base sm:text-lg flex items-center gap-2">
              <svg className="w-4 h-4 sm:w-5 sm:h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              Party Chat
            </h3>
          </div>

          <div 
            ref={chatContainerRef}
            className="flex-1 overflow-y-auto p-4 space-y-3"
          >
            {chatMessages.length === 0 ? (
              <div className="text-center text-gray-500 mt-8">
                <div className="w-12 h-12 sm:w-16 sm:h-16 bg-gray-700/50 rounded-full flex items-center justify-center mx-auto mb-3 sm:mb-4">
                  <svg className="w-6 h-6 sm:w-8 sm:h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                </div>
                <p className="font-medium text-sm sm:text-base">No messages yet</p>
                <p className="text-xs sm:text-sm mt-1">Start the conversation!</p>
              </div>
            ) : (
              chatMessages.map((msg) => {
                const isOwnMessage = msg.userId === user?.uid;
                return (
                  <div key={msg.id} className={`flex gap-2 sm:gap-3 ${isOwnMessage ? 'flex-row-reverse' : ''}`}>
                    {!isOwnMessage && (
                      <div className="relative w-8 h-8 sm:w-10 sm:h-10 rounded-xl overflow-hidden flex-shrink-0 border-2 border-gray-600">
                        <Image
                          src={msg.userPhoto || "/images/default-avatar.png"}
                          alt={msg.userName}
                          fill
                          className="object-cover"
                          sizes="40px"
                        />
                      </div>
                    )}
                    <div className={`flex-1 ${isOwnMessage ? 'text-right' : ''}`}>
                      <div className={`flex items-baseline gap-1.5 sm:gap-2 ${isOwnMessage ? 'justify-end' : ''}`}>
                        {!isOwnMessage && (
                          <span className="text-white font-medium text-xs sm:text-sm">{msg.userName}</span>
                        )}
                        <span className="text-gray-500 text-[10px] sm:text-xs">
                          {new Date(msg.timestamp).toLocaleTimeString([], { 
                            hour: '2-digit', 
                            minute: '2-digit' 
                          })}
                        </span>
                        {isOwnMessage && (
                          <span className="text-white font-medium text-xs sm:text-sm">You</span>
                        )}
                      </div>
                      <div className={`mt-1 ${isOwnMessage ? 'flex justify-end' : ''}`}>
                        <p className={`inline-block px-3 py-2 sm:px-4 sm:py-2 rounded-2xl text-xs sm:text-sm max-w-[85%] ${
                          isOwnMessage 
                            ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white' 
                            : 'bg-gray-700/60 text-gray-100'
                        }`}>
                          {msg.message}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
            <div ref={chatEndRef} />
          </div>

          <div className="p-4 border-t border-gray-700">
            <div className="flex gap-2 sm:gap-3">
              <input
                type="text"
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Type a message..."
                className="flex-1 px-3 py-2 sm:px-4 sm:py-3 bg-gray-700 text-white rounded-xl border border-gray-600 focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 text-sm sm:text-base"
              />
              <button
                onClick={sendMessage}
                disabled={!newMessage.trim() || isSendingMessage}
                className="px-3 py-2 sm:px-4 sm:py-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl hover:from-purple-600 hover:to-pink-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-lg hover:shadow-purple-500/25 flex items-center justify-center"
              >
                {isSendingMessage ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                ) : (
                  <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
                  </svg>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Invite Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-lg flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-2xl max-w-md w-full max-h-[80vh] flex flex-col border border-gray-700 shadow-2xl">
            <div className="p-4 sm:p-6 border-b border-gray-700 flex items-center justify-between">
              <h2 className="text-lg sm:text-xl font-bold text-white">Invite Friends</h2>
              <button
                onClick={() => setShowInviteModal(false)}
                className="text-gray-400 hover:text-white transition-colors p-1 rounded-lg hover:bg-gray-700/50"
              >
                <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 sm:p-6">
              {following.length === 0 ? (
                <div className="text-center py-6 sm:py-8">
                  <div className="w-12 h-12 sm:w-16 sm:h-16 bg-gray-700/50 rounded-full flex items-center justify-center mx-auto mb-3 sm:mb-4">
                    <svg className="w-6 h-6 sm:w-8 sm:h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
                    </svg>
                  </div>
                  <p className="text-gray-400 text-sm sm:text-base">You don't follow anyone yet</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {following.map((friend) => (
                    <label
                      key={friend.id}
                      className="flex items-center gap-3 p-2 sm:p-3 rounded-xl hover:bg-gray-700 cursor-pointer transition-all duration-200"
                    >
                      <input
                        type="checkbox"
                        checked={selectedInvitees.includes(friend.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedInvitees([...selectedInvitees, friend.id]);
                          } else {
                            setSelectedInvitees(selectedInvitees.filter((id) => id !== friend.id));
                          }
                        }}
                        className="w-4 h-4 sm:w-5 sm:h-5 text-purple-500 bg-gray-700 border-gray-600 rounded focus:ring-purple-500 focus:ring-2"
                      />
                      <div className="relative w-10 h-10 sm:w-12 sm:h-12 rounded-xl overflow-hidden border-2 border-gray-600">
                        <Image
                          src={friend.photoURL || "/images/default-avatar.png"}
                          alt={friend.displayName}
                          fill
                          className="object-cover"
                          sizes="48px"
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-white font-medium text-sm sm:text-base truncate">{friend.displayName}</p>
                        <p className="text-gray-400 text-xs sm:text-sm truncate">@{friend.username}</p>
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </div>

            <div className="p-4 sm:p-6 border-t border-gray-700">
              <button
                onClick={sendInvites}
                disabled={selectedInvitees.length === 0 || isSendingInvites}
                className="w-full py-3 sm:py-4 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl hover:from-purple-600 hover:to-pink-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 font-medium shadow-lg hover:shadow-purple-500/25 flex items-center justify-center gap-2 text-sm sm:text-base"
              >
                {isSendingInvites ? (
                  <>
                    <div className="w-4 h-4 sm:w-5 sm:h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    Sending...
                  </>
                ) : (
                  `Invite ${selectedInvitees.length} friend${selectedInvitees.length !== 1 ? 's' : ''}`
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* End Party Confirmation Modal */}
      {showEndPartyConfirm && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-lg flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-2xl max-w-sm w-full border border-gray-700 shadow-2xl">
            <div className="p-6 text-center">
              <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-white mb-2">End Watch Party?</h3>
              <p className="text-gray-300 mb-6">
                This will end the party for all participants. This action cannot be undone.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowEndPartyConfirm(false)}
                  className="flex-1 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-xl transition-all duration-200 font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={endParty}
                  disabled={isEndingParty}
                  className="flex-1 py-3 bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-700 hover:to-orange-700 text-white rounded-xl transition-all duration-200 font-medium disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isEndingParty ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      Ending...
                    </>
                  ) : (
                    'End Party'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}