const { GoogleGenerativeAI } = require("@google/generative-ai");
require("dotenv").config();

// Initialize the API with your key from the .env file
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function checkGeminiStatus() {
  try {
    console.log("Checking connection to Gemini 2.5 Flash (Node.js)...");

    // Get the model - using the 2026 standard version
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const prompt = "Connection test: Reply with 'Node.js Success'.";

    // Generate content
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    console.log("------------------------------");
    console.log("API Key Status: WORKING");
    console.log("Model Response:", text.trim());
    console.log("------------------------------");
  } catch (error) {
    console.log("------------------------------");
    console.log("API Key Status: FAILED");
    console.log("Error Details:", error.message);

    if (error.message.includes("404")) {
      console.log(
        "Tip: Ensure 'gemini-2.5-flash' is available in your region.",
      );
    }
    console.log("------------------------------");
  }
}

checkGeminiStatus();
