
export interface SessionPlanItem {
  id: string;
  module: string;
  learningPoints: string[];
  resources: string;
  method: string;
  duration: string;
  slideNo: string;
}

export interface SubTopicItem {
  id: string;
  text: string;
}

export interface ModuleItem {
  id: string;
  title: string;
  subTopics: SubTopicItem[];
}

export interface LearningOutcomeItem {
  id: string;
  text: string;
}

export interface ReviewQuestion {
  id: string;
  question: string;
}

export interface CourseData {
  id?: string;
  lastModified?: number;
  trainerName: string;
  courseTitle: string;
  duration: string;
  location: string;
  trainerBio: string;
  trainerTitle: string;
  learningOutcomes: LearningOutcomeItem[];
  iceBreaker: string;
  modules: ModuleItem[];
  sessionPlan: SessionPlanItem[];
  reviewQuestions: ReviewQuestion[];
}

export const INITIAL_COURSE_DATA: CourseData = {
  trainerName: "",
  courseTitle: "",
  duration: "",
  location: "",
  trainerBio: "",
  trainerTitle: "",
  learningOutcomes: [{ id: 'lo-1', text: '' }],
  iceBreaker: "",
  modules: [
    { id: 'mod-1', title: 'Module 1', subTopics: [{ id: 'sub-1', text: '' }] }
  ],
  sessionPlan: [],
  reviewQuestions: [{ id: 'rv-1', question: '' }]
};
