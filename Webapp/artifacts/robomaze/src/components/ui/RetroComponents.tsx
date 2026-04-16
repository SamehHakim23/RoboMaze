import React from 'react';
import { cn } from '@/lib/utils';

export const RetroPanel = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement> & { title?: string, titleColor?: string, variant?: 'default' | 'soft' | 'highlight' }>(
  ({ className, children, title, titleColor = 'text-primary', variant = 'default', ...props }, ref) => {
    const borderClass = variant === 'soft' ? 'pixel-border-soft' : variant === 'highlight' ? 'pixel-border-primary' : 'pixel-border';
    return (
      <div ref={ref} className={cn("relative bg-panel p-4 flex flex-col", borderClass, className)} {...props}>
        {title && (
          <div className="absolute -top-3 left-4 bg-background px-2 z-10">
            <h3 className={cn("text-[10px] sm:text-xs", titleColor)}>{title}</h3>
          </div>
        )}
        {children}
      </div>
    );
  }
);
RetroPanel.displayName = 'RetroPanel';

export const RetroButton = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'destructive' | 'success' | 'warning' | 'default' | 'ghost', active?: boolean, size?: 'sm' | 'default' | 'lg' }>(
  ({ className, variant = 'default', active, size = 'default', ...props }, ref) => {
    const variants = {
      default: "border-border text-foreground hover:bg-border/50",
      ghost: "border-transparent text-muted-foreground hover:text-foreground hover:bg-border/30",
      primary: "border-primary text-primary hover:bg-primary/20 hover:neon-box-primary",
      destructive: "border-destructive text-destructive hover:bg-destructive/20",
      success: "border-success text-success hover:bg-success/20",
      warning: "border-warning text-warning hover:bg-warning/20",
    };

    const sizes = {
      sm: "text-[8px] px-2 py-1.5",
      default: "text-[10px] sm:text-xs px-4 py-3",
      lg: "text-xs sm:text-sm px-5 py-4",
    };

    return (
      <button
        ref={ref}
        className={cn(
          "font-display uppercase border-2 transition-all active:scale-95 disabled:opacity-40 disabled:pointer-events-none focus:outline-none focus:ring-1 focus:ring-primary/40",
          variants[variant],
          sizes[size],
          active && "bg-opacity-30 shadow-[inset_0_0_10px_currentColor]",
          className
        )}
        {...props}
      />
    );
  }
);
RetroButton.displayName = 'RetroButton';

export const RetroValue = ({ label, value, unit, highlight, warn, compact }: { label: string, value: string | number, unit?: string, highlight?: boolean, warn?: boolean, compact?: boolean }) => (
  <div className={cn("flex flex-col", compact && "gap-0")}>
    <span className={cn("text-muted-foreground uppercase", compact ? "text-[8px]" : "text-[10px]")}>{label}</span>
    <div className={cn(
      "font-body tracking-wider mt-0.5",
      compact ? "text-base" : "text-xl md:text-2xl",
      warn ? "text-warning neon-text-warning" : highlight ? "text-primary neon-text-primary" : "text-foreground"
    )}>
      {value} {unit && <span className="text-[10px] text-muted-foreground">{unit}</span>}
    </div>
  </div>
);

export const RetroBadge = ({ children, variant = 'default', className, pulse }: { children: React.ReactNode, variant?: 'default'|'primary'|'success'|'warning'|'destructive', className?: string, pulse?: boolean }) => {
  const variants = {
    default: "bg-border/60 text-foreground",
    primary: "bg-primary/15 text-primary border border-primary/60",
    success: "bg-success/15 text-success border border-success/60",
    warning: "bg-warning/15 text-warning border border-warning/60",
    destructive: "bg-destructive/15 text-destructive border border-destructive/60 neon-text-destructive",
  };
  return (
    <span className={cn("px-2 py-1 text-[10px] font-display uppercase tracking-wider inline-flex items-center gap-1.5", variants[variant], pulse && "animate-pulse-glow", className)}>
      {children}
    </span>
  )
};

export const RetroStat = ({ label, value, color = 'text-primary', icon }: { label: string, value: string | number, color?: string, icon?: React.ReactNode }) => (
  <div className="bg-panel-alt pixel-border-soft p-3">
    <div className="text-muted-foreground text-[9px] font-display uppercase mb-1 flex items-center gap-1.5">{icon}{label}</div>
    <div className={cn("font-display text-lg", color)}>{value}</div>
  </div>
);

export const LiveIndicator = ({ status, label }: { status: 'active' | 'idle' | 'warning' | 'error', label?: string }) => {
  const dotClass = status === 'active' ? 'live-dot-success' : status === 'warning' ? 'live-dot-warning' : status === 'error' ? 'live-dot-destructive' : 'live-dot-primary';
  return (
    <span className="inline-flex items-center gap-1.5 font-body text-xs">
      <span className={cn("live-dot", dotClass)} />
      {label && <span className="text-muted-foreground">{label}</span>}
    </span>
  );
};
