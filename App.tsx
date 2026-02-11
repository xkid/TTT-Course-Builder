import React, { useState, useEffect, useRef } from 'react';
import { INITIAL_COURSE_DATA, CourseData, ModuleItem, SessionPlanItem, ReviewQuestion } from './types';
import { generateCourseStructure, generateSessionPlan, generateReviewQuestions, generateModulesFromOutcomes } from './services/geminiService';
import { saveCourseToDB, getAllCourses, deleteCourseFromDB } from './services/db';
import { CoursePreview } from './components/CoursePreview';
import { SortableItem } from './components/SortableItem';
import { Sparkles, ChevronRight, ChevronLeft, Save, Printer, Edit3, Plus, Trash2, Wand2, FolderOpen, X, Loader2, FileJson, FileText, Upload, GripVertical, Settings, Key } from 'lucide-react';

// DnD Kit Imports
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';

const steps = [
  "General Info",
  "Outcomes & Mapping",
  "Modules",
  "Session Plan",
  "Review & Export"
];

function App() {
  const [currentStep, setCurrentStep] = useState(0);
  
  // Helper to get initial data mixed with saved defaults
  const getInitialData = () => {
    const savedDefaults = localStorage.getItem('hrdf_user_defaults');
    const defaults = savedDefaults ? JSON.parse(savedDefaults) : {};
    return {
      ...INITIAL_COURSE_DATA,
      ...defaults,
      // Ensure fresh IDs for list items to prevent DnD conflicts on new drafts
      learningOutcomes: [{ id: `lo-${Date.now()}`, text: '' }],
      modules: [{ id: `mod-${Date.now()}`, title: 'Module 1', subTopics: [{ id: `sub-${Date.now()}`, text: '' }] }],
      reviewQuestions: [{ id: `rv-${Date.now()}`, question: '' }]
    };
  };

  const [data, setData] = useState<CourseData>(getInitialData);
  const [isGenerating, setIsGenerating] = useState(false);
  const [topicPrompt, setTopicPrompt] = useState("");
  
  // Saved Courses State
  const [showSavedModal, setShowSavedModal] = useState(false);
  const [savedCourses, setSavedCourses] = useState<CourseData[]>([]);
  const [isLoadingSaved, setIsLoadingSaved] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');

  // Settings State
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [userDefaults, setUserDefaults] = useState({
    trainerName: "",
    trainerTitle: "",
    trainerBio: "",
    location: ""
  });
  const [customApiKey, setCustomApiKey] = useState("");
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load defaults into local state when settings modal opens (or on mount)
  useEffect(() => {
    const saved = localStorage.getItem('hrdf_user_defaults');
    if (saved) setUserDefaults(JSON.parse(saved));
    
    const storedApiKey = localStorage.getItem('gemini_api_key');
    if (storedApiKey) setCustomApiKey(storedApiKey);
  }, []);

  // Sensors for DnD - Added activation constraint to allow input focus
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const fetchSavedCourses = async () => {
    setIsLoadingSaved(true);
    try {
      const courses = await getAllCourses();
      setSavedCourses(courses);
    } catch (error) {
      console.error("Failed to fetch courses", error);
    } finally {
      setIsLoadingSaved(false);
    }
  };

  useEffect(() => {
    if (showSavedModal) {
      fetchSavedCourses();
    }
  }, [showSavedModal]);

  const handleSaveDraft = async () => {
    setSaveStatus('saving');
    try {
      const courseToSave = {
        ...data,
        id: data.id || crypto.randomUUID(),
        lastModified: Date.now()
      };
      await saveCourseToDB(courseToSave);
      setData(courseToSave);
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch (error) {
      console.error("Failed to save", error);
      setSaveStatus('idle');
      alert("Failed to save draft.");
    }
  };

  const handleLoadCourse = (course: CourseData) => {
    setData(course);
    setShowSavedModal(false);
    setCurrentStep(0); 
  };

  const handleDeleteCourse = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm("Are you sure you want to delete this saved course?")) {
      try {
        await deleteCourseFromDB(id);
        fetchSavedCourses(); 
      } catch (error) {
        console.error("Failed to delete", error);
      }
    }
  };

  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    localStorage.setItem('hrdf_user_defaults', JSON.stringify(userDefaults));
    
    if (customApiKey.trim()) {
      localStorage.setItem('gemini_api_key', customApiKey.trim());
    } else {
      localStorage.removeItem('gemini_api_key');
    }
    
    setShowSettingsModal(false);
    alert("Settings saved!");
  };
  
  // --- Export / Import Handlers ---

  const exportToJSON = (course: CourseData, e: React.MouseEvent) => {
    e.stopPropagation();
    const dataStr = JSON.stringify(course, null, 2);
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${course.courseTitle.replace(/[^a-z0-9]/gi, '_').toLowerCase() || 'course'}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportToMarkdown = (course: CourseData, e: React.MouseEvent) => {
    e.stopPropagation();
    const clean = (s: string) => (s || '').replace(/\|/g, '\\|').replace(/\n/g, '<br>'); 
    const tableRows = course.sessionPlan.map(row => {
      return `| ${clean(row.module)} | ${clean(row.learningPoints.join('; '))} | ${clean(row.resources)} | ${clean(row.method)} | ${clean(row.duration)} | ${clean(row.slideNo)} |`;
    }).join('\n');

    const markdown = `# ${course.courseTitle || 'Untitled Course'}

**Trainer:** ${course.trainerName}  
**Title:** ${course.trainerTitle}  
**Duration:** ${course.duration}  
**Location:** ${course.location}

---

## Trainer Profile
${course.trainerBio}

## Learning Outcomes
At the end of this session, all trainees will be able to:
${course.learningOutcomes.map((lo, i) => `${i+1}. ${lo.text}`).join('\n')}

## Ice Breaker
${course.iceBreaker}

## Content Mapping
${course.modules.map((m, i) => `### ${i+1}. ${m.title}
${m.subTopics.map((st, j) => `- ${i+1}.${j+1} ${st.text}`).join('\n')}`).join('\n\n')}

## Session Plan
| Learning Points / Content | Resources | Method / Activities | Duration | Slide No. |
| ------------------------- | :-------: | ------------------- | :------: | :-------: |
${tableRows}

## Review Outcome / Checklist
${course.reviewQuestions.map((q, i) => `${i+1}. ${q.question}`).join('\n')}
`;
    const blob = new Blob([markdown], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${course.courseTitle.replace(/[^a-z0-9]/gi, '_').toLowerCase() || 'course'}.md`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const triggerImport = () => {
    fileInputRef.current?.click();
  };

  const handleFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);
        if (json.modules && json.sessionPlan) {
          const importedCourse = {
             ...json,
             id: json.id || crypto.randomUUID(),
             lastModified: Date.now(),
             courseTitle: (json.courseTitle || "Imported Course") + " (Imported)"
          };
          await saveCourseToDB(importedCourse);
          fetchSavedCourses();
          alert("Course imported successfully!");
        } else {
          alert("Invalid course file format.");
        }
      } catch (err) {
        console.error(err);
        alert("Failed to parse JSON file.");
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // --- Data Change Handlers ---
  const handleInputChange = (field: keyof CourseData, value: any) => {
    setData(prev => ({ ...prev, [field]: value }));
  };

  const handleOutcomeChange = (index: number, value: string) => {
    const newOutcomes = [...data.learningOutcomes];
    newOutcomes[index].text = value;
    setData(prev => ({ ...prev, learningOutcomes: newOutcomes }));
  };

  const addOutcome = () => {
    setData(prev => ({ 
      ...prev, 
      learningOutcomes: [...prev.learningOutcomes, { id: `lo-${Date.now()}`, text: "" }] 
    }));
  };

  const removeOutcome = (index: number) => {
    const newOutcomes = data.learningOutcomes.filter((_, i) => i !== index);
    setData(prev => ({ ...prev, learningOutcomes: newOutcomes }));
  };

  // --- Module Handlers ---
  const handleModuleChange = (index: number, field: keyof ModuleItem, value: any) => {
    const newModules = [...data.modules];
    newModules[index] = { ...newModules[index], [field]: value };
    setData(prev => ({ ...prev, modules: newModules }));
  };

  const addModule = () => {
    setData(prev => ({
      ...prev,
      modules: [...prev.modules, { 
        id: `mod-${Date.now()}`, 
        title: 'New Module', 
        subTopics: [{ id: `sub-${Date.now()}`, text: '' }] 
      }]
    }));
  };

  const removeModule = (index: number) => {
    const newModules = data.modules.filter((_, i) => i !== index);
    setData(prev => ({ ...prev, modules: newModules }));
  };

  const handleSubTopicChange = (modIndex: number, subIndex: number, value: string) => {
    const newModules = [...data.modules];
    newModules[modIndex].subTopics[subIndex].text = value;
    setData(prev => ({ ...prev, modules: newModules }));
  };

  const addSubTopic = (modIndex: number) => {
    const newModules = [...data.modules];
    newModules[modIndex].subTopics.push({ id: `sub-${Date.now()}`, text: "" });
    setData(prev => ({ ...prev, modules: newModules }));
  };

  // --- Session Plan Handlers ---
  const handleSessionPlanChange = (index: number, field: keyof SessionPlanItem, value: any) => {
    const newPlan = [...data.sessionPlan];
    newPlan[index] = { ...newPlan[index], [field]: value };
    setData(prev => ({ ...prev, sessionPlan: newPlan }));
  };

  // --- Review Question Handlers ---
  const handleQuestionChange = (index: number, value: string) => {
     const newQs = [...data.reviewQuestions];
     newQs[index] = { ...newQs[index], question: value };
     setData(prev => ({ ...prev, reviewQuestions: newQs }));
  };

  const addQuestion = () => {
     setData(prev => ({ ...prev, reviewQuestions: [...prev.reviewQuestions, { id: Date.now().toString(), question: '' }] }));
  };

  // --- Drag and Drop Handlers ---

  const handleDragEndOutcomes = (event: DragEndEvent) => {
    const { active, over } = event;
    if (active.id !== over?.id) {
      setData((prev) => {
        const oldIndex = prev.learningOutcomes.findIndex((item) => item.id === active.id);
        const newIndex = prev.learningOutcomes.findIndex((item) => item.id === over?.id);
        return {
          ...prev,
          learningOutcomes: arrayMove(prev.learningOutcomes, oldIndex, newIndex),
        };
      });
    }
  };

  const handleDragEndModulesStep = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;
    
    const activeId = String(active.id);
    const overId = String(over.id);

    // Case 1: Dragging a Module (starts with mod-)
    if (activeId.startsWith('mod-')) {
       // Only sort if over another module
       if (overId.startsWith('mod-')) {
          setData((prev) => {
            const oldIndex = prev.modules.findIndex((item) => item.id === activeId);
            const newIndex = prev.modules.findIndex((item) => item.id === overId);
            return {
              ...prev,
              modules: arrayMove(prev.modules, oldIndex, newIndex),
            };
          });
       }
       return;
    }

    // Case 2: Dragging a Subtopic (starts with sub-)
    if (activeId.startsWith('sub-')) {
       // Find source module
       const modIndex = data.modules.findIndex(m => m.subTopics.some(s => s.id === activeId));
       if (modIndex !== -1) {
          // Verify target is in same module (simple reorder support)
          const isOverInSameModule = data.modules[modIndex].subTopics.some(s => s.id === overId);
          if (isOverInSameModule) {
             setData(prev => {
                const newModules = [...prev.modules];
                const targetModule = { ...newModules[modIndex] };
                const currentSubtopics = targetModule.subTopics;
                const oldIndex = currentSubtopics.findIndex(s => s.id === activeId);
                const newIndex = currentSubtopics.findIndex(s => s.id === overId);
                
                targetModule.subTopics = arrayMove(currentSubtopics, oldIndex, newIndex);
                newModules[modIndex] = targetModule;
                
                return { ...prev, modules: newModules };
             });
          }
       }
    }
  };

  const handleDragEndSessionPlan = (event: DragEndEvent) => {
    const { active, over } = event;
    if (active.id !== over?.id) {
      setData((prev) => {
        const oldIndex = prev.sessionPlan.findIndex((item) => item.id === active.id);
        const newIndex = prev.sessionPlan.findIndex((item) => item.id === over?.id);
        return {
          ...prev,
          sessionPlan: arrayMove(prev.sessionPlan, oldIndex, newIndex),
        };
      });
    }
  };


  // --- AI Actions ---
  const quickStart = async () => {
    if (!topicPrompt) return;
    setIsGenerating(true);
    try {
      const generated = await generateCourseStructure(topicPrompt);
      setData(prev => ({ ...prev, ...generated }));
      setCurrentStep(1); 
    } catch (e) {
      console.error(e);
      alert("Failed to generate course structure. Check your API Key or try again.");
    } finally {
      setIsGenerating(false);
    }
  };

  const generateModules = async () => {
    if (data.learningOutcomes.length === 0 || !data.courseTitle) {
      alert("Please ensure you have a Course Title and Learning Outcomes defined.");
      return;
    }
    setIsGenerating(true);
    try {
      const newModules = await generateModulesFromOutcomes(data.learningOutcomes, data.courseTitle);
      setData(prev => ({ ...prev, modules: newModules }));
    } catch (e) {
      console.error(e);
      alert("Failed to generate modules. Check your API Key or try again.");
    } finally {
      setIsGenerating(false);
    }
  };

  const autoFillSessionPlan = async () => {
    if (data.modules.length === 0) {
      alert("Please define modules first.");
      return;
    }
    setIsGenerating(true);
    try {
      const plan = await generateSessionPlan(data.modules);
      setData(prev => ({ ...prev, sessionPlan: plan }));
    } catch (e) {
      console.error(e);
      alert("Failed to generate session plan. Check your API Key or try again.");
    } finally {
      setIsGenerating(false);
    }
  };

  const autoGenerateQuestions = async () => {
    setIsGenerating(true);
    try {
       const qs = await generateReviewQuestions(data.modules);
       setData(prev => ({ 
         ...prev, 
         reviewQuestions: qs.map((q, i) => ({ id: `gen-${i}`, question: q }))
       }));
    } catch(e) {
      console.error(e);
      alert("Failed to generate questions. Check your API Key or try again.");
    } finally {
      setIsGenerating(false);
    }
  };


  return (
    <div className="min-h-screen flex flex-col">
      {/* Top Navbar */}
      <nav className="bg-slate-900 text-white p-4 shadow-md sticky top-0 z-50 no-print">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center space-x-3 w-full md:w-auto justify-between md:justify-start">
             <div className="flex items-center space-x-3">
               <div className="bg-orange-500 p-2 rounded-lg">
                 <Edit3 className="w-5 h-5 text-white" />
               </div>
               <span className="font-bold text-lg tracking-tight">HRDF Course Architect</span>
             </div>
             
             {/* Mobile Saved Button */}
             <div className="flex md:hidden space-x-2">
               <button 
                  onClick={() => setShowSettingsModal(true)}
                  className="p-2 text-slate-300 hover:text-white"
               >
                 <Settings className="w-6 h-6" />
               </button>
               <button 
                  onClick={() => setShowSavedModal(true)}
                  className="p-2 text-slate-300 hover:text-white"
               >
                 <FolderOpen className="w-6 h-6" />
               </button>
             </div>
          </div>

          <div className="flex items-center space-x-4">
             {/* Desktop Buttons */}
             <div className="hidden md:flex items-center space-x-2">
               <button 
                  onClick={() => setShowSettingsModal(true)}
                  className="flex items-center text-sm font-medium text-slate-300 hover:text-white hover:bg-slate-800 px-3 py-2 rounded-lg transition"
               >
                 <Settings className="w-4 h-4 mr-2" /> Settings
               </button>
               <button 
                  onClick={() => setShowSavedModal(true)}
                  className="flex items-center text-sm font-medium text-slate-300 hover:text-white hover:bg-slate-800 px-3 py-2 rounded-lg transition"
               >
                 <FolderOpen className="w-4 h-4 mr-2" /> My Courses
               </button>
             </div>

             <div className="flex space-x-1 bg-slate-800 p-1 rounded-full overflow-x-auto max-w-[90vw] md:max-w-none">
                {steps.map((label, idx) => (
                  <button 
                    key={idx}
                    onClick={() => setCurrentStep(idx)}
                    className={`px-3 py-1 rounded-full text-xs font-medium transition-colors whitespace-nowrap ${
                      currentStep === idx ? 'bg-orange-500 text-white' : 'bg-transparent text-slate-400 hover:text-white'
                    }`}
                  >
                    {idx + 1}. {label}
                  </button>
                ))}
             </div>
          </div>
        </div>
      </nav>

      {/* Settings Modal */}
      {showSettingsModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm no-print">
           <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg animate-in fade-in zoom-in duration-200 flex flex-col max-h-[90vh]">
             <div className="flex justify-between items-center p-6 border-b flex-shrink-0">
                <h2 className="text-xl font-bold text-gray-800 flex items-center">
                  <Settings className="w-5 h-5 mr-2 text-orange-500" /> Global Settings
                </h2>
                <button onClick={() => setShowSettingsModal(false)} className="text-gray-400 hover:text-gray-600">
                  <X className="w-6 h-6" />
                </button>
             </div>
             
             <div className="overflow-y-auto p-6 space-y-6">
                
                {/* API Key Section */}
                <div className="bg-orange-50 p-4 rounded-lg border border-orange-100">
                   <h3 className="text-sm font-bold text-orange-800 mb-2 flex items-center">
                      <Key className="w-4 h-4 mr-2" /> API Configuration
                   </h3>
                   <p className="text-xs text-orange-700 mb-3">
                     Enter your Gemini API key to enable AI features. The key is stored locally in your browser.
                   </p>
                   <div>
                     <label className="block text-xs font-semibold text-gray-600 mb-1">Gemini API Key</label>
                     <input 
                       type="password"
                       className="w-full border border-gray-300 rounded-lg px-3 py-2 bg-white text-gray-900 focus:ring-2 focus:ring-orange-200 outline-none"
                       value={customApiKey}
                       onChange={e => setCustomApiKey(e.target.value)}
                       placeholder="AIzaSy..."
                     />
                   </div>
                </div>

                <div className="space-y-4">
                  <h3 className="text-sm font-bold text-gray-800 border-b pb-1">Default Profile Values</h3>
                  <p className="text-xs text-gray-500">
                    These values will be auto-filled when you start a new draft.
                  </p>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Default Trainer Name</label>
                    <input 
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 bg-white text-gray-900 focus:ring-2 focus:ring-orange-200 outline-none"
                      value={userDefaults.trainerName}
                      onChange={e => setUserDefaults({...userDefaults, trainerName: e.target.value})}
                      placeholder="e.g. John Doe"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Default Professional Title</label>
                    <input 
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 bg-white text-gray-900 focus:ring-2 focus:ring-orange-200 outline-none"
                      value={userDefaults.trainerTitle}
                      onChange={e => setUserDefaults({...userDefaults, trainerTitle: e.target.value})}
                      placeholder="e.g. Senior Consultant"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Default Location / Organization</label>
                    <input 
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 bg-white text-gray-900 focus:ring-2 focus:ring-orange-200 outline-none"
                      value={userDefaults.location}
                      onChange={e => setUserDefaults({...userDefaults, location: e.target.value})}
                      placeholder="e.g. Training Center A"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Default Bio</label>
                    <textarea 
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 bg-white text-gray-900 focus:ring-2 focus:ring-orange-200 outline-none h-24"
                      value={userDefaults.trainerBio}
                      onChange={e => setUserDefaults({...userDefaults, trainerBio: e.target.value})}
                      placeholder="Standard trainer biography..."
                    />
                  </div>
                </div>
             </div>

             <div className="p-6 pt-4 border-t bg-gray-50 rounded-b-xl flex justify-end space-x-2 flex-shrink-0">
                 <button type="button" onClick={() => setShowSettingsModal(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg font-medium">Cancel</button>
                 <button onClick={handleSaveSettings} className="px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 font-bold">Save Settings</button>
             </div>
           </div>
        </div>
      )}

      {/* Saved Courses Modal */}
      {showSavedModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm no-print">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col animate-in fade-in zoom-in duration-200">
            <div className="flex justify-between items-center p-6 border-b">
              <h2 className="text-xl font-bold text-gray-800 flex items-center">
                <FolderOpen className="w-5 h-5 mr-2 text-orange-500" /> Saved Courses
              </h2>
              <div className="flex items-center space-x-2">
                 <input 
                   type="file" 
                   ref={fileInputRef} 
                   onChange={handleFileImport} 
                   accept=".json"
                   className="hidden"
                 />
                 <button 
                   onClick={triggerImport}
                   className="flex items-center text-sm bg-slate-100 hover:bg-slate-200 text-gray-700 px-3 py-1.5 rounded-md font-medium transition"
                 >
                   <Upload className="w-4 h-4 mr-2" /> Import JSON
                 </button>
                 <div className="w-px h-6 bg-gray-300 mx-2"></div>
                 <button onClick={() => setShowSavedModal(false)} className="text-gray-400 hover:text-gray-600">
                  <X className="w-6 h-6" />
                 </button>
              </div>
            </div>
            
            <div className="p-6 overflow-y-auto flex-grow">
              {isLoadingSaved ? (
                <div className="flex justify-center py-10">
                  <Loader2 className="w-8 h-8 text-orange-500 animate-spin" />
                </div>
              ) : savedCourses.length === 0 ? (
                <div className="text-center py-12 text-gray-500 bg-gray-50 rounded-lg border-2 border-dashed border-gray-200">
                  <p>No saved courses found.</p>
                  <p className="text-sm mt-1">Start a new draft and click "Save Draft".</p>
                </div>
              ) : (
                <div className="grid gap-3">
                  {savedCourses.map((course) => (
                    <div 
                      key={course.id} 
                      onClick={() => handleLoadCourse(course)}
                      className="group flex flex-col md:flex-row justify-between items-start md:items-center p-4 rounded-lg border border-gray-200 hover:border-orange-500 hover:shadow-md cursor-pointer transition bg-white gap-4"
                    >
                      <div className="flex-grow">
                        <h3 className="font-bold text-gray-800 group-hover:text-orange-600 transition">
                          {course.courseTitle || "Untitled Course"}
                        </h3>
                        <div className="text-xs text-gray-500 mt-1 flex gap-3">
                           <span>{course.modules.length} Modules</span>
                           <span>•</span>
                           <span>Last edited: {course.lastModified ? new Date(course.lastModified).toLocaleDateString() : 'Unknown'}</span>
                        </div>
                      </div>
                      
                      <div className="flex items-center space-x-2 w-full md:w-auto justify-end">
                        <button 
                          onClick={(e) => exportToJSON(course, e)}
                          className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition"
                          title="Export JSON"
                        >
                          <FileJson className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={(e) => exportToMarkdown(course, e)}
                          className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition"
                          title="Export Markdown"
                        >
                          <FileText className="w-4 h-4" />
                        </button>
                        <div className="w-px h-4 bg-gray-200 mx-1"></div>
                        <button 
                          onClick={(e) => handleDeleteCourse(course.id!, e)}
                          className="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded transition"
                          title="Delete Course"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="p-4 border-t bg-gray-50 rounded-b-xl flex justify-end">
               <button 
                 onClick={() => {
                   setData(INITIAL_COURSE_DATA);
                   setShowSavedModal(false);
                   setCurrentStep(0);
                 }}
                 className="text-sm text-indigo-600 font-semibold hover:underline"
               >
                 + Start New Blank Draft
               </button>
            </div>
          </div>
        </div>
      )}

      <main className="flex-grow bg-gray-50 p-6 print:p-0 print:bg-white">
        <div className="max-w-6xl mx-auto">
          
          {/* AI Quick Start (Only on step 0) */}
          {currentStep === 0 && (
            <div className="bg-gradient-to-r from-indigo-600 to-purple-600 rounded-2xl p-8 mb-8 text-white shadow-xl no-print">
              <h2 className="text-2xl font-bold mb-4 flex items-center">
                <Sparkles className="mr-2" /> AI Quick Builder
              </h2>
              <p className="mb-6 opacity-90">Enter your training topic, and we'll draft the course structure, modules, and outcomes for you instantly.</p>
              <div className="flex gap-2 max-w-2xl">
                <input 
                  type="text" 
                  value={topicPrompt}
                  onChange={(e) => setTopicPrompt(e.target.value)}
                  placeholder="e.g., Advanced Excel for Finance, Workplace Safety Level 1..."
                  className="flex-grow px-4 py-3 rounded-lg text-gray-900 bg-white focus:ring-4 focus:ring-purple-400 focus:outline-none"
                />
                <button 
                  onClick={quickStart}
                  disabled={isGenerating || !topicPrompt}
                  className="bg-white text-indigo-700 px-6 py-3 rounded-lg font-bold hover:bg-indigo-50 disabled:opacity-50 flex items-center"
                >
                  {isGenerating ? <span className="animate-spin mr-2">⏳</span> : <Wand2 className="mr-2 h-5 w-5" />}
                  Generate
                </button>
              </div>
            </div>
          )}

          {/* Form Content Area */}
          <div className={`bg-white rounded-xl shadow-sm p-6 mb-8 border border-gray-100 ${currentStep === 4 ? 'hidden' : 'block'}`}>
            
            {/* Step 0: General Info */}
            {currentStep === 0 && (
              <div className="space-y-6">
                 <h3 className="text-xl font-semibold text-gray-800 border-b pb-2">General Information</h3>
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Course Name / Title</label>
                      <input 
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 bg-white text-gray-900 focus:ring-2 focus:ring-orange-200 focus:border-orange-500 outline-none transition"
                        value={data.courseTitle}
                        onChange={(e) => handleInputChange('courseTitle', e.target.value)}
                        placeholder="Mastering Ollama on Local Computers"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Duration</label>
                      <input 
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 bg-white text-gray-900 focus:ring-2 focus:ring-orange-200 focus:border-orange-500 outline-none transition"
                        value={data.duration}
                        onChange={(e) => handleInputChange('duration', e.target.value)}
                        placeholder="e.g., 2 Days (9am - 5pm)"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
                      <input 
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 bg-white text-gray-900 focus:ring-2 focus:ring-orange-200 focus:border-orange-500 outline-none transition"
                        value={data.location}
                        onChange={(e) => handleInputChange('location', e.target.value)}
                        placeholder="e.g., AC Hotels"
                      />
                    </div>
                 </div>

                 <h3 className="text-xl font-semibold text-gray-800 border-b pb-2 mt-8">Trainer Profile</h3>
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Trainer Name</label>
                      <input 
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 bg-white text-gray-900 focus:ring-2 focus:ring-orange-200 focus:border-orange-500 outline-none transition"
                        value={data.trainerName}
                        onChange={(e) => handleInputChange('trainerName', e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Professional Title</label>
                      <input 
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 bg-white text-gray-900 focus:ring-2 focus:ring-orange-200 focus:border-orange-500 outline-none transition"
                        value={data.trainerTitle}
                        onChange={(e) => handleInputChange('trainerTitle', e.target.value)}
                        placeholder="e.g., Senior System Engineer"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-1">Bio / Experience</label>
                      <textarea 
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 bg-white text-gray-900 focus:ring-2 focus:ring-orange-200 focus:border-orange-500 outline-none transition h-24"
                        value={data.trainerBio}
                        onChange={(e) => handleInputChange('trainerBio', e.target.value)}
                        placeholder="Brief summary of experience..."
                      />
                    </div>
                 </div>
              </div>
            )}

            {/* Step 1: Learning Outcomes & Mapping */}
            {currentStep === 1 && (
              <div className="space-y-6">
                 <h3 className="text-xl font-semibold text-gray-800 border-b pb-2">Learning Outcomes</h3>
                 <p className="text-sm text-gray-500">At the end of this session, all trainees will be able to:</p>
                 
                 <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEndOutcomes}>
                   <SortableContext items={data.learningOutcomes} strategy={verticalListSortingStrategy}>
                     {data.learningOutcomes.map((outcome, idx) => (
                       <SortableItem key={outcome.id} id={outcome.id}>
                         <div className="flex gap-2 w-full">
                           <span className="py-2 text-gray-400 font-bold w-6 text-center">{idx + 1}.</span>
                           <input 
                              className="flex-grow border border-gray-300 rounded-lg px-3 py-2 bg-white text-gray-900 focus:ring-2 focus:ring-orange-200 outline-none"
                              value={outcome.text}
                              onChange={(e) => handleOutcomeChange(idx, e.target.value)}
                           />
                           <button onClick={() => removeOutcome(idx)} className="text-red-400 hover:text-red-600 flex-shrink-0"><Trash2 className="w-5 h-5"/></button>
                         </div>
                       </SortableItem>
                     ))}
                   </SortableContext>
                 </DndContext>

                 <button onClick={addOutcome} className="flex items-center text-orange-600 font-semibold text-sm hover:underline ml-8">
                    <Plus className="w-4 h-4 mr-1" /> Add Outcome
                 </button>

                 <h3 className="text-xl font-semibold text-gray-800 border-b pb-2 mt-8">Ice Breaker</h3>
                 <textarea 
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 bg-white text-gray-900 focus:ring-2 focus:ring-orange-200 outline-none h-24"
                    value={data.iceBreaker}
                    onChange={(e) => handleInputChange('iceBreaker', e.target.value)}
                    placeholder="Describe the ice breaker activity..."
                  />
              </div>
            )}

            {/* Step 2: Modules (Content Mapping) */}
            {currentStep === 2 && (
              <div className="space-y-8">
                 <div className="flex flex-col md:flex-row justify-between items-start md:items-center border-b pb-4 gap-2">
                    <h3 className="text-xl font-semibold text-gray-800">Modules (Content Mapping)</h3>
                    <div className="flex gap-2">
                      <button 
                        onClick={generateModules}
                        disabled={isGenerating}
                        className="bg-indigo-100 text-indigo-700 px-3 py-1.5 rounded-md text-sm font-bold flex items-center hover:bg-indigo-200"
                      >
                         {isGenerating ? "Generating..." : <><Wand2 className="w-4 h-4 mr-2" /> Generate from Outcomes</>}
                      </button>
                      <button onClick={addModule} className="bg-slate-800 text-white px-3 py-1.5 rounded-md text-sm flex items-center hover:bg-slate-700">
                        <Plus className="w-4 h-4 mr-1" /> Add Module
                      </button>
                    </div>
                 </div>
                 
                 <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEndModulesStep}>
                  <SortableContext items={data.modules} strategy={verticalListSortingStrategy}>
                   {data.modules.map((mod, modIdx) => (
                     <SortableItem key={mod.id} id={mod.id} className="bg-gray-50 p-4 rounded-lg border border-gray-200 relative group w-full">
                        <button onClick={() => removeModule(modIdx)} className="absolute top-4 right-4 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition">
                          <Trash2 className="w-5 h-5" />
                        </button>

                        <div className="mb-4 pr-8">
                          <label className="block text-xs uppercase font-bold text-gray-500 mb-1">Module Title</label>
                          <div className="flex gap-2 items-center">
                              <span className="font-bold text-gray-500 text-lg">{modIdx + 1}.</span>
                              <input 
                                className="w-full border border-gray-300 rounded px-3 py-2 bg-white font-semibold text-gray-800 focus:ring-2 focus:ring-orange-200 outline-none"
                                value={mod.title}
                                onChange={(e) => handleModuleChange(modIdx, 'title', e.target.value)}
                              />
                          </div>
                        </div>

                        <div className="pl-4 border-l-2 border-orange-200 ml-2">
                          <label className="block text-xs uppercase font-bold text-gray-500 mb-2">Sub-Topics / Learning Points</label>
                          <div className="space-y-2">
                            {/* REMOVED NESTED DndContext, USING PARENT CONTEXT */}
                              <SortableContext items={mod.subTopics} strategy={verticalListSortingStrategy}>
                                {mod.subTopics.map((sub, subIdx) => (
                                  <SortableItem key={sub.id} id={sub.id} className="items-center" handleClassName="mt-1">
                                      <span className="text-xs font-bold text-gray-400 w-8 text-right mr-2">{modIdx + 1}.{subIdx + 1}</span>
                                      <input 
                                        className="w-full border border-gray-200 rounded px-2 py-1.5 bg-white text-gray-900 text-sm focus:border-orange-400 outline-none"
                                        value={sub.text}
                                        onChange={(e) => handleSubTopicChange(modIdx, subIdx, e.target.value)}
                                        placeholder={`Topic ${modIdx + 1}.${subIdx + 1}`}
                                      />
                                  </SortableItem>
                                ))}
                              </SortableContext>
                          </div>
                          <button onClick={() => addSubTopic(modIdx)} className="mt-2 text-xs text-orange-600 font-semibold hover:underline flex items-center ml-10">
                            <Plus className="w-3 h-3 mr-1" /> Add Sub-topic
                          </button>
                        </div>
                     </SortableItem>
                   ))}
                  </SortableContext>
                 </DndContext>
              </div>
            )}

            {/* Step 3: Session Plan */}
            {currentStep === 3 && (
               <div className="space-y-6">
                 <div className="flex flex-col md:flex-row justify-between items-start md:items-center border-b pb-4">
                    <h3 className="text-xl font-semibold text-gray-800">Detailed Session Plan</h3>
                    <button 
                      onClick={autoFillSessionPlan} 
                      disabled={isGenerating}
                      className="mt-2 md:mt-0 bg-indigo-100 text-indigo-700 px-4 py-2 rounded-lg text-sm font-bold flex items-center hover:bg-indigo-200"
                    >
                      {isGenerating ? "Generating..." : <><Sparkles className="w-4 h-4 mr-2" /> Auto-Generate from Modules</>}
                    </button>
                 </div>

                 {data.sessionPlan.length === 0 && (
                   <div className="text-center py-10 bg-gray-50 rounded-lg border border-dashed border-gray-300 text-gray-500">
                     <p>No session plan items yet. Use the Auto-Generate button or add manually.</p>
                   </div>
                 )}

                 <div className="space-y-4">
                   <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEndSessionPlan}>
                    <SortableContext items={data.sessionPlan} strategy={verticalListSortingStrategy}>
                     {data.sessionPlan.map((item, idx) => (
                       <SortableItem key={item.id} id={item.id} className="border border-gray-200 rounded-lg p-4 bg-white shadow-sm block">
                          <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                             {/* Module & Content */}
                             <div className="md:col-span-4">
                                <label className="text-xs text-gray-500 font-bold uppercase">Learning Points / Content</label>
                                <input 
                                  className="w-full font-semibold border-b border-gray-200 focus:border-orange-500 outline-none py-1 mb-2 bg-white text-gray-900"
                                  value={item.module}
                                  onChange={(e) => handleSessionPlanChange(idx, 'module', e.target.value)}
                                  placeholder="Module/Section Name"
                                />
                                <textarea 
                                  className="w-full text-sm border border-gray-200 rounded p-2 h-20 bg-white text-gray-900"
                                  value={item.learningPoints.join('\n')} // Simplified for textarea
                                  onChange={(e) => handleSessionPlanChange(idx, 'learningPoints', e.target.value.split('\n'))}
                                  placeholder="Bullet points (one per line)"
                                />
                             </div>

                             {/* Resources */}
                             <div className="md:col-span-2">
                                <label className="text-xs text-gray-500 font-bold uppercase">Resources</label>
                                <textarea 
                                  className="w-full text-sm border border-gray-200 rounded p-2 h-28 bg-white text-gray-900"
                                  value={item.resources}
                                  onChange={(e) => handleSessionPlanChange(idx, 'resources', e.target.value)}
                                  placeholder="e.g. PPT, Handouts"
                                />
                             </div>

                             {/* Method */}
                             <div className="md:col-span-4">
                                <label className="text-xs text-gray-500 font-bold uppercase">Method / Activity</label>
                                <textarea 
                                  className="w-full text-sm border border-gray-200 rounded p-2 h-28 bg-white text-gray-900"
                                  value={item.method}
                                  onChange={(e) => handleSessionPlanChange(idx, 'method', e.target.value)}
                                  placeholder="Lecture, Group Activity..."
                                />
                             </div>

                             {/* Timing & Slides */}
                             <div className="md:col-span-2 space-y-2">
                                <div>
                                  <label className="text-xs text-gray-500 font-bold uppercase">Duration</label>
                                  <input 
                                    className="w-full border border-gray-200 rounded p-1 text-sm bg-white text-gray-900"
                                    value={item.duration}
                                    onChange={(e) => handleSessionPlanChange(idx, 'duration', e.target.value)}
                                    placeholder="e.g., 30 mins"
                                  />
                                </div>
                                <div>
                                  <label className="text-xs text-gray-500 font-bold uppercase">Slide No.</label>
                                  <input 
                                    className="w-full border border-gray-200 rounded p-1 text-sm bg-white text-gray-900"
                                    value={item.slideNo}
                                    onChange={(e) => handleSessionPlanChange(idx, 'slideNo', e.target.value)}
                                    placeholder="1-5"
                                  />
                                </div>
                                <div className="text-right pt-2">
                                  <button onClick={() => setData(prev => ({...prev, sessionPlan: prev.sessionPlan.filter(i => i.id !== item.id)}))} className="text-red-400 hover:text-red-600">
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                             </div>
                          </div>
                       </SortableItem>
                     ))}
                    </SortableContext>
                   </DndContext>
                   <button 
                     onClick={() => setData(prev => ({...prev, sessionPlan: [...prev.sessionPlan, { id: Date.now().toString(), module: '', learningPoints: [], resources: '', method: '', duration: '', slideNo: '' }] }))}
                     className="w-full py-2 border-2 border-dashed border-gray-300 text-gray-500 rounded-lg hover:border-orange-400 hover:text-orange-500 font-semibold"
                   >
                     + Add Session Row
                   </button>
                 </div>
               </div>
            )}
          </div>

          {/* Review Questions Section - Integrated into Review Step Logic but shown in Preview Mode really */}
          {currentStep === 4 && (
            <div className="mb-8 no-print">
               <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
                  <div className="flex justify-between items-center mb-4">
                     <h3 className="text-xl font-semibold text-gray-800">Review Questions</h3>
                     <button 
                       onClick={autoGenerateQuestions}
                       disabled={isGenerating}
                       className="text-indigo-600 text-sm font-bold flex items-center hover:bg-indigo-50 px-3 py-1 rounded"
                     >
                       <Wand2 className="w-4 h-4 mr-2" /> Suggest Questions
                     </button>
                  </div>
                  <div className="space-y-3">
                    {data.reviewQuestions.map((q, idx) => (
                      <div key={q.id} className="flex gap-2">
                        <span className="py-2 text-gray-400 font-bold">{idx + 1}.</span>
                        <input 
                           className="flex-grow border border-gray-300 rounded px-3 py-2 text-sm bg-white text-gray-900 focus:ring-2 focus:ring-orange-200 outline-none"
                           value={q.question}
                           onChange={(e) => handleQuestionChange(idx, e.target.value)}
                           placeholder="Enter review question..."
                        />
                         <button onClick={() => {
                           const newQs = data.reviewQuestions.filter((_, i) => i !== idx);
                           setData(prev => ({ ...prev, reviewQuestions: newQs }));
                         }} className="text-gray-400 hover:text-red-500">
                           <Trash2 className="w-4 h-4" />
                         </button>
                      </div>
                    ))}
                    <button onClick={addQuestion} className="text-sm text-orange-600 font-bold hover:underline">+ Add Question</button>
                  </div>
               </div>
               
               <div className="flex justify-end gap-4 mb-4">
                 <button 
                    onClick={() => window.print()} 
                    className="bg-slate-800 text-white px-6 py-2 rounded-lg font-bold flex items-center shadow-lg hover:bg-slate-700 transition"
                  >
                    <Printer className="mr-2 w-5 h-5" /> Print / Save as PDF
                 </button>
               </div>
            </div>
          )}

          {/* PREVIEW COMPONENT */}
          {currentStep === 4 && (
            <div className="border-t-4 border-orange-500 shadow-2xl">
              <CoursePreview data={data} />
            </div>
          )}

          {/* Navigation Footer */}
          <div className="bg-white p-4 border-t sticky bottom-0 flex justify-between items-center no-print mt-8 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)]">
             <button 
               onClick={() => setCurrentStep(Math.max(0, currentStep - 1))}
               disabled={currentStep === 0}
               className="flex items-center px-4 py-2 text-gray-600 hover:text-gray-900 disabled:opacity-30 disabled:cursor-not-allowed font-medium"
             >
               <ChevronLeft className="w-5 h-5 mr-1" /> Back
             </button>

             <div className="flex space-x-2">
                <button 
                  onClick={handleSaveDraft}
                  disabled={saveStatus === 'saving'}
                  className={`flex items-center px-4 py-2 rounded-lg font-medium transition-colors ${
                    saveStatus === 'saved' ? 'bg-green-100 text-green-700' : 'text-gray-500 hover:bg-gray-100'
                  }`}
                >
                  {saveStatus === 'saving' ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : saveStatus === 'saved' ? (
                    <Save className="w-4 h-4 mr-2" />
                  ) : (
                    <Save className="w-4 h-4 mr-2" />
                  )}
                  {saveStatus === 'saving' ? 'Saving...' : saveStatus === 'saved' ? 'Saved!' : 'Save Draft'}
                </button>
             </div>

             <button 
               onClick={() => setCurrentStep(Math.min(steps.length - 1, currentStep + 1))}
               disabled={currentStep === steps.length - 1}
               className="flex items-center bg-orange-500 text-white px-6 py-2 rounded-lg hover:bg-orange-600 disabled:opacity-50 disabled:bg-gray-400 font-bold transition-colors shadow-md"
             >
               Next <ChevronRight className="w-5 h-5 ml-1" />
             </button>
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;