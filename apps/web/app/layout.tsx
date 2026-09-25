import './globals.css';
import type { ReactNode } from 'react';
import { Inter, JetBrains_Mono, Fraunces } from 'next/font/google';

// Inter — the working UI. Fraunces — the editorial/masthead voice (optical serif).
// JetBrains Mono — scoped to real identifiers (requirement IDs, keycaps) only.
const inter = Inter({ subsets: ['latin'], variable: '--font-sans', display: 'swap' });
const fraunces = Fraunces({
  subsets: ['latin'],
  variable: '--font-display',
  axes: ['opsz', 'SOFT'],
  display: 'swap',
});
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono', display: 'swap' });

export const metadata = {
  title: 'Interview Prep Kit',
  description: 'Turn a job description into a researched, personalised interview prep kit.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${fraunces.variable} ${mono.variable}`}>
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
