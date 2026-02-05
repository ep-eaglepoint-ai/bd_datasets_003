import React from 'react';

const Icon = ({ 'data-testid': testId, ...props }: any) => (
  <svg data-testid={testId || 'icon'} {...props} />
);

export const ArrowLeft = Icon;
export const CheckCircle = Icon;
export const Plus = Icon;
export const Clock = Icon;
export const Users = Icon;
export const Share2 = Icon;
export const Sparkles = Icon;
export const Palette = Icon;
export const Image = Icon;
export const Calendar = Icon;
export const Globe = Icon;
export const Home = Icon;
export const RefreshCw = Icon;
export const Archive = Icon;
export const Eye = Icon;
export const Trash2 = Icon;
