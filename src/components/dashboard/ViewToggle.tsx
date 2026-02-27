"use client";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export type DashboardView = "cards" | "chart";

interface ViewToggleProps {
  view: DashboardView;
  onViewChange: (view: DashboardView) => void;
}

export function ViewToggle({ view, onViewChange }: ViewToggleProps) {
  return (
    <Tabs value={view} onValueChange={(v) => onViewChange(v as DashboardView)}>
      <TabsList>
        <TabsTrigger value="cards">Cards</TabsTrigger>
        <TabsTrigger value="chart">Chart</TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
