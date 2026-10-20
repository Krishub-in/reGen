/**
 * Media devices utility for WebRTC calls and voice messages.
 * Handles device availability, permissions, constraints, and cleanup.
 */

/**
 * Cleanly stop all tracks in a MediaStream.
 */
export function stopMediaStream(stream) {
  if (!stream) return;
  try {
    const tracks = stream.getTracks ? stream.getTracks() : [];
    tracks.forEach((track) => {
      try {
        track.stop();
      } catch {}
      try {
        if (typeof stream.removeTrack === 'function') {
          stream.removeTrack(track);
        }
      } catch {}
    });
  } catch (e) {
    console.warn('[mediaUtils] Error stopping media tracks:', e);
  }
}

/**
 * Parse browser getUserMedia DOMException into clear, actionable messages.
 */
export function parseMediaError(err, requestedType = 'audio') {
  const name = err?.name || '';
  const msg = String(err?.message || '').toLowerCase();

  // NotFoundError / DevicesNotFoundError / "requested device not found"
  if (
    name === 'NotFoundError' ||
    name === 'DevicesNotFoundError' ||
    msg.includes('requested device not found') ||
    msg.includes('device not found') ||
    msg.includes('not found')
  ) {
    if (requestedType === 'video') {
      return {
        title: 'Camera or Microphone Not Found',
        message:
          'No camera or microphone was detected on your device. Please plug in a webcam and microphone, or make sure your device is enabled in system settings.',
        troubleshooting: [
          'Ensure your webcam/headset is securely plugged in.',
          'Verify that camera and microphone are enabled in Windows Settings > Privacy.',
          'If you only have a microphone, you can switch to a Voice Call.',
        ],
        type: 'device_not_found',
      };
    }
    return {
      title: 'Microphone Not Found',
      message:
        'No microphone was detected on your device. Please connect a microphone or headset and click Retry.',
      troubleshooting: [
        'Plug in your microphone, headset, or earphones.',
        'Check Windows Settings > Privacy > Microphone to ensure apps have access.',
        'Verify your default recording device in Windows Sound settings.',
      ],
      type: 'device_not_found',
    };
  }

  // NotAllowedError / PermissionDeniedError
  if (
    name === 'NotAllowedError' ||
    name === 'PermissionDeniedError' ||
    msg.includes('permission denied') ||
    msg.includes('not allowed') ||
    msg.includes('permission dismissed')
  ) {
    return {
      title: 'Permission Denied',
      message:
        'Access to your microphone or camera was blocked by your browser. Please grant permission to continue.',
      troubleshooting: [
        'Click the lock or camera icon on the left side of your browser address bar.',
        'Set Microphone and Camera to "Allow".',
        'Reload the page or click Retry below.',
      ],
      type: 'permission_denied',
    };
  }

  // NotReadableError / TrackStartError
  if (
    name === 'NotReadableError' ||
    name === 'TrackStartError' ||
    msg.includes('could not start') ||
    msg.includes('already in use') ||
    msg.includes('in use')
  ) {
    return {
      title: 'Device Already in Use',
      message:
        'Your microphone or camera is currently being used by another application (e.g. Zoom, Teams, Meet, or another browser tab).',
      troubleshooting: [
        'Close other apps or browser tabs that might be using your microphone/webcam.',
        'Unplug and reconnect your headset or webcam.',
        'Click Retry once other applications are closed.',
      ],
      type: 'device_busy',
    };
  }

  // OverconstrainedError
  if (name === 'OverconstrainedError') {
    return {
      title: 'Unsupported Device Settings',
      message:
        'The requested video or audio settings are not supported by your hardware.',
      troubleshooting: [
        'Default device constraints will be used automatically on retry.',
        'Click Retry to connect using default audio/video settings.',
      ],
      type: 'overconstrained',
    };
  }

  // Insecure context (HTTP on external network)
  if (!navigator?.mediaDevices || !navigator?.mediaDevices?.getUserMedia) {
    return {
      title: 'Microphone & Camera Unavailable',
      message:
        'Microphone and camera access requires a secure connection (HTTPS or localhost).',
      troubleshooting: [
        'Access the application via http://localhost or using a secure HTTPS connection.',
      ],
      type: 'insecure_context',
    };
  }

  return {
    title: 'Microphone / Camera Error',
    message: err?.message || 'Unable to access your audio or video device. Please check your hardware connection.',
    troubleshooting: [
      'Check that your microphone and camera are connected.',
      'Check browser permissions.',
      'Click Retry to try again.',
    ],
    type: 'unknown',
  };
}

/**
 * Acquire media stream with robust fallback and clean constraints.
 * - Video calls: { audio: true, video: true } with automatic fallback to { audio: true } if camera is missing
 * - Voice calls / voice messages: { audio: true }
 */
export async function getSafeMediaStream({
  mediaType = 'voice',
  allowAudioFallback = true,
  onAudioFallback = null,
} = {}) {
  if (!navigator?.mediaDevices?.getUserMedia) {
    throw new Error('navigator.mediaDevices.getUserMedia is not supported or requires a secure context (HTTPS/localhost).');
  }

  const isVideo = mediaType === 'video';

  if (isVideo) {
    // Standard constraint: { audio: true, video: true } without hardcoded device IDs or overconstraints
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
      return { stream, fallbackToAudio: false };
    } catch (err) {
      const isNotFound =
        err?.name === 'NotFoundError' ||
        err?.name === 'DevicesNotFoundError' ||
        String(err?.message || '').toLowerCase().includes('not found');

      // If camera is missing, but allowAudioFallback is enabled, try audio-only fallback
      if (isNotFound && allowAudioFallback) {
        try {
          const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
          if (typeof onAudioFallback === 'function') {
            onAudioFallback();
          }
          return { stream: audioStream, fallbackToAudio: true };
        } catch (audioErr) {
          // If audio also failed, throw the original or audio error
          throw audioErr;
        }
      }
      throw err;
    }
  }

  // Audio-only constraint for voice calls & voice messages
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  return { stream, fallbackToAudio: false };
}

/**
 * Check permission status for audio / video where supported by browser.
 */
export async function checkMediaPermissions() {
  const result = { microphone: 'prompt', camera: 'prompt', supported: false };
  if (typeof navigator === 'undefined' || !navigator?.permissions?.query) {
    return result;
  }
  result.supported = true;
  try {
    const micStatus = await navigator.permissions.query({ name: 'microphone' });
    result.microphone = micStatus.state; // 'granted' | 'denied' | 'prompt'
  } catch {}
  try {
    const camStatus = await navigator.permissions.query({ name: 'camera' });
    result.camera = camStatus.state;
  } catch {}
  return result;
}
