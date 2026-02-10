
import React from 'react';
import { CourseData } from '../types';
import { User, Clock, MapPin, BookOpen, Layers, Target, FileText, CheckCircle } from 'lucide-react';

interface CoursePreviewProps {
  data: CourseData;
}

export const CoursePreview: React.FC<CoursePreviewProps> = ({ data }) => {
  return (
    <div className="bg-white shadow-lg p-8 mx-auto max-w-5xl min-h-screen text-gray-900" id="course-preview">
      {/* Header Info */}
      <div className="border-b-2 border-orange-500 pb-6 mb-8">
        <h1 className="text-4xl font-bold text-gray-900 mb-2">{data.courseTitle || "Course Title"}</h1>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4 text-sm text-gray-800">
          <div className="flex items-center space-x-2">
            <User className="w-4 h-4 text-orange-600" />
            <span className="font-semibold w-20">Trainer:</span>
            <span>{data.trainerName}</span>
          </div>
          <div className="flex items-center space-x-2">
            <Clock className="w-4 h-4 text-orange-600" />
            <span className="font-semibold w-20">Duration:</span>
            <span>{data.duration}</span>
          </div>
          <div className="flex items-center space-x-2">
            <FileText className="w-4 h-4 text-orange-600" />
            <span className="font-semibold w-20">Title:</span>
            <span>{data.trainerTitle}</span>
          </div>
          <div className="flex items-center space-x-2">
            <MapPin className="w-4 h-4 text-orange-600" />
            <span className="font-semibold w-20">Location:</span>
            <span>{data.location}</span>
          </div>
        </div>
      </div>

      {/* Learning Outcomes */}
      <div className="mb-10 text-gray-900">
        <h2 className="text-xl font-bold text-orange-600 mb-4 flex items-center">
          <Target className="w-5 h-5 mr-2" /> Learning Outcomes
        </h2>
        <p className="mb-3 italic text-gray-600">At the end of this session, all trainees will be able to:</p>
        <ul className="list-decimal pl-6 space-y-2">
          {data.learningOutcomes.map((outcome, idx) => (
            <li key={outcome.id || idx} className="text-gray-800">{outcome.text}</li>
          ))}
        </ul>
      </div>

      {/* Content Mapping (Tree Visualization) */}
      <div className="mb-10 break-inside-avoid text-gray-900">
        <h2 className="text-xl font-bold text-orange-600 mb-6 flex items-center">
          <Layers className="w-5 h-5 mr-2" /> Content Mapping
        </h2>
        <div className="flex flex-row items-stretch">
          {/* Root Node */}
          <div className="flex flex-col justify-center items-center mr-8">
            <div className="bg-white border-2 border-gray-800 rounded-lg p-4 shadow-md w-48 text-center font-bold text-gray-900">
              {data.courseTitle || "Course Title"}
            </div>
          </div>
          
          {/* Connections */}
          <div className="flex flex-col justify-around relative">
             <div className="absolute left-0 top-4 bottom-4 w-px bg-gray-400"></div>
             {data.modules.map((mod, idx) => (
               <div key={mod.id} className="flex items-center my-4 relative">
                 <div className="w-8 h-px bg-gray-400"></div>
                 <div className="flex flex-col">
                    <div className="bg-white border border-gray-400 rounded px-3 py-2 shadow-sm min-w-[200px] mb-2 font-semibold text-gray-900 flex items-start">
                      <span className="text-orange-600 font-bold mr-2">{idx + 1}.</span>
                      <span>{mod.title}</span>
                    </div>
                    {/* Sub topics tiny branches */}
                    <div className="pl-4 border-l border-gray-300 ml-2 space-y-1">
                      {mod.subTopics.map((sub, sIdx) => (
                        <div key={sub.id || sIdx} className="text-xs text-gray-600 relative flex items-start">
                           <span className="mr-2 font-medium text-gray-500 w-6">{idx + 1}.{sIdx + 1}</span>
                           <span>{sub.text}</span>
                        </div>
                      ))}
                    </div>
                 </div>
               </div>
             ))}
          </div>
        </div>
      </div>

      {/* Session Plan Table */}
      <div className="mb-10 break-inside-avoid">
         <h2 className="text-xl font-bold text-orange-600 mb-4 flex items-center">
          <BookOpen className="w-5 h-5 mr-2" /> Session Plan
        </h2>
        <div className="overflow-x-auto">
          <table className="min-w-full border border-gray-300 text-sm text-gray-900">
            <thead className="bg-orange-100 text-gray-900">
              <tr>
                <th className="border border-gray-300 px-4 py-2 text-left w-1/4 font-bold text-gray-900">Learning Points / Contents</th>
                <th className="border border-gray-300 px-4 py-2 text-center w-1/12 font-bold text-gray-900">Resources</th>
                <th className="border border-gray-300 px-4 py-2 text-left w-1/3 font-bold text-gray-900">Method / Activities</th>
                <th className="border border-gray-300 px-4 py-2 text-center w-1/12 font-bold text-gray-900">Duration</th>
                <th className="border border-gray-300 px-4 py-2 text-center w-1/12 font-bold text-gray-900">Slide No.</th>
              </tr>
            </thead>
            <tbody>
              {data.sessionPlan.map((row) => (
                <tr key={row.id} className="hover:bg-gray-50 text-gray-900">
                  <td className="border border-gray-300 px-4 py-3 align-top">
                    <div className="font-bold mb-1 text-gray-900">{row.module}</div>
                    <ul className="list-disc pl-4 text-xs text-gray-700 space-y-1">
                      {row.learningPoints.map((pt, i) => <li key={i}>{pt}</li>)}
                    </ul>
                  </td>
                  <td className="border border-gray-300 px-4 py-3 text-center align-middle whitespace-pre-wrap text-gray-900">{row.resources}</td>
                  <td className="border border-gray-300 px-4 py-3 align-top whitespace-pre-wrap text-gray-900">{row.method}</td>
                  <td className="border border-gray-300 px-4 py-3 text-center align-middle text-gray-900">{row.duration}</td>
                  <td className="border border-gray-300 px-4 py-3 text-center align-middle text-gray-900">{row.slideNo}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Other Sections Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 break-inside-avoid text-gray-900">
        {/* Trainer Profile */}
        <div className="border border-gray-200 p-6 rounded-lg bg-gray-50">
          <h3 className="font-bold text-lg mb-3 border-b pb-2 text-gray-900">Trainer Profile</h3>
          <div className="flex items-start space-x-4">
             <div className="w-20 h-20 bg-gray-300 rounded-full flex-shrink-0 flex items-center justify-center text-gray-500">
               <User />
             </div>
             <div>
               <p className="font-bold text-gray-900">{data.trainerName}</p>
               <p className="text-sm text-gray-700 whitespace-pre-line mt-2">{data.trainerBio || "No bio provided."}</p>
             </div>
          </div>
        </div>

        {/* Ice Breaker */}
        <div className="border border-gray-200 p-6 rounded-lg bg-gray-50">
           <h3 className="font-bold text-lg mb-3 border-b pb-2 text-gray-900">ICE Breaker</h3>
           <p className="text-gray-700 whitespace-pre-line">{data.iceBreaker || "No ice breaker activity defined."}</p>
        </div>
      </div>

      {/* Recap & Review */}
      <div className="mt-8 border border-gray-200 p-6 rounded-lg bg-orange-50 break-inside-avoid text-gray-900">
         <h2 className="text-xl font-bold text-orange-600 mb-4 flex items-center">
            <CheckCircle className="w-5 h-5 mr-2" /> Review Outcome
          </h2>
          <p className="mb-2 font-semibold text-gray-900">Checklist Questions:</p>
          <ul className="list-decimal pl-5 space-y-2 text-gray-800">
            {data.reviewQuestions.map((q, idx) => (
              <li key={q.id || idx}>{q.question}</li>
            ))}
          </ul>
      </div>
    </div>
  );
};
