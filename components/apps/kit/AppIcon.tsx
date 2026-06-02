"use client";

import {
  Cable,
  ShoppingCart,
  ShieldCheck,
  KanbanSquare,
  Table2,
  Globe,
  GitPullRequest,
  Map,
  PenLine,
  CalendarClock,
  TrendingUp,
  Music,
  Box,
  ListChecks,
  Tags,
  Mic,
  Gauge,
  Mail,
  Users,
  FlaskConical,
  Sparkles,
  type LucideIcon,
} from "lucide-react";

const MAP: Record<string, LucideIcon> = {
  cable: Cable,
  cart: ShoppingCart,
  "shield-check": ShieldCheck,
  kanban: KanbanSquare,
  table: Table2,
  globe: Globe,
  git: GitPullRequest,
  map: Map,
  pen: PenLine,
  calendar: CalendarClock,
  trending: TrendingUp,
  music: Music,
  box: Box,
  "list-checks": ListChecks,
  tags: Tags,
  mic: Mic,
  gauge: Gauge,
  mail: Mail,
  users: Users,
  flask: FlaskConical,
  sparkles: Sparkles,
};

export function AppIcon({
  name,
  className,
  strokeWidth = 1.6,
}: {
  name: string;
  className?: string;
  strokeWidth?: number;
}) {
  const Icon = MAP[name] ?? Sparkles;
  return <Icon className={className} strokeWidth={strokeWidth} />;
}
