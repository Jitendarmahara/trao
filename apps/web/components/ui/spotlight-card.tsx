'use client';

import React from 'react';

/**
 * Surface panel for the Readiness Dossier theme. A quiet working card:
 * limestone surface, hairline border, restrained shadow. The `key` variant
 * adds a brass top-rule to mark where the important material lives.
 *
 * Same call signature as before so existing pages don't change; the legacy
 * `spotlightColor` prop is accepted and ignored.
 */
export function SpotlightCard({
  children,
  className = '',
  variant = 'default',
}: {
  children: React.ReactNode;
  className?: string;
  variant?: 'default' | 'key';
  spotlightColor?: string;
}) {
  return <div className={`${variant === 'key' ? 'panel-key' : 'panel'} ${className}`}>{children}</div>;
}
