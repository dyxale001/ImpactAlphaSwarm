import { formatNumberWithSpaces } from '../utils/stringFormatters';

interface InvestorCardProps {
  firstName?: string;
  lastName?: string;
  capital: string;
  universe: string[];
  tolerance: string;
  expertise: string;
}

export default function InvestorCard({ 
  firstName = "Authorized", 
  lastName = "Investor", 
  capital, 
  universe, 
  tolerance, 
  expertise
}: InvestorCardProps) {
  
  return (
    <div className="w-full max-w-[480px] mx-auto relative rounded-lg overflow-hidden shadow-2xl bg-accent/90 border-white/10 group flex flex-col sm:flex-row min-h-[260px]">

      {/* Left side / Top side: Branding and Archetype (White section) */}
      <div className="w-full sm:w-2/5 p-6 flex flex-col justify-center items-center text-center relative z-10 sm:border-r border-primary/50">

        <div className="w-12 h-12 mb-3 rounded-lg flex items-center justify-center">
          <span className="text-primary font-black font-mono text-xl z-10">&gt;_</span>
        </div>
        
        <h2 className="text-sm font-bold text-gray-900 tracking-widest uppercase">
          AlphaSwarm
        </h2>
        <p className="text-[9px] text-gray-500 tracking-widest uppercase mt-1 mb-4">
          Operative Profile
        </p>

        <div className="mt-auto pt-4 border-t border-primary/50 w-full">
            <p className="text-[10px] text-primary uppercase tracking-widest font-semibold mb-1">Archetype</p>
            <p className="text-sm font-bold text-gray-900">{tolerance}</p>
        </div>
      </div>

 
      <div className="w-full sm:w-3/5 p-6 flex flex-col justify-center relative z-10">
        <h3 className="text-xl sm:text-2xl font-light text-brand-fg uppercase tracking-wider mb-0.5">
          {firstName} <span className="font-bold text-primary">{lastName}</span>
        </h3>
        <p className="text-[10px] text-brand-primary font-mono uppercase tracking-widest mb-6 border-b border-brand-border/50 pb-2 inline-block w-fit">
          Level: {expertise}
        </p>

        <div className="flex flex-col gap-3">
          {/* Capital */}
          <div className="flex items-center gap-3">
            <div className="w-4 flex justify-center">
              <svg className="w-3 h-3 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <p className="text-xs text-brand-fg font-mono">
              <span className="text-primary mr-1">ZAR</span> 
              {formatNumberWithSpaces(capital)}
            </p>
          </div>


          <div className="flex items-start gap-3 mt-1">
            <div className="w-4 flex justify-center mt-0.5">
              <svg className="w-3 h-3 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
              </svg>
            </div>
            <div className="flex flex-wrap gap-1.5 flex-1">
               {universe.slice(0, 3).map(u => (
                 <span key={u} className="text-[10px] text-primary bg-primary/10 px-1.5 py-0.5 rounded border border-brand-accent/20">
                   {u}
                 </span>
               ))}
               {universe.length > 3 && (
                 <span className="text-[10px] text-brand-muted-fg bg-brand-bg/50 px-1.5 py-0.5 rounded border border-brand-border/30">
                   +{universe.length - 3}
                 </span>
               )}
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}