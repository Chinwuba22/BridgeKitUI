# Circle Bridge Kit UI

A simple, minimal UI for interacting directly with **Circle’s BridgeKit** to move USDC across blockchains.

This project is focused on making **bridging USDC as easy as possible** — no third-party contracts, no unnecessary abstractions, just a clean interface on top of Circle’s official tooling.

---

## 🔗 Live Demo (Recommended)

👉 **Use the UI here:**  
https://bridge-kit-ui.vercel.app/

> ⚠️ **System (Desktop) only**  
> Mobile wallets are not supported at the moment. Please use a desktop browser with a supported wallet (e.g. MetaMask).

---

## 🧠 What is Circle Bridge Kit?

**Circle Bridge Kit** is a developer toolkit provided by Circle that enables seamless transfer of **USDC across supported blockchains** using Circle’s Cross-Chain Transfer Protocol (CCTP).

In simple terms, it allows you to:
- Burn USDC on a source chain  
- Mint the same amount on a destination chain  
- All while interacting directly with Circle infrastructure

---

## ✨ What this UI does

This UI provides:
- A clean, easy-to-use interface for Circle Bridge Kit
- Direct wallet interaction (no custodial or third-party contracts)
- Support for bridging **USDC to and from supported testnet chains**
- Minimal steps and clear feedback during bridging

The goal is **usability** — making it easy for anyone to try Circle Bridge Kit without writing code.

---

## 🔐 Trust & Security

- ❌ No third-party smart contracts
- ❌ No private keys stored
- ✅ Users sign transactions directly with their wallet
- ✅ All interactions go directly through Circle’s Bridge Kit

---

## 🧪 Testnet Notice

This UI currently operates on **testnet**.

You may occasionally notice:
- Failed transactions
- Testnet funds deducted during failed attempts

This is a known behavior during testing and is still being investigated.  
Improvements and better handling will be added over time.

---

## 🛠️ Built With

- **Next.js**
- **wagmi + viem**
- **RainbowKit** (wallet connections)
- **@circle-fin/bridge-kit**
- **Tailwind CSS**

---

## 🗺️ Roadmap

- Improve transaction feedback & error handling
- Add support for more chains
- Improve mobile support
- Better UX around bridge status (burn → attestation → mint)

---

## 🤝 Feedback & Contributions

Feedback is highly appreciated.

If you encounter issues, have suggestions, or want to contribute:
- Open an issue
- Share feedback directly
- Test the UI and report edge cases

---

## 🚀 Build on Arc

Don’t forget to **build on @arc** and explore what’s possible with Circle’s infrastructure.

---

### Disclaimer

This UI is provided for educational and testing purposes.  
Always verify transactions and understand testnet behavior before using any bridge in production.
