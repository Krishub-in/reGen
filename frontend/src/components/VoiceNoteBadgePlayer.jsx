import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Play, Pause, Volume2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function VoiceNoteBadgePlayer({ src, className = '' }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef(null);

  if (!src) return null;

  const togglePlay = (e) => {
    e.stopPropagation();
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play().then(() => {
        setIsPlaying(true);
      }).catch(err => {
        console.error('Audio play error:', err);
      });
    }
  };

  return (
    <div className={cn("inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-[#0D9488]/10 text-[#0D9488] dark:text-[#14B8A6] border border-[#0D9488]/20 text-xs font-medium shadow-2xs", className)}>
      <audio
        ref={audioRef}
        src={src}
        onEnded={() => setIsPlaying(false)}
        onError={() => setIsPlaying(false)}
        className="hidden"
      />
      <Button
        type="button"
        size="icon"
        variant="ghost"
        onClick={togglePlay}
        className="h-5 w-5 p-0 hover:bg-[#0D9488]/20 text-inherit rounded shrink-0"
        title={isPlaying ? "Pause voice note" : "Play voice note"}
      >
        {isPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5 ml-0.5" />}
      </Button>
      <span className="text-[11px] font-semibold flex items-center gap-1">
        <Volume2 className="h-3 w-3" />
        <span>Voice Note</span>
      </span>
      {isPlaying && <span className="text-[10px] animate-pulse">Playing...</span>}
    </div>
  );
}

/**
 * Extracts and cleans voice note data from a description string
 */
export function extractVoiceNote(desc) {
  if (!desc || typeof desc !== 'string') return { cleanText: '', voiceNoteUrl: null };
  const match = desc.match(/\[voice_note:(data:audio\/[^\]]+)\]/);
  if (match) {
    const cleanText = desc.replace(/\[voice_note:[^\]]+\]/g, '').trim();
    return { cleanText, voiceNoteUrl: match[1] };
  }
  return { cleanText: desc, voiceNoteUrl: null };
}
