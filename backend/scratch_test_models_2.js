const { GoogleGenerativeAI } = require('@google/generative-ai');
async function test() {
  const genAI = new GoogleGenerativeAI('AIzaSyDzVC4j49Bc0JgBM9POUFs3T7DDomcuOe4');
  
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
