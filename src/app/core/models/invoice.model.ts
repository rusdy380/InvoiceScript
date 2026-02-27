export interface InvoiceLineItem {
  id?: number;
  description: string;
  duration: string;
  qty: number;
  unit_price: number;
  amount?: number;
}

export interface MonthlyVariable {
  key: string;
  label: string;
  value: string;
}

export interface Invoice {
  id?: number;
  company_id: number;
  invoice_number: string;
  issue_date: string;
  due_date: string;
  bill_to_name: string;
  bill_to_address: string;
  bill_to_email?: string;
  month: number;   // 1-12
  year: number;
  notes?: string;
  line_items: InvoiceLineItem[];
  monthly_variables: MonthlyVariable[];
  subtotal?: number;
  tax_rate?: number;
  tax_amount?: number;
  total?: number;
  created_at?: string;
  updated_at?: string;
}

export interface InvoiceTemplate {
  id?: number;
  company_id: number;
  name: string;
  bill_to_name: string;
  bill_to_address: string;
  bill_to_email?: string;
  notes?: string;
  line_items: InvoiceLineItem[];
  monthly_variables: MonthlyVariable[];
  payment_terms: number;
  tax_rate: number;
  created_at?: string;
}
