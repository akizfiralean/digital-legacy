/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Plus, 
  Search, 
  LayoutGrid, 
  List, 
  Image as ImageIcon, 
  Mic, 
  Utensils, 
  Settings,
  X,
  History as HistoryIcon,
  Languages,
  Palette,
  ChevronRight,
  Star,
  Clock,
  HardDrive,
  LogOut,
  User as UserIcon,
  LogIn,
  Trash2,
  Play,
  Pause,
  Upload,
  ArrowRight,
  ArrowLeft
} from 'lucide-react';
import { useApp } from './AppContext';
import { SUPPORTED_LANGUAGES, Theme, Language, Memory, MemoryMedia } from './types';
import { db, signInWithGoogle, logout, handleFirestoreError, OperationType } from './firebase';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  addDoc, 
  serverTimestamp, 
  updateDoc, 
  doc, 
  deleteDoc,
  orderBy
} from 'firebase/firestore';

export default function MainContent() {
  const { t, setTheme, setLanguage, language, theme, user, loading: authLoading } = useApp();
  const [memories, setMemories] = useState<Memory[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'photo' | 'voice' | 'recipe'>('all');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [currentNav, setCurrentNav] = useState<'files' | 'timeline' | 'starred' | 'recent'>('files');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  // New Media States
  const [uploadedMedia, setUploadedMedia] = useState<MemoryMedia[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [recorder, setRecorder] = useState<MediaRecorder | null>(null);

  // Fetch real data from Firebase
  useEffect(() => {
    if (!user) {
      setMemories([]);
      return;
    }

    const memoriesRef = collection(db, 'memories');
    let q = query(memoriesRef, where('userId', '==', user.uid), orderBy('year', 'desc'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Memory[];
      setMemories(data);
      setLoading(false);
    }, (error) => {
      // If we get an index error, fallback to un-ordered query
      if (error.message.includes('requires an index')) {
        const fallbackQ = query(memoriesRef, where('userId', '==', user.uid));
        onSnapshot(fallbackQ, (snapshot) => {
           const data = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          })) as Memory[];
          setMemories(data);
          setLoading(false);
        });
      } else {
        handleFirestoreError(error, OperationType.LIST, 'memories');
      }
    });

    return () => unsubscribe();
  }, [user]);

  // Form state
  const [newMemory, setNewMemory] = useState({
    title: '',
    description: '',
    type: 'photo' as 'photo' | 'voice' | 'recipe',
    star: false,
    year: new Date().getFullYear(),
    author: user?.displayName || '',
  });

  useEffect(() => {
    if (user && !newMemory.author) {
      setNewMemory(prev => ({ ...prev, author: user.displayName || '' }));
    }
  }, [user]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const reader = new FileReader();
      reader.onloadend = () => {
        const type = file.type.startsWith('image') ? 'image' : 'audio';
        setUploadedMedia(prev => [...prev.slice(-20), { url: reader.result as string, type, name: file.name }]);
      };
      reader.readAsDataURL(file);
    }
  };

  const startRecording = async () => {
    setErrorMessage(null);
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error("Microphone access is not supported by your browser.");
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      const chunks: Blob[] = [];

      mediaRecorder.ondataavailable = (e) => chunks.push(e.data);
      mediaRecorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'audio/ogg; codecs=opus' });
        const reader = new FileReader();
        reader.onloadend = () => {
          setUploadedMedia(prev => [...prev, { url: reader.result as string, type: 'audio', name: `Recording ${new Date().toLocaleTimeString()}` }]);
        };
        reader.readAsDataURL(blob);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setRecorder(mediaRecorder);
      setIsRecording(true);
    } catch (err: any) {
      console.error("Recording error:", err);
      if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        setErrorMessage("Microphone tidak ditemukan. Silakan hubungkan mikrofon.");
      } else if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setErrorMessage("Izin mikrofon ditolak. Silakan izinkan akses di browser.");
      } else {
        setErrorMessage("Gagal merekam suara: " + err.message);
      }
    }
  };

  const stopRecording = () => {
    if (recorder) {
      recorder.stop();
      setIsRecording(false);
      setRecorder(null);
    }
  };

  const handleAddMemory = async () => {
    if (!newMemory.title || !newMemory.author || !user) {
      setErrorMessage("Judul dan Nama Pengirim harus diisi.");
      return;
    }
    
    setIsSaving(true);
    setErrorMessage(null);

    try {
      await addDoc(collection(db, 'memories'), {
        ...newMemory,
        userId: user.uid,
        media: uploadedMedia,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      setIsUploadOpen(false);
      setUploadedMedia([]);
      setNewMemory({
        title: '',
        description: '',
        type: 'photo',
        star: false,
        year: new Date().getFullYear(),
        author: user.displayName || '',
      });
    } catch (error: any) {
      console.error("Save error:", error);
      setErrorMessage("Gagal menyimpan memori. Pastikan ukuran file tidak terlalu besar (Max total 1MB).");
      handleFirestoreError(error, OperationType.CREATE, 'memories');
    } finally {
      setIsSaving(false);
    }
  };

  const toggleStar = async (id: string, currentStatus: boolean) => {
    try {
      const ref = doc(db, 'memories', id);
      await updateDoc(ref, {
        star: !currentStatus,
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `memories/${id}`);
    }
  };

  const deleteMemory = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'memories', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `memories/${id}`);
    }
  };

  const filteredMemories = memories.filter(m => {
    const matchesSearch = 
      m.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.author.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.year.toString().includes(searchQuery);
    const matchesFilter = filter === 'all' || m.type === filter;
    
    if (currentNav === 'starred') return matchesSearch && matchesFilter && (m as any).star;
    return matchesSearch && matchesFilter;
  });

  // Sorting based on view
  const sortedMemories = [...filteredMemories].sort((a, b) => {
    if (currentNav === 'timeline') return b.year - a.year;
    // For recent/others, sort by newest
    return b.year - a.year; 
  });

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg-primary)]">
        <div className="w-12 h-12 border-4 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[var(--bg-primary)] px-6">
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-md w-full text-center space-y-10"
        >
          <div className="inline-flex p-8 rounded-[3rem] bg-[var(--accent)] text-white shadow-2xl shadow-[var(--accent)]/30">
            <HardDrive size={72} />
          </div>
          <div className="space-y-4">
            <h1 className="font-serif text-5xl font-black tracking-tight">{t('login_title')}</h1>
            <p className="text-lg opacity-60 leading-relaxed font-medium italic">{t('login_desc')}</p>
          </div>
          
          <button 
            onClick={signInWithGoogle}
            className="w-full py-6 bg-[var(--accent)] text-white rounded-[2.5rem] font-black text-xl shadow-2xl shadow-[var(--accent)]/40 hover:scale-105 active:scale-95 transition-all flex items-center justify-center gap-4 group"
          >
            <LogIn size={24} className="group-hover:rotate-12 transition-transform" />
            {t('login_btn')}
          </button>

          <div className="pt-12 flex flex-wrap justify-center gap-3">
            {SUPPORTED_LANGUAGES.map(l => (
              <button 
                key={l.code} 
                onClick={() => setLanguage(l.code)}
                className={`px-3 py-1 text-[10px] font-black uppercase tracking-widest border-b-2 transition-all ${language === l.code ? 'border-[var(--accent)] text-[var(--accent)]' : 'border-transparent opacity-30 hover:opacity-100'}`}
              >
                {l.code}
              </button>
            ))}
          </div>
        </motion.div>
      </div>
    );
  }

  const SideBarItem = ({ id, icon: Icon, label }: { id: typeof currentNav, icon: any, label: string }) => (
    <button
      onClick={() => setCurrentNav(id)}
      className={`w-full flex items-center gap-4 px-4 py-3 rounded-xl transition-all ${
        currentNav === id 
          ? 'bg-[var(--accent)] text-white shadow-lg shadow-[var(--accent)]/20' 
          : 'hover:bg-[var(--border)] opacity-70'
      }`}
    >
      <Icon size={20} />
      <span className="font-medium text-sm">{label}</span>
      {currentNav === id && <ChevronRight size={14} className="ml-auto opacity-60" />}
    </button>
  );

  return (
    <div className="flex min-h-screen">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex w-72 flex-col bg-[var(--bg-primary)] border-r border-[var(--border)] sticky top-0 h-screen p-6">
        <div className="mb-10">
          <h1 className="font-serif text-3xl font-bold tracking-tight text-[var(--accent)]">{t('app_name')}</h1>
          <p className="text-[10px] opacity-50 tracking-[0.2em] font-bold uppercase mt-1">{t('app_slogan')}</p>
        </div>

        <nav className="flex-1 space-y-2">
          <SideBarItem id="files" icon={HardDrive} label={t('nav_files')} />
          <SideBarItem id="timeline" icon={HistoryIcon} label={t('nav_timeline')} />
          <SideBarItem id="starred" icon={Star} label={t('nav_starred')} />
          <SideBarItem id="recent" icon={Clock} label={t('nav_recent')} />
        </nav>

        <div className="mt-auto space-y-4">
          {/* User Info */}
          {user && (
            <div className="flex items-center gap-3 p-3 mb-2 rounded-2xl bg-[var(--accent)]/5 border border-[var(--accent)]/10">
              <div className="w-10 h-10 rounded-xl overflow-hidden border-2 border-[var(--accent)] shadow-sm">
                <img src={user.photoURL || `https://ui-avatars.com/api/?name=${user.displayName}`} alt={user.displayName || ''} className="w-full h-full object-cover" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-black uppercase tracking-widest text-[var(--accent)]">{user.displayName}</p>
                <button 
                  onClick={logout}
                  className="text-[9px] font-bold opacity-40 hover:opacity-100 flex items-center gap-1 transition-opacity uppercase"
                >
                  <LogOut size={10} /> {t('logout_btn')}
                </button>
              </div>
            </div>
          )}
          {/* Storage Indicator */}
          <div className="bg-[var(--card-bg)] border border-[var(--border)] p-4 rounded-2xl shadow-sm">
            <div className="flex justify-between items-center mb-2">
              <span className="text-[10px] font-bold uppercase opacity-50">{t('storage_label')}</span>
              <span className="text-[10px] font-bold text-[var(--accent)]">{t('storage_unlimited')}</span>
            </div>
            <div className="h-1.5 w-full bg-[var(--border)] rounded-full overflow-hidden">
              <div className="h-full bg-[var(--accent)] w-[5%] rounded-full animate-pulse" />
            </div>
            <p className="text-[9px] opacity-40 mt-2 font-mono">{t('storage_used')}</p>
          </div>

          <button 
            onClick={() => setIsSettingsOpen(true)}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-[var(--border)] hover:bg-[var(--border)] transition-all text-sm opacity-70"
          >
            <Settings size={18} /> {t('theme_label')}
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col">
        {/* Header / Search */}
        <header className="sticky top-0 z-30 bg-[var(--bg-primary)]/80 backdrop-blur-md border-b border-[var(--border)] px-6 py-4">
          <div className="max-w-6xl mx-auto flex items-center gap-6">
            <div className="lg:hidden">
              <h1 className="font-serif text-xl font-bold">{t('app_name')}</h1>
            </div>
            
            <div className="relative flex-1 group">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 opacity-40 group-focus-within:text-[var(--accent)] transition-colors" size={18} />
              <input 
                type="text" 
                placeholder={t('search_placeholder')}
                className="w-full pl-12 pr-4 py-3 pb-3 rounded-2xl bg-[var(--card-bg)] border border-[var(--border)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/30 transition-all shadow-sm"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            <div className="flex items-center gap-2">
              <button 
                onClick={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')}
                className="p-3 rounded-xl hover:bg-[var(--border)] transition-colors opacity-60"
                title={t(`view_${viewMode === 'grid' ? 'list' : 'grid'}`)}
              >
                {viewMode === 'grid' ? <List size={20} /> : <LayoutGrid size={20} />}
              </button>
              <button 
                onClick={() => setIsSettingsOpen(true)}
                className="lg:hidden p-3 rounded-xl hover:bg-[var(--border)] transition-colors opacity-60"
              >
                <Settings size={20} />
              </button>
            </div>
          </div>
        </header>

        {/* Filters and View */}
        <main className="max-w-6xl mx-auto w-full px-6 py-8">
          <div className="flex items-center justify-between mb-8 overflow-x-auto pb-2 no-scrollbar">
            <div className="flex gap-2">
              {(['all', 'photo', 'voice', 'recipe'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-5 py-2 rounded-full whitespace-nowrap text-xs font-bold uppercase tracking-widest transition-all ${
                    filter === f 
                      ? 'bg-[var(--accent)] text-white shadow-xl shadow-[var(--accent)]/10' 
                      : 'bg-transparent border border-[var(--border)] hover:border-[var(--accent)]/30'
                  }`}
                >
                  {t(`filter_${f === 'all' ? 'all' : f + 's'}`)}
                </button>
              ))}
            </div>
          </div>

          <div className="relative">
            {currentNav === 'timeline' && viewMode === 'grid' ? (
              /* Special Timeline UI */
              <div className="relative pl-12 lg:pl-0">
                <div className="absolute left-[3.4rem] lg:left-1/2 top-4 bottom-0 w-1 bg-[var(--border)] rounded-full -translate-x-1/2 opacity-30" />
                <div className="space-y-16">
                  {sortedMemories.map((memory, index) => (
                    <motion.div
                      key={memory.id}
                      initial={{ opacity: 0, y: 30 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      className={`relative flex flex-col md:flex-row items-center gap-10 md:gap-20 ${
                        index % 2 === 0 ? 'md:flex-row-reverse' : ''
                      }`}
                    >
                      <div className="absolute left-6 md:left-1/2 -translate-x-1/2 z-10 w-14 h-14 rounded-full bg-[var(--accent)] text-white flex flex-col items-center justify-center shadow-2xl border-[6px] border-[var(--bg-primary)] ring-1 ring-black/5">
                        <span className="text-[10px] font-bold opacity-70 leading-none">YEAR</span>
                        <span className="text-sm font-bold leading-none">{memory.year}</span>
                      </div>

                      <div className={`w-full md:w-[calc(50%-4rem)]`}>
                        <MemoryCard 
                          memory={memory} 
                          viewMode="grid" 
                          onToggleStar={() => toggleStar(memory.id, memory.star)} 
                          onDelete={() => deleteMemory(memory.id)}
                        />
                      </div>
                      <div className="hidden md:block w-[calc(50%-4rem)]" />
                    </motion.div>
                  ))}
                </div>
              </div>
            ) : viewMode === 'grid' ? (
              /* Drive Grid View */
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6">
                <AnimatePresence>
                      {sortedMemories.map((memory) => (
                        <motion.div 
                          key={memory.id}
                          layout
                          initial={{ scale: 0.9, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          exit={{ scale: 0.9, opacity: 0 }}
                        >
                          <MemoryCard 
                            memory={memory} 
                            viewMode="grid" 
                            onToggleStar={() => toggleStar(memory.id, memory.star)} 
                            onDelete={() => deleteMemory(memory.id)}
                          />
                        </motion.div>
                      ))}
                </AnimatePresence>
              </div>
            ) : (
              /* Drive List View */
              <div className="bg-[var(--card-bg)] rounded-3xl border border-[var(--border)] overflow-hidden shadow-sm">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-[var(--border)] bg-[var(--bg-primary)]/50">
                      <th className="px-6 py-4 text-[10px] font-bold uppercase opacity-50 tracking-wider">Name</th>
                      <th className="px-6 py-4 text-[10px] font-bold uppercase opacity-50 tracking-wider hidden md:table-cell">Author</th>
                      <th className="px-6 py-4 text-[10px] font-bold uppercase opacity-50 tracking-wider">Date</th>
                      <th className="px-6 py-4 w-16"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedMemories.map((memory) => (
                      <tr key={memory.id} className="border-b border-[var(--border)] hover:bg-[var(--border)]/30 transition-colors group">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-4">
                            <div className="w-10 h-10 rounded-lg bg-[var(--accent)]/10 flex items-center justify-center text-[var(--accent)]">
                              {memory.type === 'photo' && <ImageIcon size={20} />}
                              {memory.type === 'voice' && <Mic size={20} />}
                              {memory.type === 'recipe' && <Utensils size={20} />}
                            </div>
                            <div>
                              <p className="font-bold text-sm">{memory.title}</p>
                              <p className="text-[10px] opacity-40 uppercase tracking-widest">{memory.type}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 hidden md:table-cell text-sm opacity-70">{memory.author}</td>
                        <td className="px-6 py-4 text-sm opacity-50 font-mono italic">{memory.year}</td>
                         <td className="px-6 py-4 text-right">
                            <div className="flex justify-end gap-2">
                              <button 
                                onClick={() => deleteMemory(memory.id)}
                                className="p-2 opacity-0 group-hover:opacity-40 hover:opacity-100 hover:text-red-500 transition-all"
                              >
                                <Trash2 size={16} />
                              </button>
                              <button 
                                onClick={() => toggleStar(memory.id, memory.star)}
                                className={`p-2 transition-colors ${ memory.star ? 'text-yellow-500' : 'opacity-20 group-hover:opacity-100 hover:text-[var(--accent)]'}`}
                              >
                                <Star size={16} fill={memory.star ? "currentColor" : "none"} />
                              </button>
                            </div>
                         </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {sortedMemories.length === 0 && (
              <div className="text-center py-32 opacity-20">
            <HistoryIcon size={80} className="mx-auto mb-6" />
                <p className="text-xl font-serif italic">{t('no_memories')}</p>
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Floating Action Button (Mobile) */}
      <button
        onClick={() => setIsUploadOpen(true)}
        className="fixed bottom-8 right-8 w-16 h-16 rounded-full bg-[var(--accent)] text-white shadow-2xl flex items-center justify-center hover:scale-110 active:scale-95 transition-transform z-40 lg:w-20 lg:h-20"
      >
        <Plus size={36} />
      </button>

      {/* Reusable Components inside App to avoid scope issues */}
      <AnimatePresence>
        {isUploadOpen && (
          <UploadModal 
            t={t} 
            newMemory={newMemory} 
            setNewMemory={setNewMemory} 
            onClose={() => {
              setIsUploadOpen(false);
              setErrorMessage(null);
            }} 
            onSave={handleAddMemory} 
            uploadedMedia={uploadedMedia}
            setUploadedMedia={setUploadedMedia}
            handleFileChange={handleFileChange}
            isRecording={isRecording}
            startRecording={startRecording}
            stopRecording={stopRecording}
            errorMessage={errorMessage}
            isSaving={isSaving}
          />
        )}
        {isSettingsOpen && (
          <SettingsModal 
            t={t} 
            theme={theme} 
            language={language} 
            setTheme={setTheme} 
            setLanguage={setLanguage} 
            onClose={() => setIsSettingsOpen(false)} 
          />
        )}
      </AnimatePresence>

      {/* Custom styles for sidebar scroll/no-scrollbar */}
      <style>{`
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
    </div>
  );
}

// Sub-components for cleaner structure
function MemoryCard({ memory, viewMode, onToggleStar, onDelete }: { memory: Memory, viewMode: 'grid' | 'list', onToggleStar: () => void, onDelete: () => void }) {
  const { t } = useApp();
  const [activeMediaIndex, setActiveMediaIndex] = useState(0);
  const images = (memory.media || []).filter(m => m.type === 'image');
  const audios = (memory.media || []).filter(m => m.type === 'audio');
  const [isPlaying, setIsPlaying] = useState<string | null>(null);

  return (
    <div className="group bg-[var(--card-bg)] rounded-[2.5rem] border border-[var(--border)] overflow-hidden shadow-[0_4px_20px_rgba(0,0,0,0.02)] hover:shadow-[0_20px_40px_rgba(0,0,0,0.06)] hover:-translate-y-1 transition-all duration-500">
      <div className="relative">
        <div className="absolute top-6 right-6 z-10 flex gap-3">
          <button 
            onClick={onDelete}
            className="p-3 rounded-full bg-white/70 text-black/40 hover:bg-red-500 hover:text-white backdrop-blur-xl transition-all opacity-0 group-hover:opacity-100 shadow-lg"
          >
            <Trash2 size={18} />
          </button>
          <button 
            onClick={onToggleStar}
            className={`p-3 rounded-full backdrop-blur-xl transition-all shadow-lg ${
              memory.star ? 'bg-yellow-400 text-white' : 'bg-white/70 text-black/40 hover:bg-white hover:text-[var(--accent)]'
            }`}
          >
            <Star size={18} fill={memory.star ? "currentColor" : "none"} />
          </button>
        </div>

        {/* Gallery View */}
        {images.length > 0 ? (
          <div className="relative h-64 overflow-hidden bg-black/5">
            <AnimatePresence mode="wait">
              <motion.img 
                key={activeMediaIndex}
                src={images[activeMediaIndex].url} 
                alt={memory.title}
                initial={{ opacity: 0, scale: 1.1 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.6 }}
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
              />
            </AnimatePresence>
            
            {images.length > 1 && (
              <div className="absolute inset-x-0 bottom-6 flex justify-center gap-2 px-4">
                {images.map((_, idx) => (
                  <button 
                    key={idx}
                    onClick={() => setActiveMediaIndex(idx)}
                    className={`h-1.5 transition-all rounded-full ${idx === activeMediaIndex ? 'w-8 bg-white' : 'w-2 bg-white/30 hover:bg-white/50'}`}
                  />
                ))}
              </div>
            )}

            {images.length > 1 && (
              <>
                <button 
                  onClick={() => setActiveMediaIndex(prev => (prev === 0 ? images.length - 1 : prev - 1))}
                  className="absolute left-4 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/20 text-white opacity-0 group-hover:opacity-100 hover:bg-black/40 transition-all"
                >
                  <ArrowLeft size={20} />
                </button>
                <button 
                  onClick={() => setActiveMediaIndex(prev => (prev === images.length - 1 ? 0 : prev + 1))}
                  className="absolute right-4 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/20 text-white opacity-0 group-hover:opacity-100 hover:bg-black/40 transition-all"
                >
                  <ArrowRight size={20} />
                </button>
              </>
            )}
          </div>
        ) : (
          <div className="h-64 bg-[var(--accent)]/5 flex flex-col items-center justify-center p-12 text-center opacity-30">
            {memory.type === 'voice' ? <Mic size={64} className="mb-4" /> : <Utensils size={64} className="mb-4" />}
            <p className="text-xs font-black uppercase tracking-widest">{t(`type_${memory.type}`)}</p>
          </div>
        )}
      </div>

      <div className="p-8">
        <div className="flex items-center gap-3 mb-5">
          <div className="p-3 rounded-2xl bg-[var(--accent)]/10 text-[var(--accent)]">
            {memory.type === 'photo' && <ImageIcon size={20} />}
            {memory.type === 'voice' && <Mic size={20} />}
            {memory.type === 'recipe' && <Utensils size={20} />}
          </div>
          <span className="text-[10px] uppercase font-black tracking-widest opacity-40">{t(`type_${memory.type}`)}</span>
        </div>
        
        <h3 className="font-serif text-2xl font-bold tracking-tight mb-4 text-[var(--text-primary)]">{memory.title}</h3>
        <p className="text-sm opacity-60 leading-relaxed mb-8 line-clamp-3 font-medium">{memory.description}</p>
        
        {/* Audio Players */}
        {audios.length > 0 && (
          <div className="space-y-3 mb-8">
            {audios.map((audio, idx) => (
              <div key={idx} className="flex items-center gap-3 p-3 rounded-2xl bg-[var(--accent)]/5 border border-[var(--accent)]/10">
                <button 
                  onClick={() => {
                    const el = document.getElementById(`audio-${memory.id}-${idx}`) as HTMLAudioElement;
                    if (isPlaying === audio.url) {
                      el.pause();
                      setIsPlaying(null);
                    } else {
                      document.querySelectorAll('audio').forEach(a => a.pause());
                      el.play();
                      setIsPlaying(audio.url);
                    }
                  }}
                  className="w-10 h-10 rounded-full bg-[var(--accent)] text-white flex items-center justify-center shadow-lg hover:scale-105 active:scale-95 transition-transform"
                >
                  {isPlaying === audio.url ? <Pause size={16} /> : <Play size={16} fill="white" />}
                </button>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-black uppercase truncate opacity-50">{audio.name || `Recording ${idx + 1}`}</p>
                  <audio 
                    id={`audio-${memory.id}-${idx}`} 
                    src={audio.url} 
                    onEnded={() => setIsPlaying(null)}
                    onPause={() => setIsPlaying(null)}
                    className="hidden"
                  />
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between pt-6 border-t border-[var(--border)]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-[var(--accent)] flex items-center justify-center text-xs text-white font-black shadow-lg shadow-[var(--accent)]/20 uppercase">
              {memory.author.charAt(0)}
            </div>
            <span className="text-xs font-bold opacity-60">{memory.author}</span>
          </div>
          <div className="flex flex-col items-end">
             <span className="text-[10px] font-black italic opacity-30">{memory.year}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function UploadModal({ t, newMemory, setNewMemory, onClose, onSave, uploadedMedia, setUploadedMedia, handleFileChange, isRecording, startRecording, stopRecording, errorMessage, isSaving }: any) {
  return (
    <motion.div 
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-end md:items-center justify-center p-4 lg:p-0"
    >
      <motion.div 
        initial={{ y: 200, scale: 0.95 }} animate={{ y: 0, scale: 1 }} exit={{ y: 200, scale: 0.95 }}
        className="bg-[var(--bg-primary)] w-full max-w-xl rounded-[3rem] p-8 lg:p-10 shadow-huge border border-[var(--border)] overflow-hidden"
      >
        <div className="flex justify-between items-center mb-8">
          <h2 className="font-serif text-3xl font-bold italic">{t('upload_title')}</h2>
          <button onClick={onClose} disabled={isSaving} className="p-3 hover:bg-[var(--border)] rounded-full transition-colors disabled:opacity-20"><X size={24} /></button>
        </div>
        
        <div className="space-y-8 max-h-[65vh] overflow-y-auto pr-2 custom-scrollbar">
          {errorMessage && (
            <div className="p-4 bg-red-50 border border-red-100 text-red-600 rounded-2xl text-xs font-bold leading-relaxed animate-pulse">
              ⚠️ {errorMessage}
            </div>
          )}
          {/* Type Choice */}
          <div className="grid grid-cols-3 gap-3">
            {(['photo', 'voice', 'recipe'] as const).map((type) => (
              <button
                key={type}
                onClick={() => setNewMemory({ ...newMemory, type })}
                className={`p-4 rounded-[2rem] border-2 transition-all flex flex-col items-center gap-2 ${
                  newMemory.type === type 
                    ? 'border-[var(--accent)] bg-[var(--accent)]/5 text-[var(--accent)]' 
                    : 'border-[var(--border)] opacity-40 hover:opacity-100'
                }`}
              >
                {type === 'photo' && <ImageIcon size={24} />}
                {type === 'voice' && <Mic size={24} />}
                {type === 'recipe' && <Utensils size={24} />}
                <span className="text-[10px] font-black tracking-widest">{t(`type_${type}`)}</span>
              </button>
            ))}
          </div>

          {/* Media Upload Area */}
          <div className="space-y-4">
             <label className="text-[10px] font-black uppercase tracking-widest opacity-40 ml-2">Files & Recordings</label>
             <div className="grid grid-cols-2 gap-4">
                <label className="group relative flex flex-col items-center justify-center p-6 rounded-[2.5rem] border-2 border-dashed border-[var(--border)] hover:border-[var(--accent)] transition-all cursor-pointer bg-[var(--accent)]/[0.02]">
                  <Upload size={32} className="mb-2 opacity-20 group-hover:opacity-100 group-hover:scale-110 transition-all text-[var(--accent)]" />
                  <span className="text-[10px] font-black uppercase tracking-widest opacity-50 group-hover:opacity-100">{t('add_image')}</span>
                  <input type="file" multiple accept="image/*,audio/*" onChange={handleFileChange} className="hidden" />
                </label>

                <button 
                  onClick={isRecording ? stopRecording : startRecording}
                  className={`flex flex-col items-center justify-center p-6 rounded-[2.5rem] border-2 transition-all ${isRecording ? 'border-red-500 bg-red-50 text-red-500 animate-pulse' : 'border-dashed border-[var(--border)] hover:border-[var(--accent)] bg-[var(--accent)]/[0.02] text-[var(--accent)]'}`}
                >
                  <Mic size={32} className={`mb-2 ${isRecording ? 'scale-125' : 'opacity-20 hover:opacity-100'}`} />
                  <span className="text-[10px] font-black uppercase tracking-widest">{isRecording ? t('stop_recording') : t('add_voice')}</span>
                </button>
             </div>
             <p className="text-[9px] opacity-30 text-center px-4 mt-2">
               Firestore limit: 1MB per document. Use optimized photos for best results.
             </p>

             {/* Preview Grid */}
             {uploadedMedia.length > 0 && (
               <div className="grid grid-cols-4 gap-2 mt-4">
                  {uploadedMedia.map((media: any, idx: number) => (
                    <div key={idx} className="relative group aspect-square rounded-2xl overflow-hidden bg-black/5 border border-[var(--border)] shadow-sm">
                       {media.type === 'image' ? (
                         <img src={media.url} className="w-full h-full object-cover" />
                       ) : (
                         <div className="w-full h-full flex items-center justify-center bg-[var(--accent)]/10 text-[var(--accent)]">
                            <Mic size={16} />
                         </div>
                       )}
                       <button 
                        onClick={() => setUploadedMedia(uploadedMedia.filter((_: any, i: number) => i !== idx))}
                        className="absolute inset-0 bg-black/40 text-white opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity"
                       >
                         <Trash2 size={16} />
                       </button>
                    </div>
                  ))}
               </div>
             )}
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-widest opacity-40 ml-2">{t('title_label')}</label>
            <input 
              type="text" 
              className="w-full p-5 rounded-3xl bg-[var(--card-bg)] border border-[var(--border)] focus:ring-4 focus:ring-[var(--accent)]/10 outline-none transition-all font-medium text-lg placeholder:opacity-30 shadow-sm"
              placeholder="e.g. Grandma's Garden"
              value={newMemory.title}
              onChange={(e) => setNewMemory({ ...newMemory, title: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-widest opacity-40 ml-2">{t('desc_label')}</label>
            <textarea 
              rows={4}
              className="w-full p-5 rounded-3xl bg-[var(--card-bg)] border border-[var(--border)] focus:ring-4 focus:ring-[var(--accent)]/10 outline-none transition-all resize-none placeholder:opacity-30 shadow-sm"
              placeholder="Tell the story..."
              value={newMemory.description}
              onChange={(e) => setNewMemory({ ...newMemory, description: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest opacity-40 ml-2">{t('date_label')}</label>
              <input 
                type="number" 
                className="w-full p-5 rounded-3xl bg-[var(--card-bg)] border border-[var(--border)] focus:ring-4 focus:ring-[var(--accent)]/10 outline-none shadow-sm"
                value={newMemory.year}
                onChange={(e) => setNewMemory({ ...newMemory, year: parseInt(e.target.value) || new Date().getFullYear() })}
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest opacity-40 ml-2">{t('author_label')}</label>
              <input 
                type="text" 
                className="w-full p-5 rounded-3xl bg-[var(--card-bg)] border border-[var(--border)] focus:ring-4 focus:ring-[var(--accent)]/10 outline-none shadow-sm"
                value={newMemory.author}
                onChange={(e) => setNewMemory({ ...newMemory, author: e.target.value })}
              />
            </div>
          </div>
        </div>

        <div className="mt-10 flex gap-4">
          <button onClick={onClose} className="flex-1 py-5 rounded-3xl font-bold border-2 border-[var(--border)] hover:bg-[var(--border)] transition-all">
            {t('cancel')}
          </button>
          <button 
            disabled={!newMemory.title || !newMemory.author || isSaving}
            onClick={onSave} 
            className="flex-2 py-5 rounded-3xl font-black bg-[var(--accent)] text-white shadow-2xl shadow-[var(--accent)]/30 hover:scale-105 active:scale-95 transition-all disabled:opacity-30 disabled:hover:scale-100 flex items-center justify-center gap-3"
          >
            {isSaving && <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
            {isSaving ? 'Menyimpan...' : t('save')}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function SettingsModal({ t, theme, language, setTheme, setLanguage, onClose }: any) {
  return (
    <motion.div 
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-end md:items-center justify-center p-4"
    >
      <motion.div 
        initial={{ y: 100 }} animate={{ y: 0 }} exit={{ y: 100 }}
        className="bg-[var(--bg-primary)] w-full max-w-md rounded-[3rem] p-10 shadow-huge border border-[var(--border)]"
      >
        <div className="flex justify-between items-center mb-10">
          <h2 className="font-serif text-3xl font-bold">{t('theme_label')} & {t('lang_label')}</h2>
          <button onClick={onClose} className="p-3 hover:bg-[var(--border)] rounded-full"><X size={24} /></button>
        </div>

        <div className="space-y-10 max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
          <div>
            <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest opacity-40 mb-6 px-1">
              <Palette size={14} /> {t('theme_label')}
            </label>
            <div className="grid grid-cols-3 gap-4">
              {(['elegant-light', 'elegant-dark', 'vintage'] as Theme[]).map((tCode) => (
                <button
                  key={tCode}
                  onClick={() => setTheme(tCode)}
                  className={`aspect-square rounded-[2rem] border-2 transition-all p-4 flex flex-col items-center justify-center gap-3 ${
                    theme === tCode ? 'border-[var(--accent)] bg-[var(--accent)]/5 ring-4 ring-[var(--accent)]/5' : 'border-[var(--border)] opacity-60'
                  }`}
                >
                  <div className={`w-10 h-10 rounded-full border border-black/10 shadow-sm ${
                    tCode === 'elegant-light' ? 'bg-[#fcfaf7]' : tCode === 'elegant-dark' ? 'bg-[#1a1816]' : 'bg-[#f4ece1]'
                  }`} />
                  <span className="text-[10px] font-bold capitalize">{tCode.split('-').join(' ')}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest opacity-40 mb-6 px-1">
              <Languages size={14} /> {t('lang_label')}
            </label>
            <div className="grid grid-cols-2 gap-3">
              {SUPPORTED_LANGUAGES.map((lang) => (
                <button
                  key={lang.code}
                  onClick={() => setLanguage(lang.code)}
                  className={`flex items-center justify-between p-5 rounded-2xl border-2 transition-all ${
                    language === lang.code ? 'border-[var(--accent)] bg-[var(--accent)]/5 font-black text-[var(--accent)]' : 'border-[var(--border)] opacity-60'
                  }`}
                >
                  <span className="text-xs">{lang.name}</span>
                  {language === lang.code && <div className="w-2 h-2 rounded-full bg-[var(--accent)] shadow-lg shadow-[var(--accent)]" />}
                </button>
              ))}
            </div>
          </div>
        </div>

        <button onClick={onClose} className="w-full mt-10 py-5 bg-[var(--accent)] text-white rounded-[2rem] font-bold shadow-xl shadow-[var(--accent)]/20 hover:brightness-110 active:scale-95 transition-all">
          Done
        </button>
      </motion.div>
    </motion.div>
  );
}

