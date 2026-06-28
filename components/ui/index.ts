/**
 * Pontifex core UI component library — barrel export.
 *
 * Brand-token-aware, dark-mode-complete, mobile-first primitives. Import from
 * one place:  import { Button, Card, Modal } from '@/components/ui';
 *
 * These are the canonical building blocks — check docs/reference/UI_CATALOG.md
 * before hand-rolling a button/card/modal/etc.
 */

export { Button } from './Button';
export type { ButtonProps, ButtonLinkProps, ButtonVariant, ButtonSize } from './Button';

export { Card, CardHeader, CardBody } from './Card';
export type { CardProps } from './Card';

export { Modal } from './Modal';
export type { ModalProps, ModalSize } from './Modal';

export { StatusBadge } from './StatusBadge';
export type { StatusBadgeProps, BadgeVariant } from './StatusBadge';

export { EmptyState } from './EmptyState';
export type { EmptyStateProps } from './EmptyState';

export { StatCard } from './StatCard';
export type { StatCardProps } from './StatCard';

export { Tabs, TabList, Tab, TabPanel } from './Tabs';
export type { TabsProps, TabProps, TabPanelProps } from './Tabs';

export { Alert } from './Alert';
export type { AlertProps, AlertVariant } from './Alert';

export { PageHeader } from './PageHeader';
export type { PageHeaderProps } from './PageHeader';

export { Spinner } from './Spinner';
export type { SpinnerProps, SpinnerSize } from './Spinner';

// Skeleton family (pre-existing comprehensive module — re-exported for one-stop imports).
export {
  Skeleton,
  SkeletonText,
  SkeletonCard,
  SkeletonTable,
  SkeletonStat,
  SkeletonAvatar,
  SkeletonButton,
  SkeletonBadge,
  RevealSection,
} from './Skeleton';
export type { SkeletonProps } from './Skeleton';
