import { createHmac } from 'crypto';

/**
 * WebRTC client library — shared between guest PWA and staff PWA.
 *
 * Provides:
 *   - ICE server config generation (STUN + time-limited TURN credentials)
 *   - Peer connection factory
 *   - Offer/answer helpers
 *   - Audio track management
 *
 * This module is designed to run in the browser. The `crypto` import
 * is used only by `generateTurnCredentials()` which runs on the server
 * (signaling server generates creds and sends them to the client).
 * The browser-side code uses the pre-generated credentials.
 */

export interface TurnConfig {
  host: string;
  port: number;
  secret: string;
  realm: string;
  ttlSeconds: number;
}

export interface TurnCredentials {
  username: string;
  credential: string;
  ttl: number;
}

export interface IceServerConfig {
  urls: string | string[];
  username?: string;
  credential?: string;
}

/**
 * Generate time-limited TURN credentials using HMAC-SHA1
 * (coturn `use-auth-secret` mode per RFC 5766 §4.3.2).
 *
 * This function runs on the SERVER (signaling server) — never expose
 * the `secret` to the client. The generated credentials are sent to
 * the client as part of the call setup response.
 *
 * @param userId  Any unique identifier for the user (identity ID)
 * @param config  TURN server configuration including the shared secret
 */
export function generateTurnCredentials(
  userId: string,
  config: TurnConfig,
): TurnCredentials {
  const timestamp = Math.floor(Date.now() / 1000) + config.ttlSeconds;
  const username = `${timestamp}:${userId}`;
  const credential = createHmac('sha1', config.secret)
    .update(username)
    .digest('base64');

  return { username, credential, ttl: config.ttlSeconds };
}

/**
 * Build the ICE servers array for RTCPeerConnection configuration.
 * Includes both STUN (for NAT discovery) and TURN (for relay fallback).
 *
 * @param turnConfig  TURN server details
 * @param credentials  Pre-generated credentials from `generateTurnCredentials()`
 */
export function buildIceServers(
  turnConfig: TurnConfig,
  credentials: TurnCredentials,
): IceServerConfig[] {
  const turnUrl = `turn:${turnConfig.host}:${turnConfig.port}`;
  const stunUrl = `stun:${turnConfig.host}:${turnConfig.port}`;

  return [
    { urls: stunUrl },
    {
      urls: [turnUrl, `${turnUrl}?transport=udp`],
      username: credentials.username,
      credential: credentials.credential,
    },
  ];
}

/**
 * Browser-side WebRTC helper class.
 * Creates and manages a single RTCPeerConnection for an audio call.
 *
 * Usage (in React component):
 *   const client = new WebRtcPeerConnection(iceServers);
 *   await client.addLocalAudioTrack();
 *   const offer = await client.createOffer();
 *   // send offer via signaling...
 *   // on answer: client.setRemoteDescription(answer);
 *   // on ICE candidate: client.addIceCandidate(candidate);
 */
export class WebRtcPeerConnection {
  private pc: RTCPeerConnection;
  private _remoteStream: MediaStream | null = null;

  /** Callback when remote audio stream is received */
  onRemoteStream?: (stream: MediaStream) => void;
  /** Callback when a new ICE candidate is generated */
  onIceCandidate?: (candidate: RTCIceCandidate) => void;
  /** Callback when connection state changes */
  onStateChange?: (state: RTCPeerConnectionState) => void;

  constructor(iceServers: IceServerConfig[]) {
    this.pc = new RTCPeerConnection({
      iceServers: iceServers as RTCIceServer[],
      iceCandidatePoolSize: 10,
    });

    this.pc.ontrack = (event) => {
      this._remoteStream = event.streams[0] ?? null;
      if (this._remoteStream && this.onRemoteStream) {
        this.onRemoteStream(this._remoteStream);
      }
    };

    this.pc.onicecandidate = (event) => {
      if (event.candidate && this.onIceCandidate) {
        this.onIceCandidate(event.candidate);
      }
    };

    this.pc.onconnectionstatechange = () => {
      if (this.onStateChange) {
        this.onStateChange(this.pc.connectionState);
      }
    };
  }

  get remoteStream(): MediaStream | null {
    return this._remoteStream;
  }

  get connectionState(): RTCPeerConnectionState {
    return this.pc.connectionState;
  }

  /**
   * Request microphone access and add the audio track to the connection.
   * Call this BEFORE createOffer() or createAnswer().
   */
  async addLocalAudioTrack(): Promise<MediaStream> {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: false,
    });

    for (const track of stream.getAudioTracks()) {
      this.pc.addTrack(track, stream);
    }

    return stream;
  }

  /** Create an SDP offer (caller side) */
  async createOffer(): Promise<RTCSessionDescriptionInit> {
    const offer = await this.pc.createOffer({
      offerToReceiveAudio: true,
      offerToReceiveVideo: false,
    });
    await this.pc.setLocalDescription(offer);
    return offer;
  }

  /** Create an SDP answer (callee side, after setting remote offer) */
  async createAnswer(): Promise<RTCSessionDescriptionInit> {
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    return answer;
  }

  /** Set the remote SDP (offer on callee side, answer on caller side) */
  async setRemoteDescription(sdp: RTCSessionDescriptionInit): Promise<void> {
    await this.pc.setRemoteDescription(new RTCSessionDescription(sdp));
  }

  /** Add a remote ICE candidate received via signaling */
  async addIceCandidate(candidate: RTCIceCandidateInit): Promise<void> {
    await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
  }

  /** Close the connection and release resources */
  close(): void {
    this.pc.close();
    this._remoteStream = null;
  }
}
