import './globals.css';
import type { ReactNode } from 'react';

export const metadata = {
  title: 'AI Interview Prep Kit',
  description: 'Turn a job description into a personalised interview prep kit.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
