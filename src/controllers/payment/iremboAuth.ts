import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

const AUTH_URL = process.env.IPAY_AUTH_URL as string;
const CLIENT_ID = process.env.IPAY_PUBLIC_KEY as string;
const CLIENT_SECRET = process.env.IPAY_SECRET_KEY as string;

export const getIremboToken = async (): Promise<string> => {
  try {
    const { data } = await axios.post(
      AUTH_URL,
      {
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
      },
      {
        headers: {
          "Content-Type": "application/json",
          "irembopay-secretKey": CLIENT_SECRET,
          "X-API-Version": "2",
          Accept: "application/json",
        },
      }
    );
    return data.access_token;
  } catch (error: any) {
    console.error(
      "❌ Error getting Irembo token:",
      error.response?.data || error
    );
    throw new Error("Failed to authenticate with IremboPay.");
  }
};
