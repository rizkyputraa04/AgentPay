import {
  Keypair,
  Connection,
  PublicKey,
  Transaction,
  VersionedTransaction,
} from '@solana/web3.js';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

export class AgentPayWallet {
  keypair: Keypair;

  constructor(keypair: Keypair) {
    this.keypair = keypair;
  }

  static fromFile(filePath?: string): AgentPayWallet {
    const walletPath = filePath || path.join(os.homedir(), '.config', 'solana', 'id.json');
    const raw = fs.readFileSync(walletPath, 'utf-8');
    const secretKey = Uint8Array.from(JSON.parse(raw));
    return new AgentPayWallet(Keypair.fromSecretKey(secretKey));
  }

  static fromSecretKey(secretKey: Uint8Array): AgentPayWallet {
    return new AgentPayWallet(Keypair.fromSecretKey(secretKey));
  }

  static generate(): AgentPayWallet {
    return new AgentPayWallet(Keypair.generate());
  }

  get publicKey(): PublicKey {
    return this.keypair.publicKey;
  }

  get publicKeyString(): string {
    return this.keypair.publicKey.toBase58();
  }

  async signTransaction<T extends Transaction | VersionedTransaction>(tx: T): Promise<T> {
    if (tx instanceof Transaction) {
      tx.sign(this.keypair);
    }
    return tx;
  }

  async signAllTransactions<T extends Transaction | VersionedTransaction>(txs: T[]): Promise<T[]> {
    return txs.map(tx => {
      if (tx instanceof Transaction) tx.sign(this.keypair);
      return tx;
    });
  }
}
