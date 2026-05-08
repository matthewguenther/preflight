import { Download, Plane, RadioTower } from 'lucide-react';
import { AIRPORT } from '../../lib/constants';
import { todayLocalISO } from '../../lib/time';
import { apiFetch } from '../../lib/api';

export function Header() {
  async function downloadBackup() {
    const data = await apiFetch('/.netlify/functions/export');
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `preflight-backup-${todayLocalISO()}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <header className="tactical-header border-b border-stone-200 bg-white">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="tactical-emblem flex h-10 w-10 items-center justify-center rounded-lg bg-sky-900 text-white">
            <Plane size={22} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-semibold text-stone-950">Preflight</h1>
              <span className="live-ops-indicator hidden items-center gap-1 rounded-full border border-cyan-400/30 bg-cyan-400/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.24em] text-cyan-200 sm:inline-flex">
                <RadioTower size={11} /> Live Ops
              </span>
            </div>
            <p className="text-sm text-stone-500">
              {AIRPORT.icao} · {AIRPORT.name} · {AIRPORT.city}
            </p>
            <div className="mt-2 flex flex-wrap gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-stone-500">
              <span className="rounded border border-cyan-400/20 bg-cyan-400/10 px-2 py-1">Elev {AIRPORT.elevation_ft} MSL</span>
              <span className="rounded border border-cyan-400/20 bg-cyan-400/10 px-2 py-1">RWY 18 / 36</span>
              <span className="rounded border border-emerald-300/20 bg-emerald-300/10 px-2 py-1">Student VFR</span>
            </div>
          </div>
        </div>
        <button
          className="inline-flex items-center justify-center gap-2 rounded-md border border-stone-300 px-3 py-2 text-sm font-semibold text-stone-800 hover:bg-stone-50"
          onClick={downloadBackup}
        >
          <Download size={16} /> Download backup
        </button>
      </div>
    </header>
  );
}
