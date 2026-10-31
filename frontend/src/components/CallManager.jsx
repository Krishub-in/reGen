import React, { useState, useEffect, useRef, useCallback } from 'react';
import { getSocket } from '../hooks/useSocket';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Phone, PhoneCall, PhoneOff, Video, VideoOff, Mic, MicOff, Users, AlertCircle, RotateCw } from 'lucide-react';
import { toast } from 'sonner';
import { useUpdateNotificationAction } from '../hooks/useQueries';
import { getSafeMediaStream, stopMediaStream, parseMediaError } from '../lib/mediaUtils';

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ],
};

/** Tile for a remote participant in a Team Meeting */
function ParticipantTile({ participant }) {
  const videoRef = useRef(null);
  const audioRef = useRef(null);
  const [hasVideoTrack, setHasVideoTrack] = useState(false);

  useEffect(() => {
    if (participant.stream) {
      if (videoRef.current) {
        videoRef.current.srcObject = participant.stream;
      }
      if (audioRef.current) {
        audioRef.current.srcObject = participant.stream;
      }
      const vTrack = participant.stream.getVideoTracks()[0];
      setHasVideoTrack(Boolean(vTrack && vTrack.enabled && vTrack.readyState === 'live'));

      const checkTrack = () => {
        const vt = participant.stream?.getVideoTracks()[0];
        setHasVideoTrack(Boolean(vt && vt.enabled && vt.readyState === 'live'));
      };
      if (vTrack) {
        vTrack.onended = checkTrack;
        vTrack.onmute = checkTrack;
        vTrack.onunmute = checkTrack;
      }
    }
  }, [participant.stream]);

  return (
    <div className="relative aspect-video rounded-xl bg-zinc-900 border border-white/10 overflow-hidden flex items-center justify-center">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        className={`w-full h-full object-cover ${hasVideoTrack ? 'block' : 'hidden'}`}
      />
      <audio ref={audioRef} autoPlay playsInline />
      {!hasVideoTrack && (
        <Avatar className="h-20 w-20">
          <AvatarFallback className="bg-indigo-600 text-xl font-bold text-white">
            {(participant.username || 'TM').slice(0, 2).toUpperCase()}
          </AvatarFallback>
        </Avatar>
      )}
      <span className="absolute bottom-3 left-3 text-xs bg-black/60 px-2 py-0.5 rounded font-medium text-white flex items-center gap-1.5 backdrop-blur-xs">
        <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
        {participant.username}
      </span>
    </div>
  );
}

