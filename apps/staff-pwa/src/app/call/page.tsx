'use client';
import { useEffect, useState, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuth } from '@/context/auth-context';
import { env } from '@/lib/env';

type CallState = 'IDLE' | 'INCOMING' | 'CONNECTED' | 'ENDED';

export default function StaffCallScreen() {
  const { accessToken, department } = useAuth();
  const [callState, setCallState] = useState<CallState>('IDLE');
  const [fromRoom, setFromRoom] = useState('');
  const [callId, setCallId] = useState('');
  const [duration, setDuration] = useState(0);

  const socketRef = useRef<Socket | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);

  const cleanup = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    pcRef.current?.close(); pcRef.current = null;
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    setDuration(0);
  }, []);

  useEffect(() => {
    if (!accessToken) return;

    const socket = io(env.signalingUrl, {
      auth: { token: accessToken },
      transports: ['websocket'],
      query: { department: department ?? '' },
    });
    socketRef.current = socket;

    socket.on('call:incoming', (data: { call_id: string; from_room: string }) => {
      setCallId(data.call_id);
      setFromRoom(data.from_room);
      setCallState('INCOMING');
    });

    socket.on('call:accepted', async (data: { call_id: string; peer_socket_id: string }) => {
      // We are the callee — wait for caller's SDP offer
    });

    socket.on('call:sdp', async (data: { call_id: string; sdp: RTCSessionDescriptionInit }) => {
      if (!pcRef.current) {
        // Create peer connection on first SDP (offer from caller)
        const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
        pcRef.current = pc;

        const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false });
        localStreamRef.current = stream;
        stream.getTracks().forEach((track) => pc.addTrack(track, stream));

        pc.ontrack = (event) => {
          if (remoteAudioRef.current && event.streams[0]) remoteAudioRef.current.srcObject = event.streams[0];
        };
        pc.onicecandidate = (event) => {
          if (event.candidate) socket.emit('call:ice-candidate', { call_id: callId, candidate: event.candidate.toJSON() });
        };

        await pc.setRemoteDescription(data.sdp);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('call:sdp', { call_id: callId, sdp: answer });

        setCallState('CONNECTED');
        timerRef.current = setInterval(() => setDuration((d) => d + 1), 1000);
      } else if (data.sdp.type === 'offer') {
        await pcRef.current.setRemoteDescription(data.sdp);
        const answer = await pcRef.current.createAnswer();
        await pcRef.current.setLocalDescription(answer);
        socket.emit('call:sdp', { call_id: callId, sdp: answer });
      }
    });

    socket.on('call:ice-candidate', async (data: { candidate: RTCIceCandidateInit }) => {
      if (pcRef.current) await pcRef.current.addIceCandidate(data.candidate);
    });

    socket.on('call:ended', () => { setCallState('ENDED'); cleanup(); });

    return () => { socket.disconnect(); cleanup(); };
  }, [accessToken, department, cleanup, callId]);

  const handleAccept = () => {
    socketRef.current?.emit('call:accept', { call_id: callId });
    // SDP exchange happens in call:sdp handler above
  };

  const handleReject = () => {
    socketRef.current?.emit('call:reject', { call_id: callId });
    setCallState('IDLE'); setFromRoom(''); setCallId('');
  };

  const handleEnd = () => {
    socketRef.current?.emit('call:end', { call_id: callId });
    setCallState('ENDED'); cleanup();
  };

  const fmt = (s: number) => `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;

  return (
    <main style={{ maxWidth: '24rem', margin: '4rem auto', padding: '1rem', textAlign: 'center' }}>
      <audio ref={remoteAudioRef} autoPlay playsInline />

      {callState === 'IDLE' && (
        <div style={{ background: '#fff', borderRadius: '0.75rem', padding: '2rem', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 600 }}>Waiting for calls...</h2>
          <p style={{ color: '#6b7280', fontSize: '0.875rem', marginTop: '0.5rem' }}>Keep this page open to receive incoming calls.</p>
        </div>
      )}

      {callState === 'INCOMING' && (
        <div style={{ background: '#fff', borderRadius: '0.75rem', padding: '2rem', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', border: '2px solid #059669' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 600 }}>Incoming Call</h2>
          <p style={{ fontSize: '1.5rem', fontWeight: 700, margin: '1rem 0' }}>Room {fromRoom}</p>
          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
            <button onClick={handleAccept} style={{ padding: '0.875rem 2rem', borderRadius: '0.5rem', background: '#059669', color: '#fff', border: 'none', fontWeight: 600, fontSize: '1rem', cursor: 'pointer' }}>Answer</button>
            <button onClick={handleReject} style={{ padding: '0.875rem 2rem', borderRadius: '0.5rem', background: '#dc2626', color: '#fff', border: 'none', fontWeight: 600, fontSize: '1rem', cursor: 'pointer' }}>Decline</button>
          </div>
        </div>
      )}

      {callState === 'CONNECTED' && (
        <div style={{ background: '#fff', borderRadius: '0.75rem', padding: '2rem', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
          <p style={{ color: '#059669', fontWeight: 700, fontSize: '2rem' }}>{fmt(duration)}</p>
          <p style={{ fontWeight: 500 }}>Room {fromRoom}</p>
          <button onClick={handleEnd} style={{ marginTop: '1.5rem', padding: '0.875rem 2rem', borderRadius: '0.5rem', background: '#dc2626', color: '#fff', border: 'none', fontWeight: 600, fontSize: '1rem', cursor: 'pointer' }}>End Call</button>
        </div>
      )}

      {callState === 'ENDED' && (
        <div style={{ background: '#fff', borderRadius: '0.75rem', padding: '2rem', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
          <p>Call ended — {fmt(duration)}</p>
          <button onClick={() => { setCallState('IDLE'); setFromRoom(''); }} style={{ marginTop: '1rem', padding: '0.5rem 1rem', borderRadius: '0.5rem', background: '#059669', color: '#fff', border: 'none', cursor: 'pointer' }}>Ready for next call</button>
        </div>
      )}
    </main>
  );
}
