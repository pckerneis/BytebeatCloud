import { useState, useRef, useEffect, useCallback, KeyboardEvent, ChangeEvent } from 'react';
import { supabase } from '../lib/supabaseClient';

interface AutocompleteItem {
  type: 'tag' | 'mention';
  value: string; // tag name or username
  display: string; // what to show in dropdown
}

interface AutocompleteTextareaProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  placeholder?: string;
  rows?: number;
}

// Debounce helper
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);

  return debouncedValue;
}

export function AutocompleteTextarea({
  value,
  onChange,
  className,
  placeholder,
  rows,
}: AutocompleteTextareaProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [suggestions, setSuggestions] = useState<AutocompleteItem[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [triggerInfo, setTriggerInfo] = useState<{
    type: 'tag' | 'mention';
    query: string;
    startPos: number;
  } | null>(null);

  const debouncedQuery = useDebounce(triggerInfo?.query ?? '', 150);

  // Detect trigger character and extract query
  const detectTrigger = useCallback((text: string, cursorPos: number) => {
    // Look backwards from cursor to find # or @
    let i = cursorPos - 1;
    while (i >= 0) {
      const char = text[i];
      // Stop at whitespace or newline
      if (/\s/.test(char)) {
        return null;
      }
      if (char === '#' || char === '@') {
        // Check if it's at start or preceded by whitespace
        if (i === 0 || /\s/.test(text[i - 1])) {
          const query = text.slice(i + 1, cursorPos);
          // Only trigger if we have at least 2 character after the trigger
          if (query.length >= 2) {
            return {
              type: char === '#' ? 'tag' : 'mention',
              query,
              startPos: i,
            } as const;
          }
        }
        return null;
      }
      i--;
    }
    return null;
  }, []);

  // Handle text change
  const handleChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    const cursorPos = e.target.selectionStart;
    onChange(newValue);

    const trigger = detectTrigger(newValue, cursorPos);
    setTriggerInfo(trigger);
    if (!trigger) {
      setSuggestions([]);
    }
    setSelectedIndex(0);
  };

  // Fetch suggestions when debounced query changes
  useEffect(() => {
    if (!triggerInfo || debouncedQuery.length < 1) {
      setSuggestions([]);
      return;
    }

    let cancelled = false;

    const fetchSuggestions = async () => {
      if (triggerInfo.type === 'tag') {
        const { data } = await supabase
          .from('tags')
          .select('name')
          .ilike('name', `%${debouncedQuery}%`)
          .limit(8);

        if (!cancelled && data) {
          setSuggestions(
            data.map((t) => ({
              type: 'tag',
              value: t.name,
              display: `#${t.name}`,
            })),
          );
        }
      } else {
        const { data } = await supabase
          .from('profiles')
          .select('username')
          .ilike('username', `%${debouncedQuery}%`)
          .limit(8);

        if (!cancelled && data) {
          setSuggestions(
            data.map((p) => ({
              type: 'mention',
              value: p.username,
              display: `@${p.username}`,
            })),
          );
        }
      }
    };

    void fetchSuggestions();

    return () => {
      cancelled = true;
    };
  }, [debouncedQuery, triggerInfo?.type]);

  // Insert selected suggestion
  const insertSuggestion = useCallback(
    (item: AutocompleteItem) => {
      if (!triggerInfo || !textareaRef.current) return;

      const before = value.slice(0, triggerInfo.startPos);
      const after = value.slice(textareaRef.current.selectionStart);
      const insertion = item.type === 'tag' ? `#${item.value}` : `@${item.value}`;
      const newValue = before + insertion + ' ' + after;

      onChange(newValue);
      setSuggestions([]);
      setTriggerInfo(null);

      // Set cursor position after the inserted text
      const newCursorPos = before.length + insertion.length + 1;
      requestAnimationFrame(() => {
        textareaRef.current?.setSelectionRange(newCursorPos, newCursorPos);
        textareaRef.current?.focus();
      });
    },
    [triggerInfo, value, onChange],
  );

  // Handle keyboard navigation
  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (suggestions.length === 0) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % suggestions.length);
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + suggestions.length) % suggestions.length);
        break;
      case 'Enter':
      case 'Tab':
        if (suggestions.length > 0) {
          e.preventDefault();
          insertSuggestion(suggestions[selectedIndex]);
        }
        break;
      case 'Escape':
        e.preventDefault();
        setSuggestions([]);
        setTriggerInfo(null);
        break;
    }
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        textareaRef.current &&
        !textareaRef.current.contains(e.target as Node)
      ) {
        setSuggestions([]);
        setTriggerInfo(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Scroll selected item into view
  useEffect(() => {
    if (dropdownRef.current && suggestions.length > 0) {
      const selectedEl = dropdownRef.current.children[selectedIndex] as HTMLElement;
      selectedEl?.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex, suggestions.length]);

  return (
    <div className="autocomplete-textarea-wrapper">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        className={className}
        placeholder={placeholder}
        rows={rows}
      />
      {suggestions.length > 0 && (
        <div ref={dropdownRef} className="autocomplete-dropdown">
          {suggestions.map((item, index) => (
            <div
              key={`${item.type}-${item.value}`}
              className={`autocomplete-item ${index === selectedIndex ? 'selected' : ''}`}
              onClick={() => insertSuggestion(item)}
              onMouseEnter={() => setSelectedIndex(index)}
            >
              {item.display}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
