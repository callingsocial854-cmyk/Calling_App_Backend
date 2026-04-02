import axios from "axios";

export const sendOTP = async ({
  numbers,
  var1,
  var2,
  var3,
  var4,
}) => {
  try {
    if (!numbers || !var1 || !var2 || !var3 || !var4) {
      throw new Error("All template variables are required");
    }

    const formattedNumbers = Array.isArray(numbers)
      ? numbers.join(",")
      : numbers;

    const API_KEY = process.env.SMS_API_KEY;

    const message = `Dear ${var1} ${var2} is your OTP ${var3} ${var4} -AdServs`;

    const response = await axios.get(
      "https://sms.adservs.co.in/vb/apikey.php",
      {
        params: {
          apikey: API_KEY,
          senderid: process.env.SENDER_ID,
          number: formattedNumbers,
          message: message,
        },
      }
    );

    console.log("SMS Response:", response.data);

    return {
      success: true,
      data: response.data,
    };
  } catch (error) {
    console.error("SMS Error:", error.message);

    return {
      success: false,
      error: error.message,
    };
  }
};