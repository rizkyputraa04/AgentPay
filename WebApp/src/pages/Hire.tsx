import { useState, useEffect } from "react";
import { ArrowRight, ArrowLeft, CheckCircle2, ExternalLink, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useAgentPay } from "@/hooks/useAgentPay";

interface Agent {
  address: string;
  owner: string;
  name: string;
  description: string;
  skills: string[];
  pricePerJob: number;
  isActive: boolean;
}

const Hire = () => {
  const { toast } = useToast();
  const { fetchAgents, hireAgent, connected } = useAgentPay();

  const [step, setStep] = useState(1);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loadingAgents, setLoadingAgents] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [jobDetails, setJobDetails] = useState({ title: "", description: "" });
  const [hiring, setHiring] = useState(false);
  const [result, setResult] = useState<{ txSignature: string; escrowAddress: string; explorerUrl: string } | null>(null);

  const loadAgents = async () => {
    setLoadingAgents(true);
    try {
      const data = await fetchAgents();
      setAgents((data as Agent[]).filter(a => a.isActive));
    } catch (e) {
      toast({ title: "Error", description: "Gagal memuat agents", variant: "destructive" });
    } finally {
      setLoadingAgents(false);
    }
  };

  useEffect(() => {
    if (connected) loadAgents();
  }, [connected]);

  const handleConfirm = async () => {
    if (!selectedAgent || !connected) return;
    setHiring(true);
    try {
      const jobId = "hire-" + Date.now();
      const skills = selectedAgent.skills;
      const res = await hireAgent(
        jobId,
        jobDetails.title,
        jobDetails.description,
        skills,
        selectedAgent.owner,
        selectedAgent.pricePerJob
      );
      setResult(res);
      setStep(4);
      toast({ title: "Escrow berhasil dibuat!", description: "SOL sudah terkunci on-chain" });
    } catch (e: any) {
      toast({ title: "Gagal", description: e.message || "Terjadi error", variant: "destructive" });
    } finally {
      setHiring(false);
    }
  };

  return (
    <div className="container py-12 max-w-3xl">
      <h1 className="text-3xl font-bold mb-2">Hire an Agent</h1>
      <p className="text-muted-foreground mb-8">Complete the steps below to hire an AI agent and lock payment in escrow.</p>

      {/* Steps indicator */}
      <div className="flex items-center gap-2 mb-10">
        {[1, 2, 3, 4].map((s) => (
          <div key={s} className="flex items-center gap-2">
            <div className={"w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-colors " +
              (s <= step ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground")}>
              {s < step ? <CheckCircle2 className="w-4 h-4" /> : s}
            </div>
            {s < 4 && <div className={"w-12 h-px " + (s < step ? "bg-primary" : "bg-border")} />}
          </div>
        ))}
      </div>

      {/* Step 1: Select Agent */}
      {step === 1 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">Select an Agent</h2>
            <Button variant="outline" size="sm" onClick={loadAgents} disabled={loadingAgents || !connected} className="gap-2">
              <RefreshCw className={"w-3 h-3 " + (loadingAgents ? "animate-spin" : "")} />
              Refresh
            </Button>
          </div>

          {!connected ? (
            <div className="rounded-lg border border-border bg-card p-8 text-center">
              <p className="text-muted-foreground">Connect your Phantom wallet first</p>
            </div>
          ) : loadingAgents ? (
            <div className="rounded-lg border border-border bg-card p-8 text-center">
              <p className="text-muted-foreground">Loading agents from Devnet...</p>
            </div>
          ) : agents.length === 0 ? (
            <div className="rounded-lg border border-border bg-card p-8 text-center">
              <p className="text-muted-foreground">No active agents found. Register an agent first.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {agents.map((a) => (
                <button
                  key={a.address}
                  onClick={() => setSelectedAgent(a)}
                  className={"w-full text-left rounded-lg border p-4 transition-colors " +
                    (selectedAgent?.address === a.address ? "border-primary bg-primary/5" : "border-border bg-card hover:border-primary/30")}
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
                      <p className="text-xs text-muted-foreground mt-1 font-mono">
                        Owner: {a.owner.slice(0, 6)}...{a.owner.slice(-4)}
                      </p>
                    </div>
                    <span className="font-mono text-primary font-semibold">
                      {(a.pricePerJob / 1_000_000_000).toFixed(4)} SOL
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}

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
            <Input
              placeholder="e.g. Audit my token contract"
              value={jobDetails.title}
              onChange={(e) => setJobDetails({ ...jobDetails, title: e.target.value })}
            />
          </div>
          <div>
            <Label>Description</Label>
            <Input
              placeholder="Describe what you need done"
              value={jobDetails.description}
              onChange={(e) => setJobDetails({ ...jobDetails, description: e.target.value })}
            />
          </div>
          <div className="flex gap-3 mt-4">
            <Button variant="outline" onClick={() => setStep(1)} className="gap-2">
              <ArrowLeft className="w-4 h-4" /> Back
            </Button>
            <Button onClick={() => setStep(3)} disabled={!jobDetails.title || !jobDetails.description} className="gap-2">
              Next <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Step 3: Confirm & Lock */}
      {step === 3 && selectedAgent && (
        <div className="space-y-6">
          <h2 className="text-xl font-semibold">Confirm & Lock Escrow</h2>
          <div className="rounded-lg border border-border bg-card p-6 space-y-4">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Agent</span>
              <span className="font-medium">{selectedAgent.name}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Job</span>
              <span className="font-medium">{jobDetails.title}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Worker Address</span>
              <span className="font-mono text-xs">
                {selectedAgent.owner.slice(0, 6)}...{selectedAgent.owner.slice(-4)}
              </span>
            </div>
            <div className="border-t border-border pt-4 flex justify-between">
              <span className="text-muted-foreground">Escrow Amount</span>
              <span className="text-xl font-bold font-mono text-primary">
                {(selectedAgent.pricePerJob / 1_000_000_000).toFixed(4)} SOL
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              1% protocol fee ({(selectedAgent.pricePerJob / 1_000_000_000 * 0.01).toFixed(6)} SOL) applied on settlement.
            </p>
          </div>
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setStep(2)} className="gap-2">
              <ArrowLeft className="w-4 h-4" /> Back
            </Button>
            <Button onClick={handleConfirm} disabled={hiring} className="gap-2">
              {hiring ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {hiring ? "Locking Escrow on-chain..." : "Confirm & Lock SOL"}
            </Button>
          </div>
        </div>
      )}

      {/* Step 4: Success */}
      {step === 4 && result && selectedAgent && (
        <div className="text-center space-y-6">
          <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-8 h-8 text-primary" />
          </div>
          <div>
            <h2 className="text-2xl font-bold">Escrow Locked!</h2>
            <p className="text-muted-foreground mt-2">
              {(selectedAgent.pricePerJob / 1_000_000_000).toFixed(4)} SOL has been locked in escrow on Solana Devnet.
            </p>
          </div>
          <div className="rounded-lg border border-border bg-card p-4 space-y-3 text-left">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Transaction Signature</p>
              <p className="font-mono text-xs break-all">{result.txSignature}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Escrow PDA Address</p>
              <p className="font-mono text-xs break-all">{result.escrowAddress}</p>
            </div>
          </div>
          <div className="flex gap-3 justify-center">
            <Button asChild variant="outline" className="gap-2">
              <a href={result.explorerUrl} target="_blank" rel="noreferrer">
                View on Solana Explorer <ExternalLink className="w-4 h-4" />
              </a>
            </Button>
            <Button onClick={() => { setStep(1); setSelectedAgent(null); setResult(null); setJobDetails({ title: "", description: "" }); }}>
              Hire Another Agent
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Hire;