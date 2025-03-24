import dotenv from "dotenv";
import { Request, Response } from "express";
import User from "../../models/User";
import { AuthRequest } from "../../middleware/authMiddleware";
import Subscription from "../../models/Subscription";

dotenv.config();

import { iPay } from "./iremboConfig";
import UserSubscription from "../../models/UserSubscription";
import smsService from "../../services/sms.service";
import emailService from "../../services/email.service";

export const initiatePayment = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  console.log("IPAY Object: ", iPay);
  try {
    const { subscription_id, language } = req.body;
    const userId = req.user?.id as string;

    const client = await User.findById(userId).lean();
    const subscription = await Subscription.findById(subscription_id).lean();
    if (!subscription) {
      res.status(400).json({ error: "No Such Subscription Found!" });
      return;
    }

    const shortSubId = subscription._id;
    const timestamp = Date.now();
    const langCode = (language || "en").slice(0, 2).toLowerCase();
    const transactionId = `TX-s${shortSubId}-${langCode}-${timestamp}`;

    const invoice = await iPay.invoice.createInvoice({
      transactionId: transactionId,
      paymentAccountIdentifier: process.env.IPAY_PAYMENT_ACCOUNT as string,
      customer: {
        email: client?.email,
        phoneNumber: client?.phone_number,
        name: client?.names,
      },
      paymentItems: [
        {
          unitAmount: subscription.price,
          quantity: 1,
          code: "PC-3260e308aa",
        },
      ],
      description: `Subscription Payment for ${subscription.name}`,
      expiryAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(), // 30 min expiry
      language: language,
    });
    res.json({
      success: true,
      invoiceNumber: invoice.data.invoiceNumber,
      paymentUrl: invoice.data.paymentLinkUrl,
    });
  } catch (error: any) {
    console.error(
      "❌ Error initiating payment:",
      error.response?.data || error
    );
    res.status(500).json({ error: "Payment initiation failed." });
  }
};

export const checkPaymentStatus = async (req: Request, res: Response) => {
  try {
    const { transaction_id } = req.params;
    const paymentStatus = await iPay.invoice.getInvoice(transaction_id);

    res.json(paymentStatus);
  } catch (error: any) {
    console.error(
      "Error checking payment status:",
      error.response?.data || error
    );
    res.status(500).json({ error: "Failed to check payment status." });
  }
};

// ✅ Handle Payment Callback
export const handlePaymentCallback = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { transaction_id, status } = req.body;

    // Fetch invoice details
    const invoiceDetails = await iPay.invoice.getInvoice(transaction_id);
    if (!invoiceDetails) {
      console.error("❌ Error: Invoice not found");
      res.status(400).json({ error: "Invoice not found" });
      return;
    }
    const { customer } = invoiceDetails.data;
    const email = customer.email;
    const phoneNumber = customer.phoneNumber;

    const parts = transaction_id.split("-");

    const subscriptionId = parts[1]?.replace("s", "");
    const language = parts[2] || "en";
    // Find the user and subscription
    const user = await User.findOne({ email }).lean();

    if (!user) {
      console.error("❌ User not found!");
      res.status(400).json({ error: "User not found!" });
      return;
    }

    if (status === "COMPLETED") {
      console.log(`✅ Payment successful for Transaction ${transaction_id}`);
      const subscriptionExists = await Subscription.findById(subscriptionId);
      if (!subscriptionExists) {
        res.status(404).json({ error: "Subscription not found" });
        return;
      }

      const subscription = new UserSubscription({
        user_id: user._id,
        subscription: "67bf7c68c884017f1366f660",
        start_date: Date.now(),
        language: language,
        attempts_left: subscriptionExists.examAttemptsLimit,
      });
      const savedSubscription = await subscription.save();
      await User.findByIdAndUpdate(req.body.user_id, {
        $push: { subscriptions: subscription._id },
        is_subscribed: true,
      });
      smsService.sendSMS(
        phoneNumber,
        `Hello ${customer.fullName} Murakoze gufata ifatabuguzi ku rubuga umuhanda!`
      );
      if (email) {
        emailService.sendEmail({
          to: email,
          subject: "Kugura Ifatabuguzi",
          html: `Hello ${customer.fullName} Murakoze gufata ifatabuguzi ku rubuga umuhanda. Ubu mushobora kwinjira kurubuga mugakora isuzuma ! !`,
        });
      }

      res.status(201).json(savedSubscription);
    } else {
      smsService.sendSMS(
        phoneNumber,
        `Hello ${customer.fullName} Kugura ifatabuguzi ku rubuga umuhanda ntibibashije gukunda!`
      );
      if (email) {
        emailService.sendEmail({
          to: email,
          subject: "Kugura Ifatabuguzi",
          html: `Hello ${customer.fullName} Kugura ifatabuguzi ku rubuga umuhanda ntibibashije gukunda. Mukomeze mugerageze murebe cyangwa mujye ahatangirwa ubufasha mutwandikire tubafashe!`,
        });
      }
      console.log(`❌ Payment failed for Transaction ${transaction_id}`);
    }
  } catch (error: any) {
    console.error("❌ Error processing payment callback:", error);
    res.status(500).json({ error: "Webhook processing failed." });
  }
};
