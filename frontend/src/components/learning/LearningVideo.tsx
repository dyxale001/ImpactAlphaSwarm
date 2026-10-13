import { learningVideoEmbed } from '../../utils/learningVideo';
export default function LearningVideo({ url }: { url?: string | null }) {
  const src = learningVideoEmbed(url);
  if (!src) return null;
  return <div className="aspect-video overflow-hidden rounded-2xl border border-brand-border"><iframe src={src} title="Educational video" className="h-full w-full" loading="lazy" referrerPolicy="strict-origin-when-cross-origin" allow="fullscreen; picture-in-picture; encrypted-media" sandbox="allow-scripts allow-same-origin allow-presentation" allowFullScreen /></div>;
}
