const { GoogleGenerativeAI } = require('@google/generative-ai');

async function test() {
  try {
    const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models?key=AIzaSyDzVC4j49Bc0JgBM9POUFs3T7DDomcuOe4');
    const data = await response.json();
    if (data.models) {
        console.log("Available models:");
        data.models.forEach(m => {
            if (m.supportedGenerationMethods && m.supportedGenerationMethods.includes('generateContent')) {
                console.log(m.name);
            }
        });
    } else {
        console.log("Error fetching models:", data);
    }
  } catch(e) {
      console.error(e);
  }
}
test();
