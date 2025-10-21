export interface WebRTCConfig extends RTCConfiguration {
  iceServers: RTCIceServer[];
  iceTransportPolicy: 'all' | 'relay';
  iceCandidatePoolSize: number;
}

export const webrtcConfig: WebRTCConfig = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    {
      urls: 'turn:openrelay.metered.ca:80',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
    {
      urls: 'turn:openrelay.metered.ca:443',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
  ],
  iceTransportPolicy: 'all',
  iceCandidatePoolSize: 10,
};

export default webrtcConfig;
