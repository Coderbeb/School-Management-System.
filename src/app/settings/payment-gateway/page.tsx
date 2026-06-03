import { redirect } from 'next/navigation';

export default function PaymentGatewayRedirectPage() {
    redirect('/settings?tab=payment-gateway');
}
