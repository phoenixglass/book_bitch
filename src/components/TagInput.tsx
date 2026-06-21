import { useState, useRef } from 'react';
import { useAppStore } from '../store/appStore';

interface TagInputProps {
  tags: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
  className?: string;
}

export function TagInput({ tags, onChange, placeholder = 'Add tag…', className = '' }: TagInputProps) {
  const [input, setInput] = useState('');
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { projectTags, getOrCreateTag } = useAppStore();

  const lc = input.toLowerCase();
  const suggestions = lc.length > 0
    ? projectTags.filter(
        (t) => t.name.toLowerCase().includes(lc) && !tags.includes(t.name),
      ).slice(0, 5)
    : [];

  function addTag(name: string) {
    const trimmed = name.trim();
    if (!trimmed || tags.includes(trimmed)) return;
    getOrCreateTag(trimmed);
    onChange([...tags, trimmed]);
    setInput('');
  }

  function removeTag(name: string) {
    onChange(tags.filter((t) => t !== name));
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if ((e.key === 'Enter' || e.key === ',') && input.trim()) {
      e.preventDefault();
      addTag(input);
    }
    if (e.key === 'Backspace' && !input && tags.length > 0) {
      removeTag(tags[tags.length - 1]);
    }
  }

  return (
    <div className={`relative ${className}`}>
      <div
        className="flex flex-wrap gap-1 min-h-[32px] bg-[#1a1a2e] border border-[#2d3748] rounded px-2 py-1 cursor-text focus-within:border-[#6b46c1] transition-colors"
        onClick={() => inputRef.current?.focus()}
      >
        {tags.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 bg-[#6b46c1]/30 text-purple-300 rounded px-1.5 py-0.5 text-xs"
          >
            #{tag}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); removeTag(tag); }}
              className="opacity-60 hover:opacity-100 text-xs leading-none"
            >
              ×
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 150)}
          placeholder={tags.length === 0 ? placeholder : ''}
          className="bg-transparent text-sm text-gray-300 outline-none placeholder-gray-600 flex-1 min-w-[80px]"
        />
      </div>

      {focused && suggestions.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-0.5 bg-[#2d3748] border border-[#0f3460] rounded shadow-lg z-50">
          {suggestions.map((t) => (
            <button
              key={t.id}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); addTag(t.name); }}
              className="w-full text-left px-3 py-1.5 text-xs text-gray-300 hover:bg-[#6b46c1]/40 transition-colors"
            >
              #{t.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Simple comma-list display for read-only contexts
export function TagList({ tags }: { tags: string[] }) {
  if (!tags.length) return <span className="text-gray-600 text-xs italic">none</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {tags.map((tag) => (
        <span
          key={tag}
          className="inline-block bg-[#6b46c1]/20 text-purple-300 rounded px-1.5 py-0.5 text-xs"
        >
          #{tag}
        </span>
      ))}
    </div>
  );
}
