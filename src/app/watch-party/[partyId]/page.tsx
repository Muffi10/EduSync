//src/app/watch-party/[partyId]/page.tsx
"use client";
import { useEffect, useState, useRef } from "react";
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

export default function WatchPartyPage() {
  const params = useParams();
  const partyId = params?.partyId as string;
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

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

  const [isClient, setIsClient] = useState(false);
  useEffect(() => setIsClient(true), []);

  // Auto-scroll chat to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
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
          alert("Watch party not found");
          router.push("/");
          return;
        }

        const partyData = partyDoc.data() as PartyData;
        
        // Check if party status is ended
        if (partyData.status === "ended") {
          setPartyEnded(true);
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

        setLoading(false);
      } catch (error) {
        console.error("Error fetching party data:", error);
        router.push("/");
      }
    };

    const timeoutId = setTimeout(fetchPartyData, 100);
    return () => clearTimeout(timeoutId);
  }, [partyId, router, isClient]);

  // Listen to party status changes (for when host ends party)
  useEffect(() => {
    if (!partyId || !isClient || !user) return;

    const partyRef = doc(db, "watchParties", partyId);
    const unsubscribe = onSnapshot(partyRef, (snapshot) => {
      if (!snapshot.exists()) {
        setPartyEnded(true);
        return;
      }

      const data = snapshot.data() as PartyData;
      
      if (data.status === "ended" && !isHost) {
        setPartyEnded(true);
      }
    });

    return () => unsubscribe();
  }, [partyId, isClient, user, isHost]);

  // Show party ended modal
  useEffect(() => {
    if (partyEnded && !isHost) {
      const timer = setTimeout(() => {
        router.push("/");
      }, 3000);
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

  const sendMessage = async () => {
    if (!newMessage.trim() || !partyId || !user) return;

    const messageText = newMessage.trim();
    const tempId = `temp-${Date.now()}`;

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

      alert(`Invited ${selectedInvitees.length} friend(s) to watch party!`);
      setShowInviteModal(false);
      setSelectedInvitees([]);
    } catch (error) {
      console.error("Error sending invites:", error);
      alert("Failed to send invites");
    } finally {
      setIsSendingInvites(false);
    }
  };

  const endParty = async () => {
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
  };

  const handleLeaveParty = () => {
    if (isHost) {
      endParty();
    } else {
      router.push(`/watch/${party?.videoId}`);
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
      <div className="h-screen bg-gray-900 flex items-center justify-center">
        <div className="bg-gray-800 rounded-lg p-8 max-w-md text-center">
          <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">Watch Party Ended</h2>
          <p className="text-gray-400 mb-6">The host has ended this watch party.</p>
          <p className="text-gray-500 text-sm">Redirecting to home page...</p>
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
      {/* Header */}
      <div className="bg-gray-800 border-b border-gray-700 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full flex items-center justify-center">
            <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 20 20">
              <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z" />
            </svg>
          </div>
          <div>
            <h1 className="text-white font-semibold">{party.title}</h1>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowParticipants(!showParticipants)}
                className="text-gray-400 text-sm hover:text-white transition flex items-center gap-1"
              >
                {participants.length} watching
                <svg className={`w-4 h-4 transition-transform ${showParticipants ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          {isHost && (
            <>
              <button
                onClick={() => setShowInviteModal(true)}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition text-sm"
              >
                Invite Friends
              </button>
              <button
                onClick={endParty}
                disabled={isEndingParty}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition text-sm disabled:opacity-50"
              >
                {isEndingParty ? "Ending..." : "End Party"}
              </button>
            </>
          )}
          {!isHost && (
            <button
              onClick={() => router.push(`/watch/${party.videoId}`)}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition text-sm"
            >
              Leave Party
            </button>
          )}
        </div>
      </div>

      {/* Participants Dropdown */}
      {showParticipants && (
        <div className="bg-gray-800 border-b border-gray-700 px-6 py-3">
          <div className="max-h-40 overflow-y-auto space-y-2">
            {participants.map((participant) => (
              <div key={participant.userId} className="flex items-center gap-2 p-2 rounded hover:bg-gray-700">
                <div className="relative w-8 h-8 rounded-full overflow-hidden">
                  <Image
                    src={participant.userPhoto}
                    alt={participant.userName}
                    fill
                    className="object-cover"
                  />
                </div>
                <span className="text-white text-sm flex-1">{participant.userName}</span>
                {participant.userId === party.hostId && (
                  <span className="text-xs bg-purple-600 text-white px-2 py-0.5 rounded">Host</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Video Section */}
        <div className="flex-1 flex flex-col bg-black">
          <div className="flex-1 flex items-center justify-center">
            <video
              ref={videoRef}
              className="w-full h-full"
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
          
          <div className="bg-gray-800 p-4 border-t border-gray-700">
            <h2 className="text-white font-semibold text-lg">{video.title}</h2>
            <p className="text-gray-400 text-sm mt-1">
              {isHost ? "You are the host" : `Hosted by ${party.hostName}`}
            </p>
          </div>
        </div>

        {/* Chat Sidebar */}
        <div className="w-96 bg-gray-800 border-l border-gray-700 flex flex-col">
          <div className="p-4 border-b border-gray-700">
            <h3 className="text-white font-semibold">Chat</h3>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {chatMessages.length === 0 ? (
              <div className="text-center text-gray-500 mt-8">
                <p>No messages yet</p>
                <p className="text-sm mt-1">Be the first to say something!</p>
              </div>
            ) : (
              chatMessages.map((msg) => (
                <div key={msg.id} className="flex gap-2">
                  <div className="relative w-8 h-8 rounded-full overflow-hidden flex-shrink-0">
                    <Image
                      src={msg.userPhoto || "/images/default-avatar.png"}
                      alt={msg.userName}
                      fill
                      className="object-cover"
                    />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-baseline gap-2">
                      <span className="text-white font-medium text-sm">{msg.userName}</span>
                      <span className="text-gray-500 text-xs">
                        {new Date(msg.timestamp).toLocaleTimeString([], { 
                          hour: '2-digit', 
                          minute: '2-digit' 
                        })}
                      </span>
                    </div>
                    <p className="text-gray-300 text-sm mt-1">{msg.message}</p>
                  </div>
                </div>
              ))
            )}
            <div ref={chatEndRef} />
          </div>

          <div className="p-4 border-t border-gray-700">
            <div className="flex gap-2">
              <input
                type="text"
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                onKeyPress={(e) => e.key === "Enter" && sendMessage()}
                placeholder="Send a message..."
                className="flex-1 px-4 py-2 bg-gray-700 text-white rounded-lg border border-gray-600 focus:outline-none focus:border-purple-500"
              />
              <button
                onClick={sendMessage}
                disabled={!newMessage.trim()}
                className="px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-lg hover:from-purple-600 hover:to-pink-600 disabled:opacity-50 disabled:cursor-not-allowed transition"
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
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-lg max-w-md w-full max-h-[80vh] flex flex-col">
            <div className="p-6 border-b border-gray-700 flex items-center justify-between">
              <h2 className="text-xl font-bold text-white">Invite Friends</h2>
              <button
                onClick={() => setShowInviteModal(false)}
                className="text-gray-400 hover:text-white"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              {following.length === 0 ? (
                <p className="text-gray-400 text-center py-8">You don't follow anyone yet</p>
              ) : (
                <div className="space-y-2">
                  {following.map((friend) => (
                    <label
                      key={friend.id}
                      className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-700 cursor-pointer"
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
                        className="w-5 h-5"
                      />
                      <div className="relative w-10 h-10 rounded-full overflow-hidden">
                        <Image
                          src={friend.photoURL || "/images/default-avatar.png"}
                          alt={friend.displayName}
                          fill
                          className="object-cover"
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

            <div className="p-6 border-t border-gray-700">
              <button
                onClick={sendInvites}
                disabled={selectedInvitees.length === 0 || isSendingInvites}
                className="w-full py-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-lg hover:from-purple-600 hover:to-pink-600 disabled:opacity-50 disabled:cursor-not-allowed transition font-medium"
              >
                {isSendingInvites 
                  ? "Sending..." 
                  : `Invite ${selectedInvitees.length > 0 ? `(${selectedInvitees.length})` : ""}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}