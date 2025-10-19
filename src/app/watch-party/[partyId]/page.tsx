//src/app/watch-party/[partyId]/page.tsx
"use client";
import { useEffect, useState, useRef, useCallback, Suspense } from "react";
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

function WatchPartyContent() {
  const params = useParams();
  const partyId = params?.partyId as string;
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const [party, setParty] = useState<PartyData | null>(null);
  const [video, setVideo] = useState<any>(null);
  const [user, setUser] = useState<any>(null);
  const [token, setToken] = useState<string | null>(null);
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

  // Auto-scroll chat to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  // Fetch party data with optimizations
  useEffect(() => {
    if (!partyId) return;

    const fetchPartyData = async () => {
      const auth = getAuth();
      
      // Wait for auth to initialize
      await new Promise<void>((resolve) => {
        const unsubscribe = auth.onAuthStateChanged((user) => {
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

        const [partyDoc, userDoc] = await Promise.all([
          getDoc(doc(db, "watchParties", partyId)),
          getDoc(doc(db, "users", currentUser.uid))
        ]);
        
        if (!partyDoc.exists()) {
          alert("Watch party not found");
          router.push("/");
          return;
        }

        const partyData = partyDoc.data() as PartyData;
        
        if (partyData.status === "ended") {
          setPartyEnded(true);
          return;
        }

        setParty(partyData);
        setIsHost(partyData.hostId === currentUser.uid);

        // Fetch video data
        const videoDoc = await getDoc(doc(db, "videos", partyData.videoId));
        if (videoDoc.exists()) {
          setVideo(videoDoc.data());
        }

        // Fetch following list for invites (only if host)
        if (partyData.hostId === currentUser.uid) {
          const userData = userDoc.data();
          const followingIds = userData?.following || [];

          if (followingIds.length > 0) {
            const followingPromises = followingIds.map(async (uid: string) => {
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
            });

            const followingData = await Promise.all(followingPromises);
            setFollowing(followingData.filter(Boolean) as Following[]);
          }
        }

        // Add user as participant if not already
        const participantDoc = await getDoc(
          doc(db, `watchParties/${partyId}/participants`, currentUser.uid)
        );

        if (!participantDoc.exists()) {
          await fetch("/api/watch-party/join", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${idToken}`,
            },
            body: JSON.stringify({ partyId }),
          });
        }
      } catch (error) {
        console.error("Error fetching party data:", error);
        router.push("/");
      }
    };

    fetchPartyData();
  }, [partyId, router]);

  // Real-time listeners with optimized updates
  useEffect(() => {
    if (!partyId || !user) return;

    // Party status listener
    const partyRef = doc(db, "watchParties", partyId);
    const unsubscribeParty = onSnapshot(partyRef, (snapshot) => {
      if (!snapshot.exists()) {
        setPartyEnded(true);
        return;
      }

      const data = snapshot.data() as PartyData;
      if (data.status === "ended" && !isHost) {
        setPartyEnded(true);
      }
    });

    // Playback state listener
    const playbackRef = ref(realtimeDb, `watchParties/${partyId}/playback`);
    const unsubscribePlayback = onValue(playbackRef, (snapshot) => {
      const data = snapshot.val() as PlaybackState;
      if (data) {
        setPlaybackState(data);
        syncVideo(data);
      }
    });

    // Chat messages listener
    const chatRef = collection(db, `watchParties/${partyId}/chat`);
    const chatQuery = query(chatRef, orderBy("timestamp", "desc"), limit(50));
    const unsubscribeChat = onSnapshot(chatQuery, (snapshot) => {
      const messages: ChatMessage[] = [];
      snapshot.forEach((doc) => {
        messages.push({ id: doc.id, ...doc.data() } as ChatMessage);
      });
      setChatMessages(messages.reverse());
    });

    // Participants listener
    const participantsRef = collection(db, `watchParties/${partyId}/participants`);
    const unsubscribeParticipants = onSnapshot(participantsRef, (snapshot) => {
      const parts: Participant[] = [];
      snapshot.forEach((doc) => {
        parts.push(doc.data() as Participant);
      });
      setParticipants(parts);
    });

    return () => {
      unsubscribeParty();
      unsubscribePlayback();
      unsubscribeChat();
      unsubscribeParticipants();
    };
  }, [partyId, user, isHost]);

  // Party ended redirect
  useEffect(() => {
    if (partyEnded && !isHost) {
      const timer = setTimeout(() => {
        router.push("/");
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [partyEnded, isHost, router]);

  const syncVideo = useCallback((state: PlaybackState) => {
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
  }, []);

  const updatePlaybackState = useCallback(async (action: string, currentTime?: number) => {
    if (!isHost || !partyId || !videoRef.current) return;

    const playbackRef = ref(realtimeDb, `watchParties/${partyId}/playback`);
    await set(playbackRef, {
      action,
      currentTime: currentTime ?? videoRef.current.currentTime,
      timestamp: Date.now(),
      hostId: user.uid,
      speed: 1.0,
    });
  }, [isHost, partyId, user]);

  const sendMessage = useCallback(async () => {
    if (!newMessage.trim() || !partyId || !user) return;

    const messageText = newMessage.trim();
    const tempId = `temp-${Date.now()}`;

    // Optimistic update
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
      setChatMessages((prev) => prev.filter((msg) => msg.id !== tempId));
    }
  }, [newMessage, partyId, user, token]);

  const sendInvites = useCallback(async () => {
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

      alert(`Invited ${selectedInvitees.length} friend(s) to watch party!`);
      setShowInviteModal(false);
      setSelectedInvitees([]);
    } catch (error) {
      console.error("Error sending invites:", error);
      alert("Failed to send invites");
    } finally {
      setIsSendingInvites(false);
    }
  }, [selectedInvitees, token, partyId]);

  const endParty = useCallback(async () => {
    if (!isHost || !token) return;

    if (!confirm("Are you sure you want to end this watch party? All participants will be removed.")) return;

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

      router.push(`/watch/${party?.videoId}`);
    } catch (error) {
      console.error("Error ending party:", error);
      alert("Failed to end party");
    } finally {
      setIsEndingParty(false);
    }
  }, [isHost, token, partyId, party, router]);

  const handleKeyPress = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }, [sendMessage]);

  // Party Ended Modal for non-hosts
  if (partyEnded && !isHost) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 to-black flex items-center justify-center p-4">
        <div className="bg-gray-800/80 backdrop-blur-lg rounded-2xl p-8 max-w-md w-full text-center border border-gray-700/50 shadow-2xl">
          <div className="w-20 h-20 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="w-10 h-10 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-white mb-3">Watch Party Ended</h2>
          <p className="text-gray-300 mb-6">The host has ended this watch party.</p>
          <div className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin mx-auto"></div>
        </div>
      </div>
    );
  }

  if (!party || !video) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 to-black flex items-center justify-center text-white">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p>Loading party...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 to-black flex flex-col">
      {/* Header */}
      <div className="bg-gray-800/80 backdrop-blur-lg border-b border-gray-700/50 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-gradient-to-r from-purple-500 to-pink-500 rounded-xl flex items-center justify-center shadow-lg">
            <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 20 20">
              <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z" />
            </svg>
          </div>
          <div>
            <h1 className="text-white font-bold text-lg">{party.title}</h1>
            <div className="flex items-center gap-3 mt-1">
              <button
                onClick={() => setShowParticipants(!showParticipants)}
                className="text-gray-300 hover:text-white transition flex items-center gap-2 text-sm bg-gray-700/50 px-3 py-1 rounded-full"
              >
                <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></span>
                {participants.length} watching
                <svg className={`w-4 h-4 transition-transform ${showParticipants ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              <span className="text-gray-400 text-sm">•</span>
              <span className="text-gray-300 text-sm">{isHost ? "You are hosting" : `Hosted by ${party.hostName}`}</span>
            </div>
          </div>
        </div>
        
        <div className="flex gap-3">
          {isHost && (
            <>
              <button
                onClick={() => setShowInviteModal(true)}
                className="px-5 py-2.5 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white rounded-xl transition-all duration-200 text-sm font-medium shadow-lg hover:shadow-purple-500/25 flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Invite
              </button>
              <button
                onClick={endParty}
                disabled={isEndingParty}
                className="px-5 py-2.5 bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-700 hover:to-orange-700 text-white rounded-xl transition-all duration-200 text-sm font-medium shadow-lg hover:shadow-red-500/25 disabled:opacity-50 flex items-center gap-2"
              >
                {isEndingParty ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    Ending...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    End Party
                  </>
                )}
              </button>
            </>
          )}
          {!isHost && (
            <button
              onClick={() => router.push(`/watch/${party.videoId}`)}
              className="px-5 py-2.5 bg-gray-700 hover:bg-gray-600 text-white rounded-xl transition-all duration-200 text-sm font-medium shadow-lg flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
              Leave
            </button>
          )}
        </div>
      </div>

      {/* Participants Dropdown */}
      {showParticipants && (
        <div className="bg-gray-800/60 backdrop-blur-lg border-b border-gray-700/50">
          <div className="max-w-4xl mx-auto px-6 py-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {participants.map((participant) => (
                <div key={participant.userId} className="flex items-center gap-3 p-3 rounded-xl bg-gray-700/30 hover:bg-gray-700/50 transition-all duration-200">
                  <div className="relative w-10 h-10 rounded-xl overflow-hidden border-2 border-gray-600">
                    <Image
                      src={participant.userPhoto}
                      alt={participant.userName}
                      fill
                      className="object-cover"
                      sizes="40px"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-medium text-sm truncate">{participant.userName}</p>
                    {participant.userId === party.hostId && (
                      <span className="text-xs bg-gradient-to-r from-purple-500 to-pink-500 text-white px-2 py-0.5 rounded-full">Host</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* Video Section */}
        <div className="flex-1 flex flex-col bg-black/40">
          <div className="flex-1 flex items-center justify-center p-4 lg:p-8">
            <div className="w-full max-w-6xl aspect-video bg-black rounded-2xl overflow-hidden shadow-2xl border border-gray-700/50">
              <video
                ref={videoRef}
                className="w-full h-full object-contain"
                src={video.videoUrl}
                poster={video.thumbnailUrl}
                controls={isHost}
                onPlay={() => isHost && updatePlaybackState("play")}
                onPause={() => isHost && updatePlaybackState("pause")}
                onSeeked={() => isHost && videoRef.current && updatePlaybackState("seek", videoRef.current.currentTime)}
              >
                Your browser does not support the video tag.
              </video>
            </div>
          </div>
          
          <div className="bg-gray-800/60 backdrop-blur-lg p-6 border-t border-gray-700/50">
            <div className="max-w-6xl mx-auto">
              <h2 className="text-white font-bold text-xl mb-2">{video.title}</h2>
              <p className="text-gray-300">
                {isHost ? "You are controlling playback for everyone" : "Host is controlling playback"}
              </p>
            </div>
          </div>
        </div>

        {/* Chat Sidebar */}
        <div className="w-full lg:w-96 xl:w-[420px] bg-gray-800/60 backdrop-blur-lg border-l border-gray-700/50 flex flex-col">
          <div className="p-6 border-b border-gray-700/50">
            <h3 className="text-white font-bold text-lg flex items-center gap-2">
              <svg className="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              Party Chat
            </h3>
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {chatMessages.length === 0 ? (
              <div className="text-center text-gray-400 mt-8">
                <div className="w-16 h-16 bg-gray-700/50 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                </div>
                <p className="font-medium">No messages yet</p>
                <p className="text-sm mt-1">Start the conversation!</p>
              </div>
            ) : (
              chatMessages.map((msg) => {
                const isOwnMessage = msg.userId === user?.uid;
                return (
                  <div key={msg.id} className={`flex gap-3 ${isOwnMessage ? 'flex-row-reverse' : ''}`}>
                    {!isOwnMessage && (
                      <div className="relative w-10 h-10 rounded-xl overflow-hidden flex-shrink-0 border-2 border-gray-600">
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
                      <div className={`flex items-baseline gap-2 ${isOwnMessage ? 'justify-end' : ''}`}>
                        {!isOwnMessage && (
                          <span className="text-white font-medium text-sm">{msg.userName}</span>
                        )}
                        <span className="text-gray-400 text-xs">
                          {new Date(msg.timestamp).toLocaleTimeString([], { 
                            hour: '2-digit', 
                            minute: '2-digit' 
                          })}
                        </span>
                        {isOwnMessage && (
                          <span className="text-white font-medium text-sm">You</span>
                        )}
                      </div>
                      <div className={`mt-1 ${isOwnMessage ? 'flex justify-end' : ''}`}>
                        <p className={`inline-block px-4 py-2 rounded-2xl text-sm max-w-[80%] ${
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

          <div className="p-6 border-t border-gray-700/50">
            <div className="flex gap-3">
              <input
                type="text"
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Type a message..."
                className="flex-1 px-4 py-3 bg-gray-700/50 text-white rounded-xl border border-gray-600 focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 backdrop-blur-lg"
              />
              <button
                onClick={sendMessage}
                disabled={!newMessage.trim()}
                className="px-6 py-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl hover:from-purple-600 hover:to-pink-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-lg hover:shadow-purple-500/25 flex items-center gap-2"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Invite Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-lg flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800/90 backdrop-blur-lg rounded-2xl max-w-md w-full max-h-[80vh] flex flex-col border border-gray-700/50 shadow-2xl">
            <div className="p-6 border-b border-gray-700/50 flex items-center justify-between">
              <h2 className="text-xl font-bold text-white">Invite Friends</h2>
              <button
                onClick={() => setShowInviteModal(false)}
                className="text-gray-400 hover:text-white transition-colors p-1 rounded-lg hover:bg-gray-700/50"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              {following.length === 0 ? (
                <div className="text-center py-8">
                  <div className="w-16 h-16 bg-gray-700/50 rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
                    </svg>
                  </div>
                  <p className="text-gray-400">You don't follow anyone yet</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {following.map((friend) => (
                    <label
                      key={friend.id}
                      className="flex items-center gap-4 p-3 rounded-xl hover:bg-gray-700/50 cursor-pointer transition-all duration-200"
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
                        className="w-5 h-5 text-purple-500 bg-gray-700 border-gray-600 rounded focus:ring-purple-500 focus:ring-2"
                      />
                      <div className="relative w-12 h-12 rounded-xl overflow-hidden border-2 border-gray-600">
                        <Image
                          src={friend.photoURL || "/images/default-avatar.png"}
                          alt={friend.displayName}
                          fill
                          className="object-cover"
                          sizes="48px"
                        />
                      </div>
                      <div className="flex-1">
                        <p className="text-white font-medium">{friend.displayName}</p>
                        <p className="text-gray-400 text-sm">@{friend.username}</p>
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </div>

            <div className="p-6 border-t border-gray-700/50">
              <button
                onClick={sendInvites}
                disabled={selectedInvitees.length === 0 || isSendingInvites}
                className="w-full py-4 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl hover:from-purple-600 hover:to-pink-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 font-medium shadow-lg hover:shadow-purple-500/25 flex items-center justify-center gap-2"
              >
                {isSendingInvites ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
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
    </div>
  );
}

export default function WatchPartyPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-gray-900 to-black flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-white">Loading watch party...</p>
        </div>
      </div>
    }>
      <WatchPartyContent />
    </Suspense>
  );
}