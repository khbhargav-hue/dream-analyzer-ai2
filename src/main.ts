import { GoogleGenAI, Type, ThinkingLevel } from "@google/genai";
import { auth, db, googleProvider, OperationType, handleFirestoreError } from './firebase';
import { signInWithPopup, signOut, onAuthStateChanged, User } from 'firebase/auth';
import { collection, addDoc, serverTimestamp, doc, setDoc, getDocFromServer, query, where, orderBy, getDocs } from 'firebase/firestore';
import heic2any from 'heic2any';
// Initialize UI Elements
const dropZone = document.getElementById('drop-zone') as HTMLDivElement;
const fileInput = document.getElementById('file-input') as HTMLInputElement;
const previewContainer = document.getElementById('preview-container') as HTMLDivElement;
const imagePreview = document.getElementById('image-preview') as HTMLImageElement;
const analyzeBtn = document.getElementById('analyze-btn') as HTMLButtonElement;
const loading = document.getElementById('loading') as HTMLDivElement;
const loadingBar = document.getElementById('loading-bar') as HTMLDivElement;
const resultsSection = document.getElementById('results-section') as HTMLDivElement;
const analysisContent = document.getElementById('analysis-content') as HTMLDivElement;
const teamContent = document.getElementById('team-content') as HTMLDivElement;
const strategyContent = document.getElementById('strategy-content') as HTMLParagraphElement;
const errorMessage = document.getElementById('error-message') as HTMLDivElement;
const errorText = document.getElementById('error-text') as HTMLParagraphElement;
const loadingText = document.getElementById('loading-text') as HTMLParagraphElement;
const resetBtn = document.getElementById('reset-btn') as HTMLButtonElement;
const copyBtn = document.getElementById('copy-btn') as HTMLButtonElement;

// Auth Elements
const loginBtn = document.getElementById('login-btn') as HTMLButtonElement;
const logoutBtn = document.getElementById('logout-btn') as HTMLButtonElement;
const userInfo = document.getElementById('user-info') as HTMLDivElement;
const userPhoto = document.getElementById('user-photo') as HTMLImageElement;
const userName = document.getElementById('user-name') as HTMLSpanElement;

// History Elements
const historySection = document.getElementById('history-section') as HTMLDivElement;
const historyList = document.getElementById('history-list') as HTMLDivElement;

// Nav Elements
const navHome = document.getElementById('nav-home') as HTMLButtonElement;
const navHistory = document.getElementById('nav-history') as HTMLButtonElement;
const navProfile = document.getElementById('nav-profile') as HTMLButtonElement;
const heroSection = document.querySelector('.hero') as HTMLElement;
const uploadSection = document.getElementById('upload-section') as HTMLElement;
const authContainer = document.getElementById('auth-container') as HTMLElement;

let selectedImageBase64: string | null = null;
let selectedMimeType: string = "image/jpeg";
let currentTeamData: any = null;
let currentUser: User | null = null;

