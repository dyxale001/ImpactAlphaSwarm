import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { INVESTMENT_CATEGORIES } from "@/data/mockData";
import { DollarSign, ChevronRight, Laptop, Leaf, Heart, Landmark, Bot, Bitcoin } from "lucide-react";

const RISK_LEVELS = [
  { value: 1, label: "Conservative", desc: "Steady growth, lower risk", color: "text-primary" },
  { value: 2, label: "Moderate", desc: "Balanced risk & reward", color: "text-info" },
  { value: 3, label: "Aggressive", desc: "High growth potential", color: "text-warning" },
  { value: 4, label: "Very Aggressive", desc: "Maximum returns, highest risk", color: "text-danger" },
];

export default function OnboardingPage() {
  const [capital, setCapital] = useState("10000");
  const [risk, setRisk] = useState(2);
  const [selectedCategories, setSelectedCategories] = useState<string[]>(["tech", "ai"]);
  const navigate = useNavigate();

  const toggleCategory = (id: string) => {
    setSelectedCategories((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    );
  };

  return (
    <div className="max-w-2xl mx-auto py-8 space-y-10">
      <div>
        <h1 className="text-2xl font-bold mb-1">Set Up Your Profile</h1>
        <p className="text-muted-foreground text-sm">Tell us about your investment style so we can tailor recommendations.</p>
      </div>

      {/* Capital Input */}
      <section className="glass-card p-6 space-y-4" style={{ animation: "slide-up 0.4s ease-out forwards" }}>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Investment Capital</h2>
        <div className="relative">
          <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
          <input
            type="text"
            value={capital}
            onChange={(e) => setCapital(e.target.value.replace(/[^0-9]/g, ""))}
            className="w-full bg-secondary border border-border rounded-lg pl-10 pr-4 py-3 text-lg font-mono text-foreground focus:ring-2 focus:ring-primary/50 focus:outline-none"
            placeholder="10000"
          />
        </div>
        <p className="text-xs text-muted-foreground">This is for simulation only - no real money will be used.</p>
      </section>

      {/* Risk Appetite */}
      <section className="glass-card p-6 space-y-4" style={{ animation: "slide-up 0.5s ease-out forwards" }}>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Risk Appetite</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {RISK_LEVELS.map((level) => (
            <button
              key={level.value}
              onClick={() => setRisk(level.value)}
              className={`p-4 rounded-lg border text-left transition-all ${
                risk === level.value
                  ? "border-primary bg-primary/10 glow-primary"
                  : "border-border bg-secondary/50 hover:border-muted-foreground/30"
              }`}
            >
              <p className={`text-sm font-semibold ${risk === level.value ? level.color : "text-foreground"}`}>
                {level.label}
              </p>
              <p className="text-xs text-muted-foreground mt-1">{level.desc}</p>
            </button>
          ))}
        </div>
      </section>

      {/* Investment Universe */}
      <section className="glass-card p-6 space-y-4" style={{ animation: "slide-up 0.6s ease-out forwards" }}>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Investment Universe</h2>
        <p className="text-xs text-muted-foreground">Select the sectors you're interested in.</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {INVESTMENT_CATEGORIES.map((cat) => {
            const iconMap: Record<string, React.ElementType> = {
              Laptop, Leaf, Heart, Landmark, Bot, Bitcoin,
            };
            const IconComp = iconMap[cat.icon];
            return (
              <button
                key={cat.id}
                onClick={() => toggleCategory(cat.id)}
                className={`p-4 rounded-lg border text-left transition-all ${
                  selectedCategories.includes(cat.id)
                    ? "border-primary bg-primary/10"
                    : "border-border bg-secondary/50 hover:border-muted-foreground/30"
                }`}
              >
                {IconComp && <IconComp className="w-5 h-5 text-muted-foreground" />}
                <p className="text-sm font-medium mt-2">{cat.label}</p>
                <p className="text-xs text-muted-foreground">{cat.examples}</p>
              </button>
            );
          })}
        </div>
      </section>

      <button
        onClick={() => navigate("/")}
        className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground py-3 rounded-lg font-semibold hover:opacity-90 transition-opacity"
      >
        Launch Dashboard <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  );
}
