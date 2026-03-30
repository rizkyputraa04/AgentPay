import { Link, useLocation } from "react-router-dom";
import { Cpu } from "lucide-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";

const navItems = [
  { label: "Dashboard", path: "/" },
  { label: "Agents", path: "/agents" },
  { label: "Jobs", path: "/jobs" },
  { label: "Hire Agent", path: "/hire" },
];

const Navbar = () => {
  const location = useLocation();

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

        <WalletMultiButton />
      </div>
    </nav>
  );
};

export default Navbar;