export interface Transaction {
  id: string;
  date: string;
  symbol: string;
  type: 'BUY' | 'SELL';
  quantity: number;
  price: number;
  total: number;
  status: 'PENDING' | 'COMPLETED' | 'CANCELLED';
  account: string;
  broker: string;
}

export interface ColumnDef {
  id: string;
  header: string;
  accessor: keyof Transaction;
  width: number;
  sortable: boolean;
  filterable: boolean;
}

export interface FilterState {
  column: string;
  value: string;
}

export interface SortState {
  column: string;
  direction: 'asc' | 'desc';
}
