// One theme colour per sector, used everywhere a sector is shown: the Settings run
// split, watchlist badges and tabs, onboarding. The colours themselves are the
// --color-sector-* tokens in index.css, drawn from the forest and lime ramps.
//
// Several of the colours are pale, so they are for fills (dots, bars, tints and
// borders) only. Sector names are written in the normal text colour beside them.
//
// Tailwind only generates classes it can see written out in full, so every class is
// spelled out here rather than built from the sector's name.

export interface SectorColour {
  /** A solid fill: dots, bar slices. */
  fill: string
  /** A light wash for a selected chip or card. */
  tint: string
  /** The border of a selected chip or card. */
  border: string
}

export const SECTOR_COLOURS: Record<string, SectorColour> = {
  'Technology': {
    fill: 'bg-sector-technology',
    tint: 'bg-sector-technology/10',
    border: 'border-sector-technology/60',
  },
  'Green Energy': {
    fill: 'bg-sector-green-energy',
    tint: 'bg-sector-green-energy/20',
    border: 'border-sector-green-energy',
  },
  'Finance': {
    fill: 'bg-sector-finance',
    tint: 'bg-sector-finance/15',
    border: 'border-sector-finance',
  },
  'AI & Robotics': {
    fill: 'bg-sector-ai-robotics',
    tint: 'bg-sector-ai-robotics/15',
    border: 'border-sector-ai-robotics',
  },
  'Healthcare': {
    fill: 'bg-sector-healthcare',
    tint: 'bg-sector-healthcare/30',
    border: 'border-sector-healthcare',
  },
  'Media & Communications': {
    fill: 'bg-sector-media-communications',
    tint: 'bg-sector-media-communications/10',
    border: 'border-sector-media-communications/60',
  },
}

const UNKNOWN_SECTOR: SectorColour = {
  fill: 'bg-brand-border',
  tint: '',
  border: 'border-brand-border',
}

export function sectorColour(sector: string | null | undefined): SectorColour {
  return (sector && SECTOR_COLOURS[sector]) || UNKNOWN_SECTOR
}
