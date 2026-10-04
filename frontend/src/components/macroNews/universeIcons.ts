import { Bot, Cpu, Globe2, Heart, TrendingUp, Tv, Zap, type LucideIcon } from "lucide-react";

// The same glyph per universe as the Settings and Whale Watching tiles, so a sector
// looks the same wherever it appears. Market-wide is not a sector; a globe says
// "applies everywhere".
const ICONS: Record<string, LucideIcon> = {
  "Market-wide": Globe2,
  Technology: Cpu,
  "Green Energy": Zap,
  Finance: TrendingUp,
  "AI & Robotics": Bot,
  Healthcare: Heart,
  "Media & Communications": Tv,
};

export function universeIcon(label: string): LucideIcon {
  return ICONS[label] ?? Globe2;
}
