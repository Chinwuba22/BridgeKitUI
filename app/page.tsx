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

  // Define CHAINS first
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

  // Chain configuration helpers - defined after CHAINS
  const getChainConfig = (chain: typeof fromChain) => {
    if (chain === "Base_Sepolia") return CHAINS.BASE_SEPOLIA;
    if (chain === "Ethereum_Sepolia") return CHAINS.ETHEREUM_SEPOLIA;
    return CHAINS.ARC_TESTNET;
  };

  // Helper to get consistent provider
  const getProvider = () => {
    let provider: any = (window as any).ethereum;
    if (!provider && walletClient) {
      const transport = (walletClient as any).transport;
      if (transport && transport.request) {
        provider = transport;
      }
    }
    return provider;
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
      // Check for various "chain not recognized" error patterns
      const isUnrecognizedChain = 
        err.code === 4902 || 
        err.code === -32002 || 
        err.message?.includes("Unrecognized chain") ||
        err.message?.includes("Unrecognized chain ID") ||
        err.message?.includes("wallet_addEthereumChain");
      
      if (isUnrecognizedChain) {
        try {
          await provider.request({
            method: "wallet_addEthereumChain",
            params: [{
              chainId: chainConfig.chainId,
              chainName: chainConfig.chainName,
              nativeCurrency: chainConfig.nativeCurrency,
              rpcUrls: getRpcUrlsForWallet(chainConfig),
              blockExplorerUrls: chainConfig.blockExplorerUrls,
            }],
          });
          
          await new Promise(resolve => setTimeout(resolve, 500)); // Reduced from 1000ms
          
          await provider.request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: chainConfig.chainId }],
          });
          
          await new Promise(resolve => setTimeout(resolve, 300)); // Reduced from 500ms
          
          const currentChainId = await provider.request({ method: "eth_chainId" });
          if (currentChainId.toLowerCase() !== chainConfig.chainId.toLowerCase()) {
            throw new Error(`Failed to switch to chain ${chainConfig.chainName} after adding`);
          }
        } catch (addErr: any) {
          // If chain already exists, try to switch anyway
          if (addErr.code === 4001 || addErr.message?.includes("already") || addErr.message?.includes("User rejected")) {
            try {
              await provider.request({
                method: "wallet_switchEthereumChain",
                params: [{ chainId: chainConfig.chainId }],
              });
              await new Promise(resolve => setTimeout(resolve, 300)); // Reduced from 500ms
              const currentChainId = await provider.request({ method: "eth_chainId" });
              if (currentChainId.toLowerCase() === chainConfig.chainId.toLowerCase()) {
                return; // Successfully switched
              }
            } catch (switchErr: any) {
              throw new Error(`Failed to switch to chain ${chainConfig.chainName}: ${switchErr.message || switchErr.code || 'Unknown error'}`);
            }
          }
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

  // Helper function to get RPC URLs for wallet_addEthereumChain
  const getRpcUrlsForWallet = (chainConfig: any): string[] => {
    return chainConfig.rpcUrls;
  };

  // Helper function to try multiple RPC endpoints with fallback
  const tryRpcEndpoints = async (rpcUrls: string[], operation: (url: string) => Promise<any>): Promise<any> => {
    let lastError: any = null;
    
    for (let i = 0; i < rpcUrls.length; i++) {
      const rpcUrl = rpcUrls[i];
      try {
        const result = await Promise.race([
          operation(rpcUrl),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error(`RPC timeout after 8 seconds`)), 8000)
          )
        ]);
        return result;
      } catch (err: any) {
        lastError = err;
        // Continue to next endpoint
        if (i < rpcUrls.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 300)); // Reduced from 500ms
        }
      }
    }
    
    // All endpoints failed
    throw new Error(`All RPC endpoints failed. Last error: ${lastError?.message || 'Unknown error'}`);
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
        setBalanceLoading(false);
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
        // Use chainConfig RPC URLs as fallback if wagmi's default fails
        rpcUrl = chainConfig.rpcUrls[0] || sepolia.rpcUrls.default.http[0];
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
      
      const decimals = 6;
      
      
      // Use single RPC endpoint
      // Always create a new client for balance fetching to avoid issues with publicClient chain mismatch
      // This ensures we're using the correct RPC endpoint for the selected chain
      client = createPublicClient({
        chain: chain,
        transport: http(rpcUrl, {
          timeout: 10000, // 10 second timeout
        }),
      });
      
      // Add timeout wrapper for the contract call
      const balancePromise = client.readContract({
        address: usdcAddress,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [address as `0x${string}`],
      });
      
      // Add timeout to prevent infinite loading
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error("Balance fetch timeout after 12 seconds")), 12000) // Reduced from 15s
      );
      
      const balance = await Promise.race([balancePromise, timeoutPromise]) as bigint;

      const formattedBalance = formatUnits(balance as bigint, decimals);
      setBalance(formattedBalance);
      setError("");
    } catch (err: any) {
      console.error(`❌ Error fetching balance for ${fromChain}:`, err);
      console.error("Error details:", {
        message: err.message,
        code: err.code,
        data: err.data,
        cause: err.cause,
      });
      setBalance("0.00");
      // Don't set error state for balance fetch failures, just log them
    } finally {
      setBalanceLoading(false);
    }
  };

  useEffect(() => {
    if (!isConnected || !walletClient || loading) return;

    async function switchToChain() {
      try {
        // Get provider using helper
        const provider = getProvider();
        if (!provider) return;

        const chainConfig = getChainConfig(fromChain);
        
        // Check current chain ID
        const currentChainId = await provider.request({ method: "eth_chainId" });
        
          if (currentChainId.toLowerCase() !== chainConfig.chainId.toLowerCase()) {
          await ensureChain(provider, chainConfig);
        }
      } catch (err: any) {
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
    // No delay needed - balance fetch is async

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
      // Get provider using helper
      const provider = getProvider();
      if (!provider) throw new Error("No provider available. Please ensure your wallet is connected.");

      setBridgeStatus("Step 1/3: Switching to sending chain...");
      const fromChainConfig = getChainConfig(fromChain);
      
      const currentChainId = await provider.request({ method: "eth_chainId" });
      if (currentChainId.toLowerCase() !== fromChainConfig.chainId.toLowerCase()) {
        await ensureChain(provider, fromChainConfig);
        await new Promise(resolve => setTimeout(resolve, 800)); // Reduced from 1500ms
        
        // Verify chain switch
        const verifyChainId = await provider.request({ method: "eth_chainId" });
        if (verifyChainId.toLowerCase() !== fromChainConfig.chainId.toLowerCase()) {
          throw new Error(`Failed to switch to ${fromChainConfig.chainName}. Please switch manually in your wallet.`);
        }
      }

      // Recreate adapter after chain switch to ensure it's bound to the correct chain
      setBridgeStatus("Creating adapter for sending chain...");
      let currentAdapter = adapter;
      
      try {
        const freshAdapter = await createAdapterFromProvider({
          provider: provider,
        });
        currentAdapter = freshAdapter;
      } catch (adapterErr: any) {
        if (!currentAdapter) {
          throw new Error(`Failed to create adapter for ${fromChainConfig.chainName}. Please try reconnecting your wallet.`);
        }
      }

      const kit = new BridgeKit();

      kit.on('*', (payload: any) => {
        if (payload.values?.txHash) {
          const txHash = payload.values.txHash;
          if (payload.method === 'approve') {
            setBridgeStatus(`Transaction 1/3: Approval confirmed - ${txHash.slice(0, 10)}...`);
          } else if (payload.method?.includes('burn') || payload.method?.includes('deposit')) {
            setBridgeStatus(`Transaction 2/3: Deposit confirmed - ${txHash.slice(0, 10)}...`);
          } else if (payload.method === 'receiveMessage' || payload.method?.includes('receive') || payload.method?.includes('mint')) {
            setBridgeStatus(`Transaction 3/3: Mint confirmed - ${txHash.slice(0, 10)}...`);
          }
        }
      });

      setBridgeStatus("Transaction 1/3: Approving USDC...");
      
      // Skip RPC test - it adds unnecessary delay, bridge will fail fast if RPC is down
      
      
      let bridgeResult;
      let bridgeAttempts = 0;
      const maxBridgeAttempts = 3;
      
      // Retry logic for RPC errors
      while (bridgeAttempts < maxBridgeAttempts) {
        bridgeAttempts++;
        
        try {
          if (bridgeAttempts > 1) {
            setBridgeStatus(`Transaction 1/3: Retrying approval (attempt ${bridgeAttempts}/${maxBridgeAttempts})...`);
            // Recreate adapter before retry to ensure fresh connection
            try {
              const retryAdapter = await createAdapterFromProvider({
                provider: provider,
              });
              currentAdapter = retryAdapter;
            } catch (adapterErr: any) {
            }
            await new Promise(resolve => setTimeout(resolve, 1000)); // Reduced from 2000ms
          }
          
        bridgeResult = await kit.bridge({
          from: { chain: fromChain, adapter: currentAdapter },
          to: { chain: toChain, adapter: currentAdapter },
          amount: amount,
        });
          break; // Success, exit retry loop
      } catch (bridgeErr: any) {
          const errorMsg = bridgeErr?.message || bridgeErr?.toString() || '';
          
          // Check for RPC endpoint errors
          const isRpcError = errorMsg.includes("RPC endpoint error") || 
                           errorMsg.includes("RPC") || 
                           errorMsg.includes("network") ||
                           errorMsg.includes("fetch") ||
                           errorMsg.includes("timeout") ||
                           errorMsg.includes("ECONNREFUSED") ||
                           errorMsg.includes("ENOTFOUND");
          
          if (isRpcError && bridgeAttempts < maxBridgeAttempts) {
            setBridgeStatus(`RPC error detected. Retrying... (${bridgeAttempts}/${maxBridgeAttempts})`);
            await new Promise(resolve => setTimeout(resolve, 1000));
            continue; // Retry
          }
          
          // If not an RPC error or max attempts reached, handle normally
        if (bridgeErr.result && typeof bridgeErr.result === 'object' && bridgeErr.result?.state === 'pending') {
          bridgeResult = bridgeErr.result;
            break; // Exit retry loop, handle pending state
          }
          
          // If it's an RPC error and we've exhausted retries
          if (isRpcError && bridgeAttempts >= maxBridgeAttempts) {
            throw new Error(`RPC endpoint error after ${maxBridgeAttempts} attempts: ${errorMsg}. Please try again.`);
          }
          
          // For non-RPC errors, throw immediately
          throw bridgeErr;
        }
      }
      
      // If we exited the loop without bridgeResult, something went wrong
      if (!bridgeResult) {
        throw new Error("Bridge failed: Unable to initiate bridge after retries.");
      }

      if (bridgeResult?.steps && Array.isArray(bridgeResult.steps)) {
        bridgeResult.steps.forEach((step: any) => {
          if (step.error) {
          }
        });
      }

      if (bridgeResult?.state === 'success') {
        setBridgeStatus("Bridge complete! All 3 transactions confirmed. 🎉");
      } else if (bridgeResult?.state === 'pending') {
        const pendingSteps = bridgeResult.steps?.filter((s: any) => s.state === 'pending' || !s.state) || [];
        const failedSteps = bridgeResult.steps?.filter((s: any) => s.state === 'error' || s.error) || [];
        
        if (failedSteps.length > 0) {
          const failedStep = failedSteps[0];
          const errorMsg = (failedStep.error as any)?.message || (failedStep.error as any) || failedStep.errorMessage || 'Unknown error';
          
          // Log error for debugging
          
          // Throw error - same handling for all chains
          throw new Error(`Bridge failed at step "${failedStep.name}": ${errorMsg}`);
        }
        
        const receiveStep = pendingSteps.find((s: any) => 
          s.name?.toLowerCase().includes('receive') || 
          s.name?.toLowerCase().includes('mint') ||
          s.name?.toLowerCase().includes('message')
        );
        
        if (receiveStep) {
          // IMMEDIATELY switch to receiving chain - don't wait for attestation
          // Transaction 1 (Approve) and Transaction 2 (Burn) are complete
          setBridgeStatus("Transactions 1/3 (Approve) & 2/3 (Burn) complete. Switching to receiving chain for Transaction 3/3 (Mint)...");
          
          const toChainConfig = getChainConfig(toChain);
          
          // Always use window.ethereum directly for receive adapter to ensure wallet prompts work
          let receiveProvider: any = (window as any).ethereum;
          if (!receiveProvider) {
            receiveProvider = provider;
          }
          
          if (!receiveProvider) {
            throw new Error("Provider is not available. Please ensure your wallet is connected.");
          }
          
          // CRITICAL: Add and switch to receiving chain BEFORE creating adapter
          // This must be done aggressively to ensure BridgeKit recognizes the chain
          setBridgeStatus(`Adding ${toChainConfig.chainName} to wallet...`);
          
          const normalizedTargetChainId = toChainConfig.chainId.toLowerCase();
          
          // Step 1: FORCE add the chain to wallet
          try {
            console.log(`📝 Adding ${toChainConfig.chainName} (${toChainConfig.chainId}) to wallet...`);
            await receiveProvider.request({
              method: "wallet_addEthereumChain",
              params: [{
                chainId: toChainConfig.chainId,
                chainName: toChainConfig.chainName,
                nativeCurrency: toChainConfig.nativeCurrency,
                rpcUrls: getRpcUrlsForWallet(toChainConfig),
                blockExplorerUrls: toChainConfig.blockExplorerUrls,
              }],
            });
            console.log(`✅ Chain added to wallet`);
            await new Promise(resolve => setTimeout(resolve, 800)); // Reduced from 1500ms
          } catch (addErr: any) {
            // Check if chain already exists - that's OK
            if (addErr.code === 4001 || addErr.message?.includes("already") || addErr.message?.includes("User rejected")) {
              console.log(`ℹ️ Chain might already exist (this is OK)`);
            } else {
              console.warn(`⚠️ Could not add chain:`, addErr.message);
              // Continue anyway - might already exist
            }
            await new Promise(resolve => setTimeout(resolve, 300)); // Reduced from 500ms
          }
          
          // Step 2: Verify and switch to the chain with retries
          let currentChainId = await receiveProvider.request({ method: "eth_chainId" });
          
          let switchAttempts = 0;
          const maxSwitchAttempts = 3;
          
          while (currentChainId.toLowerCase() !== normalizedTargetChainId && switchAttempts < maxSwitchAttempts) {
            switchAttempts++;
            setBridgeStatus(`Switching to ${toChainConfig.chainName} (attempt ${switchAttempts}/${maxSwitchAttempts})...`);
            
            try {
              await receiveProvider.request({
                method: "wallet_switchEthereumChain",
                params: [{ chainId: toChainConfig.chainId }],
              });
              await new Promise(resolve => setTimeout(resolve, 1000)); // Reduced from 2000ms // Wait after switch
            
            currentChainId = await receiveProvider.request({ method: "eth_chainId" });
              if (currentChainId.toLowerCase() === normalizedTargetChainId) {
                break;
              } else {
                // If switch failed, try adding chain again
                if (switchAttempts < maxSwitchAttempts) {
                  try {
                    await receiveProvider.request({
                      method: "wallet_addEthereumChain",
                      params: [{
                        chainId: toChainConfig.chainId,
                        chainName: toChainConfig.chainName,
                        nativeCurrency: toChainConfig.nativeCurrency,
                        rpcUrls: toChainConfig.rpcUrls,
                        blockExplorerUrls: toChainConfig.blockExplorerUrls,
                      }],
                    });
                    await new Promise(resolve => setTimeout(resolve, 800)); // Reduced from 1500ms
                  } catch (addErr2: any) {
                    // Ignore - might already exist
                  }
                }
              }
            } catch (switchErr: any) {
              // If switch fails with "Unrecognized chain", try adding again
              if (switchErr.code === 4902 || switchErr.message?.includes("Unrecognized")) {
                try {
                  await receiveProvider.request({
                    method: "wallet_addEthereumChain",
                    params: [{
                      chainId: toChainConfig.chainId,
                      chainName: toChainConfig.chainName,
                      nativeCurrency: toChainConfig.nativeCurrency,
                      rpcUrls: toChainConfig.rpcUrls,
                      blockExplorerUrls: toChainConfig.blockExplorerUrls,
                    }],
                  });
                  await new Promise(resolve => setTimeout(resolve, 1500));
                } catch (addErr3: any) {
                  // Ignore - might already exist
                }
              }
              
              if (switchAttempts >= maxSwitchAttempts) {
                throw new Error(`Failed to switch to ${toChainConfig.chainName} after ${maxSwitchAttempts} attempts. Please switch manually in your wallet.`);
              }
            }
          }
          
          // Final verification - we MUST be on the correct chain
          currentChainId = await receiveProvider.request({ method: "eth_chainId" });
          if (currentChainId.toLowerCase() !== normalizedTargetChainId) {
            // One last attempt to switch
            try {
              await receiveProvider.request({
                method: "wallet_switchEthereumChain",
                params: [{ chainId: toChainConfig.chainId }],
              });
              await new Promise(resolve => setTimeout(resolve, 1200)); // Reduced from 2500ms
              currentChainId = await receiveProvider.request({ method: "eth_chainId" });
            } catch (finalSwitchErr: any) {
            }
            
            if (currentChainId.toLowerCase() !== normalizedTargetChainId) {
              throw new Error(`CRITICAL: Not on ${toChainConfig.chainName} (${toChainConfig.chainId}). Current: ${currentChainId}. Please switch to ${toChainConfig.chainName} manually and try again.`);
            }
          }
          
          
          setBridgeStatus(`Creating adapter for ${toChainConfig.chainName}...`);
          
          // Double-check chain one more time before creating adapter
          const preAdapterChainCheck = await receiveProvider.request({ method: "eth_chainId" });
          if (preAdapterChainCheck.toLowerCase() !== normalizedTargetChainId) {
            await receiveProvider.request({
              method: "wallet_switchEthereumChain",
              params: [{ chainId: toChainConfig.chainId }],
            });
            await new Promise(resolve => setTimeout(resolve, 1000)); // Reduced from 2000ms
          }
          
          const receiveAdapter = await createAdapterFromProvider({
            provider: receiveProvider,
          });
          
          if (!receiveAdapter) {
            throw new Error("Failed to create receive adapter");
          }
          
          
          // Final verification after adapter creation
          const postAdapterChainCheck = await receiveProvider.request({ method: "eth_chainId" });
          if (postAdapterChainCheck.toLowerCase() !== normalizedTargetChainId) {
            throw new Error(`Chain mismatch after adapter creation. Expected ${toChainConfig.chainId} (${toChain}), got ${postAdapterChainCheck}. Please ensure you're on ${toChainConfig.chainName}.`);
          }
          

          // Start retrying immediately - don't wait for attestation
          // Start immediately, retry logic will handle attestation timing
          setBridgeStatus("Transaction 3/3: Ready to receive. Attempting transaction NOW - check your wallet!");
          
          let attestationReady = false;
          let retryCount = 0;
          const maxRetries = 40; // More retries for non-Base chains
          let currentReceiveAdapter = receiveAdapter;
          
          // Use the existing from adapter - it should still be valid
          // The from adapter represents the sending chain and doesn't need to be recreated
          // since we're just using it as a reference for the bridge state
          const freshFromAdapter = currentAdapter;
          
          // Create a new BridgeKit instance for receive
          const receiveKit = new BridgeKit();
          
          // Set up event listeners immediately
          receiveKit.on('*', (payload: any) => {
            if (payload.values?.txHash) {
              const txHash = payload.values.txHash;
              if (payload.method === 'receiveMessage' || payload.method?.includes('receive') || payload.method?.includes('mint')) {
                setBridgeStatus(`Transaction 3/3: Receive transaction submitted - ${txHash.slice(0, 10)}...`);
              }
            }
          });
          
          // Set up chain change listener to detect if chain switches away (optional)
          let chainChangeHandler: ((chainId: string) => void) | null = null;
          try {
            if (receiveProvider && typeof receiveProvider.on === 'function') {
              chainChangeHandler = (newChainId: string) => {
                console.log(`🔄 Chain changed detected: ${newChainId}, Expected: ${toChainConfig.chainId}`);
                if (newChainId.toLowerCase() !== toChainConfig.chainId.toLowerCase()) {
                  setBridgeStatus(`⚠️ Chain switched away. Please switch back to ${toChainConfig.chainName}.`);
                }
              };
              receiveProvider.on('chainChanged', chainChangeHandler);
            }
          } catch (listenerErr: any) {
          }
          
          // Cleanup function
          const cleanup = () => {
            try {
              if (receiveProvider && typeof receiveProvider.removeListener === 'function' && chainChangeHandler) {
                receiveProvider.removeListener('chainChanged', chainChangeHandler);
              }
            } catch (cleanupErr: any) {
            }
          };
          
          while (!attestationReady && retryCount < maxRetries) {
            // Wait between retries - reduced delays for faster bridging
            if (retryCount > 0) {
              await new Promise(resolve => setTimeout(resolve, 1500)); // Reduced from 2000ms
            } else {
              // First retry - start immediately, no wait
              // retryCount++ happens below
            }
            retryCount++;
            
            try {
              // CRITICAL: ALWAYS ensure the receiving chain is added AND switched BEFORE retry
              // BridgeKit's retry will fail if the chain isn't recognized by the wallet
              setBridgeStatus(`Ensuring ${toChainConfig.chainName} is added and active...`);
              
              const normalizedExpectedChainId = toChainConfig.chainId.toLowerCase();
              
              // Step 1: Only add chain if not already on it (skip if already exists)
              // Check current chain first to avoid unnecessary wallet prompts
              let currentChainCheck = await receiveProvider.request({ method: "eth_chainId" });
              if (currentChainCheck.toLowerCase() !== normalizedExpectedChainId) {
                // Only try to add if we're not on the chain
                try {
                  await receiveProvider.request({
                    method: "wallet_addEthereumChain",
                    params: [{
                      chainId: toChainConfig.chainId,
                      chainName: toChainConfig.chainName,
                      nativeCurrency: toChainConfig.nativeCurrency,
                      rpcUrls: getRpcUrlsForWallet(toChainConfig),
                      blockExplorerUrls: toChainConfig.blockExplorerUrls,
                    }],
                  });
                  await new Promise(resolve => setTimeout(resolve, 300));
                } catch (addErr: any) {
                  // Chain might already exist, that's OK
                }
              }
              
              // Step 2: Verify and switch to the chain
              let verifyChainId = await receiveProvider.request({ method: "eth_chainId" });
              let switchAttempts = 0;
              const maxSwitchAttempts = 3;
              
              while (verifyChainId.toLowerCase() !== normalizedExpectedChainId && switchAttempts < maxSwitchAttempts) {
                switchAttempts++;
                setBridgeStatus(`Switching to ${toChainConfig.chainName} (attempt ${switchAttempts}/${maxSwitchAttempts})...`);
                
                try {
                  await receiveProvider.request({
                    method: "wallet_switchEthereumChain",
                    params: [{ chainId: toChainConfig.chainId }],
                  });
                  await new Promise(resolve => setTimeout(resolve, 1000)); // Reduced from 2000ms
                  
                  verifyChainId = await receiveProvider.request({ method: "eth_chainId" });
                  if (verifyChainId.toLowerCase() === normalizedExpectedChainId) {
                    break;
                  } else {
                  }
                } catch (switchErr: any) {
                  // If switch fails, try adding chain again (might not have been added properly)
                  if (switchErr.code === 4902 || switchErr.message?.includes("Unrecognized")) {
                    try {
                      await receiveProvider.request({
                        method: "wallet_addEthereumChain",
                        params: [{
                          chainId: toChainConfig.chainId,
                          chainName: toChainConfig.chainName,
                          nativeCurrency: toChainConfig.nativeCurrency,
                          rpcUrls: toChainConfig.rpcUrls,
                          blockExplorerUrls: toChainConfig.blockExplorerUrls,
                        }],
                      });
                await new Promise(resolve => setTimeout(resolve, 1500));
                    } catch (addErr2: any) {
                      // Ignore - might already exist
                    }
                  }
                  if (switchAttempts >= maxSwitchAttempts) {
                    throw new Error(`Failed to switch to ${toChainConfig.chainName} after ${maxSwitchAttempts} attempts. Please switch manually.`);
                  }
                }
              }
              
              // Final verification - we MUST be on the correct chain before calling retry
                verifyChainId = await receiveProvider.request({ method: "eth_chainId" });
                if (verifyChainId.toLowerCase() !== normalizedExpectedChainId) {
                throw new Error(`CRITICAL: Not on ${toChainConfig.chainName} (${toChainConfig.chainId}). Current: ${verifyChainId}. Cannot proceed with retry.`);
                }
                
              // Step 3: Recreate adapter with verified chain
              currentReceiveAdapter = await createAdapterFromProvider({
                provider: receiveProvider,
              });
              
              // Step 4: One more verification before retry
              const finalChainCheck = await receiveProvider.request({ method: "eth_chainId" });
              if (finalChainCheck.toLowerCase() !== normalizedExpectedChainId) {
                throw new Error(`Chain changed before retry! Expected ${toChainConfig.chainId}, got ${finalChainCheck}`);
              }
              
              // Check receive step state
              const receiveStepBefore = bridgeResult.steps?.find((s: any) => 
                s.name?.toLowerCase().includes('receive') || 
                s.name?.toLowerCase().includes('mint') ||
                s.name?.toLowerCase().includes('message')
              );
              
              // If already successful, we're done
              if (receiveStepBefore?.state === 'success' || bridgeResult?.state === 'success') {
                attestationReady = true;
                setBridgeStatus("Bridge complete! All 3 transactions confirmed. 🎉");
                break;
              }
              
              // If failed, throw error
              if (receiveStepBefore?.state === 'error' || receiveStepBefore?.error) {
                const errorMsg = (receiveStepBefore.error as any)?.message || receiveStepBefore.error || 'Unknown error';
                throw new Error(`Receive step failed: ${errorMsg}`);
              }
              
              // Show status
              if (retryCount === 1) {
                setBridgeStatus(`Transaction 3/3: Executing receive transaction - CHECK YOUR WALLET NOW!`);
              } else {
                setBridgeStatus(`Transaction 3/3: Retrying receive transaction (${retryCount}/${maxRetries}) - Check wallet!`);
              }
              
              
              // FINAL CHECK: Verify we're still on the correct chain RIGHT BEFORE retry
              const preRetryChainCheck = await receiveProvider.request({ method: "eth_chainId" });
              if (preRetryChainCheck.toLowerCase() !== normalizedExpectedChainId) {
                console.warn(`⚠️ Chain changed before retry! Current: ${preRetryChainCheck}, Expected: ${toChainConfig.chainId}`);
                setBridgeStatus(`Chain changed! Switching back to ${toChainConfig.chainName}...`);
                
                // Force switch one more time
                try {
                  await receiveProvider.request({
                    method: "wallet_switchEthereumChain",
                    params: [{ chainId: toChainConfig.chainId }],
                  });
                  await new Promise(resolve => setTimeout(resolve, 1000)); // Reduced from 2000ms
                  
                  const recheckChainId = await receiveProvider.request({ method: "eth_chainId" });
                  if (recheckChainId.toLowerCase() !== normalizedExpectedChainId) {
                    throw new Error(`Failed to switch to ${toChainConfig.chainName} before retry. Please switch manually.`);
                  }
                  
                  // Recreate adapter after forced switch
                  currentReceiveAdapter = await createAdapterFromProvider({
                    provider: receiveProvider,
                  });
                } catch (forceSwitchErr: any) {
                  throw new Error(`Cannot proceed: Not on ${toChainConfig.chainName}. Please switch manually and try again.`);
                }
              }
              
              // CALL RETRY - This should prompt wallet
              // Use fresh adapters to ensure they're properly configured
              try {
                bridgeResult = await receiveKit.retry(bridgeResult, {
                  from: freshFromAdapter,
                  to: currentReceiveAdapter
                });
              } catch (retryError: any) {
                const retryErrorMsg = retryError?.message || retryError?.toString() || '';
                
                // Check if error is related to chain switching
                if (retryErrorMsg.includes("Unrecognized chain") || 
                    retryErrorMsg.includes("Failed to switch") || 
                    retryErrorMsg.includes("chain ID") ||
                    retryErrorMsg.includes("wallet_addEthereumChain")) {
                  
                  // Force switch one more time
                  try {
                    setBridgeStatus(`Chain error detected. Switching to ${toChainConfig.chainName}...`);
                    await receiveProvider.request({
                      method: "wallet_switchEthereumChain",
                      params: [{ chainId: toChainConfig.chainId }],
                    });
                    await new Promise(resolve => setTimeout(resolve, 1200));
                    
                    const postErrorChainCheck = await receiveProvider.request({ method: "eth_chainId" });
                    if (postErrorChainCheck.toLowerCase() !== normalizedExpectedChainId) {
                      await receiveProvider.request({
                        method: "wallet_addEthereumChain",
                        params: [{
                          chainId: toChainConfig.chainId,
                          chainName: toChainConfig.chainName,
                          nativeCurrency: toChainConfig.nativeCurrency,
                          rpcUrls: getRpcUrlsForWallet(toChainConfig),
                          blockExplorerUrls: toChainConfig.blockExplorerUrls,
                        }],
                      });
                      await new Promise(resolve => setTimeout(resolve, 800));
                      
                      await receiveProvider.request({
                        method: "wallet_switchEthereumChain",
                        params: [{ chainId: toChainConfig.chainId }],
                      });
                      await new Promise(resolve => setTimeout(resolve, 1000));
                    }
                    
                    currentReceiveAdapter = await createAdapterFromProvider({
                      provider: receiveProvider,
                    });
                    
                    bridgeResult = await receiveKit.retry(bridgeResult, {
                      from: freshFromAdapter,
                      to: currentReceiveAdapter
                    });
                  } catch (chainFixErr: any) {
                    throw new Error(`Failed to fix chain issue: ${chainFixErr.message || chainFixErr}. Please ensure you're on ${toChainConfig.chainName} and try again.`);
                  }
                } else {
                  // Not a chain error, re-throw
                  throw retryError;
                }
              }
              
              // Check receive step after retry
              const receiveStepAfter = bridgeResult.steps?.find((s: any) => 
                s.name?.toLowerCase().includes('receive') || 
                s.name?.toLowerCase().includes('mint') ||
                s.name?.toLowerCase().includes('message')
              );
              
              console.log('📊 After retry:', {
                stepState: receiveStepAfter?.state,
                bridgeState: bridgeResult?.state,
                allSteps: bridgeResult?.steps?.map((s: any) => ({ name: s.name, state: s.state })),
                txHash: receiveStepAfter?.txHash,
              });
              
              // If successful, we're done
              if (receiveStepAfter?.state === 'success' || bridgeResult?.state === 'success') {
                attestationReady = true;
                setBridgeStatus("Bridge complete! All 3 transactions confirmed. 🎉");
                break;
              }
              
              // Check if transaction was submitted (has txHash) but not yet confirmed
              const stepState = receiveStepAfter?.state as string | undefined;
              if (receiveStepAfter?.txHash && stepState !== 'success') {
                setBridgeStatus(`Transaction 3/3: Transaction submitted! Waiting for confirmation (${retryCount}/${maxRetries})...`);
                
                // Wait for confirmation when we have a txHash
                await new Promise(resolve => setTimeout(resolve, 3000)); // Reduced from 5000ms
                
                // Check again if it's confirmed now
                const updatedReceiveStep = bridgeResult.steps?.find((s: any) => 
                  s.name?.toLowerCase().includes('receive') || 
                  s.name?.toLowerCase().includes('mint') ||
                  s.name?.toLowerCase().includes('message')
                );
                
                const updatedState = updatedReceiveStep?.state as string | undefined;
                const bridgeState = bridgeResult?.state as string | undefined;
                if (updatedState === 'success' || bridgeState === 'success') {
                  attestationReady = true;
                  setBridgeStatus("Bridge complete! All 3 transactions confirmed. 🎉");
                  break;
                }
                
                // Continue retrying to check status
                continue;
              }
              
              // If pending, transaction might be submitted but not confirmed yet
              // For non-Base chains, this might take longer
              if (receiveStepAfter?.state === 'pending') {
                
                // Check if we have a transaction hash
                if (receiveStepAfter?.txHash) {
                  setBridgeStatus(`Transaction 3/3: Transaction submitted (${receiveStepAfter.txHash.slice(0, 10)}...). Waiting for confirmation...`);
                  // Wait for confirmation - reduced wait times
                  const isFromBase = fromChain === 'Base_Sepolia';
                  const confirmWaitTime = isFromBase ? 5000 : 8000; // Reduced from 10000/15000
                  await new Promise(resolve => setTimeout(resolve, confirmWaitTime));
                } else {
                  // No txHash yet, wallet might be prompting
                setBridgeStatus("Transaction 3/3: ⚠️ CHECK YOUR WALLET - Sign the transaction!");
                  await new Promise(resolve => setTimeout(resolve, 12000)); // Reduced from 20000ms
                }
                continue;
              }
              
              // If no state or state unchanged, might need to wait for attestation
              // For non-Base chains, attestation might take longer
              const stepStateCheck = receiveStepAfter?.state as string | undefined;
              if (!receiveStepAfter || !stepStateCheck || stepStateCheck === 'pending') {
                // Wait for attestation - optimized timing
                const isFromBase = fromChain === 'Base_Sepolia';
                const waitTime = isFromBase ? 2000 : 3000; // Reduced from 3000/5000
                
                if (retryCount < 20) {
                  if (stepStateCheck === 'pending') {
                    setBridgeStatus(`Transaction 3/3: Transaction pending - waiting for confirmation (${retryCount}/${maxRetries})...`);
                    // Wait for pending transactions
                    await new Promise(resolve => setTimeout(resolve, 5000)); // Reduced from 8000ms
                  } else {
                  setBridgeStatus(`Transaction 3/3: Waiting for attestation (${retryCount}/${maxRetries})...`);
                    await new Promise(resolve => setTimeout(resolve, waitTime));
                  }
                  // Continue to next retry
                  continue;
                } else {
                  // After 20 retries, keep retrying but with optimized waits
                  setBridgeStatus(`Transaction 3/3: Attestation taking longer than expected. Keep retrying... (${retryCount}/${maxRetries})`);
                  await new Promise(resolve => setTimeout(resolve, 3000)); // Reduced from 5000ms
                  continue;
                }
              }
              
              // Continue retrying
              
              // Refresh bridge result state by checking all steps
              const allSteps = bridgeResult.steps || [];
              const receiveStepCheck = allSteps.find((s: any) => 
                s.name?.toLowerCase().includes('receive') || 
                s.name?.toLowerCase().includes('mint') ||
                s.name?.toLowerCase().includes('message')
              );
              
              // If we have a transaction hash but state is not success, it might be confirming
              if (receiveStepCheck?.txHash && receiveStepCheck?.state !== 'success' && receiveStepCheck?.state !== 'error') {
                setBridgeStatus(`Transaction 3/3: Transaction pending confirmation. Waiting... (${retryCount}/${maxRetries})`);
                // Wait a bit longer for confirmation
                await new Promise(resolve => setTimeout(resolve, 3000)); // Reduced from 4000ms
                continue;
              }
              
              const failedStep = bridgeResult.steps?.find((s: any) => 
                (s.name?.toLowerCase().includes('receive') || 
                 s.name?.toLowerCase().includes('mint') ||
                 s.name?.toLowerCase().includes('message')) &&
                (s.state === 'error' || s.error)
              );
              
              if (failedStep) {
                const errorMsg = (failedStep.error as any)?.message || (failedStep.error as any) || failedStep.errorMessage || 'Unknown error';
                
                
                if (errorMsg.includes("invalid chain ID") || errorMsg.includes("Invalid chain ID")) {
                  if (retryCount < 3) {
                    setBridgeStatus(`Detected chain ID error. Recreating adapter for ${toChain}...`);
                    await new Promise(resolve => setTimeout(resolve, 1000)); // Reduced from 2000ms
                    currentReceiveAdapter = await createAdapterFromProvider({
                      provider: receiveProvider,
                    });
                    continue;
                  }
                  throw new Error(`Invalid chain ID error on ${toChain}. Please ensure you're on ${toChain} and try again.`);
                }
                
                // For "Invalid" errors (often attestation not ready), continue retrying
                if (errorMsg.includes("Invalid") || errorMsg.includes("invalid") || errorMsg.includes("not ready") || errorMsg.includes("attestation")) {
                  if (retryCount < maxRetries) {
                    setBridgeStatus(`Transaction 3/3: ${errorMsg}. Retrying... (${retryCount}/${maxRetries})`);
                    // Wait a bit longer for attestation
                    await new Promise(resolve => setTimeout(resolve, 2000)); // Reduced from 3000ms
                    continue;
                  }
                }
                
                throw new Error(`Receive transaction failed: ${errorMsg}`);
              }
              
            } catch (retryErr: any) {
              const errorMsg = retryErr.message || retryErr.toString() || '';
              
              // Handle "Unrecognized chain ID" errors - this means the chain isn't in the wallet
              if (errorMsg.includes("Unrecognized chain ID") || errorMsg.includes("Unrecognized chain") || 
                  errorMsg.includes("wallet_addEthereumChain")) {
                if (retryCount < 5) {
                  setBridgeStatus(`Chain not recognized. Adding ${toChainConfig.chainName} to wallet...`);
                  try {
                    // Force add the chain to wallet
                    await receiveProvider.request({
                      method: "wallet_addEthereumChain",
                      params: [{
                        chainId: toChainConfig.chainId,
                        chainName: toChainConfig.chainName,
                        nativeCurrency: toChainConfig.nativeCurrency,
                        rpcUrls: toChainConfig.rpcUrls,
                        blockExplorerUrls: toChainConfig.blockExplorerUrls,
                      }],
                    });
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    
                    // Now switch to it
                    await ensureChain(receiveProvider, toChainConfig);
                    await new Promise(resolve => setTimeout(resolve, 800)); // Reduced from 1500ms
                    
                    // Recreate adapter
                    currentReceiveAdapter = await createAdapterFromProvider({
                      provider: receiveProvider,
                    });
                    continue; // Retry with chain now added
                  } catch (addErr: any) {
                    if (retryCount < 3) {
                      continue; // Try again
                    }
                    throw new Error(`Failed to add ${toChainConfig.chainName} to wallet. Please add it manually and try again.`);
                  }
                }
                throw new Error(`Chain ${toChainConfig.chainName} is not recognized by your wallet. Please add it manually using wallet_addEthereumChain.`);
              }
              
              if (errorMsg.includes("invalid chain ID") || errorMsg.includes("Invalid chain ID")) {
                if (retryCount < 3) {
                  setBridgeStatus(`Chain ID error detected. Recreating adapter...`);
                  await new Promise(resolve => setTimeout(resolve, 1000)); // Reduced from 2000ms
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
          
          // Cleanup chain change listener
          cleanup();
          
          if (!attestationReady) {
            setBridgeStatus("Transaction 3/3: Attestation is taking longer than expected. Please check your wallet for the receive transaction.");
          }
        } else {
          setBridgeStatus("Bridge is processing. Please check your wallet for pending transactions.");
        }
      } else {
        const errorSteps = bridgeResult?.steps?.filter((s: any) => s.state === 'error' || s.error) || [];
        const errorMsg = errorSteps.length > 0 
          ? `Bridge failed at step: ${errorSteps[0].name} - ${(errorSteps[0].error as any)?.message || (errorSteps[0].error as any) || errorSteps[0].errorMessage || 'Unknown error'}` 
          : "Bridge did not complete successfully";
        throw new Error(errorMsg);
      }
      
      setTimeout(() => fetchBalance(), 2000); // Reduced from 3000ms
      setTimeout(() => setBridgeStatus(""), 8000); // Reduced from 10000ms
    } catch (err: any) {
      
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
    <main className="min-h-screen flex flex-col items-center justify-center p-2 sm:p-4 md:p-6 lg:p-8 bg-[var(--background)] text-[var(--foreground)]">
      <nav className="w-full mb-4 sm:mb-6 md:mb-8 px-2 sm:px-4 md:px-6 lg:px-8">
        <div className="w-full max-w-7xl mx-auto px-3 sm:px-6 md:px-10 lg:px-14 xl:px-20 py-4 sm:py-6 md:py-8 lg:py-10 flex flex-col sm:flex-row items-center justify-between gap-3 sm:gap-6 md:gap-8 lg:gap-12 text-[var(--foreground)] rounded-xl bg-[var(--panel)] shadow-lg">
          <div className="flex items-center gap-2 sm:gap-4 px-2 sm:px-4 md:px-6 py-2 sm:py-3 w-full sm:w-auto justify-center sm:justify-start">
            <span 
              className="text-[var(--foreground)] font-bold tracking-tight font-[var(--font-poppins)] text-lg sm:text-xl md:text-2xl"
              style={{ lineHeight: '1.2', fontFamily: 'var(--font-poppins), sans-serif' }}
            >
              BridgeKit
            </span>
          </div>

          <div className="flex flex-wrap items-center justify-center sm:justify-end gap-2 sm:gap-3 w-full sm:w-auto">
            <a
              href="https://faucet.circle.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 md:px-5 py-2 sm:py-2.5 bg-transparent rounded-lg text-[var(--foreground)] font-semibold border-2 border-[var(--panel-border)] hover:bg-[var(--panel)]/50 active:bg-[var(--panel)]/70 transition-all duration-200 text-sm sm:text-base touch-manipulation"
              style={{ lineHeight: '1.2', fontFamily: 'var(--font-poppins), sans-serif' }}
            >
              <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
              <span className="hidden sm:inline">Faucet</span>
            </a>
            <button
              onClick={toggleTheme}
              type="button"
              className="p-2 sm:p-2.5 rounded-lg bg-[var(--panel)]/50 hover:bg-[var(--panel)] active:bg-[var(--panel)]/70 border border-[var(--panel-border)] text-[var(--foreground)] transition-all duration-200 hover:scale-105 active:scale-95 touch-manipulation"
              aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
              title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
            >
              {theme === "dark" ? (
                <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              ) : (
                <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                            className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 md:px-5 py-2 sm:py-2.5 bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 active:from-blue-700 active:to-purple-800 text-white text-sm sm:text-base font-semibold rounded-lg transition-all duration-150 shadow-sm touch-manipulation whitespace-nowrap"
                          >
                            <span className="hidden sm:inline">Connect Wallet</span>
                            <span className="sm:hidden">Connect</span>
                          </button>
                        );
                      }

                      if (chain.unsupported) {
                        return (
                          <button
                            onClick={openChainModal}
                            type="button"
                            className="px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg hover:bg-red-500/20 active:bg-red-500/30 transition-all touch-manipulation"
                          >
                            Wrong network
                          </button>
                        );
                      }

                      return (
                        <div className="flex flex-wrap items-center justify-center sm:justify-end gap-2 sm:gap-3 md:gap-5">
                          <button
                            onClick={openChainModal}
                            type="button"
                            className="flex items-center gap-2 sm:gap-3 px-3 sm:px-4 md:px-6 py-2 sm:py-2.5 md:py-3 bg-transparent rounded-lg text-[var(--foreground)] font-semibold border-2 border-[var(--panel-border)] hover:bg-[var(--panel)]/50 active:bg-[var(--panel)]/70 transition-all touch-manipulation"
                            style={{ fontSize: '0.875rem', lineHeight: '1.2', fontFamily: 'var(--font-poppins), sans-serif' }}
                          >
                            {chain.hasIcon && (
                              <div
                                style={{
                                  background: chain.iconBackground,
                                  width: 24,
                                  height: 24,
                                  borderRadius: 999,
                                  overflow: "hidden",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                }}
                                className="sm:w-8 sm:h-8"
                              >
                                {chain.iconUrl && (
                                  <img
                                    alt={chain.name ?? "Chain icon"}
                                    src={chain.iconUrl}
                                    style={{ width: '100%', height: '100%' }}
                                  />
                                )}
                              </div>
                            )}
                            <span className="hidden sm:inline">{chain.name || 'Unknown'}</span>
                            <span className="sm:hidden text-xs">{(chain.name || 'Unknown').split(' ')[0]}</span>
                          </button>

                          <button
                            onClick={openAccountModal}
                            type="button"
                            className="flex items-center gap-2 sm:gap-3 px-3 sm:px-4 md:px-6 py-2 sm:py-2.5 md:py-3 bg-transparent rounded-lg text-[var(--foreground)] font-semibold border-2 border-[var(--panel-border)] hover:bg-[var(--panel)]/50 active:bg-[var(--panel)]/70 transition-all touch-manipulation"
                            style={{ fontSize: '0.875rem', lineHeight: '1.2', fontFamily: 'var(--font-poppins), sans-serif', letterSpacing: '0.05em' }}
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

      <div className="w-full flex-1 flex flex-col items-center justify-center px-2 sm:px-4 py-4 sm:py-6 md:py-8">
        <div className="w-full max-w-[500px] mx-auto bg-[var(--panel)] border border-[var(--panel-border)] rounded-2xl shadow-2xl px-6 sm:px-8 py-8 sm:py-10 transition-all duration-300 hover:shadow-3xl">
          {!isConnected ? (
            <div className="text-center py-16">
              <div className="mb-8">
                <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-gradient-to-br from-blue-500/20 to-purple-500/20 flex items-center justify-center">
                  <svg className="w-10 h-10 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </div>
                <h2 className="text-2xl font-bold text-[var(--foreground)] mb-3">
                  Connect Your Wallet
                </h2>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Connect your wallet to start bridging USDC across chains
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-4 sm:space-y-5">
              <div className="group bg-gradient-to-br from-[var(--panel)]/90 to-[var(--panel)]/70 border-2 border-[var(--panel-border)] rounded-xl p-5 sm:p-6 hover:border-blue-500/50 hover:shadow-xl transition-all duration-300 cursor-pointer active:scale-[0.98] touch-manipulation backdrop-blur-sm">
                <div className="flex items-center gap-2 mb-2 sm:mb-3">
                  <label className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">From</label>
                  <svg className="w-3 h-3 text-blue-400 opacity-60 group-hover:opacity-100 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
                <div className="flex items-center gap-2 sm:gap-3">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-gradient-to-br from-blue-500/20 to-purple-500/20 dark:from-blue-600/30 dark:to-purple-600/30 flex items-center justify-center flex-shrink-0 border border-blue-500/30 group-hover:border-blue-500/50 transition-colors">
                    <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-full bg-gradient-to-br from-blue-500/40 to-purple-500/40"></div>
                  </div>
                  <div className="flex-1 relative min-w-0">
                    <select
                      value={fromChain}
                      onChange={(e) => setFromChain(e.target.value as typeof fromChain)}
                      className="w-full font-semibold text-[var(--foreground)] text-base sm:text-lg bg-transparent border-none p-0 cursor-pointer focus:outline-none appearance-none pr-6 sm:pr-8 group-hover:text-blue-400 transition-colors touch-manipulation"
                      disabled={loading}
                    >
                      {chainOptions.map((c) => (
                        <option key={c.key} value={c.key} className="text-[var(--foreground)] bg-[var(--panel)]">
                          {c.label}
                        </option>
                      ))}
                    </select>
                    <div className="absolute right-0 top-0 bottom-0 flex items-center pointer-events-none pr-1">
                      <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-400 group-hover:text-blue-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                    <div className="text-xs text-slate-400 dark:text-slate-500 mt-1 sm:mt-1.5 group-hover:text-slate-300 transition-colors">USDC</div>
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
                  className="p-2.5 sm:p-3 rounded-full bg-[var(--panel)] border-2 border-[var(--panel-border)] hover:border-[var(--panel-border)] hover:bg-[var(--panel)]/80 active:bg-[var(--panel)]/70 transition-all duration-150 hover:scale-110 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed shadow-md touch-manipulation"
                  aria-label="Swap chains"
                >
                  <svg className="w-4 h-4 sm:w-5 sm:h-5 text-[var(--foreground)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                  </svg>
                </button>
              </div>

              <div className="group bg-gradient-to-br from-[var(--panel)]/90 to-[var(--panel)]/70 border-2 border-[var(--panel-border)] rounded-xl p-5 sm:p-6 hover:border-purple-500/50 hover:shadow-xl transition-all duration-300 cursor-pointer active:scale-[0.98] touch-manipulation backdrop-blur-sm">
                <div className="flex items-center gap-2 mb-2 sm:mb-3">
                  <label className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">To</label>
                  <svg className="w-3 h-3 text-purple-400 opacity-60 group-hover:opacity-100 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                  </svg>
                </div>
                <div className="flex items-center gap-2 sm:gap-3">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-gradient-to-br from-purple-500/20 to-pink-500/20 dark:from-purple-600/30 dark:to-pink-600/30 flex items-center justify-center flex-shrink-0 border border-purple-500/30 group-hover:border-purple-500/50 transition-colors">
                    <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-full bg-gradient-to-br from-purple-500/40 to-pink-500/40"></div>
                  </div>
                  <div className="flex-1 relative min-w-0">
                    <select
                      value={toChain}
                      onChange={(e) => setToChain(e.target.value as typeof toChain)}
                      className="w-full font-semibold text-[var(--foreground)] text-base sm:text-lg bg-transparent border-none p-0 cursor-pointer focus:outline-none appearance-none pr-6 sm:pr-8 group-hover:text-purple-400 transition-colors touch-manipulation"
                      disabled={loading}
                    >
                      {chainOptions.map((c) => (
                        <option key={c.key} value={c.key} className="text-[var(--foreground)] bg-[var(--panel)]">
                          {c.label}
                        </option>
                      ))}
                    </select>
                    <div className="absolute right-0 top-0 bottom-0 flex items-center pointer-events-none pr-1">
                      <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-400 group-hover:text-purple-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                    <div className="text-xs text-slate-400 dark:text-slate-500 mt-1 sm:mt-1.5 group-hover:text-slate-300 transition-colors">USDC</div>
                  </div>
                </div>
              </div>

              <div className="bg-gradient-to-br from-[var(--panel)]/90 to-[var(--panel)]/70 border border-[var(--panel-border)] rounded-xl p-5 sm:p-6 hover:shadow-lg transition-all duration-300 backdrop-blur-sm">
                <label className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2 sm:mb-3 block">Amount</label>
                <div className="flex items-center gap-2 sm:gap-3">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-gradient-to-br from-purple-500/20 to-blue-500/20 dark:from-purple-600/30 dark:to-blue-600/30 flex items-center justify-center flex-shrink-0 border border-purple-500/20">
                    <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-full bg-gradient-to-br from-purple-500/40 to-blue-500/40"></div>
                  </div>
                  <div className="flex-1 min-w-0">
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
                        inputMode="decimal"
                        className="flex-1 bg-transparent border-none text-2xl sm:text-3xl font-bold text-[var(--foreground)] placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none disabled:opacity-50 w-full min-w-0"
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
                className="w-full bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 hover:from-blue-700 hover:via-purple-700 hover:to-pink-700 active:from-blue-800 active:via-purple-800 active:to-pink-800 text-white font-bold py-4 sm:py-5 px-6 rounded-xl transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed disabled:from-slate-600 disabled:via-slate-700 disabled:to-slate-800 flex items-center justify-center gap-3 mt-6 sm:mt-8 shadow-xl hover:shadow-2xl active:scale-[0.97] touch-manipulation text-base sm:text-lg relative overflow-hidden group"
              >
                <span className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000"></span>
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
                    <span className="relative z-10">Bridging...</span>
                  </>
                ) : (
                  <span className="relative z-10">{fromChain === toChain ? "Select different networks" : "Bridge USDC"}</span>
                )}
              </button>

              <p className="text-xs text-slate-400 dark:text-slate-500 text-center mt-4">
                Ensure you have gas on both chains for approvals and bridging.
              </p>

              {bridgeStatus && (
                <div className="mt-4 p-4 bg-gradient-to-r from-blue-500/10 via-purple-500/10 to-pink-500/10 border border-blue-500/30 rounded-xl backdrop-blur-sm">
                  <p className="text-blue-300 dark:text-blue-400 text-sm font-medium flex items-center gap-3">
                    <svg
                      className="w-4 h-4 animate-spin flex-shrink-0"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <span className="flex-1">{bridgeStatus}</span>
                  </p>
                </div>
              )}

              {error && (
                <div className="mt-4 p-4 bg-gradient-to-r from-red-500/10 to-orange-500/10 border border-red-500/30 rounded-xl backdrop-blur-sm animate-in fade-in slide-in-from-top-2">
                  <p className="text-red-300 dark:text-red-400 text-sm font-medium flex items-start gap-3">
                    <svg
                      className="w-5 h-5 flex-shrink-0 mt-0.5"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                        clipRule="evenodd"
                      />
                    </svg>
                    <span className="flex-1 whitespace-pre-line">{error}</span>
                  </p>
                </div>
              )}

              {!adapter && isConnected && (
                <div className="mt-4 p-4 bg-gradient-to-r from-yellow-500/10 to-amber-500/10 border border-yellow-500/30 rounded-xl backdrop-blur-sm">
                  <p className="text-yellow-300 dark:text-yellow-400 text-sm font-medium flex items-center gap-3">
                    <svg className="w-4 h-4 animate-pulse" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                    </svg>
                    <span>Initializing bridge adapter...</span>
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="mt-8 w-full flex flex-col items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
          <p>Powered by Circle BridgeKit</p>
          <p className="text-xs">
            Built with ❤️ by{" "}
            <a
              href="https://x.com/X_Drained"
              target="_blank"
              rel="noopener noreferrer"
              className="text-purple-400 hover:text-purple-300 dark:text-purple-500 dark:hover:text-purple-400 transition-colors underline"
            >
              Drained
            </a>
          </p>
        </div>
      </div>
    </main>
  );
}
