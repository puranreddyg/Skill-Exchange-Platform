const { GoogleGenerativeAI } = require('@google/generative-ai');
async function test() {
  const genAI = new GoogleGenerativeAI('AIzaSyCpcWpF7Vw2KQqn0J5OxaoeBJw4F6R3_fw');
  
  const modelsToTest = ["gemini-1.5-pro", "gemini-1.5-flash", "gemini-1.5-flash-latest"];
  
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
