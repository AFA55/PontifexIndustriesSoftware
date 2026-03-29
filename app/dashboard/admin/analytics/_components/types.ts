export type TimeRange = 'daily' | 'weekly' | 'monthly';

export interface WidgetProps {
  data: any;
  timeRange: TimeRange;
  isLoading: boolean;
}

export interface WidgetConfig {
  id: string;
  title: string;
  description: string;
  icon: string;
  component: React.ComponentType<WidgetProps>;
  defaultSize: { w: number; h: number };
  minSize: { w: number; h: number };
  roles: string[];
  dataKey: string;
}
