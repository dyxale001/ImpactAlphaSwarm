export const formatDbString = (str?: string): string => {
  if (!str) return 'N/A';
  return str
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
};

export const formatNumberWithSpaces = (value: string | number): string => {
  if (!value) return '';
  const numericValue = value.toString().replace(/\s/g, '').replace(/[^0-9.]/g, '');
  
  const parts = numericValue.split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  
  return parts.join('.');
};

export const unformatNumberSpaces = (value: string): string => {
  return value.replace(/\s/g, '');
};