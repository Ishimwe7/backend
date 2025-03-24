import { Request, Response } from "express";
import User,{IUser} from "../models/User";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";
import smsService from "../services/sms.service";
import mongoose from "mongoose";
import logger from '../services/logger.service'
import emailService from "../services/email.service";
import { AuthRequest } from "../middleware/authMiddleware";
import UserSubscription from "../models/UserSubscription";
import { v4 as uuidv4 } from "uuid";

const resetCodes = new Map(); 

dotenv.config();

interface TokenPayload {
  id: string;
  names: string;
  email: string;
  phone_number: string;
  country: string;
  city: string;
  address:string;
  birth_date:Date;
}

export const registerUser = async (req: Request, res: Response) => {
  const { names, email,phone_number,country,city, password } = req.body;
  try {

    const existingEmail = await User.findOne({ email });
    if (existingEmail) {
       res.status(400).json({ error: "Email is already in use. Please try another." });
       return;
    }
    const existingPhone = await User.findOne({ phone_number });
    if (existingPhone) {
       res.status(400).json({ error: "Phone number is already in use. Please try another." });
       return;
    }

    const user = new User({ names, email, phone_number, country, city, password });
    await user.save();
    smsService.sendSMS(phone_number,"Hello, "+names, +" Welcome to umuhanda. your registration was done successfully. Welcome abroad !!");
    if(user.email){
          emailService.sendEmail({to:user.email,subject:"Kwiyandikisha",html:`Hello ${user.names} murakoze kwiyandikisha k'urubuga Umuhanda. Ubu mwakwinjira muri konti yanyu mugatangira kwiga !`})
        }
    res.status(201).json({ message: "Registration done successfully. You can now login!" });
  } catch (error) {
    res.status(400).json({ error: "User registration failed."+error });
  }
};


