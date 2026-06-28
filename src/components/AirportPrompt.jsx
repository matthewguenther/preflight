import { Plane, Search } from 'lucide-react';
import { useState } from 'react';
import { normalizeAirportCode } from '../hooks/useAirport';

// Full-screen landing shown when no airport is selected. It is the single,
// obvious entry point: one search box plus quick-pick chips for airports the
// user has loaded before. On touch devices we intentionally do not autofocus,
// so the on-screen keyboard does not immediately cover the recent chips.
const autoFocusOnDesktop =
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(pointer: fine)').matches;

export function AirportPrompt({ onSelect, recents = [] }) {
  const [value, setValue] = useState('');

  function submit(event) {
    event.preventDefault();
    const code = normalizeAirportCode(value);
    if (code) onSelect(code);
  }

  return (
    <div className="airport-prompt">
      <div className="airport-prompt-panel">
        <div className="airport-prompt-brand">
          <span className="airport-prompt-emblem"><Plane size={20} /></span>
          <span className="airport-prompt-word">PREFLIGHT</span>
        </div>

        <h1 className="airport-prompt-title">Search an airport to begin</h1>
        <p className="airport-prompt-sub">
          Enter an ICAO or FAA identifier to load live weather, traffic, NOTAMs, and fuel.
        </p>

        <form className="airport-prompt-form" onSubmit={submit}>
          <div className="airport-prompt-field">
            <Search size={20} />
            <input
              aria-label="Enter airport code"
              autoCapitalize="characters"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="search"
              maxLength={4}
              autoFocus={autoFocusOnDesktop}
              placeholder="e.g. KVBT"
              value={value}
              onChange={(event) => setValue(event.target.value.toUpperCase())}
            />
          </div>
          <button className="airport-prompt-submit" type="submit">Load airport</button>
        </form>

        <p className="airport-prompt-hint">Try KVBT · KJFK · 7M5</p>

        {recents.length > 0 ? (
          <div className="airport-prompt-recents">
            <span className="airport-prompt-recents-label">Recent</span>
            <div className="airport-prompt-chips">
              {recents.map((code) => (
                <button
                  key={code}
                  type="button"
                  className="airport-prompt-chip"
                  onClick={() => onSelect(code)}
                >
                  {code}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
