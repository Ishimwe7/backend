import express from "express";
import {
  initiatePayment,
  checkPaymentStatus,
  handlePaymentCallback,
} from "../controllers/payment/paymentController";
import authMiddleware from "../middleware/authMiddleware";

const router = express.Router();

// 🔹 Route to initiate a payment
router.post("/pay", authMiddleware, initiatePayment);

// 🔹 Route to check payment status
router.get("/pay/status/:transaction_id", authMiddleware, checkPaymentStatus);

// 🔹 Route to handle webhook callback
router.post("/pay/callback", handlePaymentCallback);

export default router;
