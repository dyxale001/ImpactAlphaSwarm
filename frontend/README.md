# Frontend Setup Instructions

This is the frontend for the ImpactAlphaSwarm project. It is built using React and Vite.

## Prerequisites

- Node.js (v18 or higher recommended)
- npm (installed with Node.js)

## Installation & Recent TypeScript Migration ⚠️

**Important for Team Members:** The frontend has been migrated from JavaScript (.jsx) to TypeScript (.tsx). After pulling the latest changes, you **must run `npm install` again** to install the required TypeScript dependencies and types.

1. Navigate to the frontend directory:
   ```bash
   cd frontend
   ```

2. Install/Update the necessary dependencies:
   ```bash
   npm install
   ```
   *This will install all packages listed in `package.json`, including React, Vite, Zustand, and the newly added TypeScript dev dependencies.*

3. Start the development server:
   ```bash
   npm run dev
   ```

## Production Build

To build the application for production, run:
```bash
npm run build
```

---

# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.

---

## Psychometric Data Engine

The onboarding flow collects and derives psychometric data to tailor the AI Investment Committee's behavior to the user's specific psychology. Below are key derived metrics:

### `ai_derived_sentiment` (Sentiment Bias - e.g., 'fundamentals' vs 'momentum')
- **Why you need it:** An AI Investment Committee needs to know if the user cares more about solid financial math (P/E ratios, earnings) or social energy (Twitter hype, news momentum).
- **How it's used:** If the user is biased toward "fundamentals", the AI agent might filter out highly volatile meme stocks and focus on undervalued cash-flow-positive companies. If they are "momentum" biased, the AI will actively look for hype breakouts.

### `ai_derived_volatility` (Volatility Reaction - e.g., 'panic_sell' vs 'buy_dip' vs 'hold_steady')
- **Why you need it:** The platform needs to understand how the user behaves under stress.
- **How it's used:** If the AI detects a 10% market drop and knows the user's `volatility_reaction` is `panic_sell`, the AI might automatically suggest hedging strategies, send calming alerts, or pivot to defensive assets before the user panic-sells.
