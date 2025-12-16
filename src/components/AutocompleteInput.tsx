import { useState, useRef, useEffect, useCallback, KeyboardEvent, ChangeEvent } from 'react';
import { supabase } from '../lib/supabaseClient';

interface AutocompleteItem {
  type: 'tag' | 'mention';
  value: string;
  display: string;
}

interface AutocompleteInputProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  placeholder?: string;
  maxLength?: number;
  onKeyDown?: (e: KeyboardEvent<HTMLInputElement>) => void;
}

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);

  return debouncedValue;
}

export function AutocompleteInput({
  value,
  onChange,
  className,
  placeholder,
  maxLength,
  onKeyDown: externalOnKeyDown,
}: AutocompleteInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [suggestions, setSuggestions] = useState<AutocompleteItem[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [triggerInfo, setTriggerInfo] = useState<{
    type: 'tag' | 'mention';
    query: string;
    startPos: number;
  } | null>(null);

  const debouncedQuery = useDebounce(triggerInfo?.query ?? '', 150);

  const detectTrigger = useCallback((text: string, cursorPos: number) => {
    let i = cursorPos - 1;
    while (i >= 0) {
      const char = text[i];
      if (/\s/.test(char)) {
        return null;
      }
      if (char === '#' || char === '@') {
        if (i === 0 || /\s/.test(text[i - 1])) {
          const query = text.slice(i + 1, cursorPos);
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

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    const cursorPos = e.target.selectionStart ?? 0;
    onChange(newValue);

    const trigger = detectTrigger(newValue, cursorPos);
    setTriggerInfo(trigger);
    if (!trigger) {
      setSuggestions([]);
    }
    setSelectedIndex(0);
  };

  useEffect(() => {
    if (!triggerInfo || debouncedQuery.length < 2) {
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

  const insertSuggestion = useCallback(
    (item: AutocompleteItem) => {
      if (!triggerInfo || !inputRef.current) return;

      const before = value.slice(0, triggerInfo.startPos);
      const after = value.slice(inputRef.current.selectionStart ?? value.length);
      const insertion = item.type === 'tag' ? `#${item.value}` : `@${item.value}`;
      const newValue = before + insertion + ' ' + after;

      onChange(newValue);
      setSuggestions([]);
      setTriggerInfo(null);

      const newCursorPos = before.length + insertion.length + 1;
      requestAnimationFrame(() => {
        inputRef.current?.setSelectionRange(newCursorPos, newCursorPos);
        inputRef.current?.focus();
      });
    },
    [triggerInfo, value, onChange],
  );

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (suggestions.length > 0) {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex((prev) => (prev + 1) % suggestions.length);
          return;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex((prev) => (prev - 1 + suggestions.length) % suggestions.length);
          return;
        case 'Enter':
        case 'Tab':
          e.preventDefault();
          insertSuggestion(suggestions[selectedIndex]);
          return;
        case 'Escape':
          e.preventDefault();
          setSuggestions([]);
          setTriggerInfo(null);
          return;
      }
    }
    externalOnKeyDown?.(e);
  };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(e.target as Node)
      ) {
        setSuggestions([]);
        setTriggerInfo(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (dropdownRef.current && suggestions.length > 0) {
      const selectedEl = dropdownRef.current.children[selectedIndex] as HTMLElement;
      selectedEl?.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex, suggestions.length]);

  return (
    <div className="autocomplete-input-wrapper">
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        className={className}
        placeholder={placeholder}
        maxLength={maxLength}
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