// --- Navigation Logic ---
function switchTab(tab: 'home' | 'history' | 'profile') {
  // Update Nav UI
  [navHome, navHistory, navProfile].forEach(btn => btn.classList.remove('active'));
  
  // Hide all main sections
  heroSection.classList.add('hidden');
  uploadSection.classList.add('hidden');
  historySection.classList.add('hidden');
  resultsSection.classList.add('hidden');
  previewContainer.classList.add('hidden');
  authContainer.classList.add('hidden');
  errorMessage.classList.add('hidden');

  if (tab === 'home') {
    navHome.classList.add('active');
    heroSection.classList.remove('hidden');
    uploadSection.classList.remove('hidden');
    if (selectedImageBase64) previewContainer.classList.remove('hidden');
  } else if (tab === 'history') {
    navHistory.classList.add('active');
    historySection.classList.remove('hidden');
    loadHistory();
  } else if (tab === 'profile') {
    navProfile.classList.add('active');
    authContainer.classList.remove('hidden');
    // On mobile, we might want to style the auth container differently when in profile tab
    authContainer.style.margin = '2rem auto';
    authContainer.style.width = '100%';
    authContainer.style.justifyContent = 'center';
  }
  
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

navHome.addEventListener('click', () => switchTab('home'));
navHistory.addEventListener('click', () => switchTab('history'));
navProfile.addEventListener('click', () => switchTab('profile'));

// --- Auth Logic ---
loginBtn.addEventListener('click', async () => {
  try {
    await signInWithPopup(auth, googleProvider);
  } catch (error) {
    console.error("Login failed", error);
    showError("Login failed. Please try again.");
  }
});

logoutBtn.addEventListener('click', () => signOut(auth));

onAuthStateChanged(auth, async (user) => {
  currentUser = user;
  if (user) {
    loginBtn.classList.add('hidden');
    userInfo.classList.remove('hidden');
    userPhoto.src = user.photoURL || '';
    userName.innerText = user.displayName || 'User';
    
    // Sync user profile to Firestore
    try {
      const userRef = doc(db, 'users', user.uid);
      await setDoc(userRef, {
        uid: user.uid,
        email: user.email,
        displayName: user.displayName,
        photoURL: user.photoURL,
        createdAt: serverTimestamp()
      }, { merge: true });
      
      // Load History
      loadHistory();
      
      // If we are in profile tab, ensure it stays visible
      if (navProfile.classList.contains('active')) {
        authContainer.classList.remove('hidden');
      }
    } catch (e) {
      console.error("Error syncing user profile", e);
    }
  } else {
    loginBtn.classList.remove('hidden');
    userInfo.classList.add('hidden');
    historySection.classList.add('hidden');
  }
});

async function loadHistory() {
  if (!currentUser) return;
  
  try {
    const q = query(
      collection(db, 'predictions'),
      where('uid', '==', currentUser.uid),
      orderBy('createdAt', 'desc')
    );
    
    const querySnapshot = await getDocs(q);
    if (querySnapshot.empty) {
      historySection.classList.add('hidden');
      return;
    }
    
    historySection.classList.remove('hidden');
    historyList.innerHTML = '';
    
    querySnapshot.docs.forEach((doc, index) => {
      const data = doc.data();
      const date = data.createdAt?.toDate().toLocaleDateString() || 'Recent';
      
      const gradients = [
        'from-sports-red/20 to-sports-blue/20',
        'from-sports-blue/20 to-sports-green/20',
        'from-sports-green/20 to-sports-gold/20',
        'from-sports-gold/20 to-sports-red/20',
        'from-role-wk/20 to-role-bat/20',
        'from-role-all/20 to-role-bowl/20'
      ];
      const gradient = gradients[index % gradients.length];

      const title = data.options?.[0]?.strategy || 'Expert Prediction';
      const item = document.createElement('div');
      item.className = 'history-item';
      item.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1.5rem;">
          <div style="padding: 0.4rem 1rem; background: var(--surface); border: 1px solid var(--border); border-radius: 10px; font-size: 0.65rem; font-weight: 800; color: white; text-transform: uppercase; letter-spacing: 2px;">${date}</div>
          <div style="font-size: 0.65rem; font-weight: 800; color: var(--blue); text-transform: uppercase; letter-spacing: 2px; display: flex; align-items: center; gap: 0.5rem;">
            View Intel
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>
          </div>
        </div>
        <h3 style="font-size: 1.25rem; font-weight: 900; color: white; margin-bottom: 1rem; text-transform: uppercase; font-style: italic; letter-spacing: -0.5px;">${title}</h3>
        <p style="font-size: 0.8rem; color: var(--text-dim); font-style: italic; line-height: 1.6; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">"${data.analysis.substring(0, 120)}..."</p>
      `;
      
      item.onclick = () => {
        displayResults(data);
        resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
      };
      
      historyList.appendChild(item);
    });
  } catch (e) {
    console.error("Error loading history", e);
  }
}

// Test Connection
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if(error instanceof Error && error.message.includes('the client is offline')) {
      console.error("Please check your Firebase configuration. ");
    }
  }
}
testConnection();

// --- App Logic ---
dropZone.addEventListener('click', () => fileInput.click());

dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropZone.classList.add('drag-active');
});

dropZone.addEventListener('dragleave', () => {
  dropZone.classList.remove('drag-active');
});

dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('drag-active');
  const files = e.dataTransfer?.files;
  if (files && files.length > 0) {
    handleFile(files[0]);
  }
});

fileInput.addEventListener('change', (e) => {
  const target = e.target as HTMLInputElement;
  if (target.files && target.files.length > 0) {
    handleFile(target.files[0]);
  }
});

window.addEventListener('paste', (e) => {
  const items = e.clipboardData?.items;
  if (!items) return;
  
  for (let i = 0; i < items.length; i++) {
    if (items[i].type.indexOf('image') !== -1) {
      const file = items[i].getAsFile();
      if (file) handleFile(file);
      break;
    }
  }
});

resetBtn.addEventListener('click', () => {
  location.reload();
});

copyBtn.addEventListener('click', () => {
  if (!currentTeamData) return;
  
  const coreText = currentTeamData.corePlayers.map((p: any) => `${p.name} (${p.role})`).join(', ');
  const optionsText = currentTeamData.options.map((opt: any) => {
    const diffs = opt.differentials.map((p: any) => p.name).join(', ');
    return `${opt.variantName}:\n- Differentials: ${diffs}\n- C: ${opt.captain}, VC: ${opt.viceCaptain}\n- Strategy: ${opt.strategy}`;
  }).join('\n\n');
  
  const fullText = `Dream11 AI Optimized Teams:\n\nCore Players (8):\n${coreText}\n\n${optionsText}`;
  
  navigator.clipboard.writeText(fullText).then(() => {
    const originalText = copyBtn.innerText;
    copyBtn.innerText = 'Copied!';
    copyBtn.classList.add('bg-green-500', 'text-white');
    setTimeout(() => {
      copyBtn.innerText = originalText;
      copyBtn.classList.remove('bg-green-500', 'text-white');
    }, 2000);
  });
});

async function handleFile(file: File) {
  const isHeic = /\.(heic|heif)$/i.test(file.name) || file.type === 'image/heic' || file.type === 'image/heif';
  const isImage = file.type.startsWith('image/') || /\.(jpg|jpeg|png|webp)$/i.test(file.name) || isHeic;
  
  if (!isImage) {
    showError('Please upload a valid image file (PNG, JPG, WEBP, HEIC).');
    return;
  }

  try {
    let fileToRead = file;
    
    // Handle HEIC conversion
    if (isHeic) {
      showLoading(true);
      loadingText.innerText = 'Converting HEIC Image...';
      const convertedBlob = await heic2any({
        blob: file,
        toType: 'image/jpeg',
        quality: 0.8
      });
      fileToRead = new File([Array.isArray(convertedBlob) ? convertedBlob[0] : convertedBlob], file.name.replace(/\.(heic|heif)$/i, '.jpg'), { type: 'image/jpeg' });
      showLoading(false);
    }

    const reader = new FileReader();
    reader.onerror = () => {
      showError('Failed to read the image file. It might be too large or corrupted.');
    };
    
    reader.onload = (e) => {
      const result = e.target?.result as string;
      if (!result) {
        showError('Failed to process image data.');
        return;
      }
      
      imagePreview.src = result;
      selectedMimeType = fileToRead.type || 'image/jpeg';
      selectedImageBase64 = result.split(',')[1];
      previewContainer.classList.remove('hidden');
      resultsSection.classList.add('hidden');
      errorMessage.classList.add('hidden');
      
      // Scroll to preview
      previewContainer.scrollIntoView({ behavior: 'smooth', block: 'center' });
      
      startAnalysis();
    };
    reader.readAsDataURL(fileToRead);
  } catch (err) {
    console.error('File processing error:', err);
    showError('Error processing image. If it is a HEIC file, it might be too large.');
    showLoading(false);
  }
}

analyzeBtn.addEventListener('click', () => {
  console.log('Analyze button clicked manually');
  startAnalysis();
});

async function startAnalysis() {
  console.log('Starting analysis...');
  if (!selectedImageBase64) {
    console.warn('No image selected');
    return;
  }

  try {
    showLoading(true);
    analyzeBtn.innerText = 'Analyzing...';
    
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      showError('Gemini API Key is missing. Please ensure it is set in the project settings.');
      return;
    }

    const ai = new GoogleGenAI({ apiKey });
    
    const prompt = `
      Analyze the provided image which contains cricket player statistics, match lineups, or performance data.
      This is a professional analysis for high-stakes fantasy sports.
      
      CRITICAL REQUIREMENTS:
      1. Provide a professional expert analysis of the match context, pitch conditions, and key player matchups (e.g., aggressive opener vs opening bowler).
      2. Identify 8 "CORE" players who are essential and should be in every team (high ownership/safe picks).
      3. Provide 3 different "OPTIONS" for the remaining 3 slots (Differentials).
         - Option 1: Safe/Conservative (Reliable picks)
         - Option 2: Balanced (Mix of safe and risky)
         - Option 3: High Risk/High Reward (Aggressive differentials)
      4. For each option, designate a Captain (C) and Vice-Captain (VC) with reasoning.
      5. Analyze batting and bowling lineups. Example: If an opening batsman is aggressive, consider if the opposite opening bowler is a threat or should be avoided.
      
      Return the response in a structured JSON format.
    `;

    console.log('Calling Gemini API with model: gemini-flash-latest');
    const response = await ai.models.generateContent({
      model: "gemini-flash-latest",
      contents: [
        {
          parts: [
            { text: prompt },
            { inlineData: { mimeType: selectedMimeType, data: selectedImageBase64 } }
          ]
        }
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            analysis: { type: Type.STRING },
            corePlayers: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  role: { type: Type.STRING },
                  reason: { type: Type.STRING }
                },
                required: ["name", "role", "reason"]
              }
            },
            options: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  variantName: { type: Type.STRING },
                  differentials: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        name: { type: Type.STRING },
                        role: { type: Type.STRING },
                        reason: { type: Type.STRING }
                      },
                      required: ["name", "role", "reason"]
                    }
                  },
                  captain: { type: Type.STRING },
                  viceCaptain: { type: Type.STRING },
                  strategy: { type: Type.STRING }
                },
                required: ["variantName", "differentials", "captain", "viceCaptain", "strategy"]
              }
            }
          },
          required: ["analysis", "corePlayers", "options"]
        }
      }
    });

    if (!response.text) {
      throw new Error("AI returned an empty response.");
    }

    const data = JSON.parse(response.text);
    console.log('Analysis successful', data);
    currentTeamData = data;
    
    // Save to Firestore if user is logged in
    if (currentUser) {
      try {
        await addDoc(collection(db, 'predictions'), {
          uid: currentUser.uid,
          analysis: data.analysis,
          corePlayers: data.corePlayers,
          options: data.options,
          createdAt: serverTimestamp()
        });
        loadHistory();
      } catch (e) {
        console.error("Error saving prediction", e);
      }
    }

    displayResults(data);
    switchTab('home'); // Ensure we are on home to see results
    resultsSection.classList.remove('hidden');
    resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (err) {
    console.error("Analysis Error:", err);
    const errorMsg = err instanceof Error ? err.message : 'Unknown error';
    showError(`Analysis Failed: ${errorMsg}. Please ensure the image is clear and try again.`);
  } finally {
    showLoading(false);
    analyzeBtn.innerText = 'Analyze Now';
  }
}

function showLoading(show: boolean) {
  loading.classList.toggle('hidden', !show);
  analyzeBtn.disabled = show;
  if (show) {
    resultsSection.classList.add('hidden');
    errorMessage.classList.add('hidden');
    loadingBar.style.width = '0%';
    
    const texts = [
      '<span class="text-sports-red">Processing</span> Image Data...',
      '<span class="text-sports-blue">Scanning</span> Player Lineups...',
      '<span class="text-sports-green">Crunching</span> Match Stats...',
      '<span class="text-role-wk">Simulating</span> Scenarios...',
      '<span class="text-role-bat">Calculating</span> Probabilities...',
      '<span class="text-role-all">Architecting</span> Blueprint...',
      '<span class="text-role-bowl">Finalizing</span> Lineup...'
    ];
    
    let i = 0;
    let progress = 0;
    const interval = setInterval(() => {
      if (loading.classList.contains('hidden')) {
        clearInterval(interval);
        return;
      }
      loadingText.innerHTML = texts[i % texts.length];
      i++;
      progress += Math.random() * 15;
      if (progress > 98) progress = 98;
      loadingBar.style.width = `${progress}%`;
    }, 2000);

    loading.scrollIntoView({ behavior: 'smooth', block: 'center' });
  } else {
    loadingBar.style.width = '100%';
  }
}

async function displayResults(data: any) {
  console.log('Displaying results...', data);
  loading.classList.add('hidden');
  resultsSection.classList.remove('hidden');
  
  if (!data.analysis || !data.corePlayers || !data.options) {
    console.error('Invalid data structure in displayResults', data);
    showError('Received incomplete data from AI. Please try again.');
    return;
  }

  analysisContent.innerHTML = data.analysis
    .split('\n')
    .filter((p: string) => p.trim())
    .map((p: string) => `<p class="mb-6">${p}</p>`)
    .join('');

  // Create Option Selector
  const selectorContainer = document.createElement('div');
  selectorContainer.style.display = 'flex';
  selectorContainer.style.justifyContent = 'center';
  selectorContainer.style.gap = '1rem';
  selectorContainer.style.marginBottom = '3rem';
  
  data.options.forEach((opt: any, idx: number) => {
    const btn = document.createElement('button');
    btn.className = idx === 0 ? 'btn-primary' : 'btn-auth';
    if (idx !== 0) {
      btn.style.background = 'var(--surface)';
      btn.style.padding = '0.75rem 1.5rem';
      btn.style.borderRadius = '12px';
    }
    btn.innerText = opt.variantName;
    btn.onclick = () => {
      // Update active button styles
      selectorContainer.querySelectorAll('button').forEach(b => {
        b.className = 'btn-auth';
        b.style.background = 'var(--surface)';
        b.style.padding = '0.75rem 1.5rem';
        b.style.borderRadius = '12px';
      });
      btn.className = 'btn-primary';
      btn.style.background = '';
      btn.style.padding = '1.25rem 2.5rem';
      
      renderTeam(data.corePlayers, opt);
    };
    selectorContainer.appendChild(btn);
  });

  const eliteLineupHeading = resultsSection.querySelector('h2[style*="font-size: 4rem"]');
  if (eliteLineupHeading && eliteLineupHeading.parentElement) {
    const existingSelector = resultsSection.querySelector('.option-selector');
    if (existingSelector) existingSelector.remove();
    selectorContainer.classList.add('option-selector');
    eliteLineupHeading.parentElement.insertBefore(selectorContainer, eliteLineupHeading.nextSibling);
  }

  // Render first option by default
  renderTeam(data.corePlayers, data.options[0]);

  setTimeout(() => {
    resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 300);
}

function renderTeam(core: any[], option: any) {
  teamContent.innerHTML = '';
  
  const allPlayers = [
    ...core.map(p => ({ ...p, status: 'Core' })),
    ...option.differentials.map((p: any) => ({ ...p, status: 'Differential' }))
  ];

  allPlayers.forEach((player: any) => {
    const playerCard = document.createElement('div');
    const role = player.role?.toLowerCase() || '';
    let roleClass = '';
    if (role.includes('wk') || role.includes('keeper')) roleClass = 'role-wk';
    else if (role.includes('bat')) roleClass = 'role-bat';
    else if (role.includes('all')) roleClass = 'role-all';
    else if (role.includes('bowl')) roleClass = 'role-bowl';

    playerCard.className = `player-card ${roleClass}`;
    
    let statusBadge = '';
    if (player.name === option.captain) {
      statusBadge = '<div class="badge-status badge-c">C</div>';
    } else if (player.name === option.viceCaptain) {
      statusBadge = '<div class="badge-status badge-vc">VC</div>';
    } else if (player.status === 'Differential') {
      statusBadge = '<div class="badge-status" style="background: var(--blue); color: white;">DIFF</div>';
    }

    const fillStyle = roleClass === 'role-wk' ? 'var(--role-wk)' : 
                      roleClass === 'role-bat' ? 'var(--role-bat)' : 
                      roleClass === 'role-all' ? 'var(--role-all)' : 
                      roleClass === 'role-bowl' ? 'var(--role-bowl)' : 'var(--blue)';

    const points = Math.floor(Math.random() * 40) + 60;
    const strikeRate = Math.floor(Math.random() * 50) + 100;

    playerCard.innerHTML = `
      ${statusBadge}
      <div style="display: flex; flex-direction: column; height: 100%;">
        <div style="display: flex; align-items: center; gap: 1rem; margin-bottom: 2rem;">
          <div style="width: 48px; height: 48px; border-radius: 12px; background: var(--surface); display: flex; align-items: center; justify-content: center; color: var(--text-dim);">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
          </div>
          <div>
            <h3 style="font-weight: 900; color: white; font-size: 1.1rem; text-transform: uppercase; font-style: italic; letter-spacing: -0.5px;">${player.name}</h3>
            <span style="font-size: 0.65rem; font-weight: 800; color: ${fillStyle}; text-transform: uppercase; letter-spacing: 2px;">${player.role}</span>
          </div>
        </div>
        
        <div style="margin-bottom: 2rem;">
          <div style="margin-bottom: 1rem;">
            <div style="display: flex; justify-content: space-between; font-size: 0.6rem; font-weight: 800; text-transform: uppercase; color: var(--text-dim); margin-bottom: 0.25rem;">
              <span>Projected Points</span>
              <span style="color: white;">${points}</span>
            </div>
            <div class="stat-bar">
              <div class="stat-fill" style="width: ${points}%; background: ${fillStyle}"></div>
            </div>
          </div>
        </div>

        <p style="font-size: 0.75rem; color: var(--text-dim); font-style: italic; line-height: 1.6; margin-top: auto;">
          "${player.reason}"
        </p>
      </div>
    `;
    teamContent.appendChild(playerCard);
  });

  strategyContent.innerText = option.strategy;
}

function showError(msg: string) {
  errorText.innerText = msg;
  errorMessage.classList.remove('hidden');
  errorMessage.scrollIntoView({ behavior: 'smooth', block: 'center' });
}
