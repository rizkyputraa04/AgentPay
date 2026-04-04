import { Link, useLocation } from "react-router-dom";
import { Cpu, Wallet, ChevronDown, Copy, LogOut } from "lucide-react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { useState, useRef, useEffect } from "react";

const navItems = [
  { label: "Dashboard", path: "/" },
  { label: "Agents", path: "/agents" },
  { label: "Jobs", path: "/jobs" },
  { label: "Hire Agent", path: "/hire" },
  { label: "Demo", path: "/demo" },
];

const Navbar = () => {
  const location = useLocation();
  const { connected, publicKey, disconnect } = useWallet();
  const { setVisible } = useWalletModal();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const shortAddress = publicKey
    ? publicKey.toBase58().slice(0, 4) + ".." + publicKey.toBase58().slice(-4)
    : "";

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const copyAddress = () => {
    if (publicKey) navigator.clipboard.writeText(publicKey.toBase58());
    setDropdownOpen(false);
  };

  const openExplorer = () => {
    if (publicKey) {
      window.open(
        "https://explorer.solana.com/address/" + publicKey.toBase58() + "?cluster=devnet",
        "_blank"
      );
    }
    setDropdownOpen(false);
  };

  return (
    <nav className="border-b border-border bg-card/80 backdrop-blur-md sticky top-0 z-50">
      <div className="container flex items-center justify-between h-16">
        <Link to="/" className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center">
            <Cpu className="w-5 h-5 text-primary" />
          </div>
          <span className="text-lg font-bold tracking-tight text-foreground">
            Agent<span className="text-primary">Pay</span>
          </span>
        </Link>

        <div className="hidden md:flex items-center gap-1">
          {navItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                location.pathname === item.path
                  ? "text-primary bg-primary/10"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </div>

        {!connected ? (
          <button
            onClick={() => setVisible(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary/10 border border-primary/30 text-primary text-sm font-medium hover:bg-primary/20 transition-colors"
          >
            <Wallet className="w-4 h-4" />
            Connect Wallet
          </button>
        ) : (
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setDropdownOpen(!dropdownOpen)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary/10 border border-primary/30 text-primary text-sm font-medium hover:bg-primary/20 transition-colors"
            >
              <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
              <span className="font-mono">{shortAddress}</span>
              <ChevronDown className={"w-3 h-3 transition-transform " + (dropdownOpen ? "rotate-180" : "")} />
            </button>

            {dropdownOpen && (
              <div className="absolute right-0 mt-2 w-52 rounded-lg border border-border bg-card shadow-lg overflow-hidden z-50">
                <div className="px-4 py-3 border-b border-border">
                  <p className="text-xs text-muted-foreground mb-1">Connected Wallet</p>
                  <p className="font-mono text-xs text-foreground break-all">
                    {publicKey ? publicKey.toBase58().slice(0, 20) + "..." : ""}
                  </p>
                </div>
                <button
                  onClick={copyAddress}
                  className="w-full flex items-center gap-3 px-4 py-3 text-sm text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                >
                  <Copy className="w-4 h-4" />
                  <span>Copy Address</span>
                </button>
                <button
                  onClick={openExplorer}
                  className="w-full flex items-center gap-3 px-4 py-3 text-sm text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                >
                  <Wallet className="w-4 h-4" />
                  <span>View on Explorer</span>
                </button>
                <button
                  onClick={() => { disconnect(); setDropdownOpen(false); }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-sm text-red-400 hover:bg-red-500/10 transition-colors border-t border-border"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Disconnect</span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </nav>
  );
};

export default Navbar;
