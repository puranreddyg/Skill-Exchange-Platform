const { GoogleGenerativeAI } = require('@google/generative-ai');

async function test() {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || 'AIzaSyCpcWpF7Vw2KQqn0J5OxaoeBJw4F6R3_fw');
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const result = await model.generateContent("Hello?");
    console.log("Response:", result.response.text());
  } catch (error) {
    console.error("Error with gemini-1.5-flash:");
    console.error(error.message);
  }

  try {
    const model2 = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    const result2 = await model2.generateContent("Hello?");
    console.log("Response 2:", result2.response.text());
  } catch (error) {
    console.error("Error with gemini-2.5-flash:");
    console.error(error.message);
  }
}
test();
