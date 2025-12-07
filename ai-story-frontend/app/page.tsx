"use client";

import { useState, useEffect, useRef } from "react";

interface StoryResponse {
  title: string;
  content: string;
  next_choices: string[];
}

export default function Home() {
  const [premise, setPremise] = useState("");
  const [genre, setGenre] = useState("Fantasy");
  const [currentSegment, setCurrentSegment] = useState<StoryResponse | null>(null);
  const [fullStoryHistory, setFullStoryHistory] = useState<string>(""); 
  
  // IMAGES
  const [currentImage, setCurrentImage] = useState<string | null>(null);
  const [imageError, setImageError] = useState<boolean>(false);
  
  // AUDIO STATE
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoiceName, setSelectedVoiceName] = useState<string>("");
  
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const synth = useRef<SpeechSynthesis | null>(null);
  
  // NEW: Track exactly where the voice is (Character Index)
  const progressRef = useRef<number>(0);

  // Initialize Speech Engine & Load Voices
  useEffect(() => {
    if (typeof window !== "undefined") {
      synth.current = window.speechSynthesis;
      
      const loadVoices = () => {
        const availableVoices = synth.current?.getVoices() || [];
        setVoices(availableVoices);
        
        if (availableVoices.length > 0 && !selectedVoiceName) {
            const preferred = availableVoices.find(v => v.name.includes("Google US English")) 
                           || availableVoices.find(v => v.name.includes("Zira"))
                           || availableVoices[0];
            setSelectedVoiceName(preferred.name);
        }
      };

      loadVoices();
      if (window.speechSynthesis.onvoiceschanged !== undefined) {
        window.speechSynthesis.onvoiceschanged = loadVoices;
      }
    }
  }, [selectedVoiceName]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [fullStoryHistory]);

  const generateNewImage = (segment: StoryResponse, currentGenre: string) => {
    const shortTitle = segment.title.split(" ").slice(0, 5).join(" ");
    const cleanTitle = shortTitle.replace(/[^a-zA-Z0-9 ]/g, "");
    const randomSeed = Math.floor(Math.random() * 99999);
    const prompt = `${currentGenre} style art ${cleanTitle} cinematic lighting 8k detailed ${randomSeed}`;
    const url = `http://127.0.0.1:8000/image-proxy?prompt=${encodeURIComponent(prompt)}`;
    console.log("Requesting Image via Proxy:", url);
    return url;
  };

  // UPDATED: Now supports starting from a specific character index
  const speakText = (text: string, startIndex = 0, forcePlay = false) => {
    if ((isMuted && !forcePlay) || !synth.current) return;

    // 1. Cancel whatever is currently playing
    synth.current.cancel();

    // 2. Slice the text so we only speak what is LEFT
    const remainingText = text.slice(startIndex);
    if (!remainingText.trim()) return;

    const utterance = new SpeechSynthesisUtterance(remainingText);
    const voice = voices.find(v => v.name === selectedVoiceName);
    if (voice) utterance.voice = voice;

    utterance.pitch = 0.9; 
    utterance.rate = 0.9; 

    // 3. TRACK PROGRESS: Every time a word is spoken, update our ref
    utterance.onboundary = (event) => {
        // We add the 'startIndex' because the event only knows about the *current* slice
        progressRef.current = startIndex + event.charIndex;
    };

    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => {
        setIsSpeaking(false);
        // If we finished naturally, reset progress for next time
        progressRef.current = 0; 
    };

    synth.current.speak(utterance);
  };

  async function generateStory(prompt: string, isContinuation: boolean) {
    setLoading(true);
    if (synth.current) synth.current.cancel();

    const contextToSend = isContinuation ? fullStoryHistory : "";
    
    try {
      const res = await fetch("https://story-teller-ai.onrender.com", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
            premise: prompt, 
            genre: genre,
            context: contextToSend
        }),
      });

      if (!res.ok) throw new Error("Backend failed");

      const data = await res.json();
      setCurrentSegment(data);
      
      setImageError(false);
      const newImageUrl = generateNewImage(data, genre);
      setCurrentImage(newImageUrl);

      if (isContinuation) {
        setFullStoryHistory(prev => prev + "\n\n" + data.content);
      } else {
        setFullStoryHistory(data.content);
      }

      // NEW CHAPTER: Reset progress and start from 0
      progressRef.current = 0;
      speakText(data.content, 0);

    } catch (err) {
      console.error(err);
      alert("Failed to generate story.");
    } finally {
      setLoading(false);
    }
  }

  const handleStart = () => generateStory(premise, false);
  const handleChoice = (choice: string) => generateStory(choice, true);

  const resetStory = () => {
    if (synth.current) synth.current.cancel();
    setCurrentSegment(null);
    setFullStoryHistory("");
    setPremise("");
    setCurrentImage(null);
    setImageError(false);
    progressRef.current = 0;
  };

  const toggleMute = () => {
    const nextStateIsMuted = !isMuted;
    setIsMuted(nextStateIsMuted);

    if (nextStateIsMuted) {
      // MUTE: Stop speaking, but DO NOT reset 'progressRef'
      // We want to remember where we stopped.
      synth.current?.cancel();
      setIsSpeaking(false);
    } else {
      // UNMUTE: Resume from the saved index!
      if (currentSegment) {
        speakText(currentSegment.content, progressRef.current, true);
      }
    }
  };

  return (
    <main className="min-h-screen bg-black text-gray-100 p-4 md:p-8 font-sans">
      <div className="max-w-4xl mx-auto space-y-8">
        
        <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <h1 className="text-3xl md:text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-600 tracking-tighter">
            AI Story Architect
            </h1>
            
            <div className="flex items-center gap-3">
                <select 
                    value={selectedVoiceName}
                    onChange={(e) => setSelectedVoiceName(e.target.value)}
                    className="bg-gray-800 text-xs md:text-sm border border-gray-700 rounded-lg p-2 md:p-3 max-w-[150px] md:max-w-[200px] outline-none focus:border-purple-500"
                >
                    {voices.map((v) => (
                        <option key={v.name} value={v.name}>
                            {v.name.replace("Microsoft", "").replace("Google", "").substring(0, 20)}...
                        </option>
                    ))}
                </select>

                <button 
                    onClick={toggleMute}
                    className={`p-2 md:p-3 rounded-full border ${isMuted ? 'border-red-500 text-red-500' : 'border-green-500 text-green-500'} hover:bg-gray-800 transition-all text-xs md:text-sm font-bold w-24`}
                >
                    {isMuted ? "🔇 Pause" : "🔊 Play"}
                </button>
            </div>
        </div>

        {!fullStoryHistory && (
          <div className="bg-gray-900/50 backdrop-blur-sm p-8 rounded-2xl border border-gray-800 shadow-2xl ring-1 ring-white/10">
            <div className="flex flex-col gap-6">
              <div className="flex flex-col gap-2">
                <label className="text-xs font-bold text-gray-400 uppercase tracking-widest">Genre</label>
                <select 
                  value={genre}
                  onChange={(e) => setGenre(e.target.value)}
                  className="bg-gray-800 border border-gray-700 rounded-lg p-4 focus:ring-2 focus:ring-purple-500 outline-none transition-all"
                >
                  <option>Fantasy</option>
                  <option>Sci-Fi</option>
                  <option>Cyberpunk</option>
                  <option>Horror</option>
                  <option>Noir Mystery</option>
                </select>
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-xs font-bold text-gray-400 uppercase tracking-widest">Story Premise</label>
                <textarea
                  value={premise}
                  onChange={(e) => setPremise(e.target.value)}
                  placeholder="e.g. A chef finds a dragon egg in the walk-in fridge..."
                  className="bg-gray-800 border border-gray-700 rounded-lg p-4 h-40 focus:ring-2 focus:ring-purple-500 outline-none resize-none transition-all"
                />
              </div>

              <button
                onClick={handleStart}
                disabled={loading || !premise}
                className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white font-bold py-4 rounded-lg transition-all transform hover:scale-[1.02] disabled:opacity-50 disabled:scale-100 shadow-lg shadow-purple-900/20"
              >
                {loading ? "Dreaming..." : "Begin Adventure"}
              </button>
            </div>
          </div>
        )}

        {fullStoryHistory && (
          <div className="space-y-8 animate-in fade-in zoom-in duration-500">
            
            <div className="bg-gray-900 rounded-2xl border border-gray-800 overflow-hidden shadow-2xl">
              
              {currentImage && (
                <div className="relative w-full h-64 md:h-96 bg-gray-800 overflow-hidden group">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img 
                    src={imageError ? `https://loremflickr.com/1024/512/${genre}?lock=42` : currentImage} 
                    alt="Scene Illustration"
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                    onError={(e) => {
                        console.error("AI Image failed to load. Switching to fallback.");
                        setImageError(true);
                    }}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-gray-900 to-transparent opacity-90" />
                  <h2 className="absolute bottom-6 left-8 text-3xl md:text-4xl font-bold text-white shadow-black drop-shadow-lg">
                    {currentSegment?.title}
                  </h2>
                </div>
              )}
              
              {imageError && (
                 <div className="bg-orange-900/50 p-2 text-center text-xs text-orange-200">
                    ⚠️ Using Stock Photo (Network/API Limit Reached)
                 </div>
              )}

              <div className="p-8 md:p-10">
                <div className="prose prose-invert max-w-none">
                  <p className="text-lg md:text-xl leading-relaxed text-gray-300 font-serif whitespace-pre-wrap">
                    {fullStoryHistory}
                  </p>
                </div>
              </div>
              
              <div ref={scrollRef} />
            </div>

            {currentSegment && (
              <div className="grid gap-4 md:grid-cols-1">
                {currentSegment.next_choices.map((choice, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleChoice(choice)}
                    disabled={loading}
                    className="w-full text-left p-6 bg-gray-800 hover:bg-gray-750 border border-gray-700 hover:border-purple-500 rounded-xl transition-all group shadow-lg"
                  >
                    <span className="text-purple-400 font-bold mr-3 text-lg group-hover:text-purple-300">
                      {idx + 1}.
                    </span>
                    <span className="text-gray-200 text-lg group-hover:text-white">
                      {choice}
                    </span>
                  </button>
                ))}
              </div>
            )}
            
            <button 
              onClick={resetStory} 
              className="text-gray-600 hover:text-red-400 text-sm w-full text-center mt-8 transition-colors"
            >
              End Adventure & Restart
            </button>
          </div>
        )}
      </div>
    </main>
  );
}