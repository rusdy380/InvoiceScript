export interface Company {
  id?: number;
  name: string;
  registration_number: string;
  address: string;
  email: string;
  phone: string;
  bank_name: string;
  bank_account: string;
  bank_swift: string;
  payment_terms: number; // days
  logo_base64?: string;
  created_at?: string;
  updated_at?: string;
}
