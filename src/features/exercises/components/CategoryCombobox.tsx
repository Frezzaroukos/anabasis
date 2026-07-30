import { useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface CategoryComboboxProps {
  value: string;
  onChange: (value: string) => void;
  suggestions: string[];
  placeholder?: string;
  label: string;
}

/**
 * Το κομμάτι-κλειδί όλης της δουλειάς: ελεύθερο κείμενο, ΟΧΙ κλειστή λίστα.
 * Δείχνει τις υπάρχουσες κατηγορίες ως προτάσεις, αλλά ό,τι πληκτρολογήσεις
 * γίνεται αποδεκτό — γράφεις «grip» και είναι πλέον κανονική κατηγορία.
 */
export function CategoryCombobox({
  value,
  onChange,
  suggestions,
  placeholder,
  label,
}: CategoryComboboxProps) {
  const [open, setOpen] = useState(false);

  const filtered = useMemo(() => {
    const q = value.trim().toLowerCase();
    const list = q === '' ? suggestions : suggestions.filter((s) => s.toLowerCase().includes(q));
    // κρύψε την πρόταση αν ταιριάζει ήδη ακριβώς με ό,τι έχει γραφτεί
    return list.filter((s) => s.toLowerCase() !== q);
  }, [suggestions, value]);

  return (
    <div className="relative">
      <label className="mb-1.5 block text-sm font-medium">{label}</label>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setOpen(true)}
        // μικρή καθυστέρηση ώστε το mousedown στην πρόταση να προλάβει το blur
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        placeholder={placeholder}
        aria-label={label}
        autoComplete="off"
      />
      {open && filtered.length > 0 && (
        <ul className="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-md border border-border bg-card p-1 shadow-lg">
          {filtered.map((s) => (
            <li key={s}>
              <button
                type="button"
                onMouseDown={(e) => {
                  // preventDefault ώστε να μη χάσει focus το input πριν τρέξει το click
                  e.preventDefault();
                  onChange(s);
                  setOpen(false);
                }}
                className={cn(
                  'block w-full rounded-md px-2.5 py-1.5 text-left text-sm hover:bg-accent',
                )}
              >
                {s}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
