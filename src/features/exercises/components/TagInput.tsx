import { useState } from 'react';
import { X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface TagInputProps {
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  label: string;
}

/**
 * Ελεύθερα tags (εξοπλισμός): πληκτρολογείς + Enter, καμία προκαθορισμένη
 * λίστα. Ίδια φιλοσοφία με το CategoryCombobox — ο χρήστης ορίζει τι υπάρχει.
 */
export function TagInput({ value, onChange, placeholder, label }: TagInputProps) {
  const [draft, setDraft] = useState('');

  const commit = () => {
    const tag = draft.trim();
    if (tag !== '' && !value.includes(tag)) onChange([...value, tag]);
    setDraft('');
  };

  const remove = (tag: string) => onChange(value.filter((t) => t !== tag));

  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium">{label}</label>
      {value.length > 0 && (
        <ul className="mb-2 flex flex-wrap gap-1.5">
          {value.map((tag) => (
            <li
              key={tag}
              className="flex items-center gap-1 rounded-full bg-elevated py-1 pl-2.5 pr-1.5 text-xs"
            >
              {tag}
              <button
                type="button"
                onClick={() => remove(tag)}
                aria-label={`${tag} ×`}
                className={cn(
                  'rounded-full p-0.5 text-muted-foreground ring-offset-background transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                )}
              >
                <X className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <Input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            commit();
          } else if (e.key === 'Backspace' && draft === '' && value.length > 0) {
            remove(value[value.length - 1]!);
          }
        }}
        onBlur={commit}
        placeholder={placeholder}
        aria-label={label}
      />
    </div>
  );
}