export default function CallManager({ userProfile }) {
  const myId = userProfile?.userId || userProfile?.id || '';
  const myName = userProfile?.name || userProfile?.username || 'Me';
  const updateNotifAction = useUpdateNotificationAction();

  // 1-to-1 Call States: 'idle' | 'incoming' | 'calling' | 'connected'
  const [callState, setCallState] = useState('idle');
  const [callData, setCallData] = useState(null); // { callId, peerId, peerName, peerAvatar, mediaType, offer, notifId }
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [callDuration, setCallDuration] = useState(0);

  // Device & Permission Error Modal state
  const [mediaError, setMediaError] = useState(null);

  // Team Meeting States
  const [meetingState, setMeetingState] = useState('idle'); // 'idle' | 'joining' | 'in_meeting'
  const [meetingData, setMeetingData] = useState(null); // { meetingId, title, mediaType, hostName }
  const [meetingParticipants, setMeetingParticipants] = useState([]); // [{ userId, username, stream }]
  const [meetingMuted, setMeetingMuted] = useState(false);
  const [meetingVideoOff, setMeetingVideoOff] = useState(false);
  const [meetingDuration, setMeetingDuration] = useState(0);
  const [incomingMeeting, setIncomingMeeting] = useState(null); // { meetingId, title, hostName, mediaType }

  // Media & WebRTC Refs
  const localStreamRef = useRef(null);
  const remoteStreamRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const pendingCandidatesRef = useRef([]);

  // Meeting WebRTC Refs (Mesh Architecture)
  const meetingPeersRef = useRef({}); // peerUserId -> RTCPeerConnection
  const meetingStreamsRef = useRef({}); // peerUserId -> MediaStream
  const pendingMeetingCandidatesRef = useRef({}); // peerUserId -> candidate[]

  // DOM Video Refs
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const meetingLocalVideoRef = useRef(null);

  // Synchronized State Refs to avoid stale closures in socket callbacks
  const callStateRef = useRef(callState);
  callStateRef.current = callState;
  const callDataRef = useRef(callData);
  callDataRef.current = callData;
  const meetingStateRef = useRef(meetingState);
  meetingStateRef.current = meetingState;
  const meetingDataRef = useRef(meetingData);
  meetingDataRef.current = meetingData;

  // Ringtone / Audio cues via Web Audio API
  const ringtoneCtxRef = useRef(null);
  const ringtoneIntervalRef = useRef(null);

  const startRingtone = useCallback(() => {
    try {
      if (typeof window === 'undefined') return;
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      ringtoneCtxRef.current = ctx;

      const playBeep = () => {
        if (!ringtoneCtxRef.current || ringtoneCtxRef.current.state === 'closed') return;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(440, ctx.currentTime);
        osc.frequency.setValueAtTime(480, ctx.currentTime + 0.1);
        gain.gain.setValueAtTime(0.08, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.8);
      };

      playBeep();
      ringtoneIntervalRef.current = setInterval(playBeep, 2000);
    } catch {}
  }, []);

  const stopRingtone = useCallback(() => {
    if (ringtoneIntervalRef.current) {
      clearInterval(ringtoneIntervalRef.current);
      ringtoneIntervalRef.current = null;
    }
    if (ringtoneCtxRef.current && ringtoneCtxRef.current.state !== 'closed') {
      ringtoneCtxRef.current.close().catch(() => {});
      ringtoneCtxRef.current = null;
    }
  }, []);

  // Cleanup 1-to-1 Media & Peer
  const cleanupCall = useCallback(() => {
    stopRingtone();
    if (localStreamRef.current && meetingStateRef.current === 'idle') {
      stopMediaStream(localStreamRef.current);
      localStreamRef.current = null;
    }
    if (peerConnectionRef.current) {
      try {
        peerConnectionRef.current.close();
      } catch {}
      peerConnectionRef.current = null;
    }
    pendingCandidatesRef.current = [];
    remoteStreamRef.current = null;
    setCallState('idle');
    setCallData(null);
    setIsMuted(false);
    setIsVideoOff(false);
    setCallDuration(0);
  }, [stopRingtone]);

  // Duration Timer for active call
  useEffect(() => {
    let timer = null;
    if (callState === 'connected') {
      timer = setInterval(() => setCallDuration((d) => d + 1), 1000);
    } else {
      setCallDuration(0);
    }
    return () => clearInterval(timer);
  }, [callState]);

  // Duration Timer for team meeting
  useEffect(() => {
    let timer = null;
    if (meetingState === 'in_meeting') {
      timer = setInterval(() => setMeetingDuration((d) => d + 1), 1000);
    } else {
      setMeetingDuration(0);
    }
    return () => clearInterval(timer);
  }, [meetingState]);

  // Format seconds as MM:SS
  const formatTime = (totalSec) => {
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  // ─── 1-to-1 Call Actions ──────────────────────────────────────────

  // User initiates an outgoing call
  const startCall = useCallback(async ({ recipientId, recipientName, mediaType = 'voice' }) => {
    const socket = getSocket();
    if (!socket) {
      toast.error('Network connection not ready');
      return;
    }

    setMediaError(null);

    try {
      let effectiveMediaType = mediaType;
      const { stream } = await getSafeMediaStream({
        mediaType,
        allowAudioFallback: true,
        onAudioFallback: () => {
          effectiveMediaType = 'voice';
          toast.info('No camera detected. Connecting as voice call.');
        },
      });
      localStreamRef.current = stream;

      const callId = `call-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      const pc = new RTCPeerConnection(ICE_SERVERS);
      peerConnectionRef.current = pc;
      pendingCandidatesRef.current = [];

      // Add local tracks to peer connection
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      // Handle remote track
      pc.ontrack = (event) => {
        remoteStreamRef.current = event.streams[0];
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = event.streams[0];
        }
        if (remoteAudioRef.current) {
          remoteAudioRef.current.srcObject = event.streams[0];
        }
      };

      // Send ICE candidates to remote peer
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          socket.emit('call:signal', {
            targetUserId: recipientId,
            signal: { candidate: event.candidate },
            callId,
          });
        }
      };

      // Create offer
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      setCallData({
        callId,
        peerId: recipientId,
        peerName: recipientName || recipientId,
        mediaType: effectiveMediaType,
      });
      setCallState('calling');

      // Emit initiate event over socket
      socket.emit('call:initiate', {
        callId,
        recipientId,
        mediaType: effectiveMediaType,
        offer,
      });

      // Play outgoing ring sound
      startRingtone();
    } catch (err) {
      console.error('[CallManager] startCall error:', err);
      const parsed = parseMediaError(err, mediaType);
      setMediaError({
        ...parsed,
        onRetry: () => {
          setMediaError(null);
          startCall({ recipientId, recipientName, mediaType });
        },
        onCancel: () => {
          setMediaError(null);
          cleanupCall();
        },
      });
      cleanupCall();
    }
  }, [cleanupCall, startRingtone]);

  // User rejects an incoming call
  const rejectCall = useCallback(() => {
    const socket = getSocket();
    const currentData = callDataRef.current;
    if (socket && currentData) {
      socket.emit('call:reject', {
        callId: currentData.callId,
        callerId: currentData.peerId,
        reason: 'declined',
      });
      if (currentData.notifId) {
        updateNotifAction.mutate({ id: currentData.notifId, actionStatus: 'rejected' });
      }
    }
    cleanupCall();
  }, [cleanupCall, updateNotifAction]);

  // User accepts an incoming call
  const acceptCall = useCallback(async (customCallData = null) => {
    // If already connected, never re-accept or interrupt ongoing call
    if (callStateRef.current === 'connected') {
      return;
    }
    const socket = getSocket();
    const dataToUse = customCallData || callDataRef.current;
    if (!socket || !dataToUse) return;

    stopRingtone();
    setMediaError(null);

    try {
      let offer = dataToUse.offer;

      // If offer missing (e.g. accepted via push notification), request active call offer from server
      if (!offer && dataToUse.callId) {
        const fetchedCall = await new Promise((resolve) => {
          socket.emit('call:get-active', { callId: dataToUse.callId }, resolve);
          setTimeout(() => resolve(null), 3500);
        });
        if (fetchedCall?.offer) {
          offer = fetchedCall.offer;
        }
      }

      if (!offer) {
        // If already connected in the meantime, ignore
        if (callStateRef.current === 'connected') return;
        toast.error('Call invitation expired or unavailable');
        cleanupCall();
        return;
      }

      let effectiveMediaType = dataToUse.mediaType || 'voice';
      const { stream } = await getSafeMediaStream({
        mediaType: effectiveMediaType,
        allowAudioFallback: true,
        onAudioFallback: () => {
          effectiveMediaType = 'voice';
          toast.info('No camera detected. Connecting as voice call.');
        },
      });
      localStreamRef.current = stream;

      const pc = new RTCPeerConnection(ICE_SERVERS);
      peerConnectionRef.current = pc;
      pendingCandidatesRef.current = [];

      // Add local tracks
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      // Handle remote tracks
      pc.ontrack = (event) => {
        remoteStreamRef.current = event.streams[0];
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = event.streams[0];
        }
        if (remoteAudioRef.current) {
          remoteAudioRef.current.srcObject = event.streams[0];
        }
      };

      // Handle ICE candidates
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          socket.emit('call:signal', {
            targetUserId: dataToUse.peerId,
            signal: { candidate: event.candidate },
            callId: dataToUse.callId,
          });
        }
      };

      // Set remote offer
      await pc.setRemoteDescription(new RTCSessionDescription(offer));

      // Flush any queued candidates
      for (const cand of pendingCandidatesRef.current) {
        await pc.addIceCandidate(new RTCIceCandidate(cand)).catch(() => {});
      }
      pendingCandidatesRef.current = [];

      // Create & set local answer
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      socket.emit('call:accept', {
        callId: dataToUse.callId,
        callerId: dataToUse.peerId,
        answer,
      });

      setCallState('connected');
      try {
        toast.dismiss();
      } catch {}

      // Connection state monitor
      pc.onconnectionstatechange = () => {
        const state = pc.connectionState;
        if (state === 'failed') {
          console.warn('[WebRTC] 1-to-1 connection failed');
          toast.error('Call connection lost');
          cleanupCall();
        }
      };

      // Update notification in DB
      if (dataToUse.notifId) {
        updateNotifAction.mutate({ id: dataToUse.notifId, actionStatus: 'accepted' });
      }

      // Attach local stream to video element
      if (effectiveMediaType === 'video' && localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }
    } catch (err) {
      console.error('[CallManager] acceptCall error:', err);
      const parsed = parseMediaError(err, dataToUse.mediaType);
      setMediaError({
        ...parsed,
        onRetry: () => {
          setMediaError(null);
          acceptCall(dataToUse);
        },
        onCancel: () => {
          setMediaError(null);
          rejectCall();
        },
      });
    }
  }, [stopRingtone, updateNotifAction, rejectCall, cleanupCall]);

  // End an active call
  const endCall = useCallback(() => {
    const socket = getSocket();
    const currentData = callDataRef.current;
    if (socket && currentData) {
      socket.emit('call:end', {
        callId: currentData.callId,
        targetUserId: currentData.peerId,
      });
      if (currentData.notifId) {
        updateNotifAction.mutate({ id: currentData.notifId, actionStatus: 'ended' });
      }
    }
    cleanupCall();
  }, [cleanupCall, updateNotifAction]);

  // Toggle microphone in 1-to-1
  const toggleMute = () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMuted(!audioTrack.enabled);
      }
    }
  };

  // Toggle video in 1-to-1
  const toggleVideo = () => {
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsVideoOff(!videoTrack.enabled);
      }
    }
  };

  // ─── Team Meeting Actions ─────────────────────────────────────────

  const joinMeeting = useCallback(({ meetingId, title, mediaType = 'video' }) => {
    setMeetingData({ meetingId, title, mediaType });
    setMeetingState('joining');
  }, []);

  // Helper to create WebRTC Peer Connection for a specific meeting member
  const createMeetingPeer = useCallback((peerUserId, peerUsername, isInitiator, socket, meetingId) => {
    if (meetingPeersRef.current[peerUserId]) {
      return meetingPeersRef.current[peerUserId];
    }

    const pc = new RTCPeerConnection(ICE_SERVERS);
    meetingPeersRef.current[peerUserId] = pc;
    pendingMeetingCandidatesRef.current[peerUserId] = [];

    // Add local tracks to peer connection
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        pc.addTrack(track, localStreamRef.current);
      });
    }

    // Handle remote track
    pc.ontrack = (event) => {
      const remoteStream = event.streams[0];
      meetingStreamsRef.current[peerUserId] = remoteStream;
      setMeetingParticipants((prev) => {
        const filtered = prev.filter((p) => p.userId !== peerUserId);
        return [...filtered, { userId: peerUserId, username: peerUsername, stream: remoteStream }];
      });
    };

    // Send ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit('meeting:signal', {
          targetUserId: peerUserId,
          signal: { type: 'candidate', candidate: event.candidate },
          meetingId,
        });
      }
    };

    // If initiator, create and send offer
    if (isInitiator) {
      pc.createOffer()
        .then((offer) => pc.setLocalDescription(offer))
        .then(() => {
          socket.emit('meeting:signal', {
            targetUserId: peerUserId,
            signal: { type: 'offer', offer: pc.localDescription },
            meetingId,
          });
        })
        .catch((err) => console.error('[Meeting WebRTC] createOffer error:', err));
    }

    return pc;
  }, []);

  const confirmJoinMeeting = useCallback(async () => {
    const socket = getSocket();
    const data = meetingDataRef.current;
    if (!socket || !data) return;

    setMediaError(null);

    try {
      let effectiveMediaType = data.mediaType || 'video';
      const { stream } = await getSafeMediaStream({
        mediaType: effectiveMediaType,
        allowAudioFallback: true,
        onAudioFallback: () => {
          effectiveMediaType = 'voice';
          toast.info('No camera detected. Joining meeting in audio mode.');
        },
      });
      localStreamRef.current = stream;

      socket.emit('meeting:join', {
        meetingId: data.meetingId,
        userInfo: { userId: myId, username: myName },
      });

      setMeetingState('in_meeting');
      toast.success(`Joined ${data.title || 'Team Meeting'}`);
    } catch (err) {
      console.error('[CallManager] confirmJoinMeeting error:', err);
      const parsed = parseMediaError(err, data?.mediaType);
      setMediaError({
        ...parsed,
        onRetry: () => {
          setMediaError(null);
          confirmJoinMeeting();
        },
        onCancel: () => {
          setMediaError(null);
          setMeetingState('idle');
          setMeetingData(null);
        },
      });
      setMeetingState('idle');
      setMeetingData(null);
    }
  }, [myId, myName]);

  const leaveMeeting = useCallback(() => {
    const socket = getSocket();
    const data = meetingDataRef.current;
    if (socket && data) {
      socket.emit('meeting:leave', { meetingId: data.meetingId });
    }
    if (localStreamRef.current) {
      stopMediaStream(localStreamRef.current);
      localStreamRef.current = null;
    }
    Object.values(meetingPeersRef.current).forEach((pc) => {
      try {
        pc.close();
      } catch {}
    });
    meetingPeersRef.current = {};
    meetingStreamsRef.current = {};
    pendingMeetingCandidatesRef.current = {};
    setMeetingParticipants([]);
    setMeetingState('idle');
    setMeetingData(null);
    setMeetingMuted(false);
    setMeetingVideoOff(false);
  }, []);

  // ─── Socket Event Handlers ────────────────────────────────────────

  useEffect(() => {
    const handleIncomingCall = (data) => {
      // 1. Ignore duplicate incoming call events for the current call
      if (callDataRef.current?.callId === data.callId) {
        return;
      }

      // 2. If already in another active 1-to-1 call or team meeting, respond with busy
      if (callStateRef.current !== 'idle' || meetingStateRef.current !== 'idle') {
        const socket = getSocket();
        socket?.emit('call:reject', {
          callId: data.callId,
          callerId: data.callerId,
          reason: 'busy',
        });
        return;
      }

      setCallData({
        callId: data.callId,
        peerId: data.callerId,
        peerName: data.callerName || 'Colleague',
        mediaType: data.mediaType || 'voice',
        offer: data.offer,
        notifId: `call-notif-${data.callId}`,
      });
      setCallState('incoming');
      startRingtone();
    };

    const handleCallAccepted = async (data) => {
      stopRingtone();
      if (peerConnectionRef.current && data.answer) {
        try {
          await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(data.answer));
          // Flush any pending candidates
          for (const cand of pendingCandidatesRef.current) {
            await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(cand)).catch(() => {});
          }
          pendingCandidatesRef.current = [];
          setCallState('connected');
        } catch (err) {
          console.error('[WebRTC] Error setting remote answer:', err);
        }
      }
    };

    const handleCallRejected = (data) => {
      // If call is already connected, ignore rogue reject packets from race conditions
      if (callStateRef.current === 'connected') {
        return;
      }
      stopRingtone();
      toast.info(`Call ${data.reason === 'busy' ? 'busy' : 'declined'}`);
      cleanupCall();
    };

    const handleCallSignal = async (data) => {
      if (data.signal?.candidate) {
        const pc = peerConnectionRef.current;
        if (pc && pc.remoteDescription) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(data.signal.candidate));
          } catch (err) {
            console.error('[WebRTC] Error adding ICE candidate:', err);
          }
        } else {
          pendingCandidatesRef.current.push(data.signal.candidate);
        }
      }
    };

    const handleCallEnded = () => {
      toast.info('Call ended');
      cleanupCall();
    };

    // Team Meeting Handlers
    const handleMeetingStarted = (data) => {
      if (data.hostId !== myId && meetingStateRef.current === 'idle' && callStateRef.current === 'idle') {
        setIncomingMeeting(data);
      }
    };

    const handleMeetingUserJoined = (data) => {
      const socket = getSocket();
      const currentMeeting = meetingDataRef.current;
      if (!socket || !currentMeeting || data.userId === myId) return;

      toast.info(`${data.userInfo?.username || 'Team member'} joined the meeting`);
      // Create initiator peer connection to the newly joined user
      createMeetingPeer(data.userId, data.userInfo?.username || 'Colleague', true, socket, currentMeeting.meetingId);
    };

    const handleMeetingExistingUsers = (data) => {
      const socket = getSocket();
      const currentMeeting = meetingDataRef.current;
      if (!socket || !currentMeeting || !Array.isArray(data.users)) return;

      // New joiner connects to existing participants
      data.users.forEach((user) => {
        if (user.userId !== myId) {
          createMeetingPeer(user.userId, user.username, true, socket, currentMeeting.meetingId);
        }
      });
    };

    const handleMeetingSignal = async (data) => {
      const socket = getSocket();
      const currentMeeting = meetingDataRef.current;
      if (!socket || !currentMeeting || data.fromUserId === myId) return;

      const { fromUserId, fromUsername, signal } = data;
      let pc = meetingPeersRef.current[fromUserId];

      if (signal.type === 'offer') {
        if (!pc) {
          pc = createMeetingPeer(fromUserId, fromUsername || 'Colleague', false, socket, currentMeeting.meetingId);
        }
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(signal.offer));
          // Flush pending candidates
          const queued = pendingMeetingCandidatesRef.current[fromUserId] || [];
          for (const c of queued) {
            await pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {});
          }
          pendingMeetingCandidatesRef.current[fromUserId] = [];

          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);

          socket.emit('meeting:signal', {
            targetUserId: fromUserId,
            signal: { type: 'answer', answer },
            meetingId: currentMeeting.meetingId,
          });
        } catch (err) {
          console.error('[Meeting WebRTC] Error answering offer:', err);
        }
      } else if (signal.type === 'answer') {
        if (pc) {
          try {
            await pc.setRemoteDescription(new RTCSessionDescription(signal.answer));
            const queued = pendingMeetingCandidatesRef.current[fromUserId] || [];
            for (const c of queued) {
              await pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {});
            }
            pendingMeetingCandidatesRef.current[fromUserId] = [];
          } catch (err) {
            console.error('[Meeting WebRTC] Error setting answer:', err);
          }
        }
      } else if (signal.type === 'candidate' && signal.candidate) {
        if (pc && pc.remoteDescription) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
          } catch (err) {
            console.error('[Meeting WebRTC] Error adding ICE candidate:', err);
          }
        } else {
          if (!pendingMeetingCandidatesRef.current[fromUserId]) {
            pendingMeetingCandidatesRef.current[fromUserId] = [];
          }
          pendingMeetingCandidatesRef.current[fromUserId].push(signal.candidate);
        }
      }
    };

    const handleMeetingUserLeft = (data) => {
      if (meetingPeersRef.current[data.userId]) {
        try {
          meetingPeersRef.current[data.userId].close();
        } catch {}
        delete meetingPeersRef.current[data.userId];
      }
      delete meetingStreamsRef.current[data.userId];
      delete pendingMeetingCandidatesRef.current[data.userId];
      setMeetingParticipants((prev) => prev.filter((p) => p.userId !== data.userId));
    };

    // Attach listeners
    let attachedSocket = null;
    const checkAndAttach = () => {
      const socket = getSocket();
      if (socket && socket !== attachedSocket) {
        if (attachedSocket) {
          attachedSocket.off('call:incoming', handleIncomingCall);
          attachedSocket.off('call:accepted', handleCallAccepted);
          attachedSocket.off('call:rejected', handleCallRejected);
          attachedSocket.off('call:signal', handleCallSignal);
          attachedSocket.off('call:ended', handleCallEnded);
          attachedSocket.off('meeting:started', handleMeetingStarted);
          attachedSocket.off('meeting:user-joined', handleMeetingUserJoined);
          attachedSocket.off('meeting:existing-users', handleMeetingExistingUsers);
          attachedSocket.off('meeting:signal', handleMeetingSignal);
          attachedSocket.off('meeting:user-left', handleMeetingUserLeft);
        }
        attachedSocket = socket;
        socket.on('call:incoming', handleIncomingCall);
        socket.on('call:accepted', handleCallAccepted);
        socket.on('call:rejected', handleCallRejected);
        socket.on('call:signal', handleCallSignal);
        socket.on('call:ended', handleCallEnded);
        socket.on('meeting:started', handleMeetingStarted);
        socket.on('meeting:user-joined', handleMeetingUserJoined);
        socket.on('meeting:existing-users', handleMeetingExistingUsers);
        socket.on('meeting:signal', handleMeetingSignal);
        socket.on('meeting:user-left', handleMeetingUserLeft);
      }
    };

    checkAndAttach();
    const interval = setInterval(checkAndAttach, 1000);

    return () => {
      clearInterval(interval);
      if (attachedSocket) {
        attachedSocket.off('call:incoming', handleIncomingCall);
        attachedSocket.off('call:accepted', handleCallAccepted);
        attachedSocket.off('call:rejected', handleCallRejected);
        attachedSocket.off('call:signal', handleCallSignal);
        attachedSocket.off('call:ended', handleCallEnded);
        attachedSocket.off('meeting:started', handleMeetingStarted);
        attachedSocket.off('meeting:user-joined', handleMeetingUserJoined);
        attachedSocket.off('meeting:existing-users', handleMeetingExistingUsers);
        attachedSocket.off('meeting:signal', handleMeetingSignal);
        attachedSocket.off('meeting:user-left', handleMeetingUserLeft);
      }
    };
  }, [cleanupCall, createMeetingPeer, myId, startRingtone, stopRingtone]);

  // Window events for opening calls & meetings from buttons or notifications
  useEffect(() => {
    const onStartDirectCall = (e) => {
      if (e.detail) {
        startCall(e.detail);
      }
    };

    const onAcceptIncomingCall = (e) => {
      if (e.detail) {
        // If already connected or answering this exact call, ignore
        if (callStateRef.current === 'connected') {
          return;
        }
        if (callDataRef.current?.callId === e.detail.callId && callStateRef.current !== 'idle') {
          return;
        }
        const callerName = e.detail.senderName || e.detail.metadata?.callerName || 'Colleague';
        const callerId = e.detail.senderId || e.detail.metadata?.callerId;
        const callObj = {
          callId: e.detail.callId,
          peerId: callerId,
          peerName: callerName,
          mediaType: e.detail.metadata?.mediaType || 'voice',
          offer: e.detail.offer || null,
          notifId: e.detail.id,
        };
        setCallData(callObj);
        acceptCall(callObj);
      }
    };

    const onJoinMeeting = (e) => {
      if (e.detail) {
        joinMeeting(e.detail);
      }
    };

    const onMeetingStartedEvent = (e) => {
      if (e.detail && e.detail.hostId !== myId && meetingStateRef.current === 'idle') {
        setIncomingMeeting(e.detail);
      }
    };

    window.addEventListener('start-direct-call', onStartDirectCall);
    window.addEventListener('accept-incoming-call', onAcceptIncomingCall);
    window.addEventListener('join-team-meeting', onJoinMeeting);
    window.addEventListener('meeting:started', onMeetingStartedEvent);

    return () => {
      window.removeEventListener('start-direct-call', onStartDirectCall);
      window.removeEventListener('accept-incoming-call', onAcceptIncomingCall);
      window.removeEventListener('join-team-meeting', onJoinMeeting);
      window.removeEventListener('meeting:started', onMeetingStartedEvent);
    };
  }, [acceptCall, joinMeeting, myId, startCall]);

  // Attach local and remote streams when elements mount
  useEffect(() => {
    if (callState === 'connected') {
      if (localStreamRef.current && localVideoRef.current) {
        localVideoRef.current.srcObject = localStreamRef.current;
      }
      if (remoteStreamRef.current) {
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = remoteStreamRef.current;
        }
        if (remoteAudioRef.current) {
          remoteAudioRef.current.srcObject = remoteStreamRef.current;
        }
      }
    }
  }, [callState]);

  // Attach local stream for team meeting
  useEffect(() => {
    if (meetingState === 'in_meeting' && localStreamRef.current && meetingLocalVideoRef.current) {
      meetingLocalVideoRef.current.srcObject = localStreamRef.current;
    }
  }, [meetingState]);

  return (
    <>
      {/* ─── Incoming Call Dialog ─────────────────────────────────────── */}
      <Dialog open={callState === 'incoming'} onOpenChange={(open) => !open && rejectCall()}>
        <DialogContent className="sm:max-w-md text-center p-6 bg-card border-border shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-center font-bold text-lg">
              Incoming {callData?.mediaType === 'video' ? 'Video' : 'Voice'} Call
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center my-6 space-y-4">
            <div className="relative">
              <Avatar className="h-24 w-24 border-4 border-primary/20 animate-pulse">
                <AvatarFallback className="text-xl font-bold bg-primary/10">
                  {callData?.peerName?.slice(0, 2).toUpperCase() || '??'}
                </AvatarFallback>
              </Avatar>
              <div className="absolute -bottom-1 -right-1 bg-emerald-500 rounded-full p-2 text-white shadow-md">
                {callData?.mediaType === 'video' ? <Video className="h-4 w-4" /> : <PhoneCall className="h-4 w-4" />}
              </div>
            </div>
            <div>
              <h3 className="text-xl font-bold">{callData?.peerName}</h3>
              <p className="text-sm text-muted-foreground mt-1">is calling you...</p>
            </div>
          </div>
          <DialogFooter className="flex flex-row justify-center gap-6 sm:justify-center">
            <Button
              variant="destructive"
              size="lg"
              className="rounded-full h-14 w-14 p-0 shadow-lg hover:bg-destructive/90 transition-transform active:scale-95"
              onClick={rejectCall}
              title="Decline"
            >
              <PhoneOff className="h-6 w-6" />
            </Button>
            <Button
              variant="default"
              size="lg"
              className="rounded-full h-14 w-14 p-0 bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg transition-transform active:scale-95"
              onClick={() => acceptCall()}
              title="Accept Call"
            >
              <PhoneCall className="h-6 w-6" />
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Outgoing Calling Dialog ──────────────────────────────────── */}
      <Dialog open={callState === 'calling'} onOpenChange={(open) => !open && endCall()}>
        <DialogContent className="sm:max-w-md text-center p-6 bg-card border-border shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-center font-bold text-lg">
              Calling {callData?.mediaType === 'video' ? 'Video' : 'Voice'}
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center my-6 space-y-4">
            <div className="relative">
              <Avatar className="h-24 w-24 border-4 border-primary/20 animate-pulse">
                <AvatarFallback className="text-xl font-bold bg-primary/10">
                  {callData?.peerName?.slice(0, 2).toUpperCase() || '??'}
                </AvatarFallback>
              </Avatar>
            </div>
            <div>
              <h3 className="text-xl font-bold">{callData?.peerName}</h3>
              <p className="text-sm text-muted-foreground mt-1 animate-pulse">Ringing...</p>
            </div>
          </div>
          <DialogFooter className="flex justify-center sm:justify-center">
            <Button
              variant="destructive"
              size="lg"
              className="rounded-full h-14 w-14 p-0 shadow-lg"
              onClick={endCall}
              title="Cancel Call"
            >
              <PhoneOff className="h-6 w-6" />
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Connected 1-to-1 Call Screen / Overlay ──────────────────── */}
      {callState === 'connected' && (
        <div className="fixed inset-0 z-50 bg-black/95 flex flex-col justify-between p-4 sm:p-6 text-white animate-in fade-in duration-300">
          {/* Top Bar */}
          <div className="flex items-center justify-between z-10">
            <div className="flex items-center gap-3 bg-black/40 backdrop-blur px-4 py-2 rounded-full border border-white/10">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="font-semibold text-sm">{callData?.peerName}</span>
              <span className="text-xs text-white/70 font-mono ml-2">{formatTime(callDuration)}</span>
            </div>
          </div>

          {/* Video / Audio Area */}
          <div className="flex-1 relative flex items-center justify-center my-4 overflow-hidden rounded-2xl border border-white/10 bg-zinc-950">
            {callData?.mediaType === 'video' ? (
              <>
                <video
                  ref={remoteVideoRef}
                  autoPlay
                  playsInline
                  className="w-full h-full object-cover rounded-2xl"
                />
                {/* Audio track play */}
                <audio ref={remoteAudioRef} autoPlay playsInline />
                {/* Local PiP Video */}
                <div className="absolute bottom-4 right-4 w-28 h-36 sm:w-40 sm:h-52 md:w-48 md:h-64 rounded-xl overflow-hidden shadow-2xl border-2 border-white/20 bg-black z-20">
                  <video
                    ref={localVideoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-cover"
                  />
                  {isVideoOff && (
                    <div className="absolute inset-0 bg-zinc-900 flex items-center justify-center text-xs text-white/70">
                      Camera Off
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center space-y-4">
                <Avatar className="h-32 w-32 border-4 border-white/10 shadow-2xl">
                  <AvatarFallback className="text-3xl font-bold bg-indigo-600 text-white">
                    {callData?.peerName?.slice(0, 2).toUpperCase() || '??'}
                  </AvatarFallback>
                </Avatar>
                <div className="text-center">
                  <h3 className="text-2xl font-bold text-white">{callData?.peerName}</h3>
                  <p className="text-sm text-emerald-400 mt-1">Audio Connected</p>
                </div>
                {/* Dedicated Audio Element */}
                <audio ref={remoteAudioRef} autoPlay playsInline />
              </div>
            )}
          </div>

          {/* Controls Bar */}
          <div className="flex items-center justify-center gap-4 py-2 z-10">
            <Button
              variant="outline"
              size="lg"
              className={`rounded-full h-14 w-14 p-0 border-white/20 transition-all ${
                isMuted ? 'bg-red-600 text-white border-red-600' : 'bg-white/10 hover:bg-white/20 text-white'
              }`}
              onClick={toggleMute}
              title={isMuted ? 'Unmute' : 'Mute'}
            >
              {isMuted ? <MicOff className="h-6 w-6" /> : <Mic className="h-6 w-6" />}
            </Button>

            {callData?.mediaType === 'video' && (
              <Button
                variant="outline"
                size="lg"
                className={`rounded-full h-14 w-14 p-0 border-white/20 transition-all ${
                  isVideoOff ? 'bg-red-600 text-white border-red-600' : 'bg-white/10 hover:bg-white/20 text-white'
                }`}
                onClick={toggleVideo}
                title={isVideoOff ? 'Turn Camera On' : 'Turn Camera Off'}
              >
                {isVideoOff ? <VideoOff className="h-6 w-6" /> : <Video className="h-6 w-6" />}
              </Button>
            )}

            <Button
              variant="destructive"
              size="lg"
              className="rounded-full h-14 w-14 p-0 bg-red-600 hover:bg-red-700 shadow-xl"
              onClick={endCall}
              title="Hang Up"
            >
              <PhoneOff className="h-6 w-6" />
            </Button>
          </div>
        </div>
      )}

      {/* ─── Incoming Team Meeting Announcement Dialog ────────────────── */}
      <Dialog open={Boolean(incomingMeeting)} onOpenChange={(open) => !open && setIncomingMeeting(null)}>
        <DialogContent className="sm:max-w-md text-center p-6 bg-card border border-amber-500/30 shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-center font-bold text-lg flex items-center justify-center gap-2 text-amber-500">
              <Users className="h-5 w-5" />
              Team Meeting in Progress
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center my-5 space-y-3">
            <div className="h-16 w-16 rounded-full bg-amber-500/10 border-2 border-amber-500/30 flex items-center justify-center text-amber-500 animate-pulse">
              <Video className="h-8 w-8" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-foreground">{incomingMeeting?.title || 'Team Meeting'}</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Started by <span className="font-semibold text-foreground">{incomingMeeting?.hostName || 'Team Lead'}</span>
              </p>
            </div>
          </div>
          <DialogFooter className="flex flex-row justify-center gap-4 sm:justify-center">
            <Button variant="outline" onClick={() => setIncomingMeeting(null)}>
              Dismiss
            </Button>
            <Button
              className="bg-amber-600 hover:bg-amber-700 text-white font-semibold flex items-center gap-2"
              onClick={() => {
                const meeting = incomingMeeting;
                setIncomingMeeting(null);
                joinMeeting(meeting);
              }}
            >
              <Video className="h-4 w-4" />
              Join Meeting
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Team Meeting Join Consent Dialog ─────────────────────────── */}
      <Dialog open={meetingState === 'joining'} onOpenChange={(open) => !open && setMeetingState('idle')}>
        <DialogContent className="sm:max-w-md text-center p-6 bg-card border-border shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-center font-bold text-lg">Join Team Meeting</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center my-6 space-y-4">
            <div className="h-16 w-16 rounded-full bg-amber-500/10 flex items-center justify-center text-amber-500">
              <Users className="h-8 w-8" />
            </div>
            <div>
              <h3 className="text-xl font-bold">{meetingData?.title || 'General Team Meeting'}</h3>
              <p className="text-sm text-muted-foreground mt-1">
                You will connect to this session with your microphone and camera.
              </p>
            </div>
          </div>
          <DialogFooter className="flex flex-row justify-center gap-3 sm:justify-center">
            <Button variant="outline" onClick={() => setMeetingState('idle')}>
              Cancel
            </Button>
            <Button
              className="bg-amber-600 hover:bg-amber-700 text-white font-semibold flex items-center gap-2"
              onClick={confirmJoinMeeting}
            >
              <Video className="h-4 w-4" />
              Join Meeting
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Active Team Meeting Screen ──────────────────────────────── */}
      {meetingState === 'in_meeting' && (
        <div className="fixed inset-0 z-50 bg-black/95 flex flex-col justify-between p-4 sm:p-6 text-white animate-in fade-in duration-300">
          {/* Header */}
          <div className="flex items-center justify-between z-10 border-b border-white/10 pb-3">
            <div className="flex items-center gap-3">
              <span className="h-3 w-3 rounded-full bg-emerald-500 animate-pulse" />
              <div>
                <h3 className="font-bold text-base">{meetingData?.title || 'Team Meeting'}</h3>
                <p className="text-xs text-white/60 font-mono">Duration: {formatTime(meetingDuration)}</p>
              </div>
            </div>
            <Button
              variant="destructive"
              size="sm"
              onClick={leaveMeeting}
              className="bg-red-600 hover:bg-red-700 flex items-center gap-1.5"
            >
              <PhoneOff className="h-4 w-4" />
              Leave
            </Button>
          </div>

          {/* Meeting Room Grid */}
          <div className="flex-1 my-4 overflow-y-auto w-full flex items-center justify-center p-1 sm:p-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4 w-full max-w-5xl my-auto">
              {/* Local Tile */}
              <div className="relative aspect-video rounded-xl bg-zinc-900 border border-white/10 overflow-hidden flex flex-col items-center justify-center">
                <video
                  ref={meetingLocalVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className={`w-full h-full object-cover ${!meetingVideoOff && localStreamRef.current?.getVideoTracks().length ? 'block' : 'hidden'}`}
                />
                {(meetingVideoOff || !localStreamRef.current?.getVideoTracks().length) && (
                  <Avatar className="h-20 w-20">
                    <AvatarFallback className="bg-primary/20 text-xl font-bold">
                      {myName.slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                )}
                <span className="absolute bottom-3 left-3 text-xs bg-black/60 px-2 py-0.5 rounded font-medium text-white backdrop-blur-xs">
                  {myName} (You)
                </span>
                {meetingMuted && (
                  <span className="absolute top-3 right-3 bg-red-600 p-1.5 rounded-full text-white">
                    <MicOff className="h-3.5 w-3.5" />
                  </span>
                )}
              </div>

              {/* Other Active Members with Live Streams */}
              {meetingParticipants.length === 0 ? (
                <div className="aspect-video rounded-xl border border-dashed border-white/20 flex flex-col items-center justify-center text-white/60 p-4 text-center">
                  <Users className="h-8 w-8 mb-2 opacity-50" />
                  <p className="text-sm font-medium">Waiting for other team members to join...</p>
                </div>
              ) : (
                meetingParticipants.map((p) => (
                  <ParticipantTile key={p.userId} participant={p} />
                ))
              )}
            </div>
          </div>

          {/* Controls Bar */}
          <div className="flex items-center justify-center gap-4 py-2 border-t border-white/10 pt-4 z-10">
            <Button
              variant="outline"
              size="lg"
              className={`rounded-full h-12 w-12 p-0 border-white/20 ${
                meetingMuted ? 'bg-red-600 text-white' : 'bg-white/10 text-white hover:bg-white/20'
              }`}
              onClick={() => {
                if (localStreamRef.current) {
                  const track = localStreamRef.current.getAudioTracks()[0];
                  if (track) {
                    track.enabled = !track.enabled;
                    setMeetingMuted(!track.enabled);
                  }
                }
              }}
              title={meetingMuted ? 'Unmute' : 'Mute'}
            >
              {meetingMuted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
            </Button>
            <Button
              variant="outline"
              size="lg"
              className={`rounded-full h-12 w-12 p-0 border-white/20 ${
                meetingVideoOff ? 'bg-red-600 text-white' : 'bg-white/10 text-white hover:bg-white/20'
              }`}
              onClick={() => {
                if (localStreamRef.current) {
                  const track = localStreamRef.current.getVideoTracks()[0];
                  if (track) {
                    track.enabled = !track.enabled;
                    setMeetingVideoOff(!track.enabled);
                  }
                }
              }}
              title={meetingVideoOff ? 'Camera On' : 'Camera Off'}
            >
              {meetingVideoOff ? <VideoOff className="h-5 w-5" /> : <Video className="h-5 w-5" />}
            </Button>
            <Button
              variant="destructive"
              size="lg"
              className="rounded-full h-12 px-6 bg-red-600 hover:bg-red-700 flex items-center gap-2 font-semibold shadow-lg"
              onClick={leaveMeeting}
            >
              <PhoneOff className="h-5 w-5" />
              Leave Meeting
            </Button>
          </div>
        </div>
      )}

      {/* ─── Device & Permission Error Dialog with Retry ──────────────── */}
      <Dialog
        open={Boolean(mediaError)}
        onOpenChange={(open) => {
          if (!open) {
            const cancelFn = mediaError?.onCancel;
            setMediaError(null);
            if (cancelFn) cancelFn();
          }
        }}
      >
        <DialogContent className="sm:max-w-md bg-zinc-950 border border-red-500/30 text-white shadow-2xl">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center text-red-500 shrink-0">
                <AlertCircle className="h-5 w-5" />
              </div>
              <div className="text-left">
                <DialogTitle className="text-base font-semibold text-white">
                  {mediaError?.title || 'Microphone / Camera Error'}
                </DialogTitle>
                <p className="text-xs text-zinc-400 mt-0.5">Device & Permission Troubleshooting</p>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-3 py-2 text-sm text-zinc-300">
            <p className="leading-relaxed">{mediaError?.message}</p>

            {mediaError?.troubleshooting && mediaError.troubleshooting.length > 0 && (
              <div className="bg-zinc-900/90 rounded-lg p-3 border border-white/10 space-y-2">
                <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">How to resolve:</p>
                <ul className="text-xs text-zinc-300 space-y-1.5 list-disc pl-4">
                  {mediaError.troubleshooting.map((step, idx) => (
                    <li key={idx} className="leading-relaxed">{step}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <DialogFooter className="flex sm:justify-between items-center gap-2 pt-3 border-t border-white/10">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                const cancelFn = mediaError?.onCancel;
                setMediaError(null);
                if (cancelFn) cancelFn();
              }}
              className="text-zinc-400 hover:text-white hover:bg-zinc-800"
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => {
                const retryFn = mediaError?.onRetry;
                setMediaError(null);
                if (retryFn) retryFn();
              }}
              className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold flex items-center gap-1.5"
            >
              <RotateCw className="h-3.5 w-3.5" />
              Retry Connection
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
