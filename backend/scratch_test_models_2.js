const { GoogleGenerativeAI } = require('@google/generative-ai');
async function test() {
  const genAI = new GoogleGenerativeAI('AIzaSyCpcWpF7Vw2KQqn0J5OxaoeBJw4F6R3_fw');
  
  const modelsToTest = ["gemini-2.5-pro", "gemini-flash-latest", "gemini-pro-latest"];
  
  for (const m of modelsToTest) {
    try {
      const model = genAI.getGenerativeModel({ model: m });
      const result = await model.generateContent("Hello?");
      console.log(`Response for ${m}:`, result.response.text());
    } catch (error) {
      console.error(`Error with ${m}:`, inlineError(error.message));
    }
  }
}
function inlineError(msg) {
    return msg.replace(/\n/g, " ");
}
test();
