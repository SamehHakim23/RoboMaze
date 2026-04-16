import React from 'react';
import { Link } from 'wouter';
import { RetroPanel, RetroButton } from '@/components/ui/RetroComponents';
import { AlertTriangle } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center scanlines bg-background p-4">
      <RetroPanel className="max-w-md w-full p-8 text-center border-destructive border-4 shadow-[0_0_30px_hsl(var(--destructive-dim))]">
        <AlertTriangle className="w-16 h-16 text-destructive mx-auto mb-6 animate-pulse" />
        <h1 className="text-2xl text-destructive font-display mb-4">404_ERROR</h1>
        <p className="font-body text-lg text-muted-foreground mb-8">
          The requested coordinate lies outside the known map boundaries.
        </p>
        <Link href="/">
           <RetroButton variant="primary" className="w-full">RETURN TO DASHBOARD</RetroButton>
        </Link>
      </RetroPanel>
    </div>
  );
}
