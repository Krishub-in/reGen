import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Mic, FileText, Send, Trash2, Pencil, Play, Volume2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export default function VoiceConfirmDialog({
  isOpen,
  audioUrl,
  duration = 0,
  initialText = '',
  onSendVoice,
  onSendText,
  onEditText,
  onCancel,
  isPending = false
}) {
  const [text, setText] = useState(initialText);

  useEffect(() => {
    setText(initialText);
  }, [initialText, isOpen]);

  if (!isOpen) return null;

  const handleSendText = () => {
    if (!text.trim()) return;
    onSendText(text.trim());
  };

  const handleEditText = () => {
    onEditText(text.trim());
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onCancel(); }}>
      <DialogContent className="sm:max-w-lg bg-card text-card-foreground border border-border shadow-2xl p-5 space-y-4">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0">
              <Mic className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-base font-semibold text-foreground flex items-center gap-2">
                <span>Voice Recording</span>
                {duration > 0 && (
                  <Badge variant="secondary" className="text-[11px] font-mono">
                    {duration}s
                  </Badge>
                )}
              </DialogTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                Send as an audio voice note, or convert to text and send.
              </p>
            </div>
          </div>
        </DialogHeader>

        {/* Audio Player Preview */}
        {audioUrl && (
          <div className="p-3 rounded-lg bg-muted/40 border border-border/60 space-y-2">
            <div className="flex items-center justify-between text-xs font-medium text-foreground">
              <span className="flex items-center gap-1.5 text-primary">
                <Volume2 className="h-3.5 w-3.5" />
                Audio Preview
              </span>
              <span className="text-[10px] text-muted-foreground font-mono">
                Duration: {duration}s
              </span>
            </div>
            <audio
              controls
              src={audioUrl}
              className="w-full h-10 rounded-md focus:outline-none"
            >
              Your browser does not support the audio element.
            </audio>
          </div>
        )}

        {/* Transcribed Text Preview */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <FileText className="h-3.5 w-3.5 text-primary" />
              Converted Text (Speech-to-Text)
            </label>
            <span className="text-[10px] text-muted-foreground">
              Editable
            </span>
          </div>
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="No spoken words were recognized. You can type your message here, or send as a voice note..."
            className="min-h-[85px] text-xs resize-y leading-relaxed bg-background"
          />
        </div>

        {/* Action Choice Buttons */}
        <DialogFooter className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 pt-2 border-t border-border">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onCancel}
            disabled={isPending}
            className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 text-xs flex items-center gap-1"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Discard
          </Button>

          <div className="flex flex-wrap items-center justify-end gap-2">
            {text.trim() && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleEditText}
                disabled={isPending}
                title="Put this text into the chat text box to edit"
                className="text-xs flex items-center gap-1"
              >
                <Pencil className="h-3.5 w-3.5" />
                Edit in Chat
              </Button>
            )}

            {text.trim() && (
              <Button
                type="button"
                size="sm"
                onClick={handleSendText}
                disabled={isPending || !text.trim()}
                className="bg-primary hover:bg-primary/90 text-primary-foreground text-xs flex items-center gap-1.5 font-medium shadow-xs"
              >
                <Send className="h-3.5 w-3.5" />
                Send as Text
              </Button>
            )}

            <Button
              type="button"
              variant={text.trim() ? "secondary" : "default"}
              size="sm"
              onClick={onSendVoice}
              disabled={isPending || !audioUrl}
              className="text-xs flex items-center gap-1.5 font-medium shadow-xs"
            >
              <Mic className="h-3.5 w-3.5" />
              Send as Voice Note
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
