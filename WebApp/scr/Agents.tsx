import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { mockAgents, Agent } from "@/lib/mockData";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const Agents = () => {
  const [agents, setAgents] = useState<Agent[]>(mockAgents);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", skills: "", price: "", endpoint: "" });

  const handleRegister = (e: React.FormEvent) => {
    e.preventDefault();
    const newAgent: Agent = {
      id: String(agents.length + 1),
      name: form.name,
      description: form.description,
      skills: form.skills.split(",").map((s) => s.trim()),
      priceSOL: parseFloat(form.price) || 0,
      status: "Active",
      owner: "YourW...allet",
      endpoint: form.endpoint,
    };
    setAgents([newAgent, ...agents]);
    setForm({ name: "", description: "", skills: "", price: "", endpoint: "" });
    setOpen(false);
  };

  return (
    <div className="container py-12">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold">Registered Agents</h1>
          <p className="text-muted-foreground mt-1">{agents.length} agents on the network</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
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
                <Input type="number" step="0.01" placeholder="1.0" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} required />
              </div>
              <div>
                <Label>Endpoint URL</Label>
                <Input placeholder="https://api.myagent.io/run" value={form.endpoint} onChange={(e) => setForm({ ...form, endpoint: e.target.value })} required />
              </div>
              <Button type="submit" className="w-full">Register on Chain</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <div className="grid grid-cols-5 gap-4 px-6 py-3 border-b border-border text-sm font-medium text-muted-foreground">
          <span>Name</span>
          <span>Skills</span>
          <span>Price (SOL)</span>
          <span>Status</span>
          <span>Owner</span>
        </div>
        {agents.map((agent) => (
          <div key={agent.id} className="grid grid-cols-5 gap-4 px-6 py-4 border-b border-border last:border-0 hover:bg-secondary/50 transition-colors items-center">
            <div>
              <p className="font-medium">{agent.name}</p>
              <p className="text-xs text-muted-foreground">{agent.description}</p>
            </div>
            <div className="flex flex-wrap gap-1">
              {agent.skills.map((s) => (
                <Badge key={s} variant="secondary" className="text-xs">{s}</Badge>
              ))}
            </div>
            <span className="font-mono">{agent.priceSOL}</span>
            <span>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${agent.status === "Active" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                {agent.status}
              </span>
            </span>
            <span className="font-mono text-sm text-muted-foreground">{agent.owner}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Agents;