export const loginUser = async (req: Request, res: Response):Promise<void> => {
  try {
    const { emailOrPhone, password } = req.body;
    
    const user = await User.findOne({
      $or: [
        { email: emailOrPhone },
        { phone_number: emailOrPhone }
      ]
    }).populate("subscriptions") as IUser | null;

    if (!user) {
      logger.error("Login Failed For Mismatching user not found");
      res.status(401).json({ error: "Invalid Credentials !" });
      return;
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      logger.error("Login Failed For Mismatching passowrds")
      res.status(401).json({ error: "Invalid Credentials !" });
      return;
    }
    const userId = user._id as mongoose.Types.ObjectId;


    const tokenPayload: TokenPayload = {
      id: userId.toString(),
      names: user.names,
      email: user.email,
      phone_number: user.phone_number,
      country: user.country,
      city: user.city,
      address:user.address,
      birth_date:user.birth_date,
    };

    const token = jwt.sign(tokenPayload, process.env.JWT_SECRET as string, {
      expiresIn: "1h",
    });

    res.cookie("authToken", token, {
      httpOnly: true, // 🛑 Prevents JavaScript access (protects against XSS attacks)
      secure: process.env.NODE_ENV === "production", // 🛑 Secure cookies in production (HTTPS)
      sameSite: "strict", // 🛑 Prevents CSRF attacks
      maxAge: 1 * 60 * 60 * 1000, 
    });

    res.status(200).json({ token, message:'Login Successful' });
  } catch (error) {
    console.error("❌ Error in loginUser:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};


export const logoutUser = async (req: Request, res: Response): Promise<void> => {
  try {
    res.clearCookie("authToken", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
    });

    res.status(200).json({ message: "Logout successful. All cookies cleared!" });
  } catch (error) {
    console.error("❌ Error in logoutUser:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};


export const getUserInfo = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id; 
    if(userId!==req.params.userId){
      res.status(400).json({ error: "The user's info you're trying to fetch are different from logged in user!" });
      return;
    }

    const existingUser = await User.findById(userId).lean();
    if (!existingUser) {
       res.status(404).json({ error: "User not found!" });
       return;
    }
    const userSubscriptions = await UserSubscription.find({ user_id: userId }).populate("subscription").lean();

    existingUser.subscriptions = userSubscriptions;
  
   const sortedSubscriptions = existingUser.subscriptions.sort((a, b) => b.subscription.price - a.subscription.price);
   // Assign the most expensive subscription as the active one
   existingUser.active_subscription = sortedSubscriptions.length > 0 ? sortedSubscriptions[0] : null;

    res.status(200).json({ message: "User info fetched successfully!", user: existingUser });
  } catch (error) {
    console.error("❌ Error in Fetching User's Info:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};



export const updateUser = async (req: AuthRequest, res: Response) => {
  try {
    const { names, email, phone_number, country, city,address,birth_date } = req.body;
    const userId = req.user?.id; 

    const existingUser = await User.findById(userId);
    if (!existingUser) {
       res.status(404).json({ error: "User not found!" });
       return;
    }

    // Check if the new email or phone is already in use
    if (email && email !== existingUser.email) {
      const emailExists = await User.findOne({ email });
      if (emailExists) {
         res.status(400).json({ error: "Email is already in use. Please try another." });
         return;
      }
    }
    if (phone_number && phone_number !== existingUser.phone_number) {
      const phoneExists = await User.findOne({ phone_number });
      if (phoneExists) {
        res.status(400).json({ error: "Phone number is already in use. Please try another." });
        return;
      }
    }

    existingUser.names = names || existingUser.names;
    existingUser.email = email || existingUser.email;
    existingUser.address = address || existingUser.address;
    existingUser.birth_date = birth_date || existingUser.birth_date;
    existingUser.phone_number = phone_number || existingUser.phone_number;
    existingUser.country = country || existingUser.country;
    existingUser.city = city || existingUser.city;

    await existingUser.save();

    res.status(200).json({ message: "User info updated successfully!", user: existingUser });
  } catch (error) {
    console.error("❌ Error in updateUser:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

export const changePassword = async (req: AuthRequest, res: Response) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!changePassword || !newPassword) {
      res.status(404).json({ error: "Both current and new password are required !" });
      return;
   }

    if (!req.user?.id) {
      res.status(401).json({ error: "Unauthorized. Please log in to change Your Password." });
      return;
    }

    const user = await User.findById(req.user.id) as IUser | null;
    if (!user) {
       res.status(404).json({ error: "User not found." });
       return;
    }

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      res.status(400).json({ error: "Incorrect Current Password." });
      return;
    }
    user.password = newPassword;
    await user.save();

    logger.info(`✅ Password changed successfully for user ${user.email}`);

    res.status(200).json({ message: "Password updated successfully!" });

  } catch (error) {
    logger.error("❌ Error in changePassword:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};


/**
 * ✅ Request Reset Code
 */
export const requestPasswordReset = async (req: Request, res: Response) => {
  try {
    const { emailOrPhone } = req.body;

    if (!emailOrPhone) {
       res.status(400).json({ error: "Email or Phone Number is required!" });
       return;
    }

    const user = await User.findOne({
      $or: [{ email: emailOrPhone }, { phone_number: emailOrPhone }],
    });

    if (!user) {
       res.status(404).json({ error: "User not found!" });
       return;
    }

    // ✅ Generate Reset Code (6-digit number, valid for 10 minutes)
    const resetCode = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = Date.now() + 10 * 60 * 1000;
    const userId = user._id as mongoose.Types.ObjectId;
    resetCodes.set(userId.toString(), { resetCode, expiresAt });

    // ✅ Send reset code via SMS and/or Email
    if (user.phone_number) {
      await smsService.sendSMS(user.phone_number, `Your Password reset code is : ${resetCode}. Be aware that it will expire in 10 minutes`);
    }
    if (user.email) {
      await emailService.sendEmail({
        to: user.email,
        subject: "Password Reset Code",
        html: `<p>Your Password reset code is: <strong>${resetCode}</strong>. Be aware that it will expire in 10 minutes</p>`
      });
    }

    res.status(200).json({ message: "Reset code sent!" });
  } catch (error) {
    console.error("❌ Error in requestPasswordReset:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

/**
 * ✅ Verify Reset Code
 */
export const verifyResetCode = async (req: Request, res: Response) => {
  try {
    const { emailOrPhone, resetCode } = req.body;

    if (!resetCode) {
      res.status(400).json({ error: "Reset code is required!" });
      return;
    }

    const user = await User.findOne({
      $or: [{ email: emailOrPhone }, { phone_number: emailOrPhone }],
    });

    if (!user) {
      res.status(404).json({ error: "User not found!" });
      return;
    }
    const userId = user._id as mongoose.Types.ObjectId;
    const storedCode = resetCodes.get(userId.toString());
    if (!storedCode || storedCode.resetCode !== resetCode || Date.now() > storedCode.expiresAt) {
      res.status(400).json({ error: "Invalid or expired reset code!" });
      return;
    }

    res.status(200).json({ message: "Reset code verified!" });
  } catch (error) {
    console.error("❌ Error in verifyResetCode:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

/**
 * ✅ Reset Password
 */
export const resetPassword = async (req: Request, res: Response) => {
  try {
    const { emailOrPhone, resetCode, newPassword } = req.body;

    if (!newPassword) {
       res.status(400).json({ error: "New Password is required!" });
       return;
    }

    const user = await User.findOne({
      $or: [{ email: emailOrPhone }, { phone_number: emailOrPhone }],
    });

    if (!user) {
      res.status(404).json({ error: "User not found!" });
      return;
    }
    const userId = user._id as mongoose.Types.ObjectId
    const storedCode = resetCodes.get(userId.toString());
    if (!storedCode || storedCode.resetCode !== resetCode || Date.now() > storedCode.expiresAt) {
      res.status(400).json({ error: "Invalid or expired reset code!" });
      return;
    }

    user.password = newPassword;
    await user.save();
    resetCodes.delete(userId.toString()); 

    res.status(200).json({ message: "Password reset successful!" });
  } catch (error) {
    console.error("❌ Error in resetPassword:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};
