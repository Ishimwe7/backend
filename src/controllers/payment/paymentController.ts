import dotenv from "dotenv";
import { Request, Response } from "express";
import User from "../../models/User";
import { AuthRequest } from "../../middleware/authMiddleware";
import Subscription from "../../models/Subscription";
import { iPay } from "./iremboConfig";
import UserSubscription from "../../models/UserSubscription";
import smsService from "../../services/sms.service";
import emailService from "../../services/email.service";

dotenv.config();

export const initiatePayment = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const {
      subscription_id,
      language,
      transactionType = "subscription",
    } = req.body;
    const userId = req.user?.id as string;

    const client = await User.findById(userId).lean();
    let amount = 0;
    let shortSubId = "0";

    const timestamp = Date.now();
    let langCode = language.slice(0, 2).toUpperCase();
    const transactionId = `TX-${transactionType}-s${shortSubId}-${langCode}-${timestamp}`;
    if (langCode != "EN" && langCode != "FR") {
      langCode = "RW";
    }
    if (transactionType === "subscription") {
      if (!subscription_id) {
        res.status(400).json({
          error: "subscription_id is required for subscription payments",
        });
        return;
      }

      const subscription = await Subscription.findById(subscription_id).lean();
      if (!subscription) {
        res.status(400).json({ error: "No Such Subscription Found!" });
        return;
      }

      shortSubId = subscription._id.toString();
      amount = subscription.price;
    }

    if (transactionType === "gazette") {
      amount = 2000; // or get this from a config or DB
    }

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
          unitAmount: amount,
          quantity: 1,
          code: "PC-3260e308aa",
        },
      ],
      description: `${
        transactionType === "gazette" ? "Gazette" : "Subscription"
      } Payment`,
      expiryAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      language: "FR",
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

// ✅ Handle Payment Callback
export const handlePaymentCallback = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { transactionId, invoiceNumber, paymentStatus } = req.body.data;

    // Fetch invoice details
    const invoiceDetails = await iPay.invoice.getInvoice(invoiceNumber);
    if (!invoiceDetails) {
      console.error("❌ Error: Invoice not found");
      res.status(400).json({ error: "Invoice not found" });
      return;
    }

    const { customer } = invoiceDetails.data;
    const email = customer.email;
    const phoneNumber = customer.phoneNumber;

    const parts = transactionId.split("-");
    const type = parts[1];
    const subscriptionId = parts[2]?.replace("s", "");
    const language = parts[3] || "en";
    // Find the user and subscription
    const user = await User.findOne({ email }).lean();

    if (!user) {
      console.error("❌ User not found!");
      res.status(400).json({ error: "User not found!" });
      return;
    }

    if (paymentStatus === "PAID") {
      console.log(`✅ Payment successful for Transaction ${transactionId}`);
      if (type === "subscription") {
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
        return;
      } else {
        if (type === "gazette") {
          await User.findByIdAndUpdate(user._id, {
            $set: { allowedToDownloadGazette: true },
          });
        }
      }
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
      console.log(`❌ Payment failed for Transaction ${transactionId}`);
    }
  } catch (error: any) {
    console.error("❌ Error processing payment callback:", error);
    res.status(500).json({ error: "Webhook processing failed." });
  }
};
