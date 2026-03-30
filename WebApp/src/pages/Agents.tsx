import { useState, useEffect } from "react";
import { Plus, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useAgentPay } from "@/hooks/useAgentPay";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface Agent {
  address: string;
  owner: string;
  name: string;
  description: string;
  skills: string[];
  pricePerJob: number;
  isActive: boolean;
  jobsCompleted: number;
}

const Agents = () => {
  const { toast } = useToast();
  const { fetchAgents, registerAgent, connected, publicKey } = useAgentPay();

  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: "", description: "", skills: "", price: "", endpoint: ""
  });

  const loadAgents = async () => {
    setLoading(true);
    try {
      const data = await fetchAgents();
      setAgents(data);
    } catch (e) {
      toast({ title: "Error", description: "Gagal memuat agents", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (connected) loadAgents();
  }, [connected]);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!connected) {
      toast({ title: "Wallet belum terconnect", description: "Connect Phantom wallet dulu", variant: "destructive" });
      return;
    }
    setRegistering(true);
    try {
      const skills = form.skills.split(",").map(s => s.trim()).filter(Boolean);
      const priceInLamports = Math.floor(parseFloat(form.price) * 1_000_000_000);
      const explorerUrl = "https://explorer.solana.com/tx/" + tx + "?cluster=devnet";
      toast({
        title: "Agent berhasil didaftarkan!",
        description: "Transaksi berhasil. TX: " + tx.slice(0, 8) + "...",
      });
      console.log("Explorer URL:", explorerUrl);
      setForm({ name: "", description: "", skills: "", price: "", endpoint: "" });
      setOpen(false);
      await loadAgents();
    } catch (e: any) {
      toast({ title: "Gagal", description: e.message || "Terjadi error", variant: "destructive" });
    } finally {
      setRegistering(false);
    }
  };

  return (
    <div className="container py-12">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold">Registered Agents</h1>
          <p className="text-muted-foreground mt-1">
            {connected ? `${agents.length} agents on the network` : "Connect wallet to load agents"}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={loadAgents} disabled={loading || !connected} className="gap-2">
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2" disabled={!connected}>
                <Plus className="w-4 h-4" /> Register Agent
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-card border-border">
              <DialogHeader>
                <DialogTitle>Register New Agent</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleRegister} className="space-y-4 mt-2">
                <div>
                  <Label>Name</Label>
                  <Input placeholder="MyAgent-v1" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
                </div>
                <div>
                  <Label>Description</Label>
                  <Input placeholder="What does this agent do?" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} required />
                </div>
                <div>
                  <Label>Skills (comma separated)</Label>
                  <Input placeholder="audit, security, rust" value={form.skills} onChange={(e) => setForm({ ...form, skills: e.target.value })} required />
                </div>
                <div>
                  <Label>Price per Job (SOL)</Label>
                  <Input type="number" step="0.01" placeholder="0.05" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} required />
                </div>
                <div>
                  <Label>Endpoint URL</Label>
                  <Input placeholder="https://api.myagent.io/run" value={form.endpoint} onChange={(e) => setForm({ ...form, endpoint: e.target.value })} required />
                </div>
                <Button type="submit" className="w-full" disabled={registering}>
                  {registering ? "Registering..." : "Register on Chain"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {!connected ? (
        <div className="rounded-lg border border-border bg-card p-12 text-center">
          <p className="text-muted-foreground">Connect your Phantom wallet to view registered agents</p>
        </div>
      ) : loading ? (
        <div className="rounded-lg border border-border bg-card p-12 text-center">
          <p className="text-muted-foreground">Loading agents from Devnet...</p>
        </div>
      ) : agents.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-12 text-center">
          <p className="text-muted-foreground">No agents registered yet. Be the first!</p>
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <div className="grid grid-cols-5 gap-4 px-6 py-3 border-b border-border text-sm font-medium text-muted-foreground">
            <span>Name</span>
            <span>Skills</span>
            <span>Price (SOL)</span>
            <span>Status</span>
            <span>Owner</span>
          </div>
          {agents.map((agent) => (
            <div key={agent.address} className="grid grid-cols-5 gap-4 px-6 py-4 border-b border-border last:border-0 hover:bg-secondary/50 transition-colors items-center">
              <div>
                <p className="font-medium">{agent.name}</p>
                <p className="text-xs text-muted-foreground">{agent.description}</p>
              </div>
              <div className="flex flex-wrap gap-1">
                {agent.skills.map((s) => (
                  <Badge key={s} variant="secondary" className="text-xs">{s}</Badge>
                ))}
              </div>
              <span className="font-mono">{(agent.pricePerJob / 1_000_000_000).toFixed(4)} SOL</span>
              <span>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${agent.isActive ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                  {agent.isActive ? "Active" : "Inactive"}
                </span>
              </span>
              <span className="font-mono text-sm text-muted-foreground">
                {agent.owner.slice(0, 4)}...{agent.owner.slice(-4)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Agents;