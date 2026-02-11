
import { GoogleGenAI, Type, Schema } from "@google/genai";
import { CourseData, ModuleItem, SessionPlanItem, LearningOutcomeItem } from "../types";

// Helper to handle API calls with retry logic
async function safeGenerate(model: string, prompt: string, schema: Schema, retries = 3): Promise<any> {
  // Retrieve API key dynamically from localStorage or environment
  const storedKey = typeof window !== 'undefined' ? localStorage.getItem('gemini_api_key') : null;
  const apiKey = storedKey || process.env.API_KEY || '';

  if (!apiKey) throw new Error("API Key missing. Please configure it in Settings or check environment variables.");

  // Re-instantiate client for each request with the correct key
  const ai = new GoogleGenAI({ apiKey });

  let lastError;
  for (let i = 0; i < retries; i++) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: schema,
        }
      });
      if (response.text) {
        return JSON.parse(response.text);
      }
    } catch (error) {
      console.warn(`Gemini API attempt ${i + 1} failed:`, error);
      lastError = error;
      // Linear backoff: 1s, 2s, 3s
      await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
    }
  }
  throw lastError || new Error("Failed to generate content");
}

export const generateCourseStructure = async (topic: string): Promise<Partial<CourseData>> => {
  const prompt = `Create a structured HRDF training course outline for the topic: "${topic}". 
  I need the course title, a suggested duration, learning outcomes (3-5), a brief ice breaker idea, 
  and 3-4 distinct modules with sub-topics.
  Return JSON only.`;

  const schema: Schema = {
    type: Type.OBJECT,
    properties: {
      courseTitle: { type: Type.STRING },
      duration: { type: Type.STRING },
      learningOutcomes: { type: Type.ARRAY, items: { type: Type.STRING } },
      iceBreaker: { type: Type.STRING },
      modules: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            subTopics: { type: Type.ARRAY, items: { type: Type.STRING } }
          }
        }
      }
    }
  };

  try {
    const data = await safeGenerate('gemini-3-flash-preview', prompt, schema);
    
    // Transform simple strings to objects with IDs
    const learningOutcomes = (data.learningOutcomes || []).map((text: string, idx: number) => ({
      id: `lo-${Date.now()}-${idx}`,
      text
    }));

    const modules = (data.modules || []).map((m: any, idx: number) => ({
      id: `mod-${Date.now()}-${idx}`,
      title: m.title,
      subTopics: (m.subTopics || []).map((text: string, sIdx: number) => ({
        id: `sub-${Date.now()}-${idx}-${sIdx}`,
        text
      }))
    }));

    return { 
      ...data, 
      learningOutcomes,
      modules 
    };
  } catch (error) {
    console.error("Error generating course structure:", error);
    throw error;
  }
};

export const generateModulesFromOutcomes = async (outcomes: LearningOutcomeItem[], courseTitle: string): Promise<ModuleItem[]> => {
  const outcomesList = outcomes.map(o => o.text).filter(t => t.trim()).join('\n- ');
  const prompt = `For a training course titled "${courseTitle}", based on these learning outcomes:
- ${outcomesList}

Generate a comprehensive list of training modules (Content Mapping) that covers these outcomes.
Return a JSON array of objects with 'title' (string) and 'subTopics' (array of strings).`;

  const schema: Schema = {
    type: Type.ARRAY,
    items: {
      type: Type.OBJECT,
      properties: {
        title: { type: Type.STRING },
        subTopics: { type: Type.ARRAY, items: { type: Type.STRING } }
      }
    }
  };

  try {
    const data = await safeGenerate('gemini-3-flash-preview', prompt, schema);
    return data.map((m: any, idx: number) => ({
      id: `mod-${Date.now()}-${idx}`,
      title: m.title,
      subTopics: (m.subTopics || []).map((text: string, sIdx: number) => ({
        id: `sub-${Date.now()}-${idx}-${sIdx}`,
        text
      }))
    }));
  } catch (error) {
    console.error("Error generating modules:", error);
    throw error;
  }
};

export const generateSessionPlan = async (modules: ModuleItem[]): Promise<SessionPlanItem[]> => {
  // Map back to simple structure for prompt efficiency
  const simplifiedModules = modules.map(m => ({
    title: m.title,
    subTopics: m.subTopics.map(s => s.text)
  }));

  const modulesJson = JSON.stringify(simplifiedModules);
  const prompt = `Based on these training modules: ${modulesJson}, generate a detailed HRDF session plan table.
  For each module, provide learning points (bullet points), resources (e.g., PPT, Handouts), methodology (e.g., Lecture, Activity), estimated duration, and slide number ranges.
  Also include an 'Introduction' row at the start and a 'Summary & Review' row at the end.
  Return JSON only.`;

  const schema: Schema = {
    type: Type.ARRAY,
    items: {
      type: Type.OBJECT,
      properties: {
        module: { type: Type.STRING },
        learningPoints: { type: Type.ARRAY, items: { type: Type.STRING } },
        resources: { type: Type.STRING },
        method: { type: Type.STRING },
        duration: { type: Type.STRING },
        slideNo: { type: Type.STRING }
      }
    }
  };

  try {
    const data = await safeGenerate('gemini-3-flash-preview', prompt, schema);
    return data.map((item: any, idx: number) => ({
      ...item,
      id: `sp-${Date.now()}-${idx}`
    }));
  } catch (error) {
    console.error("Error generating session plan:", error);
    throw error;
  }
};

export const generateReviewQuestions = async (modules: ModuleItem[]): Promise<string[]> => {
  const simplifiedModules = modules.map(m => ({
    title: m.title,
    subTopics: m.subTopics.map(s => s.text)
  }));
  const modulesJson = JSON.stringify(simplifiedModules);
  
  const prompt = `Generate 3 specific review questions to check trainee understanding based on these modules: ${modulesJson}. Return a JSON array of strings.`;

  const schema: Schema = {
    type: Type.ARRAY,
    items: { type: Type.STRING }
  };

  try {
    const data = await safeGenerate('gemini-3-flash-preview', prompt, schema);
    return data;
  } catch (error) {
    console.error("Error generating review questions:", error);
    throw error;
  }
};
