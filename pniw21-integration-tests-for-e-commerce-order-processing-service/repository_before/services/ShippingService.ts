import { OrderItem, ShippingAddress } from './OrderService';

interface ShippingRate {
    baseRate: number;
    perItemRate: number;
}

const SHIPPING_RATES: Record<string, ShippingRate> = {
    US_WEST: { baseRate: 5.99, perItemRate: 0.50 },
    US_EAST: { baseRate: 7.99, perItemRate: 0.75 },
    US_CENTRAL: { baseRate: 6.99, perItemRate: 0.60 },
    INTERNATIONAL: { baseRate: 19.99, perItemRate: 2.00 },
};

const US_WEST_STATES = ['CA', 'OR', 'WA', 'NV', 'AZ', 'UT', 'ID', 'MT', 'WY', 'CO', 'NM', 'AK', 'HI'];
const US_EAST_STATES = ['NY', 'NJ', 'PA', 'MA', 'CT', 'RI', 'VT', 'NH', 'ME', 'MD', 'DE', 'VA', 'WV', 'NC', 'SC', 'GA', 'FL'];

export class ShippingService {
    calculateShippingCost(address: ShippingAddress, items: OrderItem[]): number {
        const zone = this.getShippingZone(address);
        const rate = SHIPPING_RATES[zone];

        const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);
        const cost = rate.baseRate + (totalItems - 1) * rate.perItemRate;

        return Math.round(cost * 100) / 100;
    }

    private getShippingZone(address: ShippingAddress): string {
        if (address.country !== 'US') {
            return 'INTERNATIONAL';
        }

        const state = address.state.toUpperCase();

        if (US_WEST_STATES.includes(state)) {
            return 'US_WEST';
        }

        if (US_EAST_STATES.includes(state)) {
            return 'US_EAST';
        }

        return 'US_CENTRAL';
    }

    estimateDeliveryDays(address: ShippingAddress): number {
        const zone = this.getShippingZone(address);

        switch (zone) {
            case 'US_WEST':
                return 3;
            case 'US_EAST':
                return 5;
            case 'US_CENTRAL':
                return 4;
            case 'INTERNATIONAL':
                return 14;
            default:
                return 7;
        }
    }

    validateAddress(address: ShippingAddress): boolean {
        if (!address.street || address.street.trim().length === 0) {
            return false;
        }

        if (!address.city || address.city.trim().length === 0) {
            return false;
        }

        if (!address.state || address.state.trim().length === 0) {
            return false;
        }

        if (!address.zipCode || address.zipCode.trim().length === 0) {
            return false;
        }

        if (!address.country || address.country.trim().length === 0) {
            return false;
        }

        if (address.country === 'US' && !/^\d{5}(-\d{4})?$/.test(address.zipCode)) {
            return false;
        }

        return true;
    }
}
