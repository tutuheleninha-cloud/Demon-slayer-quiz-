import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Route to generate random Demon Slayer questions
  app.get('/api/questions', async (req, res) => {
    try {
      const { topic, difficulty, lang } = req.query;
      const targetLanguage = lang === 'ja' ? 'Japanese' : 'English';
      
      let basePrompt = `Generate 5 random, unique multiple-choice trivia questions about the anime and manga Demon Slayer (Kimetsu no Yaiba). The questions and options MUST be written in ${targetLanguage}.`;
      
      if (topic && topic !== 'General') {
        basePrompt += ` Focus specifically on the topic: ${topic}.`;
      } else {
        basePrompt += ' Cover characters, plot points, breathing techniques, and demons from the anime and manga.';
      }

      if (difficulty) {
        basePrompt += ` Ensure the questions are of ${difficulty} difficulty level.`;
      } else {
        basePrompt += ' Make sure they range in difficulty from easy to hard.';
      }

      basePrompt += ' Do not repeat standard questions like "Who is the main character?". Ensure correct answers are actually correct.';

      const response = await ai.models.generateContent({
        model: 'gemini-3.5-flash',
        contents: basePrompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                question: {
                  type: Type.STRING,
                  description: 'The trivia question.',
                },
                options: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.STRING,
                  },
                  description: 'Four possible answer choices.',
                },
                correctAnswer: {
                  type: Type.STRING,
                  description: 'The exact string of the correct answer from the options array.',
                },
              },
              required: ['question', 'options', 'correctAnswer'],
            },
          },
          temperature: 1.2,
        },
      });

      const text = response.text;
      if (!text) {
        throw new Error('No text returned from model');
      }

      const questions = JSON.parse(text);
      res.json(questions);
    } catch (error) {
      console.error('Error generating questions:', error);
      res.status(500).json({ error: 'Failed to generate questions' });
    }
  });

  // API Route to generate a hint in the voice of a Kasugai Crow
  app.post('/api/hint', async (req, res) => {
    try {
      const { question, lang } = req.body;
      const targetLanguage = lang === 'ja' ? 'Japanese' : 'English';
      const prompt = `You are a Kasugai Crow from Demon Slayer. Caw! Give a cryptic, fun hint for the following trivia question, but DO NOT give away the exact answer. Speak in the voice of a Kasugai Crow (lots of caws, squawks, being bossy or dramatic). The hint MUST be written in ${targetLanguage}. Question: ${question}`;
      
      const response = await ai.models.generateContent({
        model: 'gemini-3.5-flash',
        contents: prompt,
      });

      res.json({ hint: response.text });
    } catch (error) {
      console.error('Error generating hint:', error);
      res.status(500).json({ error: 'Failed to generate hint' });
    }
  });

  // API Route to generate Text-to-Speech (TTS)
  app.post('/api/tts', async (req, res) => {
    try {
      const { text } = req.body;
      const response = await ai.models.generateContent({
        model: 'gemini-3.1-flash-tts-preview',
        contents: text,
      });

      const inlineData = response.candidates?.[0]?.content?.parts?.[0]?.inlineData;
      if (!inlineData || !inlineData.data) {
        throw new Error('Failed to generate audio');
      }

      // Convert base64 audio data to buffer and send
      const audioBuffer = Buffer.from(inlineData.data, 'base64');
      res.set('Content-Type', inlineData.mimeType || 'audio/wav');
      res.send(audioBuffer);
    } catch (error) {
      console.error('Error generating TTS:', error);
      res.status(500).json({ error: 'Failed to generate TTS' });
    }
  });

  // API Route for Visual Bonus Round
  app.get('/api/bonus-question', async (req, res) => {
    try {
      const { lang } = req.query;
      const targetLanguage = lang === 'ja' ? 'Japanese' : 'English';
      const characterPrompt = "A highly stylized, mysterious, minimalist silhouette of a famous Demon Slayer character holding their weapon, dark fantasy anime style, dramatic lighting, solid dark background.";
      
      const imageResponse = await ai.models.generateImages({
        model: 'gemini-3.1-flash-image-preview',
        prompt: characterPrompt,
        config: {
          numberOfImages: 1,
          outputMimeType: 'image/jpeg',
          aspectRatio: '16:9',
        }
      });
      
      const base64Image = imageResponse.generatedImages?.[0]?.image?.imageBytes;
      if (!base64Image) {
        throw new Error('Failed to generate image');
      }

      const imageUrl = `data:image/jpeg;base64,${base64Image}`;

      // We'll just hardcode a visual question for simplicity to ensure it matches the image,
      // or we can ask Gemini to generate a question based on a character it chose. 
      // Actually, since we just prompted for a generic silhouette, the user might not be able to guess it properly unless we tell Gemini to draw a *specific* character.
      // Let's ask Gemini to pick a character, draw them, and return the question.
      // 1. Pick a character
      const charResp = await ai.models.generateContent({
        model: 'gemini-3.5-flash',
        contents: 'Randomly pick one of the Hashira from Demon Slayer. Output ONLY their full name.',
      });
      const characterName = charResp.text?.trim() || "Kyojuro Rengoku";

      // 2. Draw silhouette
      const specificCharPrompt = `A highly stylized, mysterious, minimalist silhouette of ${characterName} from Demon Slayer, holding their weapon, dark fantasy anime style, dramatic lighting, solid dark background. Make it recognizable but a silhouette.`;
      
      const specificImageResponse = await ai.models.generateImages({
        model: 'gemini-3.1-flash-image-preview',
        prompt: specificCharPrompt,
        config: {
          numberOfImages: 1,
          outputMimeType: 'image/jpeg',
          aspectRatio: '16:9',
        }
      });
      const specificBase64Image = specificImageResponse.generatedImages?.[0]?.image?.imageBytes;
      const finalImageUrl = `data:image/jpeg;base64,${specificBase64Image}`;

      // 3. Generate question
      const qResp = await ai.models.generateContent({
        model: 'gemini-3.5-flash',
        contents: `Generate a multiple choice trivia question where the answer is ${characterName}. Format as JSON matching this schema: { question: string, options: string[], correctAnswer: string }. The questions and options MUST be written in ${targetLanguage}.`,
        config: {
          responseMimeType: 'application/json',
        }
      });
      const qData = JSON.parse(qResp.text || '{}');
      
      res.json({
        ...qData,
        imageUrl: finalImageUrl,
        isBonus: true
      });

    } catch (error) {
      console.error('Error generating bonus question:', error);
      res.status(500).json({ error: 'Failed to generate bonus question' });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
