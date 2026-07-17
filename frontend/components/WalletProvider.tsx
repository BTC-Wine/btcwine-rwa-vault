"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { DEMO_ADDRESS, isDemo } from "@/lib/demo";
import { connectWallet } from "@/lib/wallet";

type WalletCtx = {
  address: string | null;
  connect: () => Promise<void>;
  disconnect: () => void;
  connecting: boolean;
};

const Ctx = createContext<WalletCtx>({
  address: null,
  connect: async () => {},
  disconnect: () => {},
  connecting: false,
});

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [address, setAddress] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);

  // mode demo temporaire : wallet deja connecte
  useEffect(() => {
    if (isDemo()) setAddress(DEMO_ADDRESS);
  }, []);

  const connect = useCallback(async () => {
    if (isDemo()) {
      setAddress(DEMO_ADDRESS);
      return;
    }
    setConnecting(true);
    try {
      setAddress(await connectWallet());
    } catch {
      // l'utilisateur a ferme la fenetre, rien a faire
    } finally {
      setConnecting(false);
    }
  }, []);

  const disconnect = useCallback(() => setAddress(null), []);

  return (
    <Ctx.Provider value={{ address, connect, disconnect, connecting }}>
      {children}
    </Ctx.Provider>
  );
}

export const useWallet = () => useContext(Ctx);
