import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { 
  Mic, 
  MicOff, 
  Square, 
  Play, 
  Pause, 
  Trash2, 
  Volume2, 
  Sparkles, 
  Radio
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { stopMediaStream } from '@/lib/mediaUtils';

/**
 * VoiceDescriptionInput:
 * Provides multi-modal description input:
 * 1. Text typing
 * 2. Voice-to-text live transcription (Web Speech API)
 * 3. Voice note audio recording & playback (MediaRecorder)
 */
export default function VoiceDescriptionInput({
  id = 'voice-desc-input',
  label = 'Description',
  value = '',
  onChange,
  voiceNote = '',
  onVoiceNoteChange,
  placeholder = 'Add task or project details...',
  rows = 3,
  className = '',
}) {
  // Speech-to-Text State
  const [isTranscribing, setIsTranscribing] = useState(false);
  const recognitionRef = useRef(null);

  // Voice Note Recording State
  const [isRecordingNote, setIsRecordingNote] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const timerRef = useRef(null);

  // Audio Playback State
  const [isPlayingNote, setIsPlayingNote] = useState(false);
  const audioRef = useRef(null);

  // Extract embedded voice note if present in value
  const embeddedVoiceNoteMatch = typeof value === 'string' ? value.match(/\[voice_note:(data:audio\/[^\]]+)\]/) : null;
  const activeVoiceNote = voiceNote || (embeddedVoiceNoteMatch ? embeddedVoiceNoteMatch[1] : '');

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch {}
      }
      if (mediaRecorderRef.current) {
        try {
          if (mediaRecorderRef.current.stream) {
            stopMediaStream(mediaRecorderRef.current.stream);
          }
          if (mediaRecorderRef.current.state !== 'inactive') {
            mediaRecorderRef.current.stop();
          }
        } catch {}
      }
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  // ========================================================
  // 1. Voice to Text (Live Dictation via Web Speech API)
  // ========================================================
  const toggleVoiceToText = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      toast.error('Voice-to-text is not supported in this browser. Please use Chrome, Edge, or Safari.');
      return;
    }

    if (isTranscribing) {
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch {}
      }
      setIsTranscribing(false);
      toast.info('Voice dictation paused');
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      let initialText = value ? value.trim() + ' ' : '';

      recognition.onstart = () => {
        setIsTranscribing(true);
        toast.success('Listening... Speak clearly to transcribe into description.');
      };

      recognition.onresult = (event) => {
        let transcript = '';
        for (let i = 0; i < event.results.length; i++) {
          transcript += event.results[i][0].transcript;
        }
        if (transcript) {
          const updated = (initialText + transcript).trim();
          onChange(updated);
        }
      };

      recognition.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        if (event.error === 'not-allowed') {
          toast.error('Microphone access denied for voice-to-text. Please check browser permissions.');
        } else if (event.error !== 'no-speech') {
          toast.error(`Voice transcription: ${event.error}`);
        }
        setIsTranscribing(false);
      };

      recognition.onend = () => {
        setIsTranscribing(false);
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (err) {
      console.error('Failed to start speech recognition:', err);
      toast.error('Could not initialize speech recognition');
      setIsTranscribing(false);
    }
  };

  // ========================================================
  // 2. Voice Note Recording (Audio file via MediaRecorder)
  // ========================================================
  const startVoiceNoteRecording = async () => {
    if (isTranscribing) {
      try { recognitionRef.current?.stop(); } catch {}
      setIsTranscribing(false);
    }

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        toast.error('Audio recording not supported in this environment');
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];

      let mimeType = 'audio/webm';
      if (typeof MediaRecorder !== 'undefined') {
        if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) mimeType = 'audio/webm;codecs=opus';
        else if (MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')) mimeType = 'audio/ogg;codecs=opus';
        else if (MediaRecorder.isTypeSupported('audio/mp4')) mimeType = 'audio/mp4';
      }

      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      recorder.onstop = () => {
        stopMediaStream(stream);
        if (timerRef.current) clearInterval(timerRef.current);

        const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        const reader = new FileReader();
        reader.onloadend = () => {
          const dataUrl = reader.result;
          if (onVoiceNoteChange) {
            onVoiceNoteChange(dataUrl);
          } else {
            // Embed into description if no separate handler
            const cleanText = (value || '').replace(/\[voice_note:[^\]]+\]/g, '').trim();
            const withVoice = `${cleanText}\n[voice_note:${dataUrl}]`.trim();
            onChange(withVoice);
          }
          toast.success('Voice note recorded successfully!');
        };
        reader.readAsDataURL(blob);
      };

      mediaRecorderRef.current = recorder;
      recorder.start(250);
      setIsRecordingNote(true);
      setRecordingDuration(0);

      timerRef.current = setInterval(() => {
        setRecordingDuration(prev => prev + 1);
      }, 1000);

      toast.info('Recording voice note... Click stop when finished.');
    } catch (err) {
      console.error('Voice note recording failed:', err);
      toast.error('Microphone permission required to record voice notes');
      setIsRecordingNote(false);
    }
  };

  const stopVoiceNoteRecording = () => {
    if (mediaRecorderRef.current && isRecordingNote) {
      mediaRecorderRef.current.stop();
      setIsRecordingNote(false);
    }
  };

  const handleDeleteVoiceNote = () => {
    if (onVoiceNoteChange) {
      onVoiceNoteChange('');
    }
    if (typeof value === 'string' && value.includes('[voice_note:')) {
      const clean = value.replace(/\[voice_note:[^\]]+\]/g, '').trim();
      onChange(clean);
    }
    if (audioRef.current) {
      audioRef.current.pause();
    }
    setIsPlayingNote(false);
    toast.info('Voice note removed');
  };

  const togglePlayAudio = () => {
    if (!audioRef.current) return;
    if (isPlayingNote) {
      audioRef.current.pause();
      setIsPlayingNote(false);
    } else {
      audioRef.current.play().then(() => {
        setIsPlayingNote(true);
      }).catch(err => {
        console.error('Play failed:', err);
      });
    }
  };

  const formatTimer = (sec) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div className={cn("space-y-2", className)}>
      {/* Header with Title and Mode Actions */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <Label htmlFor={id} className="text-xs font-semibold text-[#172B3A] dark:text-[#E8F0F4] flex items-center gap-1.5">
          <span>{label}</span>
          <span className="text-[11px] font-normal text-[#64748B] dark:text-[#A6B5C0]">(Text, Voice to Text, or Voice Note)</span>
        </Label>

        {/* Input Mode Action Buttons */}
        <div className="flex items-center gap-1.5">
          {/* Voice-to-Text Button */}
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={toggleVoiceToText}
            className={cn(
              "h-7 px-2.5 text-xs font-medium rounded-lg border transition-all flex items-center gap-1.5 shadow-2xs",
              isTranscribing
                ? "bg-rose-50 dark:bg-rose-950/40 border-rose-400 text-rose-600 dark:text-rose-400 animate-pulse"
                : "border-[#DFE8EC] dark:border-[#2A3D48] text-[#172B3A] dark:text-[#E8F0F4] hover:text-[#0D9488] dark:hover:text-[#14B8A6] hover:bg-[#F4F8FA] dark:hover:bg-[#1D303B]"
            )}
            title={isTranscribing ? "Click to stop voice dictation" : "Dictate text via speech-to-text"}
          >
            {isTranscribing ? (
              <>
                <Radio className="w-3.5 h-3.5 text-rose-500 animate-spin" />
                <span className="text-[11px] font-semibold">Listening...</span>
              </>
            ) : (
              <>
                <Mic className="w-3.5 h-3.5 text-[#0D9488] dark:text-[#14B8A6]" />
                <span className="text-[11px]">Voice to Text</span>
              </>
            )}
          </Button>

          {/* Record Voice Note Button */}
          {!isRecordingNote ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={startVoiceNoteRecording}
              className="h-7 px-2.5 text-xs font-medium rounded-lg border border-[#DFE8EC] dark:border-[#2A3D48] text-[#172B3A] dark:text-[#E8F0F4] hover:text-[#0D9488] dark:hover:text-[#14B8A6] hover:bg-[#F4F8FA] dark:hover:bg-[#1D303B] transition-all flex items-center gap-1.5 shadow-2xs"
              title="Record an audio voice note"
            >
              <Volume2 className="w-3.5 h-3.5 text-[#0D9488] dark:text-[#14B8A6]" />
              <span className="text-[11px]">Voice Note</span>
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              onClick={stopVoiceNoteRecording}
              className="h-7 px-2.5 text-xs font-semibold rounded-lg bg-rose-600 hover:bg-rose-700 text-white transition-all flex items-center gap-1.5 animate-pulse shadow-2xs"
              title="Stop voice note recording"
            >
              <Square className="w-3.5 h-3.5 fill-current" />
              <span className="text-[11px]">Stop ({formatTimer(recordingDuration)})</span>
            </Button>
          )}
        </div>
      </div>

      {/* Main Textarea */}
      <div className="relative">
        <Textarea
          id={id}
          value={typeof value === 'string' ? value.replace(/\[voice_note:[^\]]+\]/g, '').trim() : ''}
          onChange={(e) => {
            const newText = e.target.value;
            if (activeVoiceNote && !onVoiceNoteChange) {
              onChange(`${newText}\n[voice_note:${activeVoiceNote}]`.trim());
            } else {
              onChange(newText);
            }
          }}
          placeholder={placeholder}
          rows={rows}
          className={cn(
            "bg-[#F4F8FA] dark:bg-[#1D303B] border-[#DFE8EC] dark:border-[#2A3D48] text-xs sm:text-sm rounded-xl focus-visible:ring-1 focus-visible:ring-[#0D9488] transition-all",
            isTranscribing && "border-rose-400 dark:border-rose-500 ring-1 ring-rose-400/50"
          )}
        />
        {isTranscribing && (
          <div className="absolute right-3 bottom-2.5 flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-rose-100 dark:bg-rose-950/80 text-rose-600 dark:text-rose-400 text-[10px] font-semibold border border-rose-300 dark:border-rose-800">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping" />
            <span>Transcribing Speech...</span>
          </div>
        )}
      </div>

      {/* Attached Voice Note Card / Audio Player */}
      {activeVoiceNote && (
        <div className="flex items-center justify-between gap-3 p-2 sm:p-2.5 rounded-xl border border-[#DFE8EC] dark:border-[#2A3D48] bg-white dark:bg-[#15232D] shadow-2xs">
          <audio
            ref={audioRef}
            src={activeVoiceNote}
            onEnded={() => setIsPlayingNote(false)}
            onError={() => setIsPlayingNote(false)}
            className="hidden"
          />
          <div className="flex items-center gap-2.5 min-w-0">
            <Button
              type="button"
              size="icon"
              variant="outline"
              onClick={togglePlayAudio}
              className="h-8 w-8 rounded-lg border-[#0D9488]/30 bg-[#0D9488]/10 text-[#0D9488] dark:text-[#14B8A6] hover:bg-[#0D9488] hover:text-white shrink-0 transition-all"
              title={isPlayingNote ? "Pause voice note" : "Play voice note"}
            >
              {isPlayingNote ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 ml-0.5" />}
            </Button>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-[#172B3A] dark:text-[#E8F0F4] flex items-center gap-1.5 truncate">
                <span>🎙️ Voice Note Attached</span>
                {isPlayingNote && (
                  <span className="inline-block text-[10px] text-[#0D9488] font-normal animate-pulse">
                    Playing...
                  </span>
                )}
              </p>
              <p className="text-[10px] text-[#64748B] dark:text-[#A6B5C0]">
                Audio note will be shared with the task assignees
              </p>
            </div>
          </div>

          <Button
            type="button"
            size="icon"
            variant="ghost"
            onClick={handleDeleteVoiceNote}
            className="h-7 w-7 text-[#64748B] hover:text-rose-600 rounded-lg shrink-0"
            title="Delete voice note"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}
    </div>
  );
}
