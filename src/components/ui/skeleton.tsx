import * as React from 'react';
import { cn } from '@/src/lib/utils';

function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('animate-pulse rounded-lg bg-slate-200/70', className)} {...props} />;
}

export { Skeleton };
