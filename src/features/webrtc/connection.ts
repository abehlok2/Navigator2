import { webrtcConfig } from '../../config/webrtc';

export const ICE_GATHERING_TIMEOUT_MS = 30_000;

export type IceCandidateType = 'host' | 'srflx' | 'relay' | 'prflx' | 'unknown';
export type ConnectionType = 'direct' | 'relay' | 'failed';

export interface IceGatheringSummary {
  candidates: RTCIceCandidate[];
  candidateTypes: IceCandidateType[];
  timedOut: boolean;
}

export async function addAudioTrack(
  pc: RTCPeerConnection,
  stream: MediaStream,
): Promise<RTCRtpSender> {
  const audioTrack = stream.getAudioTracks()[0];

  if (!audioTrack) {
    throw new Error('No audio track available');
  }

  const sender = pc.addTrack(audioTrack, stream);

  const parameters = sender.getParameters();
  if (!parameters.encodings) {
    parameters.encodings = [{}];
  }
  parameters.encodings[0].maxBitrate = 128_000;
  parameters.encodings[0].priority = 'high';
  await sender.setParameters(parameters);

  return sender;
}

export interface RemoteStreamHandler {
  onTrack: (stream: MediaStream, participantId: string) => void;
  onTrackEnded: (participantId: string) => void;
}

export function setupRemoteStreamHandling(
  pc: RTCPeerConnection,
  participantId: string,
  handler: RemoteStreamHandler,
): void {
  pc.ontrack = (event) => {
    const [remoteStream] = event.streams;
    if (remoteStream) {
      handler.onTrack(remoteStream, participantId);
    }
  };

  pc.removetrack = () => {
    handler.onTrackEnded(participantId);
  };
}

export async function replaceAudioTrack(
  sender: RTCRtpSender,
  newStream: MediaStream,
): Promise<void> {
  const newTrack = newStream.getAudioTracks()[0] ?? null;
  await sender.replaceTrack(newTrack);
}

type CandidateStats = RTCStats & {
  candidateType?: RTCIceCandidateType;
  type: 'local-candidate' | 'remote-candidate';
};

export interface ManagedPeerConnection {
  pc: RTCPeerConnection;
  iceGathering: Promise<IceGatheringSummary>;
  connectionType: Promise<ConnectionType>;
}

export function createPeerConnection(
  config: RTCConfiguration = webrtcConfig,
): ManagedPeerConnection {
  const peerConnection = new RTCPeerConnection(config);

  peerConnection.addEventListener('icecandidateerror', (event: RTCPeerConnectionIceErrorEvent) => {
    console.error('[WebRTC] ICE candidate error:', event.errorText || event.errorCode);
  });

  attachIceFailureHandler(peerConnection);

  return {
    pc: peerConnection,
    iceGathering: monitorIceGathering(peerConnection),
    connectionType: detectConnectionType(peerConnection),
  };
}

export function logIceCandidate(candidate: RTCIceCandidate): void {
  const candidateType = getCandidateType(candidate);
  const protocol = getCandidateProtocol(candidate);
  console.log(`ICE Candidate: ${candidateType} - ${protocol}`);
}

export function detectConnectionType(
  pc: RTCPeerConnection,
): Promise<ConnectionType> {
  return new Promise((resolve) => {
    let settled = false;
    let timeoutId: number | null = null;
    const settle = (result: ConnectionType): void => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      resolve(result);
    };

    const cleanup = (): void => {
      pc.removeEventListener('iceconnectionstatechange', onIceConnectionStateChange);
      pc.removeEventListener('connectionstatechange', onConnectionStateChange);
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
    };

    const inferAndSettle = async (): Promise<void> => {
      try {
        const connectionType = await inferConnectionTypeFromStats(pc);
        console.info(`[WebRTC] Connection established using ${connectionType} transport.`);
        settle(connectionType);
      } catch (error) {
        console.error('[WebRTC] Failed to determine connection type:', error);
        settle('failed');
      }
    };

    const onIceConnectionStateChange = (): void => {
      const state = pc.iceConnectionState;
      if (state === 'failed') {
        console.warn('[WebRTC] ICE connection failed while detecting connection type.');
        settle('failed');
        return;
      }

      if (state === 'connected' || state === 'completed') {
        void inferAndSettle();
      }
    };

    const onConnectionStateChange = (): void => {
      if (pc.connectionState === 'failed') {
        settle('failed');
      }
    };

    timeoutId = window.setTimeout(() => {
      console.warn('[WebRTC] Timed out waiting to detect connection type.');
      settle('failed');
    }, ICE_GATHERING_TIMEOUT_MS);

    pc.addEventListener('iceconnectionstatechange', onIceConnectionStateChange);
    pc.addEventListener('connectionstatechange', onConnectionStateChange);

    const initialState = pc.iceConnectionState;
    if (initialState === 'failed') {
      settle('failed');
    } else if (initialState === 'connected' || initialState === 'completed') {
      void inferAndSettle();
    }
  });
}

