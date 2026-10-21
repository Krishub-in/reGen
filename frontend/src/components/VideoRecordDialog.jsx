import { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Video,
  Mic,
  MicOff,
  Square,
  RotateCw,
  Send,
  AlertCircle,
  Loader2,
  CheckCircle2,
} from 'lucide-react';
import fixWebmDuration from 'fix-webm-duration';
import { stopMediaStream, parseMediaError } from '../lib/mediaUtils';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

export default function VideoRecordDialog({
  isOpen,
  onClose,
  onSendVideo,
  title = 'Record Video Message',
  isPending = false,
}) {
  const [stream, setStream] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [recordDuration, setRecordDuration] = useState(0);
  const [recordedVideo, setRecordedVideo] = useState(null); // { blob, url, base64, duration }
  const [caption, setCaption] = useState('');
  const [micMuted, setMicMuted] = useState(false);
  const [cameraError, setCameraError] = useState(null);

  const videoPreviewRef = useRef(null);
  const reviewVideoRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);
  const startTimeRef = useRef(null);

  // Pick supported MIME type
  const getSupportedMimeType = () => {
    const types = [
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm;codecs=h264,opus',
      'video/webm',
      'video/mp4',
    ];
    for (const t of types) {
      if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t)) {
        return t;
      }
    }
    return 'video/webm';
  };

  // Start webcam and mic stream
  const startCamera = async () => {
    setCameraError(null);
    try {
      if (stream) {
        stopMediaStream(stream);
      }
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'user',
        },
        audio: true,
      });

      setStream(mediaStream);
      if (videoPreviewRef.current) {
        videoPreviewRef.current.srcObject = mediaStream;
        videoPreviewRef.current.muted = true;
        videoPreviewRef.current.play().catch(() => {});
      }
    } catch (err) {
      console.error('[VideoRecordDialog] Camera access error:', err);
      const parsed = parseMediaError(err, 'video');
      setCameraError(parsed);
    }
  };

  // Open camera when dialog opens
  useEffect(() => {
    if (isOpen && !recordedVideo) {
      startCamera();
    }
    if (!isOpen) {
      handleCleanClose();
    }
    return () => {
      if (stream) {
        stopMediaStream(stream);
      }
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isOpen]);

  // Connect stream to video tag whenever stream is set
  useEffect(() => {
    if (stream && videoPreviewRef.current && !recordedVideo) {
      videoPreviewRef.current.srcObject = stream;
      videoPreviewRef.current.muted = true;
      videoPreviewRef.current.play().catch(() => {});
    }
  }, [stream, recordedVideo]);

  const toggleMic = () => {
    if (stream) {
      stream.getAudioTracks().forEach((track) => {
        track.enabled = !track.enabled;
      });
      setMicMuted((prev) => !prev);
    }
  };

  // Start recording
  const startRecording = () => {
    if (!stream) {
      toast.error('Camera stream is not available');
      return;
    }
    try {
      chunksRef.current = [];
      const mimeType = getSupportedMimeType();
      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      recorder.onstop = async () => {
        setIsProcessing(true);
        const elapsedMs = Math.max(Date.now() - (startTimeRef.current || Date.now()), 500);
        const durationSecs = Math.max(Math.round(elapsedMs / 1000), 1);
        const rawBlob = new Blob(chunksRef.current, { type: mimeType });

        let fixedBlob = rawBlob;
        try {
          // Fix WebM header to inject duration and cues for immediate playback
          fixedBlob = await fixWebmDuration(rawBlob, elapsedMs, { logger: false });
        } catch (err) {
          console.warn('[VideoRecordDialog] WebM duration patching fallback:', err);
          fixedBlob = rawBlob;
        }

        const videoUrl = URL.createObjectURL(fixedBlob);
        const reader = new FileReader();
        reader.readAsDataURL(fixedBlob);
        reader.onloadend = () => {
          setRecordedVideo({
            blob: fixedBlob,
            url: videoUrl,
            base64: reader.result,
            duration: durationSecs,
          });
          setIsProcessing(false);

          // Stop live camera to release hardware
          if (stream) {
            stopMediaStream(stream);
            setStream(null);
          }
        };
      };

      startTimeRef.current = Date.now();
      recorder.start(250); // collect in chunks
      setIsRecording(true);
      setRecordDuration(0);

      // Accurate live timer based on timestamps
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = setInterval(() => {
        const secs = Math.floor((Date.now() - startTimeRef.current) / 1000);
        if (secs >= 120) {
          stopRecording();
          return;
        }
        setRecordDuration(secs);
      }, 500);
    } catch (err) {
      console.error('[VideoRecordDialog] startRecording error:', err);
      toast.error('Failed to start video recording');
    }
  };

  // Stop recording
  const stopRecording = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch (err) {
        console.error(err);
      }
    }
    setIsRecording(false);
  };

  // Retake video
  const handleRetake = () => {
    if (recordedVideo?.url) {
      URL.revokeObjectURL(recordedVideo.url);
    }
    setRecordedVideo(null);
    setRecordDuration(0);
    setCaption('');
    setIsProcessing(false);
    startCamera();
  };

  // Clean close
  const handleCleanClose = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (stream) {
      stopMediaStream(stream);
      setStream(null);
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch {}
    }
    mediaRecorderRef.current = null;
    if (recordedVideo?.url) {
      URL.revokeObjectURL(recordedVideo.url);
    }
    setRecordedVideo(null);
    setIsRecording(false);
    setIsProcessing(false);
    setRecordDuration(0);
    setCaption('');
    setCameraError(null);
    onClose();
  };

  // Submit and send
  const handleSend = () => {
    if (!recordedVideo || isProcessing) return;
    onSendVideo({
      videoBlob: recordedVideo.blob,
      base64Data: recordedVideo.base64,
      duration: recordedVideo.duration,
      caption: caption.trim(),
    });
    handleCleanClose();
  };

  const formatTimer = (secs) => {
    const s = Number(secs) || 0;
    const m = Math.floor(s / 60);
    const rem = s % 60;
    return `${m}:${rem < 10 ? '0' : ''}${rem}`;
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) handleCleanClose(); }}>
      <DialogContent className="sm:max-w-lg bg-card text-foreground border border-border shadow-2xl p-5 space-y-4 rounded-2xl">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <div className="h-8 w-8 rounded-xl bg-teal-500/10 text-teal-600 dark:text-teal-400 flex items-center justify-center">
                <Video className="h-4 w-4" />
              </div>
              <span>{title}</span>
            </DialogTitle>
            {isRecording && (
              <Badge variant="destructive" className="animate-pulse gap-1.5 text-xs font-mono">
                <span className="h-2 w-2 rounded-full bg-white animate-ping" />
                REC {formatTimer(recordDuration)}
              </Badge>
            )}
            {recordedVideo && !isProcessing && (
              <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30 text-xs font-mono">
                Ready ({formatTimer(recordedVideo.duration)})
              </Badge>
            )}
          </div>
        </DialogHeader>

        {/* Camera Permission / Hardware Error Screen */}
        {cameraError ? (
          <div className="p-6 bg-destructive/10 border border-destructive/20 rounded-2xl text-center space-y-3">
            <div className="h-12 w-12 rounded-full bg-destructive/20 text-destructive flex items-center justify-center mx-auto">
              <AlertCircle className="h-6 w-6" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-foreground">{cameraError.title || 'Camera Access Required'}</h4>
              <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto leading-relaxed">
                {cameraError.message || 'Please grant camera and microphone permissions to record video messages.'}
              </p>
            </div>
            <div className="pt-2 flex justify-center gap-2">
              <Button size="sm" variant="outline" onClick={handleCleanClose}>
                Cancel
              </Button>
              <Button size="sm" onClick={startCamera} className="bg-teal-600 hover:bg-teal-700 text-white gap-1.5">
                <RotateCw className="h-3.5 w-3.5" />
                Try Again
              </Button>
            </div>
          </div>
        ) : isProcessing ? (
          /* Processing Video Screen */
          <div className="rounded-2xl overflow-hidden bg-black/95 aspect-video border border-border flex flex-col items-center justify-center space-y-3 text-white shadow-inner">
            <Loader2 className="h-8 w-8 animate-spin text-teal-400" />
            <p className="text-xs font-medium text-zinc-300">Preparing recorded video...</p>
          </div>
        ) : recordedVideo ? (
          /* Video Review Mode */
          <div className="space-y-3">
            <div className="relative rounded-2xl overflow-hidden bg-black aspect-video border border-border flex items-center justify-center shadow-inner">
              <video
                key={recordedVideo.url}
                ref={reviewVideoRef}
                src={recordedVideo.url}
                controls
                playsInline
                preload="auto"
                onLoadedMetadata={(e) => {
                  const v = e.target;
                  if (v.duration === Infinity || isNaN(v.duration)) {
                    v.currentTime = 1e101;
                    v.ontimeupdate = () => {
                      v.ontimeupdate = null;
                      v.currentTime = 0;
                    };
                  }
                }}
                className="w-full h-full object-contain bg-black"
              />
            </div>

            {/* Caption Input */}
            <div className="space-y-1">
              <Input
                placeholder="Add a message or caption with this video..."
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                className="text-xs h-9 bg-background"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSend();
                }}
              />
            </div>
          </div>
        ) : (
          /* Live Camera Recording Mode */
          <div className="space-y-3">
            <div className="relative rounded-2xl overflow-hidden bg-black aspect-video border border-border flex items-center justify-center shadow-inner">
              <video
                ref={videoPreviewRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
              />

              {/* Recording Overlay */}
              {isRecording && (
                <div className="absolute top-3 left-3 bg-black/60 backdrop-blur-md px-2.5 py-1 rounded-full flex items-center gap-2 text-white text-xs font-mono">
                  <span className="h-2.5 w-2.5 rounded-full bg-red-500 animate-ping" />
                  <span>{formatTimer(recordDuration)}</span>
                </div>
              )}

              {/* In-view Mic Toggle Button */}
              <div className="absolute top-3 right-3">
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  onClick={toggleMic}
                  className="h-8 w-8 rounded-full bg-black/50 hover:bg-black/70 text-white backdrop-blur-xs cursor-pointer"
                  title={micMuted ? 'Unmute Microphone' : 'Mute Microphone'}
                >
                  {micMuted ? <MicOff className="h-4 w-4 text-red-400" /> : <Mic className="h-4 w-4" />}
                </Button>
              </div>

              {!isRecording && (
                <div className="absolute bottom-3 left-3 bg-black/60 backdrop-blur-md px-2.5 py-1 rounded-full text-[11px] text-zinc-300">
                  Ready to record • Max 2 mins
                </div>
              )}
            </div>
          </div>
        )}

        {/* Footer Actions */}
        <DialogFooter className="flex sm:justify-between items-center gap-2 pt-2 border-t border-border">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleCleanClose}
            className="rounded-xl text-xs text-muted-foreground hover:text-foreground"
          >
            Cancel
          </Button>

          <div className="flex items-center gap-2">
            {recordedVideo && !isProcessing ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleRetake}
                  className="rounded-xl text-xs gap-1.5 cursor-pointer"
                >
                  <RotateCw className="h-3.5 w-3.5" />
                  Retake
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={handleSend}
                  disabled={isPending}
                  className="rounded-xl text-xs bg-teal-600 hover:bg-teal-700 text-white font-semibold gap-1.5 shadow-xs cursor-pointer"
                >
                  <Send className="h-3.5 w-3.5" />
                  {isPending ? 'Sending...' : 'Send Video'}
                </Button>
              </>
            ) : isRecording ? (
              <Button
                type="button"
                size="sm"
                onClick={stopRecording}
                className="rounded-xl text-xs bg-red-600 hover:bg-red-700 text-white font-semibold gap-1.5 animate-pulse shadow-xs cursor-pointer"
              >
                <Square className="h-3.5 w-3.5 fill-current" />
                Stop & Review
              </Button>
            ) : (
              <Button
                type="button"
                size="sm"
                onClick={startRecording}
                disabled={!stream || !!cameraError || isProcessing}
                className="rounded-xl text-xs bg-red-600 hover:bg-red-700 text-white font-semibold gap-1.5 shadow-xs cursor-pointer"
              >
                <span className="h-2.5 w-2.5 rounded-full bg-white" />
                Start Recording
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
