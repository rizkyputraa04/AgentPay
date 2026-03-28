import { useState } from "react";
import { ArrowRight, ArrowLeft, CheckCircle2, ExternalLink, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { mockAgents } from "@/lib/mockData";

const Hire = () => {
  const [step, setStep] = useState(1);
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [jobDetails, setJobDetails] = useState({ title: "", description: "", deadline: "" });
  const [loading, setLoading] = useState(false);

  const agent = mockAgents.find((a) => a.id === selectedAgent);
  const txHash = "5KtPn1LGuxhFiwjxErkxTb3XoEBWzVPC7S9cYrmfGxuLd7ttYNGmdhC4cg4cYDRBwFgSm3";

  const handleConfirm = () => {
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      setStep(4);
    }, 2000);
  };

  return (
    <div className="container py-12 max-w-3xl">
      <h1 className="text-3xl font-bold mb-2">Hire an Agent</h1>
      <p className="text-muted-foreground mb-8">Complete the steps below to hire an AI agent and lock payment in escrow.</p>

      {/* Steps indicator */}
      <div className="flex items-center gap-2 mb-10">
        {[1, 2, 3, 4].map((s) => (
          <div key={s} className="flex items-center gap-2">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-colors ${
              s <= step ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"
            }`}>
              {s < step ? <CheckCircle2 className="w-4 h-4" /> : s}
            </div>
            {s < 4 && <div className={`w-12 h-px ${s < step ? "bg-primary" : "bg-border"}`} />}
          </div>
        ))}
      </div>

      {/* Step 1: Select Agent */}
      {step === 1 && (
        <div className="space-y-4">
          <h2 className="text-xl font-semibold">Select an Agent</h2>
          <div className="space-y-3">
            {mockAgents.filter((a) => a.status === "Active").map((a) => (
              <button
                key={a.id}
                onClick={() => setSelectedAgent(a.id)}
                className={`w-full text-left rounded-lg border p-4 transition-colors ${
                  selectedAgent === a.id ? "border-primary bg-primary/5" : "border-border bg-card hover:border-primary/30"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">{a.name}</p>
                    <p className="text-sm text-muted-foreground">{a.description}</p>
                    <div className="flex gap-1 mt-2">
                      {a.skills.map((s) => (
                        <Badge key={s} variant="secondary" className="text-xs">{s}</Badge>
                      ))}
                    </div>
                  </div>
                  <span className="font-mono text-primary font-semibold">{a.priceSOL} SOL</span>
                </div>
              </button>
            ))}
          </div>
          <Button onClick={() => setStep(2)} disabled={!selectedAgent} className="gap-2 mt-4">
            Next <ArrowRight className="w-4 h-4" />
          </Button>
        </div>
      )}

      {/* Step 2: Job Details */}
      {step === 2 && (
        <div className="space-y-4">
          <h2 className="text-xl font-semibold">Job Details</h2>
          <div>
            <Label>Job Title</Label>
            <Input placeholder="e.g. Audit my token contract" value={jobDetails.title} onChange={(e) => setJobDetails({ ...jobDetails, title: e.target.value })} />
          </div>
          <div>
            <Label>Description</Label>
            <Input placeholder="Describe what you need done" value={jobDetails.description} onChange={(e) => setJobDetails({ ...jobDetails, description: e.target.value })} />
          </div>
          <div>
            <Label>Deadline</Label>
            <Input type="date" value={jobDetails.deadline} onChange={(e) => setJobDetails({ ...jobDetails, deadline: e.target.value })} />
          </div>
          <div className="flex gap-3 mt-4">
            <Button variant="outline" onClick={() => setStep(1)} className="gap-2">
              <ArrowLeft className="w-4 h-4" /> Back
            </Button>
            <Button onClick={() => setStep(3)} disabled={!jobDetails.title} className="gap-2">
              Next <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Step 3: Confirm & Lock */}
      {step === 3 && agent && (
        <div className="space-y-6">
          <h2 className="text-xl font-semibold">Confirm & Lock Escrow</h2>
          <div className="rounded-lg border border-border bg-card p-6 space-y-4">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Agent</span>
              <span className="font-medium">{agent.name}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Job</span>
              <span className="font-medium">{jobDetails.title}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Deadline</span>
              <span className="font-medium">{jobDetails.deadline || "—"}</span>
            </div>
            <div className="border-t border-border pt-4 flex justify-between">
              <span className="text-muted-foreground">Escrow Amount</span>
              <span className="text-xl font-bold font-mono text-primary">{agent.priceSOL} SOL</span>
            </div>
            <p className="text-xs text-muted-foreground">1% protocol fee ({(agent.priceSOL * 0.01).toFixed(4)} SOL) applied on settlement.</p>
          </div>
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setStep(2)} className="gap-2">
              <ArrowLeft className="w-4 h-4" /> Back
            </Button>
            <Button onClick={handleConfirm} disabled={loading} className="gap-2">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {loading ? "Locking Escrow..." : "Confirm & Lock SOL"}
            </Button>
          </div>
        </div>
      )}

      {/* Step 4: Success */}
      {step === 4 && agent && (
        <div className="text-center space-y-6">
          <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-8 h-8 text-primary" />
          </div>
          <div>
            <h2 className="text-2xl font-bold">Escrow Locked!</h2>
            <p className="text-muted-foreground mt-2">
              {agent.priceSOL} SOL has been locked in escrow. The agent will begin work shortly.
            </p>
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <p className="text-sm text-muted-foreground mb-1">Transaction</p>
            <p className="font-mono text-sm break-all">{txHash}</p>
          </div>
          <Button asChild variant="outline" className="gap-2">
            <a href={`https://explorer.solana.com/tx/${txHash}?cluster=devnet`} target="_blank" rel="noreferrer">
              View on Solana Explorer <ExternalLink className="w-4 h-4" />
            </a>
          </Button>
        </div>
      )}
    </div>
  );
};

export default Hire;
