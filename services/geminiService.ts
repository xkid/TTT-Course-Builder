
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

// Helper to clean numbering from text (e.g., "1.1 Topic" -> "Topic", "Module 1.1 Topic" -> "Topic")
// Made more robust to handle various numbering formats
const cleanSubTopicText = (text: string) => {
  return text.replace(/^(Module\s+)?\d+(\.\d+)+\s*[:.-]?\s*/i, '').trim();
};

export const generateCourseStructure = async (topic: string): Promise<Partial<CourseData>> => {
  const prompt = `Act as a Malaysia HRDF Certified Trainer (TTT Exemption). Design a Competency-Based Training (CBT) course outline for the topic: "${topic}".
  
  **Strict HRDF TTT Format Requirements:**

  1. **Course Title**: Professional and action-oriented.
  2. **Duration**: (e.g., 1 Day / 4 Hours).
  3. **Learning Outcomes (LO)**: 
     - Minimum 3 specific outcomes.
     - Structure MUST be: **[Action Verb] + [Specific Subject/Object]** + (Optional: Context).
     - Example: "Install and Setup Ollama Software", "Analyze data using Pivot Tables".
  4. **Ice Breaker**: A specific, relevant activity.
  5. **Content Mapping (Modules)**: 
     - Hierarchical numbering is mandatory.
     - **Module Level**: Module 1, Module 2, etc.
     - **Sub-topic Level**: 1.1 [Actionable Step], 1.2, 1.3...
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

  Generate the **Content Mapping (Hierarchy)** following CBT standards.
  1. Break the course into distinct Modules (Module 1, Module 2, etc.).
  2. Each Module MUST have sub-units numbered strictly as 1.1, 1.2, 1.3, etc.
  3. Sub-units must be actionable steps or specific topics.
  
  **IMPORTANT**: strictly separate the Module Title from the sub-topics list.
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

  **Strict HRDF Session Plan Columns:**
  1. **Learning Points / Contents**: 
     - MUST be the **EXACT COPY** of the sub-topics provided (e.g., "1.1 Download software", "1.2 Install").
     - Do NOT summarize. Use the numbered list.
  2. **Resources**: e.g., PPT, Computer, Whiteboard, Internet.
  3. **Method / Activities**: 
     - MUST be distinctly split into **'Lecture'** (Trainer input) and **'Activity'** (Trainee output).
     - Example: "Lecture: Explain X... \nActivity: Trainees perform Y..."
  4. **Duration**: Estimate time (e.g. 30 mins).
  5. **Slide No**: e.g. 1-5.

  **Closing Loop (Mandatory)**:
  - Add a final row for "Closing Section".
  - Learning Points: "Summary of Module 1-X", "Recap Key Terms".
  - Method: "Facilitated Discussion & Review Assessment".

  Include an 'Introduction/Ice Breaker' row at the start.
  Return JSON only.`;

  const schema: Schema = {
    type: Type.ARRAY,
    items: {
      type: Type.OBJECT,
      properties: {
        module: { type: Type.STRING },
        learningPoints: { type: Type.ARRAY, items: { type: Type.STRING } },
        resources: { type: Type.STRING },
        method: { type: Type.STRING, description: "Split into Lecture and Activity" },
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
  Closing Section - Review Outcome:
  Based on these modules: ${modulesJson}, create 3 specific **Assessment Questions** that directly test the Learning Outcomes.
  
  These questions serve as the "Review Outcome" for the Closing Loop.
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
