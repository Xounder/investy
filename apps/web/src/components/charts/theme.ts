/**
 * Recharts theme configuration (ADR-009, design-05).
 *
 * TASK-06 creates the base theme.
 * TASK-11/12 extend with additional palette constants.
 */

export const chartColors = {
  primary: '#2563EB',
  secondary: '#7C3AED',
  tertiary: '#6B7280',
  success: '#16A34A',
  warning: '#CA8A04',
  error: '#DC2626',
} as const;

/** Palette for donut / pie charts. */
export const donutPalette = [
  chartColors.primary,
  chartColors.secondary,
  chartColors.tertiary,
  chartColors.success,
  chartColors.warning,
  chartColors.error,
];

/** Default area / line chart stroke + fill config. */
export const areaTheme = {
  stroke: chartColors.primary,
  fill: chartColors.primary,
  fillOpacity: 0.1,
};

export const lineTheme = {
  stroke: chartColors.primary,
  strokeWidth: 2,
};

export const barTheme = {
  fill: chartColors.primary,
  radius: [4, 4, 0, 0] as [number, number, number, number],
};

/** Tooltip styling. */
export const tooltipTheme = {
  contentStyle: {
    backgroundColor: '#FFFFFF',
    border: '1px solid #E5E7EB',
    borderRadius: '8px',
    fontSize: '13px',
    fontFamily: 'Inter, system-ui, sans-serif',
  },
  itemStyle: {
    color: '#111827',
  },
};

/** Axis styling. */
export const axisTheme = {
  tick: {
    fontSize: 12,
    fontFamily: 'Inter, system-ui, sans-serif',
    fill: '#6B7280',
  },
  tickLine: { stroke: '#E5E7EB' },
  axisLine: { stroke: '#E5E7EB' },
};

/** Grid styling. */
export const gridTheme = {
  strokeDasharray: '3 3',
  stroke: '#F3F4F6',
};
