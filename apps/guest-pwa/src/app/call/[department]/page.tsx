'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { io, Socket } from 'socket.io-client';
import { useAuth } from '@/context/auth-context';
import { env } from '@/lib/env';

type CallState = 'CONNECTING' | 'RINGING' | 'CONNECTED' | 'ENDED' | 'ERROR';

export default function CallScreen() {
  const router = useRouter();
  const params = useParams();
  const department = params.department as string;
  const { accessToken } = useAuth();

  const [callState, setCallState] = useState<CallState>('CONNECTING');
  const [errorMessage, setErrorMessage] = useState('');
  const [duration, setDuration] = useState(0);

  const socketRef = useRef<Socket | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const callIdRef = useRef<string>(crypto.randomUUID());
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);

  const cleanup = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    pcRef.current?.close();
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    socketRef.current?.disconnect();
  }, []);

  useEffect(() => {
    if (!accessToken) {
      router.replace('/');
      return;
    }

    const socket = io(env.signalingUrl, {
      auth: { token: accessToken },
      transports: ['websocket'],
      query: { department },
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      setCallState('RINGING');
      socket.emit('call:initiate', {
        to_dept: department,
        call_id: callIdRef.current,
      });
    });

    socket.on('call:error', (data: { code: string; message: string }) => {
      setCallState('ERROR');
      setErrorMessage(data.message);
    });

    socket.on('call:accepted', async (_data: { call_id: string; peer_socket_id: string }) => {
      try {
        // Set up WebRTC
        const pc = new RTCPeerConnection({
          iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
        });
        pcRef.current = pc;

        // Get microphone
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true },
          video: false,
        });
        localStreamRef.current = stream;
        stream.getTracks().forEach((track) => pc.addTrack(track, stream));

        // Handle remote audio
        pc.ontrack = (event) => {
          if (remoteAudioRef.current && event.streams[0]) {
            remoteAudioRef.current.srcObject = event.streams[0];
          }
        };

        // ICE candidates
        pc.onicecandidate = (event) => {
          if (event.candidate) {
            socket.emit('call:ice-candidate', {
              call_id: callIdRef.current,
              candidate: event.candidate.toJSON(),
            });
          }
        };

        // Create and send offer
        const offer = await pc.createOffer({ offerToReceiveAudio: true });
        await pc.setLocalDescription(offer);
        socket.emit('call:sdp', { call_id: callIdRef.current, sdp: offer });

        setCallState('CONNECTED');
        // Start timer
        timerRef.current = setInterval(() => {
          setDuration((d) => d + 1);
        }, 1000);
      } catch (_err) {
        setCallState('ERROR');
        setErrorMessage('Failed to start audio. Check microphone permission.');
      }
    });

    // Handle incoming SDP answer
    socket.on('call:sdp', async (data: { call_id: string; sdp: RTCSessionDescriptionInit }) => {
      if (pcRef.current && data.sdp.type === 'answer') {
        await pcRef.current.setRemoteDescription(data.sdp);
      }
    });

    // Handle incoming ICE candidates
    socket.on('call:ice-candidate', async (data: { call_id: string; candidate: RTCIceCandidateInit }) => {
      if (pcRef.current) {
        await pcRef.current.addIceCandidate(data.candidate);
      }
    });

    // Call ended by remote
    socket.on('call:ended', () => {
      setCallState('ENDED');
      cleanup();
    });

    socket.on('call:rejected', () => {
      setCallState('ERROR');
      setErrorMessage('Call was declined by staff.');
    });

    socket.on('disconnect', () => {
      if (callState === 'CONNECTED') {
        setCallState('ENDED');
      }
    });

    return cleanup;
  }, [accessToken, department, router, cleanup]);

  const handleEndCall = () => {
    socketRef.current?.emit('call:end', { call_id: callIdRef.current });
    setCallState('ENDED');
    cleanup();
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const deptName = department === 'ROOM_SERVICE'
    ? 'Room Service'
    : department.charAt(0) + department.slice(1).toLowerCase();

  return (
    <main className="container py-8 flex flex-col items-center justify-center min-h-screen">
      <audio ref={remoteAudioRef} autoPlay playsInline />

      <div className="card text-center w-full" style={{ maxWidth: '20rem' }}>
        <h2 className="text-lg font-semibold mb-2">{deptName}</h2>

        {callState === 'CONNECTING' && (
          <>
            <div className="spinner" style={{ margin: '1.5rem auto' }} />
            <p className="text-gray-500">Connecting...</p>
          </>
        )}

        {callState === 'RINGING' && (
          <>
            <div className="spinner" style={{ margin: '1.5rem auto' }} />
            <p className="text-gray-500">Calling {deptName}...</p>
            <button className="btn btn-danger btn-lg mt-6" onClick={handleEndCall}>
              Cancel
            </button>
          </>
        )}

        {callState === 'CONNECTED' && (
          <>
            <p className="text-green-700 font-bold text-2xl mt-4">{formatTime(duration)}</p>
            <p className="text-sm text-gray-500 mt-2">Connected</p>
            <button className="btn btn-danger btn-lg mt-6" onClick={handleEndCall}>
              End Call
            </button>
          </>
        )}

        {callState === 'ENDED' && (
          <>
            <p className="text-gray-500 mt-4">Call ended</p>
            <p className="text-sm text-gray-500">Duration: {formatTime(duration)}</p>
            <button
              className="btn btn-primary btn-lg mt-6"
              onClick={() => router.push('/dashboard')}
            >
              Back to Dashboard
            </button>
          </>
        )}

        {callState === 'ERROR' && (
          <>
            <p className="error-text mt-4">{errorMessage}</p>
            <button
              className="btn btn-primary btn-lg mt-6"
              onClick={() => router.push('/dashboard')}
            >
              Back to Dashboard
            </button>
          </>
        )}
      </div>
    </main>
  );
}
