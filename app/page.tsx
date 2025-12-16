"use client";

import { useState, useEffect, type ChangeEvent } from "react";
import {
  useAccount,
  useWalletClient,
  usePublicClient,
} from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { BridgeKit } from "@circle-fin/bridge-kit";
import { createAdapterFromProvider } from "@circle-fin/adapter-viem-v2";
import { formatUnits, parseUnits, createPublicClient, http, defineChain } from "viem";
import { erc20Abi } from "viem";
import { baseSepolia, sepolia } from "wagmi/chains";

export default function BridgePage() {
  const { address, isConnected } = useAccount();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();

  const [adapter, setAdapter] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [amount, setAmount] = useState("");
  const [bridgeStatus, setBridgeStatus] = useState<string>("");
  const [fromChain, setFromChain] = useState<"Base_Sepolia" | "Ethereum_Sepolia" | "Arc_Testnet">("Base_Sepolia");
  const [toChain, setToChain] = useState<"Ethereum_Sepolia" | "Base_Sepolia" | "Arc_Testnet">("Ethereum_Sepolia");
  const [theme, setTheme] = useState<"light" | "dark">("dark");
  const [balance, setBalance] = useState<string>("0.00");
  const [balanceLoading, setBalanceLoading] = useState(false);

  // Chain configuration helpers
  const getChainConfig = (chain: typeof fromChain) => {
    if (chain === "Base_Sepolia") return CHAINS.BASE_SEPOLIA;
    if (chain === "Ethereum_Sepolia") return CHAINS.ETHEREUM_SEPOLIA;
    return CHAINS.ARC_TESTNET;
  };
  const CHAINS = {
    BASE_SEPOLIA: {
      chainId: "0x14A34", // 84532
      chainName: "Base Sepolia",
      rpcUrls: ["https://sepolia.base.org"],
      nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
      blockExplorerUrls: ["https://sepolia-explorer.base.org"],
    },
    ETHEREUM_SEPOLIA: {
      chainId: "0xaa36a7", // 11155111
      chainName: "Ethereum Sepolia",
      rpcUrls: [
        "https://ethereum-sepolia-rpc.publicnode.com",
        "https://sepolia.infura.io/v3/9aa3d95b3bc440fa88ea12eaa4456161", // Public Infura endpoint
        "https://rpc.sepolia.org",
      ],
      nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
      blockExplorerUrls: ["https://sepolia.etherscan.io"],
    },
    ARC_TESTNET: {
      chainId: "0x4cef52", // 5042002
      chainName: "Arc Testnet",
      rpcUrls: [
        "https://rpc.testnet.arc.network",
        "https://rpc.blockdaemon.testnet.arc.network",
        "https://rpc.drpc.testnet.arc.network",
        "https://rpc.quicknode.testnet.arc.network",
      ],
      nativeCurrency: { name: "ARC", symbol: "ARC", decimals: 18 },
      blockExplorerUrls: ["https://testnet.arcscan.app"],
    },
  };

  const USDC_ADDRESSES: Record<string, `0x${string}`> = {
    Base_Sepolia: "0x036cbd53842c5426634e7929541ec2318f3dcf7e".toLowerCase() as `0x${string}`,
    Ethereum_Sepolia: "0x1c7d4b196cb0c7b01d743fbc6116a902379c7238".toLowerCase() as `0x${string}`,
    Arc_Testnet: "0x3600000000000000000000000000000000000000".toLowerCase() as `0x${string}`,
  };

  // Add or switch chain on wallet
  async function ensureChain(provider: any, chainConfig: any) {
    try {
      await provider.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: chainConfig.chainId }],
      });
      
      const currentChainId = await provider.request({ method: "eth_chainId" });
      if (currentChainId.toLowerCase() !== chainConfig.chainId.toLowerCase()) {
        throw new Error(`Failed to switch to chain ${chainConfig.chainName}`);
      }
    } catch (err: any) {
      if (err.code === 4902 || err.code === -32002 || err.message?.includes("Unrecognized chain")) {
        try {
          await provider.request({
            method: "wallet_addEthereumChain",
            params: [{
              chainId: chainConfig.chainId,
              chainName: chainConfig.chainName,
              nativeCurrency: chainConfig.nativeCurrency,
              rpcUrls: chainConfig.rpcUrls,
              blockExplorerUrls: chainConfig.blockExplorerUrls,
            }],
          });
          
          await new Promise(resolve => setTimeout(resolve, 500));
          
          await provider.request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: chainConfig.chainId }],
          });
          
          const currentChainId = await provider.request({ method: "eth_chainId" });
          if (currentChainId.toLowerCase() !== chainConfig.chainId.toLowerCase()) {
            throw new Error(`Failed to switch to chain ${chainConfig.chainName} after adding`);
          }
        } catch (addErr: any) {
          throw new Error(`Failed to add chain ${chainConfig.chainName}: ${addErr.message || addErr.code || 'Unknown error'}`);
        }
      } else {
        throw err;
      }
    }
  }


  useEffect(() => {
    if (!isConnected || !walletClient) {
      setAdapter(null);
      return;
    }

    async function setupAdapter() {
      try {
        setError("");
        
        if (!walletClient) {
          setError("Wallet client not available");
          return;
        }
        
        const provider = walletClient.transport as any;
        
        if (!provider) {
          setError("No wallet provider available");
          return;
        }

        let ethereumProvider = provider;
        if (provider.request) {
          ethereumProvider = provider;
        } else if ((window as any).ethereum) {
          ethereumProvider = (window as any).ethereum;
        }

        const a = await createAdapterFromProvider({
          provider: ethereumProvider,
        });

        setAdapter(a);
        setError("");
      } catch (err: any) {
        console.error("Adapter creation failed:", err);
        setError(err.message || "Failed to initialize wallet adapter. Please try reconnecting your wallet.");
        setAdapter(null);
      }
    }

    setupAdapter();
  }, [isConnected, walletClient]);

  const getChainId = (chain: typeof fromChain): number => {
    switch (chain) {
      case "Base_Sepolia":
        return baseSepolia.id; // 84532
      case "Ethereum_Sepolia":
        return sepolia.id; // 11155111
      case "Arc_Testnet":
        return 5042002;
      default:
        return baseSepolia.id;
    }
  };

  const fetchBalance = async () => {
    if (!address || !fromChain) {
      setBalance("0.00");
      setBalanceLoading(false);
      return;
    }

    setBalanceLoading(true);
    try {
      const usdcAddress = USDC_ADDRESSES[fromChain];
      if (!usdcAddress) {
        console.warn(`USDC address not found for chain: ${fromChain}`);
        setBalance("0.00");
        return;
      }

      const chainConfig = getChainConfig(fromChain);
      const chainId = getChainId(fromChain);

      let chain;
      let rpcUrl;
      
      if (fromChain === "Base_Sepolia") {
        chain = baseSepolia;
        rpcUrl = baseSepolia.rpcUrls.default.http[0];
      } else if (fromChain === "Ethereum_Sepolia") {
        chain = sepolia;
        rpcUrl = sepolia.rpcUrls.default.http[0];
      } else {
        rpcUrl = chainConfig.rpcUrls[0];
        chain = defineChain({
          id: 5042002,
          name: "Arc Testnet",
          nativeCurrency: {
            decimals: 18,
            name: "ARC",
            symbol: "ARC",
          },
          rpcUrls: {
            default: {
              http: [rpcUrl],
            },
          },
          blockExplorers: {
            default: {
              name: "ArcScan",
              url: "https://testnet.arcscan.app",
            },
          },
          testnet: true,
        });
      }

      let client;
      const currentChainId = publicClient?.chain?.id;
      
      if (currentChainId === chainId && publicClient) {
        client = publicClient;
      } else {
        client = createPublicClient({
          chain: chain,
          transport: http(rpcUrl),
        });
      }

      const decimals = 6;
      const balance = await client.readContract({
        address: usdcAddress,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [address as `0x${string}`],
      });

      const formattedBalance = formatUnits(balance as bigint, decimals);
      setBalance(formattedBalance);
      setError("");
    } catch (err: any) {
      console.error("Error fetching balance:", err);
      setBalance("0.00");
    } finally {
      setBalanceLoading(false);
    }
  };

  useEffect(() => {
    if (!isConnected || !walletClient || loading) return;

    async function switchToChain() {
      try {
        // Get provider
        let provider: any = (window as any).ethereum;
        if (!provider && walletClient) {
          const transport = (walletClient as any).transport;
          if (transport && transport.request) {
            provider = transport;
          }
        }
        
        if (!provider) return;

        const chainConfig = getChainConfig(fromChain);
        
        // Check current chain ID
        const currentChainId = await provider.request({ method: "eth_chainId" });
        
          if (currentChainId.toLowerCase() !== chainConfig.chainId.toLowerCase()) {
          await ensureChain(provider, chainConfig);
        }
      } catch (err: any) {
        console.log("Automatic chain switch:", err.message);
      }
    }

    const timeoutId = setTimeout(switchToChain, 300);
    return () => clearTimeout(timeoutId);
  }, [fromChain, isConnected, walletClient, loading]);

  useEffect(() => {
    if (isConnected && address) {
      fetchBalance();
      const interval = setInterval(fetchBalance, 10000);
      return () => clearInterval(interval);
    } else {
      setBalance("0.00");
    }
  }, [address, fromChain, isConnected]);

  useEffect(() => {
    const saved = typeof window !== "undefined" ? localStorage.getItem("theme") : null;
    if (saved === "light" || saved === "dark") {
      setTheme(saved);
      return;
    }
    const prefersDark =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches;
    setTheme(prefersDark ? "dark" : "light");
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return;
    if (theme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
    localStorage.setItem("theme", theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev: "light" | "dark") => (prev === "dark" ? "light" : "dark"));
  };

  const bridgeUSDC = async () => {
    if (!adapter) {
      setError("Wallet adapter not initialized");
      return;
    }

    if (!amount || parseFloat(amount) <= 0) {
      setError("Please enter a valid amount");
      return;
    }

    await fetchBalance();
    await new Promise(resolve => setTimeout(resolve, 500));

    const amountNum = parseFloat(amount);
    const balanceNum = parseFloat(balance);

    if (amountNum > balanceNum + 0.01) {
      setError(`Insufficient balance. You have ${balance} USDC, but trying to bridge ${amount} USDC.`);
      return;
    }

    setError("");
    setLoading(true);
    setBridgeStatus("Initializing bridge...");

    try {
      // Get provider - same logic as adapter setup
      let provider: any = (window as any).ethereum;
      if (!provider && walletClient) {
        const transport = (walletClient as any).transport;
        if (transport && transport.request) {
          provider = transport;
        }
      }
      
      if (!provider) throw new Error("No provider available");

      setBridgeStatus("Step 1/3: Switching to sending chain...");
      const fromChainConfig = getChainConfig(fromChain);
      
      const currentChainId = await provider.request({ method: "eth_chainId" });
      if (currentChainId.toLowerCase() !== fromChainConfig.chainId.toLowerCase()) {
        await ensureChain(provider, fromChainConfig);
        await new Promise(resolve => setTimeout(resolve, 1500));
      }

      const kit = new BridgeKit();

      kit.on('*', (payload: any) => {
        if (payload.values?.txHash) {
          const txHash = payload.values.txHash;
          if (payload.method === 'approve') {
            setBridgeStatus(`Transaction 1/3: Approval confirmed - ${txHash.slice(0, 10)}...`);
          } else if (payload.method === 'mint' || payload.method?.includes('deposit') || payload.method?.includes('burn')) {
            setBridgeStatus(`Transaction 2/3: Deposit confirmed - ${txHash.slice(0, 10)}...`);
          } else if (payload.method === 'receiveMessage' || payload.method?.includes('receive') || payload.method?.includes('mint')) {
            setBridgeStatus(`Transaction 3/3: Receive confirmed - ${txHash.slice(0, 10)}...`);
          }
        }
      });

      setBridgeStatus("Transaction 1/3: Approving USDC on sending chain...");
      
      let bridgeResult;
      try {
        bridgeResult = await kit.bridge({
          from: { chain: fromChain, adapter },
          to: { chain: toChain, adapter },
          amount: amount,
        });
      } catch (bridgeErr: any) {
        if (bridgeErr.result && typeof bridgeErr.result === 'object' && bridgeErr.result?.state === 'pending') {
          bridgeResult = bridgeErr.result;
          setBridgeStatus("Bridge encountered an error but has pending steps. Attempting to retry...");
          try {
            bridgeResult = await kit.retry(bridgeResult, {
              from: adapter,
              to: adapter
            });
          } catch (retryErr: any) {
            throw new Error(`Bridge failed: ${bridgeErr.message || 'Unknown error'}. Retry also failed: ${retryErr.message || 'Unknown error'}`);
          }
        } else {
          throw bridgeErr;
        }
      }

      if (bridgeResult?.steps && Array.isArray(bridgeResult.steps)) {
        bridgeResult.steps.forEach((step: any) => {
          if (step.error) {
            console.error(`Step ${step.name} error:`, step.error);
          }
        });
      }

      if (bridgeResult?.state === 'success') {
        setBridgeStatus("Bridge complete! All 3 transactions confirmed. 🎉");
      } else if (bridgeResult?.state === 'pending') {
        const pendingSteps = bridgeResult.steps?.filter((s: any) => s.state === 'pending' || !s.state) || [];
        const failedSteps = bridgeResult.steps?.filter((s: any) => s.state === 'failed') || [];
        
        if (failedSteps.length > 0) {
          const failedStep = failedSteps[0];
          const errorMsg = (failedStep.error as any)?.message || (failedStep.error as any) || failedStep.errorMessage || 'Unknown error';
          throw new Error(`Bridge failed at step "${failedStep.name}": ${errorMsg}`);
        }
        
        const receiveStep = pendingSteps.find((s: any) => 
          s.name?.toLowerCase().includes('receive') || 
          s.name?.toLowerCase().includes('mint') ||
          s.name?.toLowerCase().includes('message')
        );
        
        if (receiveStep) {
          setBridgeStatus("Transactions 1 & 2 complete. Preparing transaction 3/3 (receive) on destination chain...");
          
          const toChainConfig = getChainConfig(toChain);
          let currentChainId = await provider.request({ method: "eth_chainId" });
          
          if (currentChainId.toLowerCase() !== toChainConfig.chainId.toLowerCase()) {
            setBridgeStatus("Switching to receiving chain for transaction 3/3...");
            await ensureChain(provider, toChainConfig);
            await new Promise(resolve => setTimeout(resolve, 3000));
            
            currentChainId = await provider.request({ method: "eth_chainId" });
            if (currentChainId.toLowerCase() !== toChainConfig.chainId.toLowerCase()) {
              throw new Error(`Failed to switch to receiving chain ${toChain}. Please switch manually.`);
            }
          }
          
          setBridgeStatus(`Creating adapter for receiving chain (${toChain})...`);
          let receiveProvider: any = provider;
          if (!receiveProvider && (window as any).ethereum) {
            receiveProvider = (window as any).ethereum;
          }
          
          if (!receiveProvider) {
            throw new Error("Provider is not available");
          }
          
          let verifyChainId = await receiveProvider.request({ method: "eth_chainId" });
          const normalizedExpectedChainId = toChainConfig.chainId.toLowerCase();
          
          if (verifyChainId.toLowerCase() !== normalizedExpectedChainId) {
            setBridgeStatus(`Verifying chain switch to ${toChain}...`);
            await ensureChain(receiveProvider, toChainConfig);
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            verifyChainId = await receiveProvider.request({ method: "eth_chainId" });
            if (verifyChainId.toLowerCase() !== normalizedExpectedChainId) {
              throw new Error(`Provider is on wrong chain. Got ${verifyChainId}, expected ${toChainConfig.chainId} (${toChain}). Please manually switch to ${toChain} in your wallet.`);
            }
          }
          
          const receiveAdapter = await createAdapterFromProvider({
            provider: receiveProvider,
          });
          
          if (!receiveAdapter) {
            throw new Error("Failed to create receive adapter");
          }
          
          const finalChainId = await receiveProvider.request({ method: "eth_chainId" });
          if (finalChainId.toLowerCase() !== normalizedExpectedChainId) {
            throw new Error(`Adapter created but chain mismatch detected. Got ${finalChainId}, expected ${toChainConfig.chainId}`);
          }

          setBridgeStatus("Transaction 3/3: Waiting for attestation from Circle (this may take 10-60 seconds)...");
          
          let attestationReady = false;
          let retryCount = 0;
          const maxRetries = 12;
          let currentReceiveAdapter = receiveAdapter;
          
          while (!attestationReady && retryCount < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, 5000));
            retryCount++;
            
            try {
              setBridgeStatus(`Transaction 3/3: Checking attestation (attempt ${retryCount}/${maxRetries})...`);
              
              let verifyChainId = await receiveProvider.request({ method: "eth_chainId" });
              const normalizedExpectedChainId = toChainConfig.chainId.toLowerCase();
              
              if (verifyChainId.toLowerCase() !== normalizedExpectedChainId) {
                setBridgeStatus(`Chain changed. Switching back to ${toChain}...`);
                await ensureChain(receiveProvider, toChainConfig);
                await new Promise(resolve => setTimeout(resolve, 2000));
                
                verifyChainId = await receiveProvider.request({ method: "eth_chainId" });
                if (verifyChainId.toLowerCase() !== normalizedExpectedChainId) {
                  throw new Error(`Chain changed. Expected ${toChainConfig.chainId} (${toChain}), got ${verifyChainId}`);
                }
                
                currentReceiveAdapter = await createAdapterFromProvider({
                  provider: receiveProvider,
                });
              }
              
              const receiveKit = new BridgeKit();
              bridgeResult = await receiveKit.retry(bridgeResult, {
                from: adapter,
                to: currentReceiveAdapter
              });
              
              const receiveStep = bridgeResult.steps?.find((s: any) => 
                (s.name?.toLowerCase().includes('receive') || 
                 s.name?.toLowerCase().includes('mint') ||
                 s.name?.toLowerCase().includes('message')) &&
                s.state === 'success'
              );
              
              if (receiveStep || bridgeResult?.state === 'success') {
                attestationReady = true;
                setBridgeStatus("Bridge complete! All 3 transactions confirmed. 🎉");
                break;
              }
              
              const failedStep = bridgeResult.steps?.find((s: any) => 
                (s.name?.toLowerCase().includes('receive') || 
                 s.name?.toLowerCase().includes('mint') ||
                 s.name?.toLowerCase().includes('message')) &&
                s.state === 'failed'
              );
              
              if (failedStep) {
                const errorMsg = (failedStep.error as any)?.message || (failedStep.error as any) || failedStep.errorMessage || 'Unknown error';
                
                if (errorMsg.includes("invalid chain ID") || errorMsg.includes("Invalid chain ID")) {
                  if (retryCount < 3) {
                    setBridgeStatus(`Detected chain ID error. Recreating adapter for ${toChain}...`);
                    await new Promise(resolve => setTimeout(resolve, 2000));
                    currentReceiveAdapter = await createAdapterFromProvider({
                      provider: receiveProvider,
                    });
                    continue;
                  }
                  throw new Error(`Invalid chain ID error on ${toChain}. Please ensure you're on ${toChain} and try again.`);
                }
                
                if (errorMsg.includes("Invalid") || errorMsg.includes("invalid")) {
                  if (retryCount < maxRetries) {
                    continue;
                  }
                }
                
                throw new Error(`Receive transaction failed: ${errorMsg}`);
              }
              
            } catch (retryErr: any) {
              const errorMsg = retryErr.message || retryErr.toString() || '';
              
              if (errorMsg.includes("invalid chain ID") || errorMsg.includes("Invalid chain ID")) {
                if (retryCount < 3) {
                  setBridgeStatus(`Chain ID error detected. Recreating adapter...`);
                  await new Promise(resolve => setTimeout(resolve, 2000));
                  currentReceiveAdapter = await createAdapterFromProvider({
                    provider: receiveProvider,
                  });
                  continue;
                }
                throw new Error(`Invalid chain ID error: ${errorMsg}`);
              }
              
              if (retryCount < maxRetries && (errorMsg.includes("Invalid") || errorMsg.includes("invalid"))) {
                setBridgeStatus(`Transaction 3/3: Waiting for attestation (attempt ${retryCount}/${maxRetries})...`);
                continue;
              }
              
              throw retryErr;
            }
          }
          
          if (!attestationReady) {
            setBridgeStatus("Transaction 3/3: Attestation is taking longer than expected. Please check your wallet for the receive transaction.");
          }
        } else {
          setBridgeStatus("Bridge is processing. Please check your wallet for pending transactions.");
        }
      } else {
        const errorSteps = bridgeResult?.steps?.filter((s: any) => s.state === 'failed') || [];
        const errorMsg = errorSteps.length > 0 
          ? `Bridge failed at step: ${errorSteps[0].name} - ${(errorSteps[0].error as any)?.message || (errorSteps[0].error as any) || errorSteps[0].errorMessage || 'Unknown error'}` 
          : "Bridge did not complete successfully";
        throw new Error(errorMsg);
      }
      
      setTimeout(() => fetchBalance(), 3000);
      setTimeout(() => setBridgeStatus(""), 10000);
    } catch (err: any) {
      console.error("Bridge failed:", err);
      
      let errorMessage = err.message || "Bridge failed. Please check your transactions on both chains.";
      
      if (err.message?.includes("Invalid transaction") || err.message?.includes("invalid transaction")) {
        errorMessage = "Invalid transaction error on receiving chain. This usually means:\n" +
          "1. The attestation may not be ready yet (wait 10-30 seconds)\n" +
          "2. The transaction parameters may be incorrect\n" +
          "3. Please ensure you're on the correct receiving chain\n" +
          "Try waiting a moment and check your wallet for the receive transaction, or try bridging again.";
      } else if (err.message?.includes("receive") || err.message?.includes("mint")) {
        errorMessage = `Receive transaction failed: ${err.message}\n` +
          "The deposit transaction may have succeeded. Please check the transaction on the sending chain.\n" +
          "You may need to manually complete the receive transaction on the destination chain.";
      }
      
      setError(errorMessage);
      setBridgeStatus("");
    } finally {
      setLoading(false);
    }
  };

  const formatAddress = (addr: string | undefined) => {
    if (!addr) return "";
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  const chainOptions: { key: "Base_Sepolia" | "Ethereum_Sepolia" | "Arc_Testnet"; label: string }[] = [
    { key: "Base_Sepolia", label: "Base Sepolia" },
    { key: "Ethereum_Sepolia", label: "Ethereum Sepolia" },
    { key: "Arc_Testnet", label: "Arc Testnet" },
  ];
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-4 sm:p-6 lg:p-8 bg-[var(--background)] text-[var(--foreground)]">
      <nav className="w-full mb-8 px-4 sm:px-6 lg:px-8">
        <div className="w-full max-w-7xl mx-auto px-14 sm:px-20 py-10 flex items-center justify-between gap-12 text-[var(--foreground)] rounded-xl bg-[var(--panel)] shadow-lg">
          <div className="flex items-center gap-4 px-6 py-3">
            <span 
              className="text-[var(--foreground)] font-bold tracking-tight font-[var(--font-poppins)]"
              style={{ fontSize: '1.5rem', lineHeight: '1.2', fontFamily: 'var(--font-poppins), sans-serif' }}
            >
              BridgeKit
            </span>
          </div>

          <div className="flex items-center gap-3">
            <a
              href="https://faucet.circle.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-5 py-2.5 bg-transparent rounded-lg text-[var(--foreground)] font-semibold border-2 border-[var(--panel-border)] hover:bg-[var(--panel)]/50 transition-all duration-200"
              style={{ fontSize: '1rem', lineHeight: '1.2', fontFamily: 'var(--font-poppins), sans-serif' }}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
              Faucet
            </a>
            <button
              onClick={toggleTheme}
              type="button"
              className="p-2.5 rounded-lg bg-[var(--panel)]/50 hover:bg-[var(--panel)] border border-[var(--panel-border)] text-[var(--foreground)] transition-all duration-200 hover:scale-105 active:scale-95"
              aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
              title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
            >
              {theme === "dark" ? (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                </svg>
              )}
            </button>

            <ConnectButton.Custom>
              {({
                account,
                chain,
                openAccountModal,
                openChainModal,
                openConnectModal,
                authenticationStatus,
                mounted,
              }) => {
                const ready = mounted && authenticationStatus !== "loading";
                const connected =
                  ready &&
                  account &&
                  chain &&
                  (!authenticationStatus ||
                    authenticationStatus === "authenticated");

                return (
                  <div
                    {...(!ready && {
                      "aria-hidden": true,
                      style: {
                        opacity: 0,
                        pointerEvents: "none",
                        userSelect: "none",
                      },
                    })}
                  >
                    {(() => {
                      if (!connected) {
                        return (
                          <button
                            onClick={openConnectModal}
                            type="button"
                            className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white text-base font-semibold rounded-lg transition-all duration-150 shadow-sm"
                          >
                            Connect Wallet
                          </button>
                        );
                      }

                      if (chain.unsupported) {
                        return (
                          <button
                            onClick={openChainModal}
                            type="button"
                            className="px-4 py-2 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg hover:bg-red-500/20 transition-all"
                          >
                            Wrong network
                          </button>
                        );
                      }

                      return (
                        <div className="flex items-center gap-5">
                          <button
                            onClick={openChainModal}
                            type="button"
                            className="flex items-center gap-3 px-6 py-3 bg-transparent rounded-lg text-[var(--foreground)] font-semibold border-2 border-[var(--panel-border)] hover:bg-[var(--panel)]/50 transition-all"
                            style={{ fontSize: '1rem', lineHeight: '1.2', fontFamily: 'var(--font-poppins), sans-serif' }}
                          >
                            {chain.hasIcon && (
                              <div
                                style={{
                                  background: chain.iconBackground,
                                  width: 32,
                                  height: 32,
                                  borderRadius: 999,
                                  overflow: "hidden",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                }}
                              >
                                {chain.iconUrl && (
                                  <img
                                    alt={chain.name ?? "Chain icon"}
                                    src={chain.iconUrl}
                                    style={{ width: 32, height: 32 }}
                                  />
                                )}
                              </div>
                            )}
                            <span>{chain.name}</span>
                          </button>

                          <button
                            onClick={openAccountModal}
                            type="button"
                            className="flex items-center gap-3 px-6 py-3 bg-transparent rounded-lg text-[var(--foreground)] font-semibold border-2 border-[var(--panel-border)] hover:bg-[var(--panel)]/50 transition-all"
                            style={{ fontSize: '1rem', lineHeight: '1.2', fontFamily: 'var(--font-poppins), sans-serif', letterSpacing: '0.05em' }}
                          >
                            {formatAddress(account.address)}
                          </button>
                        </div>
                      );
                    })()}
                  </div>
                );
              }}
            </ConnectButton.Custom>
          </div>
        </div>
      </nav>

      <div className="w-full flex-1 flex flex-col items-center justify-center px-4 py-8">
        <div className="w-full max-w-[500px] mx-auto bg-[var(--panel)] border border-[var(--panel-border)] rounded-2xl shadow-xl px-10 py-8 transition-all duration-200">
          {!isConnected ? (
            <div className="text-center py-12">
              <div className="mb-6">
                <h2 className="text-xl font-semibold text-[var(--foreground)] mb-3">
                  Connect Your Wallet
                </h2>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Use the top-right button to connect and start bridging USDC.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="group bg-[var(--panel)]/80 dark:bg-[var(--panel)]/60 border-2 border-[var(--panel-border)] rounded-xl p-6 hover:border-blue-500/50 hover:bg-[var(--panel)]/90 hover:shadow-lg transition-all duration-200 cursor-pointer">
                <div className="flex items-center gap-2 mb-3">
                  <label className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">From</label>
                  <svg className="w-3 h-3 text-blue-400 opacity-60 group-hover:opacity-100 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500/20 to-purple-500/20 dark:from-blue-600/30 dark:to-purple-600/30 flex items-center justify-center flex-shrink-0 border border-blue-500/30 group-hover:border-blue-500/50 transition-colors">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500/40 to-purple-500/40"></div>
                  </div>
                  <div className="flex-1 relative">
                    <select
                      value={fromChain}
                      onChange={(e) => setFromChain(e.target.value as typeof fromChain)}
                      className="w-full font-semibold text-[var(--foreground)] text-lg bg-transparent border-none p-0 cursor-pointer focus:outline-none appearance-none pr-6 group-hover:text-blue-400 transition-colors"
                      disabled={loading}
                    >
                      {chainOptions.map((c) => (
                        <option key={c.key} value={c.key} className="text-[var(--foreground)] bg-[var(--panel)]">
                          {c.label}
                        </option>
                      ))}
                    </select>
                    <div className="absolute right-0 top-0 bottom-0 flex items-center pointer-events-none">
                      <svg className="w-4 h-4 text-slate-400 group-hover:text-blue-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                    <div className="text-xs text-slate-400 dark:text-slate-500 mt-1.5 group-hover:text-slate-300 transition-colors">USDC</div>
                  </div>
                </div>
              </div>

              <div className="flex justify-center -my-2 relative z-10">
                <button
                  onClick={() => {
                    const temp = fromChain;
                    setFromChain(toChain);
                    setToChain(temp);
                  }}
                  disabled={loading}
                  className="p-3 rounded-full bg-[var(--panel)] border-2 border-[var(--panel-border)] hover:border-[var(--panel-border)] hover:bg-[var(--panel)]/80 transition-all duration-150 hover:scale-110 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed shadow-md"
                  aria-label="Swap chains"
                >
                  <svg className="w-5 h-5 text-[var(--foreground)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                  </svg>
                </button>
              </div>

              <div className="group bg-[var(--panel)]/80 dark:bg-[var(--panel)]/60 border-2 border-[var(--panel-border)] rounded-xl p-6 hover:border-purple-500/50 hover:bg-[var(--panel)]/90 hover:shadow-lg transition-all duration-200 cursor-pointer">
                <div className="flex items-center gap-2 mb-3">
                  <label className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">To</label>
                  <svg className="w-3 h-3 text-purple-400 opacity-60 group-hover:opacity-100 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                  </svg>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-500/20 to-pink-500/20 dark:from-purple-600/30 dark:to-pink-600/30 flex items-center justify-center flex-shrink-0 border border-purple-500/30 group-hover:border-purple-500/50 transition-colors">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500/40 to-pink-500/40"></div>
                  </div>
                  <div className="flex-1 relative">
                    <select
                      value={toChain}
                      onChange={(e) => setToChain(e.target.value as typeof toChain)}
                      className="w-full font-semibold text-[var(--foreground)] text-lg bg-transparent border-none p-0 cursor-pointer focus:outline-none appearance-none pr-6 group-hover:text-purple-400 transition-colors"
                      disabled={loading}
                    >
                      {chainOptions.map((c) => (
                        <option key={c.key} value={c.key} className="text-[var(--foreground)] bg-[var(--panel)]">
                          {c.label}
                        </option>
                      ))}
                    </select>
                    <div className="absolute right-0 top-0 bottom-0 flex items-center pointer-events-none">
                      <svg className="w-4 h-4 text-slate-400 group-hover:text-purple-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                    <div className="text-xs text-slate-400 dark:text-slate-500 mt-1.5 group-hover:text-slate-300 transition-colors">USDC</div>
                  </div>
                </div>
              </div>

              <div className="bg-[var(--panel)]/80 dark:bg-[var(--panel)]/60 border border-[var(--panel-border)] rounded-xl p-6 hover:border-[var(--panel-border)]/80 transition-all">
                <label className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-3 block">Amount</label>
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-500/20 to-blue-500/20 dark:from-purple-600/30 dark:to-blue-600/30 flex items-center justify-center flex-shrink-0 border border-purple-500/20">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500/40 to-blue-500/40"></div>
                  </div>
                  <div className="flex-1">
                    <div className="flex items-baseline gap-2">
                      <input
                        type="number"
                        value={amount}
                        onChange={(e: ChangeEvent<HTMLInputElement>) =>
                          setAmount(e.target.value)
                        }
                        placeholder="0"
                        min="0"
                        step="0.01"
                        className="flex-1 bg-transparent border-none text-3xl font-bold text-[var(--foreground)] placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none disabled:opacity-50"
                        disabled={loading || !adapter}
                      />
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <span className="text-xs text-slate-400 dark:text-slate-500">
                        Balance: {balanceLoading ? (
                          <span className="font-semibold text-[var(--foreground)] inline-flex items-center gap-1">
                            <svg className="animate-spin h-3 w-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            Loading...
                          </span>
                        ) : (
                          <span className="font-semibold text-[var(--foreground)]">{balance} USDC</span>
                        )}
                      </span>
                      <button
                        type="button"
                        onClick={fetchBalance}
                        className="text-xs text-blue-400 hover:text-blue-300 transition-colors px-2 py-0.5 rounded hover:bg-blue-400/10 disabled:opacity-50 disabled:cursor-not-allowed"
                        disabled={loading || !isConnected || balanceLoading}
                      >
                        Refresh
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <button
                onClick={bridgeUSDC}
                disabled={loading || !adapter || fromChain === toChain || !amount || parseFloat(amount) <= 0}
                className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-bold py-4 px-6 rounded-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:from-slate-600 disabled:to-slate-700 flex items-center justify-center gap-2 mt-6 shadow-lg hover:shadow-xl"
              >
                {loading ? (
                  <>
                    <svg
                      className="animate-spin h-5 w-5 text-white"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      ></circle>
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      ></path>
                    </svg>
                    <span>Bridging...</span>
                  </>
                ) : (
                  <span>{fromChain === toChain ? "Select different networks" : "Bridge USDC"}</span>
                )}
              </button>

              <p className="text-xs text-slate-400 dark:text-slate-500 text-center mt-4">
                Ensure you have gas on both chains for approvals and bridging.
              </p>

              {bridgeStatus && (
                <div className="mt-4 p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                  <p className="text-blue-400 text-xs font-medium flex items-center gap-2">
                    <svg
                      className="w-3.5 h-3.5 animate-pulse"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                        clipRule="evenodd"
                      />
                    </svg>
                    {bridgeStatus}
                  </p>
                </div>
              )}

              {error && (
                <div className="mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                  <p className="text-red-400 text-xs font-medium flex items-center gap-2">
                    <svg
                      className="w-3.5 h-3.5"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                        clipRule="evenodd"
                      />
                    </svg>
                    {error}
                  </p>
                </div>
              )}

              {!adapter && isConnected && (
                <div className="mt-4 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                  <p className="text-yellow-400 text-xs font-medium">
                    Initializing bridge adapter...
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="mt-8 w-full flex justify-center text-sm text-slate-500 dark:text-slate-400">
          <p>Powered by Circle BridgeKit</p>
        </div>
      </div>
    </main>
  );
}
