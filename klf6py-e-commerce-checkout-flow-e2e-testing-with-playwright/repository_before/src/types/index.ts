export interface CartItemType {
  id: string;
  name: string;
  price: number;
  quantity: number;
  image: string;
}

export interface ShippingAddress {
  firstName: string;
  lastName: string;
  address1: string;
  address2?: string;
  city: string;
  state: string;
  zipCode: string;
  phone: string;
  email: string;
}

export interface ValidationErrors {
  [key: string]: string;
}

export interface Order {
  id: string;
  orderNumber: string;
  email: string;
  total: number;
  items: CartItemType[];
  shippingAddress: ShippingAddress;
  createdAt: string;
  status: 'pending' | 'confirmed' | 'shipped' | 'delivered';
}

export interface CreateOrderRequest {
  paymentMethodId: string;
  items: CartItemType[];
  shippingAddress: ShippingAddress;
  total: number;
}

export interface PromoCodeResponse {
  code: string;
  discountType: 'percentage' | 'fixed';
  discountValue: number;
  valid: boolean;
}
