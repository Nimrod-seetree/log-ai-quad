import React, { useState, useRef, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { GoogleGenAI, Chat, Content, Part } from "@google/genai";

// --- Utilities ---

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Remove data url prefix (e.g. "data:image/png;base64,")
      const base64 = result.split(',')[1]; 
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// --- Types ---

type HardwareContext = {
  frameType: string;
  weight: string; // kg
  batteryCells: string; // S
  batteryCapacity: string; // mAh
  motorKv: string;
  propSize: string; // inches
  escAmps: string;
};

type Message = {
  role: 'user' | 'model';
  text: string;
};

// --- Icons ---

const IconDrone = () => (
  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
  </svg>
);

const IconAnalyze = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
  </svg>
);

const IconChat = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
  </svg>
);

const IconSend = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
  </svg>
);

const IconUpload = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
  </svg>
);

const IconX = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
  </svg>
);

const IconFileText = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
     <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
  </svg>
);

// --- Components ---

const App = () => {
  // State
  const [hardware, setHardware] = useState<HardwareContext>({
    frameType: 'Quad X',
    weight: '',
    batteryCells: '',
    batteryCapacity: '',
    motorKv: '',
    propSize: '',
    escAmps: ''
  });
  
  const [logData, setLogData] = useState('');
  
  // Image State
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<string | null>(null);
  const [chatSession, setChatSession] = useState<Chat | null>(null);
  const [chatHistory, setChatHistory] = useState<Message[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const chatEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Scroll to bottom of chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory]);

  const handleInputChange = (field: keyof HardwareContext, value: string) => {
    setHardware(prev => ({ ...prev, [field]: value }));
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const name = file.name.toLowerCase();

      // Clear previous image
      setImageFile(null);
      setImagePreview(null);
      setErrorMsg("");

      // Image handling
      if (name.endsWith('.jpg') || name.endsWith('.jpeg') || name.endsWith('.png') || name.endsWith('.webp')) {
        setImageFile(file);
        setImagePreview(URL.createObjectURL(file));
        return;
      }

      // Binary handling warning
      if (name.endsWith('.bin')) {
         setLogData("⚠️ BINARY FILE DETECTED (.BIN)\n\nBrowser-based analysis cannot parse raw ArduPilot binary logs directly.\n\nRECOMMENDED ACTION:\n1. Open Mission Planner or QGroundControl.\n2. Convert the .BIN file to a .LOG (text) file.\n3. Or export your Parameter List (.param).\n4. Upload the text file here for analysis.");
         return;
      }

      // Text handling (.log, .txt, .param)
      try {
        // Limit to ~5MB for UI responsiveness, warn if truncated
        const MAX_SIZE = 5 * 1024 * 1024; 
        let text = "";
        if (file.size > MAX_SIZE) {
            const slice = file.slice(0, MAX_SIZE);
            text = await slice.text();
            text += "\n\n[...File truncated for browser performance. Analysis will use the first 5MB...]";
        } else {
            text = await file.text();
        }
        setLogData(text);
      } catch (err) {
        console.error("Error reading file:", err);
        setErrorMsg("Failed to read text file.");
      }
    }
  };

  const clearImage = () => {
    setImageFile(null);
    setImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const startAnalysis = async () => {
    if (!logData.trim() && !imageFile) {
      setErrorMsg("Please upload a log file, paste data, or provide an image.");
      return;
    }
    setErrorMsg('');
    setIsAnalyzing(true);
    setAnalysisResult(null);
    setChatHistory([]);
    setChatSession(null);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      
      const systemInstruction = `
        You are an expert ArduPilot Flight Engineer and Log Analyst. 
        Your goal is to analyze the provided drone configuration, log data (text), and visual data (screenshots of maps, telemetry graphs, or HUDs) to identify configuration errors, vibration issues, power inconsistencies, and tuning opportunities.
        
        **Image Analysis Rules:**
        - If a MAP/FLIGHT PATH is provided: Look for straight lines vs wobbles. Analyze cornering overshoot. Identify if the path matches a tuned vehicle or loose navigation.
        - If a GRAPH is provided: Identify noise levels, tracking errors (Target vs Actual), or spikes in current/vibration.
        
        **Report Structure:**
        1. **Health Check**: Quick status (Green/Yellow/Red) on critical systems.
        2. **Visual Analysis**: Insights derived from the uploaded image (if any).
        3. **Configuration Analysis**: Check MOT_SPIN_ARM, battery settings, notch filters against hardware.
        4. **Actionable Recommendations**: Specific parameter changes.
      `;

      const contextPrompt = `
        **Hardware Context:**
        - Frame Type: ${hardware.frameType}
        - Weight: ${hardware.weight} kg
        - Battery: ${hardware.batteryCells}S ${hardware.batteryCapacity}mAh
        - Motors: ${hardware.motorKv} KV
        - Props: ${hardware.propSize} inch
        - ESC: ${hardware.escAmps} A

        **Log Data / Parameters:**
        ${logData || "No text log provided."}

        Please analyze this configuration and any attached visual data.
      `;

      // Prepare contents with optional image
      const parts: Part[] = [{ text: contextPrompt }];
      
      if (imageFile) {
        const base64Data = await fileToBase64(imageFile);
        parts.push({
          inlineData: {
            mimeType: imageFile.type,
            data: base64Data
          }
        });
      }

      // Streaming response for the initial analysis
      let fullResponse = "";
      const resultStream = await ai.models.generateContentStream({
        model: 'gemini-3-flash-preview',
        contents: { parts: parts },
        config: {
          systemInstruction: systemInstruction,
          thinkingConfig: { thinkingBudget: 1024 }
        }
      });
      
      for await (const chunk of resultStream) {
        if (chunk.text) {
          fullResponse += chunk.text;
          setAnalysisResult(fullResponse);
        }
      }

      setIsAnalyzing(false);

      // Initialize chat with the history of this interaction so the user can follow up
      const initialHistory: Content[] = [
        {
          role: 'user',
          parts: parts
        },
        {
          role: 'model',
          parts: [{ text: fullResponse }]
        }
      ];

      const chat = ai.chats.create({
        model: 'gemini-3-flash-preview',
        history: initialHistory,
        config: {
          systemInstruction: systemInstruction,
        }
      });

      setChatSession(chat);

    } catch (e: any) {
      console.error(e);
      setErrorMsg(e.message || "Analysis failed.");
      setIsAnalyzing(false);
    }
  };

  const sendChatMessage = async () => {
    if (!chatInput.trim() || !chatSession) return;
    
    const userMsg = chatInput;
    setChatInput('');
    setChatHistory(prev => [...prev, { role: 'user', text: userMsg }]);

    try {
      const resultStream = await chatSession.sendMessageStream({ message: userMsg });
      
      let modelMsg = "";
      setChatHistory(prev => [...prev, { role: 'model', text: "" }]); // Placeholder

      for await (const chunk of resultStream) {
        if (chunk.text) {
            modelMsg += chunk.text;
            setChatHistory(prev => {
                const newHistory = [...prev];
                newHistory[newHistory.length - 1] = { role: 'model', text: modelMsg };
                return newHistory;
            });
        }
      }
    } catch (e: any) {
      setChatHistory(prev => [...prev, { role: 'model', text: "Error: " + e.message }]);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-indigo-500/30">
      {/* Header */}
      <header className="bg-slate-900 border-b border-slate-800 p-4 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-indigo-600 p-2 rounded-lg shadow-lg shadow-indigo-500/20">
              <IconDrone />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-white">ArduLog AI Analyst</h1>
              <p className="text-xs text-slate-400 font-mono">V1.2 MULTI-FORMAT ANALYST</p>
            </div>
          </div>
          <div className="hidden md:block text-xs text-slate-500">
             Powered by Gemini 3 Flash
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-4 md:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Column: Context & Input */}
        <div className="lg:col-span-4 space-y-6">
          
          {/* Hardware Context Card */}
          <div className="bg-slate-900 rounded-xl border border-slate-800 p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-4 border-b border-slate-800 pb-2">Hardware Context</h2>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="block text-xs text-slate-500 mb-1">Frame Type</label>
                <select 
                  className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-sm focus:border-indigo-500 outline-none"
                  value={hardware.frameType}
                  onChange={(e) => handleInputChange('frameType', e.target.value)}
                >
                  <option>Quad X</option>
                  <option>Hexa X</option>
                  <option>Octo X</option>
                  <option>Coaxial</option>
                  <option>Plane</option>
                  <option>VTOL</option>
                </select>
              </div>
              
              <div>
                <label className="block text-xs text-slate-500 mb-1">Weight (kg)</label>
                <input 
                  type="number" step="0.1"
                  className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-sm focus:border-indigo-500 outline-none"
                  placeholder="e.g. 1.5"
                  value={hardware.weight}
                  onChange={(e) => handleInputChange('weight', e.target.value)}
                />
              </div>

              <div>
                 <label className="block text-xs text-slate-500 mb-1">Battery (S)</label>
                 <input 
                   type="number"
                   className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-sm focus:border-indigo-500 outline-none"
                   placeholder="e.g. 6"
                   value={hardware.batteryCells}
                   onChange={(e) => handleInputChange('batteryCells', e.target.value)}
                 />
              </div>

              <div>
                 <label className="block text-xs text-slate-500 mb-1">Capacity (mAh)</label>
                 <input 
                   type="number"
                   className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-sm focus:border-indigo-500 outline-none"
                   placeholder="e.g. 5000"
                   value={hardware.batteryCapacity}
                   onChange={(e) => handleInputChange('batteryCapacity', e.target.value)}
                 />
              </div>

              <div>
                 <label className="block text-xs text-slate-500 mb-1">Motor KV</label>
                 <input 
                   type="number"
                   className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-sm focus:border-indigo-500 outline-none"
                   placeholder="e.g. 380"
                   value={hardware.motorKv}
                   onChange={(e) => handleInputChange('motorKv', e.target.value)}
                 />
              </div>

               <div>
                 <label className="block text-xs text-slate-500 mb-1">Prop Size (Inch)</label>
                 <input 
                   type="number"
                   className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-sm focus:border-indigo-500 outline-none"
                   placeholder="e.g. 15"
                   value={hardware.propSize}
                   onChange={(e) => handleInputChange('propSize', e.target.value)}
                 />
              </div>

              <div>
                 <label className="block text-xs text-slate-500 mb-1">ESC Amps</label>
                 <input 
                   type="number"
                   className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-sm focus:border-indigo-500 outline-none"
                   placeholder="e.g. 60"
                   value={hardware.escAmps}
                   onChange={(e) => handleInputChange('escAmps', e.target.value)}
                 />
              </div>
            </div>
          </div>

          {/* Log Data Input */}
          <div className="bg-slate-900 rounded-xl border border-slate-800 p-5 shadow-sm flex-1 flex flex-col">
            <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-2">Log Parameters & Files</h2>
            
            {/* Image/File Upload Area */}
            <div className="mb-4">
              <input 
                type="file" 
                ref={fileInputRef}
                accept=".log,.txt,.param,.bin,.jpg,.jpeg,.png,.webp" 
                onChange={handleFileSelect} 
                className="hidden" 
              />
              
              {!imagePreview ? (
                <div 
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-slate-700 rounded-lg p-6 flex flex-col items-center justify-center cursor-pointer hover:border-indigo-500 hover:bg-slate-800/50 transition-all group"
                >
                  <div className="bg-slate-800 p-3 rounded-full mb-3 group-hover:bg-slate-700 transition-colors">
                    <IconUpload />
                  </div>
                  <span className="text-xs font-medium text-slate-400 text-center">
                    Upload Log (.log/.txt), Param (.param),<br/>or Screenshot (Image)
                  </span>
                </div>
              ) : (
                <div className="relative rounded-lg overflow-hidden border border-slate-700">
                  <img src={imagePreview} alt="Log screenshot" className="w-full h-32 object-cover opacity-80" />
                  <div className="absolute top-2 right-2">
                    <button 
                      onClick={clearImage}
                      className="bg-black/50 hover:bg-red-500 text-white p-1 rounded-full backdrop-blur-sm transition-colors"
                    >
                      <IconX />
                    </button>
                  </div>
                  <div className="absolute bottom-0 left-0 right-0 bg-black/60 p-2 text-xs text-white truncate px-3">
                    {imageFile?.name}
                  </div>
                </div>
              )}
            </div>

            <textarea
              className="w-full flex-1 bg-slate-800/50 border border-slate-700 rounded-lg p-3 text-xs font-mono text-slate-300 focus:ring-1 focus:ring-indigo-500 focus:border-transparent outline-none resize-y min-h-[8rem]"
              placeholder="Content from text logs (.log, .txt) will appear here automatically after upload. You can also paste parameter lists manually."
              value={logData}
              onChange={(e) => setLogData(e.target.value)}
            />
            
            <button
              onClick={startAnalysis}
              disabled={isAnalyzing}
              className={`mt-4 w-full py-3 rounded-lg font-medium flex items-center justify-center gap-2 transition-all ${
                isAnalyzing 
                ? 'bg-slate-800 text-slate-400 cursor-wait' 
                : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/20'
              }`}
            >
              {isAnalyzing ? (
                <>
                  <div className="w-4 h-4 border-2 border-slate-400 border-t-transparent rounded-full animate-spin"></div>
                  Analyzing Data...
                </>
              ) : (
                <>
                  <IconAnalyze /> Analyze Log
                </>
              )}
            </button>
            {errorMsg && <p className="mt-2 text-xs text-red-400 text-center">{errorMsg}</p>}
          </div>

        </div>

        {/* Right Column: Results & Chat */}
        <div className="lg:col-span-8 flex flex-col h-[calc(100vh-8rem)]">
          
          {/* Analysis View */}
          <div className={`bg-slate-900 rounded-xl border border-slate-800 flex flex-col overflow-hidden shadow-sm transition-all duration-500 ${chatSession ? 'h-3/5' : 'h-full'}`}>
             <div className="p-4 border-b border-slate-800 bg-slate-900/50 flex justify-between items-center">
               <h3 className="font-semibold text-indigo-400 flex items-center gap-2">
                 <IconAnalyze /> Analysis Report
               </h3>
               {analysisResult && <span className="text-xs px-2 py-1 bg-green-500/10 text-green-400 border border-green-500/20 rounded-full">Analysis Complete</span>}
             </div>
             
             <div className="flex-1 overflow-y-auto p-6 bg-slate-900">
               {!analysisResult && !isAnalyzing ? (
                 <div className="h-full flex flex-col items-center justify-center text-slate-600 opacity-60">
                   <IconDrone />
                   <p className="mt-4 text-sm">Upload flight logs (files/images) to begin analysis.</p>
                 </div>
               ) : (
                 <div className="prose prose-invert prose-sm max-w-none">
                    {/* Simple Markdown rendering replacement since we don't have a library */}
                    {analysisResult ? (
                      analysisResult.split('\n').map((line, i) => {
                         if (line.startsWith('###')) return <h3 key={i} className="text-lg font-bold text-indigo-200 mt-4 mb-2">{line.replace('###', '')}</h3>
                         if (line.startsWith('**')) return <h4 key={i} className="font-bold text-white mt-3">{line.replace(/\*\*/g, '')}</h4>
                         if (line.startsWith('-')) return <li key={i} className="ml-4 text-slate-300">{line.substring(1)}</li>
                         return <p key={i} className="mb-2 text-slate-300 leading-relaxed">{line}</p>
                      })
                    ) : (
                      <div className="space-y-4 animate-pulse">
                        <div className="h-4 bg-slate-800 rounded w-3/4"></div>
                        <div className="h-4 bg-slate-800 rounded w-full"></div>
                        <div className="h-4 bg-slate-800 rounded w-5/6"></div>
                        <div className="h-32 bg-slate-800 rounded w-full mt-6"></div>
                      </div>
                    )}
                 </div>
               )}
             </div>
          </div>

          {/* Chat Interface - Only appears after analysis starts */}
          {chatSession && (
            <div className="mt-4 flex-1 bg-slate-900 rounded-xl border border-slate-800 flex flex-col shadow-sm overflow-hidden animate-fade-in">
              <div className="p-3 border-b border-slate-800 bg-slate-800/30">
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                  <IconChat /> Copilot Chat
                </h3>
              </div>
              
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {chatHistory.map((msg, idx) => (
                  <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[85%] rounded-lg p-3 text-sm leading-relaxed ${
                      msg.role === 'user' 
                      ? 'bg-indigo-600 text-white' 
                      : 'bg-slate-800 text-slate-200 border border-slate-700'
                    }`}>
                      {msg.text}
                    </div>
                  </div>
                ))}
                <div ref={chatEndRef}></div>
              </div>

              <div className="p-3 bg-slate-800/50 border-t border-slate-800">
                <form 
                  onSubmit={(e) => { e.preventDefault(); sendChatMessage(); }}
                  className="flex gap-2"
                >
                  <input
                    type="text"
                    className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-sm focus:border-indigo-500 outline-none text-white placeholder-slate-600"
                    placeholder="Ask about tuning, vibrations, or errors..."
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                  />
                  <button 
                    type="submit"
                    className="bg-slate-700 hover:bg-slate-600 text-white p-2 rounded-lg transition-colors"
                  >
                    <IconSend />
                  </button>
                </form>
              </div>
            </div>
          )}

        </div>
      </main>
    </div>
  );
};

const root = createRoot(document.getElementById("root")!);
root.render(<App />);
