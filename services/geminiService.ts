
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

// Helper to clean numbering from text (e.g., "1.1 Topic" -> "Topic")
const cleanSubTopicText = (text: string) => {
  return text.replace(/^\d+(\.\d+)+\s*[:.-]?\s*/, '').trim();
};

export const generateCourseStructure = async (topic: string): Promise<Partial<CourseData>> => {
  const prompt = `Act as a Malaysia HRDF Certified Trainer (TTT Exemption). Design a training course outline for the topic: "${topic}".
  Follow this strict HRDF TTT format:

  1. **Course Title**: Professional and action-oriented.
  2. **Duration**: (e.g., 1 Day / 4 Hours).
  3. **Learning Outcomes**: Create 3-5 specific outcomes. Format MUST be: [Action Verb] + [Measurable Subject]. Ensure outcomes determine specific skills.
  4. **Ice Breaker**: A specific, relevant activity.
  5. **Content Mapping (Modules)**: 
     - Break into 3-4 distinct Modules.
     - Each Module must have sub-units (e.g., 1.1, 1.2, 1.3).
     - Ensure logical flow for the target audience.
  
  Return JSON only.`;

  const schema: Schema = {
    type: Type.OBJECT,
    properties: {
      courseTitle: { type: Type.STRING },
      duration: { type: Type.STRING },
      learningOutcomes: { 
        type: Type.ARRAY, 
        items: { type: Type.STRING },
        description: "List of learning outcomes starting with Action Verbs"
      },
      iceBreaker: { type: Type.STRING },
      modules: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING, description: "Module Title (e.g. Module 1: Introduction)" },
            subTopics: { 
              type: Type.ARRAY, 
              items: { type: Type.STRING },
              description: "List of sub-topics (e.g. 1.1 Definition, 1.2 History)"
            }
          },
          required: ["title", "subTopics"]
        }
      }
    },
    required: ["courseTitle", "learningOutcomes", "modules"]
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
      // Handle potential casing issues or missing arrays
      subTopics: (m.subTopics || m.subtopics || []).map((text: string, sIdx: number) => ({
        id: `sub-${Date.now()}-${idx}-${sIdx}`,
        text: cleanSubTopicText(text) // Clean the text from API
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
  const prompt = `Act as a Malaysia HRDF Certified Trainer.
  Course Topic: "${courseTitle}"
  Target Learning Outcomes:
  - ${outcomesList}

  Generate the **Content Mapping (Hierarchy)**.
  1. Break the course into distinct Modules (Module 1, Module 2, etc.).
  2. Each Module MUST have sub-units numbered strictly as 1.1, 1.2, 1.3, etc.
  3. Ensure the flow is logical.
  
  **IMPORTANT**: strictly separate the Module Title from the sub-topics list. Do not merge them.
  Return a JSON array of module objects.`;

  const schema: Schema = {
    type: Type.ARRAY,
    items: {
      type: Type.OBJECT,
      properties: {
        title: { type: Type.STRING, description: "The main Module Title" },
        subTopics: { 
          type: Type.ARRAY, 
          items: { type: Type.STRING },
          description: "Array of distinct sub-units (e.g. '1.1 Concept', '1.2 Application')" 
        }
      },
      required: ["title", "subTopics"]
    }
  };

  try {
    const data = await safeGenerate('gemini-3-flash-preview', prompt, schema);
    return data.map((m: any, idx: number) => ({
      id: `mod-${Date.now()}-${idx}`,
      title: m.title,
      subTopics: (m.subTopics || m.subtopics || []).map((text: string, sIdx: number) => ({
        id: `sub-${Date.now()}-${idx}-${sIdx}`,
        text: cleanSubTopicText(text) // Clean the text from API
      }))
    }));
  } catch (error) {
    console.error("Error generating modules:", error);
    throw error;
  }
};

export const generateSessionPlan = async (modules: ModuleItem[]): Promise<SessionPlanItem[]> => {
  // Map back to simple structure for prompt efficiency
  // WE EXPLICITLY RE-ADD NUMBERS HERE so the Session Plan generation sees them and uses them
  // This ensures the Table has numbering (1.1, 1.2) while the Content Mapping tree (UI) handles numbering visually.
  const simplifiedModules = modules.map((m, i) => ({
    title: m.title,
    subTopics: m.subTopics.map((s, j) => {
       // Check if text already has number (user manual input)
       const hasNumber = /^\d+\.\d+/.test(s.text);
       return hasNumber ? s.text : `${i + 1}.${j + 1} ${s.text}`;
    })
  }));

  const modulesJson = JSON.stringify(simplifiedModules);
  const prompt = `Act as a Malaysia HRDF Certified Trainer.
  Based on these modules: ${modulesJson}, generate a detailed **Session Plan Table**.

  **STRICT RULE**: The "Learning Points" for each module MUST be the **EXACT COPY** of the sub-topics provided in the input (e.g., "1.1 ...", "1.2 ..."). 
  - Do NOT rewrite, summarize, or invent new learning points.
  - Do NOT convert them into generic bullet points. Use the numbered sub-topics.

  Requirements:
  1. **Module**: The mapped content title.
  2. **Learning Points**: The exact list of sub-topics.
  3. **Methodology**: Distinctly split into 'Lecture' (Trainer input) and 'Activity' (Trainee output). Ensure every learning outcome has a practical activity.
  4. **Resources**: e.g., PPT, Handouts, Whiteboard.
  5. **Duration**: Estimate time for each section.
  
  Include an 'Introduction/Ice Breaker' row at the start and a 'Summary & Review' row at the end.
  Return JSON only.`;

  const schema: Schema = {
    type: Type.ARRAY,
    items: {
      type: Type.OBJECT,
      properties: {
        module: { type: Type.STRING },
        learningPoints: { type: Type.ARRAY, items: { type: Type.STRING } },
        resources: { type: Type.STRING },
        method: { type: Type.STRING, description: "Lecture / Activity breakdown" },
        duration: { type: Type.STRING },
        slideNo: { type: Type.STRING }
      },
      required: ["module", "learningPoints", "resources", "method", "duration", "slideNo"]
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
  
  const prompt = `Act as a Malaysia HRDF Certified Trainer.
  Closing Section:
  Based on these modules: ${modulesJson}, create 3 specific **Review/Assessment Questions** that directly test the learning outcomes (Knowledge/Skill check).
  
  Return a JSON array of strings.`;

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
