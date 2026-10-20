import { useState, useRef, useEffect, useMemo } from 'react';
import { Smile, Search, X } from 'lucide-react';
import { cn } from '../lib/utils';

const EMOJI_CATEGORIES = [
  {
    id: 'smileys',
    name: 'Smileys',
    icon: '😀',
    emojis: [
      '😀', '😃', '😄', '😁', '😆', '😅', '😂', '🤣', '🥲', '🥹',
      '😊', '😇', '🙂', '🙃', '😉', '😌', '😍', '🥰', '😘', '😗',
      '😙', '😚', '😋', '😛', '😝', '😜', '🤪', '🤨', '🧐', '🤓',
      '😎', '🥸', '🤩', '🥳', '😏', '😒', '😞', '😔', '😟', '😕',
      '🙁', '☹️', '😣', '😖', '😫', '😩', '🥺', '😢', '😭', '😮‍💨',
      '😤', '😠', '😡', '🤬', '🤯', '😳', '🥵', '🥶', '😱', '😨',
      '😰', '😥', '😓', '🫣', '🤗', '🫡', '🤔', '🫢', '🤭', '🤫',
      '🤥', '😶', '😐', '😑', '😬', '🫠', '🙄', '😯', '😦', '😧',
      '😮', '😲', '🥱', '😴', '🤤', '😪', '😵', '😵‍💫', '🤐', '🥴'
    ]
  },
  {
    id: 'gestures',
    name: 'Gestures',
    icon: '👍',
    emojis: [
      '👍', '👎', '👊', '✊', '🤛', '🤜', '🫷', '🫸', '🤞', '✌️',
      '🫰', '🤟', '🤘', '👌', '🤌', '🤏', '👈', '👉', '👆', '👇',
      '☝️', '✋', '🤚', '🖐️', '🖖', '👋', '🤙', '🫲', '🫱', '🫵',
      '👏', '🙌', '🫶', '👐', '🤲', '🤝', '🙏', '✍️', '💅', '🤳',
      '💪', '🦾', '🦿', '🦵', '🦶', '👂', '🦻', '👃', '👀', '👁️'
    ]
  },
  {
    id: 'hearts',
    name: 'Hearts & Vibes',
    icon: '❤️',
    emojis: [
      '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔',
      '❤️‍🔥', '❤️‍🩹', '❣️', '💕', '💞', '💓', '💗', '💖', '💘', '💝',
      '🔥', '✨', '⭐', '🌟', '💫', '💥', '💯', '💢', '💨', '💤',
      '🎉', '🎊', '🎈', '🎁', '🏆', '🥇', '🥈', '🥉', '🎯', '🚀'
    ]
  },
  {
    id: 'work',
    name: 'Work & Tools',
    icon: '💼',
    emojis: [
      '💼', '📁', '📂', '📄', '📑', '📊', '📈', '📉', '📋', '📌',
      '📍', '📎', '💻', '🖥️', '⌨️', '🖱️', '📱', '📞', '☎️', '✉️',
      '📧', '📨', '📩', '📦', '🏷️', '⏰', '⏱️', '⏲️', '📅', '🗓️',
      '💡', '🔦', '🔒', '🔓', '🔑', '🛠️', '⚙️', '🔧', '☕', '🍕'
    ]
  }
];

export default function EmojiPicker({ onSelectEmoji, className, disabled = false }) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('smileys');
  const [search, setSearch] = useState('');
  const popoverRef = useRef(null);
  const triggerRef = useRef(null);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target) &&
        triggerRef.current &&
        !triggerRef.current.contains(e.target)
      ) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const [placement, setPlacement] = useState('left');

  useEffect(() => {
    if (isOpen && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      const popoverWidth = 320;
      // If expanding to the right would overflow the right edge of the viewport, align right
      if (rect.left + popoverWidth > window.innerWidth - 16 && rect.right - popoverWidth >= 16) {
        setPlacement('right');
      } else {
        setPlacement('left');
      }
    }
  }, [isOpen]);

  const filteredEmojis = useMemo(() => {
    if (!search.trim()) {
      const cat = EMOJI_CATEGORIES.find((c) => c.id === activeTab);
      return cat ? cat.emojis : [];
    }
    const q = search.trim().toLowerCase();
    // Search across all emojis
    const all = EMOJI_CATEGORIES.flatMap((c) => c.emojis);
    // Unique list
    return Array.from(new Set(all));
  }, [search, activeTab]);

  const handlePick = (emoji) => {
    if (onSelectEmoji) {
      onSelectEmoji(emoji);
    }
  };

  return (
    <div className={cn("relative inline-block", className)}>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen((prev) => !prev)}
        title="Add Emoji"
        aria-label="Add Emoji"
        className={cn(
          "p-2 rounded-md transition-colors flex items-center justify-center shrink-0",
          isOpen
            ? "bg-primary/20 text-primary"
            : "text-muted-foreground hover:text-foreground hover:bg-muted/80",
          disabled && "opacity-50 cursor-not-allowed"
        )}
      >
        <Smile className="h-4 w-4" />
      </button>

      {isOpen && (
        <div
          ref={popoverRef}
          className={cn(
            "absolute bottom-full mb-2 z-50 w-72 sm:w-80 max-w-[calc(100vw-24px)] bg-popover text-popover-foreground border border-border rounded-xl shadow-2xl p-2.5 space-y-2 animate-in fade-in zoom-in-95 duration-150",
            placement === 'right' ? "right-0" : "left-0"
          )}
        >
          {/* Search bar */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search emojis..."
              className="w-full bg-muted/60 text-foreground text-xs rounded-md pl-8 pr-7 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary border border-border/50"
              autoFocus
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>

          {/* Category tabs (hidden when searching) */}
          {!search && (
            <div className="flex items-center gap-1 border-b border-border/60 pb-1.5">
              {EMOJI_CATEGORIES.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setActiveTab(cat.id)}
                  title={cat.name}
                  className={cn(
                    "flex-1 py-1 text-xs rounded-md transition-all flex items-center justify-center gap-1",
                    activeTab === cat.id
                      ? "bg-primary text-primary-foreground font-semibold shadow-xs"
                      : "text-muted-foreground hover:bg-muted/80 hover:text-foreground"
                  )}
                >
                  <span>{cat.icon}</span>
                  <span className="hidden sm:inline text-[11px]">{cat.name}</span>
                </button>
              ))}
            </div>
          )}

          {/* Emoji Grid */}
          <div className="max-h-48 overflow-y-auto grid grid-cols-7 sm:grid-cols-8 gap-1 p-1">
            {filteredEmojis.map((emoji, index) => (
              <button
                key={`${emoji}-${index}`}
                type="button"
                onClick={() => handlePick(emoji)}
                className="h-8 w-8 flex items-center justify-center text-lg rounded-md hover:bg-muted/80 active:scale-90 transition-all duration-75 cursor-pointer"
              >
                {emoji}
              </button>
            ))}
          </div>

          {/* Footer preview/tip */}
          <div className="pt-1.5 border-t border-border/60 text-[10px] text-muted-foreground flex items-center justify-between px-1">
            <span>Click to insert into message</span>
            <span className="font-mono text-[9px] opacity-75">ESC to close</span>
          </div>
        </div>
      )}
    </div>
  );
}
