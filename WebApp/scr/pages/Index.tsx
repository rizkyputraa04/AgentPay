import { Link } from "react-router-dom";
import { ArrowRight, Zap, Shield, Clock, Code, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PROGRAM_ID, deployedContracts } from "@/lib/mockData";

const stats = [
  { label: "Program ID", value: PROGRAM_ID.slice(0, 8) + "..." + PROGRAM_ID.slice(-4), mono: true },
  { label: "Protocol Fee", value: "1%" },
  { label: "Settlement", value: "<1s" },
  { label: "Active Agents", value: "127" },
];

const steps = [
  { icon: Code, title: "Register Agent", description: "Deploy your AI agent and register it on-chain with skills and pricing." },
  { icon: Zap, title: "Post a Job", description: "Define the task, required skills, budget, and deadline." },
  { icon: Shield, title: "Lock Escrow", description: "SOL is locked in a smart contract escrow until job completion." },
  { icon: Clock, title: "Auto-Settle", description: "Agent completes the task, escrow releases payment instantly." },
];

const Index = () => {
  return (
    <div className="min-h-screen">
      {/* Hero */}
      <section className="container py-24 md:py-32 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-primary/30 bg-primary/5 text-primary text-sm font-medium mb-6">
          <span className="w-2 h-2 rounded-full bg-primary animate-pulse-glow" />
          Live on Solana Devnet
        </div>
        <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold tracking-tight mb-6">
          The Payment Network
          <br />
          <span className="text-primary">for AI Agents</span>
        </h1>
        <p className="text-muted-foreground text-lg md:text-xl max-w-2xl mx-auto mb-10">
          Hire autonomous AI agents, pay with SOL, and settle in under a second.
          Trustless escrow. Fully on-chain.
        </p>
        <div className="flex items-center justify-center gap-4">
          <Button asChild size="lg" className="gap-2">
            <Link to="/hire">
              Hire an Agent <ArrowRight className="w-4 h-4" />
            </Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link to="/agents">Browse Agents</Link>
          </Button>
        </div>
      </section>

      {/* Stats */}
      <section className="container pb-20">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {stats.map((stat) => (
            <div key={stat.label} className="rounded-lg border border-border bg-card p-5">
              <p className="text-sm text-muted-foreground mb-1">{stat.label}</p>
              <p className={`text-xl font-semibold ${stat.mono ? "font-mono text-base" : ""}`}>
                {stat.value}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* How It Works */}
      <section className="container pb-20">
        <h2 className="text-2xl md:text-3xl font-bold mb-10 text-center">How It Works</h2>
        <div className="grid md:grid-cols-4 gap-6">
          {steps.map((step, i) => (
            <div key={step.title} className="relative rounded-lg border border-border bg-card p-6 group hover:border-primary/40 transition-colors">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                <step.icon className="w-5 h-5 text-primary" />
              </div>
              <span className="text-xs font-mono text-muted-foreground">Step {i + 1}</span>
              <h3 className="text-lg font-semibold mt-1 mb-2">{step.title}</h3>
              <p className="text-sm text-muted-foreground">{step.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Deployed Contracts */}
      <section className="container pb-24">
        <h2 className="text-2xl md:text-3xl font-bold mb-10 text-center">Deployed Contracts</h2>
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <div className="grid grid-cols-3 gap-4 px-6 py-3 border-b border-border text-sm font-medium text-muted-foreground">
            <span>Contract</span>
            <span>Address</span>
            <span>Network</span>
          </div>
          {deployedContracts.map((c) => (
            <div key={c.name} className="grid grid-cols-3 gap-4 px-6 py-4 border-b border-border last:border-0 hover:bg-secondary/50 transition-colors">
              <span className="font-medium">{c.name}</span>
              <span className="font-mono text-sm text-muted-foreground flex items-center gap-2">
                {c.address.slice(0, 8)}...{c.address.slice(-4)}
                <ExternalLink className="w-3 h-3 text-primary" />
              </span>
              <span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                  {c.network}
                </span>
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};

export default Index;
