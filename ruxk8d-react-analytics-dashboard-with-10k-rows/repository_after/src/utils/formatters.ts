
const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  year: 'numeric',
  month: 'short',
  day: '2-digit',
});

// Requirement 9: Using stable formatter instances instead of recreating them
export const formatCurrency = (value: number): string => {
  return currencyFormatter.format(value);
};

export const formatDate = (dateString: string): string => {
  return dateFormatter.format(new Date(dateString));
};