function monitorIceGathering(pc: RTCPeerConnection): Promise<IceGatheringSummary> {
  return new Promise((resolve) => {
    const candidates: RTCIceCandidate[] = [];
    const candidateTypes = new Set<IceCandidateType>();
    let timedOut = false;
    let completed = false;
    let timeoutId: number | null = null;

    const finish = (): void => {
      if (completed) {
        return;
      }
      completed = true;
      cleanup();

      const result: IceGatheringSummary = {
        candidates,
        candidateTypes: Array.from(candidateTypes),
        timedOut,
      };

      const missingTypes = ['host', 'srflx', 'relay'].filter(
        (type) => !candidateTypes.has(type as IceCandidateType),
      );

      if (timedOut) {
        console.warn(
          `[WebRTC] ICE gathering timed out after ${ICE_GATHERING_TIMEOUT_MS}ms. Found candidate types: ${
            result.candidateTypes.length > 0
              ? result.candidateTypes.join(', ')
              : 'none'
          }`,
        );
      } else {
        console.info(
          `[WebRTC] ICE gathering completed with candidate types: ${
            result.candidateTypes.length > 0
              ? result.candidateTypes.join(', ')
              : 'none'
          }`,
        );
      }

      if (missingTypes.length > 0 && !timedOut) {
        console.debug(
          `[WebRTC] Missing ICE candidate types: ${missingTypes.join(', ')}. TURN fallback may still occur if needed.`,
        );
      }

      resolve(result);
    };

    const cleanup = (): void => {
      pc.removeEventListener('icecandidate', onIceCandidate);
      pc.removeEventListener('icegatheringstatechange', onIceGatheringStateChange);
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
    };

    const onIceCandidate = (event: RTCPeerConnectionIceEvent): void => {
      const { candidate } = event;
      if (candidate) {
        logIceCandidate(candidate);
        candidates.push(candidate);
        candidateTypes.add(getCandidateType(candidate));
        return;
      }

      finish();
    };

    const onIceGatheringStateChange = (): void => {
      if (pc.iceGatheringState === 'complete') {
        finish();
      }
    };

    timeoutId = window.setTimeout(() => {
      timedOut = true;
      finish();
    }, ICE_GATHERING_TIMEOUT_MS);

    pc.addEventListener('icecandidate', onIceCandidate);
    pc.addEventListener('icegatheringstatechange', onIceGatheringStateChange);

    if (pc.iceGatheringState === 'complete') {
      finish();
    }
  });
}

function attachIceFailureHandler(pc: RTCPeerConnection): void {
  let hasRestarted = false;

  const onIceConnectionStateChange = (): void => {
    const state = pc.iceConnectionState;
    if (state === 'failed') {
      console.warn('[WebRTC] ICE connection failed. Attempting to restart ICE.');
      if (!hasRestarted && typeof pc.restartIce === 'function') {
        hasRestarted = true;
        try {
          pc.restartIce();
        } catch (error) {
          console.error('[WebRTC] Failed to restart ICE:', error);
        }
      }
    }
  };

  pc.addEventListener('iceconnectionstatechange', onIceConnectionStateChange);
}

function getCandidateType(candidate: RTCIceCandidate): IceCandidateType {
  if (candidate.type) {
    return candidate.type;
  }

  const parsedType = extractCandidateAttribute(candidate, 'typ');
  if (parsedType === 'host' || parsedType === 'srflx' || parsedType === 'relay' || parsedType === 'prflx') {
    return parsedType;
  }

  return 'unknown';
}

function getCandidateProtocol(candidate: RTCIceCandidate): string {
  if (candidate.protocol) {
    return candidate.protocol;
  }

  const parts = candidate.candidate?.split(' ');
  return parts && parts.length >= 3 ? parts[2] : 'unknown';
}

function extractCandidateAttribute(
  candidate: RTCIceCandidate,
  attribute: string,
): string | null {
  if (!candidate.candidate) {
    return null;
  }

  const regex = new RegExp(`${attribute} ([^ ]+)`);
  const match = candidate.candidate.match(regex);
  return match ? match[1] : null;
}

async function inferConnectionTypeFromStats(
  pc: RTCPeerConnection,
): Promise<ConnectionType> {
  const stats = await pc.getStats();
  let usesRelay = false;

  stats.forEach((report) => {
    if (report.type !== 'candidate-pair') {
      return;
    }

    const pair = report as RTCIceCandidatePairStats;
    const nominated = pair.nominated ?? (pair as Partial<{ selected: boolean }>).selected ?? false;
    if (pair.state !== 'succeeded' || !nominated) {
      return;
    }

    const localCandidate = pair.localCandidateId ? stats.get(pair.localCandidateId) : undefined;
    const remoteCandidate = pair.remoteCandidateId ? stats.get(pair.remoteCandidateId) : undefined;

    if (isIceCandidateStats(localCandidate) && localCandidate.candidateType === 'relay') {
      usesRelay = true;
    }

    if (isIceCandidateStats(remoteCandidate) && remoteCandidate.candidateType === 'relay') {
      usesRelay = true;
    }
  });

  return usesRelay ? 'relay' : 'direct';
}

function isIceCandidateStats(stat: RTCStats | undefined): stat is CandidateStats {
  if (!stat) {
    return false;
  }

  return stat.type === 'local-candidate' || stat.type === 'remote-candidate';
}

