import axios from "axios";
import dotenv from "dotenv";
import { getIremboToken } from "./iremboAuth";

dotenv.config();

const API_URL = process.env.IPAY_BASE_URL as string;
const MERCHANT_CODE = process.env.IPAY_PUBLIC_KEY as string;
const SECRET_KEY = process.env.IPAY_SECRET_KEY as string;

export const createInvoice = async (userId: string, subscription: any) => {
  try {
    const invoiceData = {
      transactionId: `TX-${userId}-${Date.now()}`,
      paymentAccountIdentifier: MERCHANT_CODE,
      customer: {
        email: subscription.email,
        phoneNumber: subscription.phone_number,
        name: subscription.name,
      },
      paymentItems: [
        {
          code: "SUBSCRIPTION",
          quantity: 1,
          unitAmount: subscription.price,
        },
      ],
      description: `Subscription for ${subscription.name}`,
      expiryAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(), // 30 min expiry
      language: "EN",
    };

    const { data } = await axios.post(`${API_URL}/invoices`, invoiceData, {
      headers: {
        "irembopay-secretKey": SECRET_KEY,
        "X-API-Version": "2",
      },
    });

    return data.data.invoiceNumber; // ✅ Return invoice number for payment
  } catch (error: any) {
    console.error("❌ Error creating invoice:", error.response?.data || error);
    throw new Error("Failed to create invoice.");
  }
};
