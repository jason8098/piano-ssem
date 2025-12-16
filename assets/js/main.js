// --- 1. 전역 변수 및 상수 정의 ---
const canvas = document.getElementById('pianoCanvas');
const ctx = canvas.getContext('2d');
const statusMsg = document.getElementById('status-msg');
const playBtn = document.getElementById('btn-play');
const gameContainer = document.getElementById('game-container');
const gameWrapper = document.getElementById('game-wrapper'); 
const zoomLevelDisplay = document.getElementById('zoom-level');
const midiInput = document.getElementById('midi-input');
const sectionSelect = document.getElementById('sel-section');
const sampleSelect = document.getElementById('sel-sample');
const controlsDiv = document.getElementById('controls');
const speedRange = document.getElementById('rng-speed');
const speedText = document.getElementById('txt-speed');
const midiStatusIcon = document.getElementById('midi-status-icon');
const fileNameDisplay = document.getElementById('file-name-display');

// 캔버스 설정
// [최적화] 태블릿 등 고해상도 기기에서 성능 저하를 막기 위해 DPR을 최대 2로 제한
let dpr = Math.min(window.devicePixelRatio || 1, 2);
let logicalWidth = 800;
let logicalHeight = 600;

// 게임 설정
const fallingSpeed = 200; 
const startOffset = 2.0; 
const startNote = 21; 
const endNote = 108;
const SPLIT_NOTE = 60; 
const BLACK_KEY_WIDTH_RATIO = 0.72 * 1.2; 
const BLACK_KEY_HEIGHT_RATIO = 0.54 * 1.2;
const keyHeight = 100;

// 상태 변수
let currentZoom = 100;
let baseWidth = 1000; 
let audioCtx = null;
let masterGain = null;
let isPlaying = false;
let isPaused = false;
let pauseTime = 0;
let startTime = 0;
let animationId;
let speed = 1.0;
let currentLoop = 0;
let loopCount = 0;

// Tone.js Piano Sampler
const piano = new Tone.Sampler({
    urls: {
        A0: "A0.mp3", C1: "C1.mp3", "D#1": "Ds1.mp3", "F#1": "Fs1.mp3",
        A1: "A1.mp3", C2: "C2.mp3", "D#2": "Ds2.mp3", "F#2": "Fs2.mp3",
        A2: "A2.mp3", C3: "C3.mp3", "D#3": "Ds3.mp3", "F#3": "Fs3.mp3",
        A3: "A3.mp3", C4: "C4.mp3", "D#4": "Ds4.mp3", "F#4": "Fs4.mp3",
        A4: "A4.mp3", C5: "C5.mp3", "D#5": "Ds5.mp3", "F#5": "Fs5.mp3",
        A5: "A5.mp3", C6: "C6.mp3", "D#6": "Ds6.mp3", "F#6": "Fs6.mp3",
        A6: "A6.mp3", C7: "C7.mp3", "D#7": "Ds7.mp3", "F#7": "Fs7.mp3",
        A7: "A7.mp3", C8: "C8.mp3"
    },
    release: 1,
    baseUrl: "https://tonejs.github.io/audio/salamander/"
}).toDestination();

let notes = []; 
let currentSection = null; 
let songDuration = 0;
let isDefaultSong = false;
let currentSongSections = []; // 현재 곡의 구간 정보

let measureTimes = []; 
let detectedTimeSignature = [4, 4]; 
let detectedBpm = 120; 

// MIDI 입력 상태
let currentPressedNotes = []; 
let nextNoteIndex = 0; 
const timingTolerance = 0.2; 
let score = { correct: 0, missed: 0, total: 0 };
const midiOutputs = []; 
const midiInputs = [];

const COLORS = {
    RED: '#ff4444',
    YELLOW: '#ffeb3b',
    GREEN: '#00e676',
    BLUE: '#536dfe',
    PURPLE: '#d05ce3',
    MISS: '#ff1493', 
    CORRECT: '#00d2ff' 
};

const FINGER_COLOR_MAP = {
    1: COLORS.RED, 2: COLORS.YELLOW, 3: COLORS.GREEN, 4: COLORS.BLUE, 5: COLORS.PURPLE
};

// 왼손용 컬러맵 (5번이 빨강, 1번이 보라)
const LEFT_FINGER_COLOR_MAP = {
    5: COLORS.RED, 4: COLORS.YELLOW, 3: COLORS.GREEN, 2: COLORS.BLUE, 1: COLORS.PURPLE
};

const FINGER_OFFSETS = { 1: -4, 2: -2, 3: 0, 4: 2, 5: 4 };

const BYPASS_CHANNEL_MAP = {
    0: { hand: 'left', finger: 1, color: LEFT_FINGER_COLOR_MAP[1] },
    1: { hand: 'left', finger: 2, color: LEFT_FINGER_COLOR_MAP[2] },
    2: { hand: 'left', finger: 3, color: LEFT_FINGER_COLOR_MAP[3] },
    3: { hand: 'left', finger: 4, color: LEFT_FINGER_COLOR_MAP[4] },
    4: { hand: 'left', finger: 5, color: LEFT_FINGER_COLOR_MAP[5] },
    5: { hand: 'right', finger: 1, color: FINGER_COLOR_MAP[1] },
    6: { hand: 'right', finger: 2, color: FINGER_COLOR_MAP[2] },
    7: { hand: 'right', finger: 3, color: FINGER_COLOR_MAP[3] },
    8: { hand: 'right', finger: 4, color: FINGER_COLOR_MAP[4] },
    10: { hand: 'right', finger: 5, color: FINGER_COLOR_MAP[5] }
};

const noteNamesList = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const flatNoteNamesList = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

// --- 샘플 곡 데이터 (내장) ---
// (Removed default songs as requested)



// --- 2. 유틸리티 및 헬퍼 함수 ---

function getNoteName(midi) { return noteNamesList[midi % 12]; }
function getFlatNoteName(midi) { return flatNoteNamesList[midi % 12]; }
function midiToFreq(note) { return 440 * Math.pow(2, (note - 69) / 12); }

function isWhiteKey(midi) {
    const note = midi % 12;
    return [0, 2, 4, 5, 7, 9, 11].includes(note);
}

let totalWhiteKeys = 0;
for(let i = startNote; i < endNote; i++) {
    if(isWhiteKey(i)) totalWhiteKeys++;
}

function getNoteX(midi) {
    const keyW = logicalWidth / totalWhiteKeys;
    let whiteKeyCount = 0;
    for(let i = startNote; i < midi; i++) {
        if(isWhiteKey(i)) whiteKeyCount++;
    }
    if (!isWhiteKey(midi)) {
        return (whiteKeyCount * keyW) - (keyW * (BLACK_KEY_WIDTH_RATIO / 2)); 
    }
    return whiteKeyCount * keyW;
}

class HandState {
    constructor() {
        this.center = null;
        this.fingerEndTimes = { 1:0, 2:0, 3:0, 4:0, 5:0 };
    }
}

function chooseFinger(noteMidi, noteStartTime, noteDuration, handState) {
    let candidates = [];
    for (let f = 1; f <= 5; f++) {
        let offset = FINGER_OFFSETS[f];
        let candidateCenter = noteMidi - offset;
        let cost = 0;
        if (handState.center !== null) cost = Math.abs(candidateCenter - handState.center);
        candidates.push({ cost: cost, finger: f, center: candidateCenter });
    }
    candidates.sort((a, b) => a.cost - b.cost);
    let chosen = null;
    for (let c of candidates) {
        if (handState.fingerEndTimes[c.finger] <= noteStartTime + 0.05) {
            chosen = c;
            break;
        }
    }
    if (!chosen) chosen = candidates[0];
    handState.center = chosen.center;
    handState.fingerEndTimes[chosen.finger] = noteStartTime + noteDuration;
    return chosen.finger;
}

// --- 3. Web MIDI API 처리 ---

if (navigator.requestMIDIAccess) {
    navigator.requestMIDIAccess().then(onMIDISuccess, onMIDIFailure);
} else {
    midiStatusIcon.style.color = '#ff4757';
    midiStatusIcon.title = 'MIDI API를 지원하지 않는 브라우저입니다.';
}

function onMIDIFailure() {
    midiStatusIcon.style.color = '#ff4757';
    midiStatusIcon.title = 'MIDI 장치 연결 실패';
}

function onMIDISuccess(midiAccess) {
    midiAccess.onstatechange = onStateChange;
    updateMIDIStatus(midiAccess);
}

function onStateChange(event) {
    updateMIDIStatus(event.target);
}

function updateMIDIStatus(midiAccess) {
    midiInputs.length = 0;
    midiOutputs.length = 0;
    midiAccess.inputs.forEach(input => {
        midiInputs.push(input);
        input.onmidimessage = onMIDIMessage;
    });
    midiAccess.outputs.forEach(output => midiOutputs.push(output));

    if (midiInputs.length > 0) {
        midiStatusIcon.style.color = COLORS.GREEN;
        midiStatusIcon.title = `MIDI 입력 장치 연결됨: ${midiInputs.map(i => i.name).join(', ')}`;
    } else {
        midiStatusIcon.style.color = COLORS.YELLOW;
        midiStatusIcon.title = 'MIDI 입력 장치가 감지되지 않았습니다.';
    }
}

function onMIDIMessage(event) {
    const command = event.data[0];
    const note = event.data[1];
    // const velocity = event.data[2]; 

    if (command >= 144 && command <= 159 && event.data[2] > 0) { // Note On
        handleNoteOn(note);
    } else if ((command >= 128 && command <= 143) || (command >= 144 && command <= 159 && event.data[2] === 0)) { // Note Off
        handleNoteOff(note);
    }
}

function handleNoteOn(note) {
    currentPressedNotes.push({ note: note, time: audioCtx ? audioCtx.currentTime : 0, color: '#aaa' });

    if (isPlaying && nextNoteIndex < notes.length) {
        const currentTime = getCurrentTime();
        const targetNote = notes[nextNoteIndex];
        
        const timeDiff = Math.abs(targetNote.startTime - currentTime);
        
        if (timeDiff <= timingTolerance) {
            if (note === targetNote.note) {
                targetNote.played = true; 
                targetNote.scoreStatus = 'correct';
                targetNote.color = COLORS.CORRECT; 
                score.correct++;
                nextNoteIndex++; 
            } else {
                score.missed++;
                targetNote.scoreStatus = 'missed'; 
                targetNote.color = COLORS.MISS; 
                const pressedNote = currentPressedNotes.find(n => n.note === note);
                if (pressedNote) pressedNote.color = COLORS.MISS;
            }
        }
    }
    
    if (isPaused) {
        drawGame(getCurrentTime());
    } else if (!isPlaying) {
        const keyVisuals = {};
        currentPressedNotes.forEach(n => {
            keyVisuals[n.note] = { status: 2, color: n.color || COLORS.CORRECT, source: 'input' };
        });
        drawKeyboard(keyVisuals);
    }
}

function handleNoteOff(note) {
    currentPressedNotes = currentPressedNotes.filter(n => n.note !== note);
    
    if (isPaused) {
        drawGame(getCurrentTime());
    } else if (!isPlaying) {
        const keyVisuals = {};
        currentPressedNotes.forEach(n => {
            keyVisuals[n.note] = { status: 2, color: n.color || COLORS.CORRECT, source: 'input' };
        });
        drawKeyboard(keyVisuals);
    }
}

// --- 4. MIDI 파일 파싱 및 로직 ---

midiInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
        const file = e.target.files[0];
        fileNameDisplay.innerText = file.name;
        fileNameDisplay.style.display = 'inline-block';
        
        const reader = new FileReader();
        reader.onload = function(event) {
            try {
                const midi = new Midi(event.target.result);
                isDefaultSong = false;
                parseMidi(midi);
            } catch (err) {
                alert("MIDI 파일 파싱 실패: " + err.message);
            }
        };
        reader.readAsArrayBuffer(file);
    }
});

// (Removed loadInternalSong as requested)

// 샘플 목록 자동 로드 (서버 환경 필요)
async function loadSampleList() {
    try {
        const response = await fetch('samples/');
        if (!response.ok) throw new Error('Directory listing not available');
        
        const text = await response.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(text, 'text/html');
        const links = Array.from(doc.querySelectorAll('a'));
        
        const midiFiles = links
            .map(link => link.getAttribute('href'))
            .filter(href => href && (href.toLowerCase().endsWith('.mid') || href.toLowerCase().endsWith('.midi')))
            .map(href => decodeURIComponent(href));

        if (midiFiles.length > 0) {
            // 기존 옵션 제거 (첫번째 '선택하세요' 제외)
            while (sampleSelect.options.length > 1) {
                sampleSelect.remove(1);
            }
            
            midiFiles.forEach(file => {
                const opt = document.createElement('option');
                opt.value = file;
                opt.text = file.replace(/\.mid$/i, '').replace(/\.midi$/i, '');
                sampleSelect.appendChild(opt);
            });
        }
    } catch (err) {
        console.log("자동 샘플 목록 로드 실패 (로컬 파일 실행 중일 수 있음):", err);
        // 실패 시 기본 하드코딩 리스트 사용 (필요시)
        const FALLBACK_SAMPLES = ['작은별 LR.mid'];
        FALLBACK_SAMPLES.forEach(file => {
            // 중복 방지
            let exists = false;
            for(let i=0; i<sampleSelect.options.length; i++) {
                if(sampleSelect.options[i].value === file) exists = true;
            }
            if(!exists) {
                const opt = document.createElement('option');
                opt.value = file;
                opt.text = file.replace('.mid', '');
                sampleSelect.appendChild(opt);
            }
        });
    }
}

// 초기화 시 목록 로드 시도
loadSampleList();

sampleSelect.addEventListener('change', async (e) => {
    const filename = e.target.value;
    if (!filename) return;
    
    try {
        const response = await fetch(`samples/${encodeURIComponent(filename)}`);
        if (!response.ok) {
            if (window.location.protocol === 'file:') {
                throw new Error('로컬 파일 보안 정책으로 인해 샘플을 로드할 수 없습니다.\n"npm run server"를 실행하여 로컬 서버를 띄워주세요.');
            }
            throw new Error('Network response was not ok');
        }
        const arrayBuffer = await response.arrayBuffer();
        const midi = new Midi(arrayBuffer);
        isDefaultSong = false;
        
        // Reset game state
        stopGame(true);
        
        parseMidi(midi);
        fileNameDisplay.innerText = filename;
        fileNameDisplay.style.display = 'inline-block';
        
        // Reset file input
        midiInput.value = '';
        
        // Reset focus to avoid keyboard interaction issues
        e.target.blur();
    } catch (err) {
        alert("샘플 로드 실패: " + err.message);
        console.error(err);
    }
});

function calculateMeasureTimes(midi) {
    const ppq = midi.header.ppq;
    const timeSignatures = midi.header.timeSignatures; 
    const tempos = midi.header.tempos;
    
    let maxTick = 0;
    midi.tracks.forEach(t => {
        t.notes.forEach(n => {
            if (n.ticks + n.durationTicks > maxTick) maxTick = n.ticks + n.durationTicks;
        });
    });

    let activeTS = timeSignatures[0] || { ticks: 0, timeSignature: [4, 4] };
    if (activeTS.ticks > 0) activeTS = { ticks: 0, timeSignature: [4, 4] };

    let currentTick = 0;
    let times = [];
    let tsIndex = 0;
    
    timeSignatures.sort((a,b) => a.ticks - b.ticks);

    while (currentTick < maxTick) {
        times.push(ticksToSeconds(currentTick, tempos, ppq));
        while(tsIndex < timeSignatures.length - 1 && timeSignatures[tsIndex + 1].ticks <= currentTick) {
            tsIndex++;
            activeTS = timeSignatures[tsIndex];
        }
        const num = activeTS.timeSignature[0];
        const den = activeTS.timeSignature[1];
        const ticksPerMeasure = (num * ppq) * (4 / den);
        currentTick += ticksPerMeasure;
        if (times.length > 2000) break; 
    }
    times.push(ticksToSeconds(currentTick, tempos, ppq));
    detectedTimeSignature = activeTS.timeSignature;
    if (tempos.length > 0) detectedBpm = Math.round(tempos[0].bpm);
    else detectedBpm = 120;
    return times;
}

function ticksToSeconds(tick, tempos, ppq) {
    let tempoEvent = tempos[0] || { ticks: 0, bpm: 120, time: 0 };
    for (let i = 1; i < tempos.length; i++) {
        if (tempos[i].ticks > tick) break;
        tempoEvent = tempos[i];
    }
    const deltaTicks = tick - tempoEvent.ticks;
    const secondsPerTick = 60 / (tempoEvent.bpm * ppq);
    return tempoEvent.time + (deltaTicks * secondsPerTick);
}

function parseMidi(midi) {
    // 1. 첫 번째 노트의 시작 시간 찾기 (공백 제거용)
    let firstNoteTime = Infinity;
    midi.tracks.forEach(track => {
        if (track.channel === 9) return; 
        track.notes.forEach(n => {
            if (n.time < firstNoteTime) firstNoteTime = n.time;
        });
    });
    // 노트가 하나도 없는 경우 방지
    if (firstNoteTime === Infinity) firstNoteTime = 0;

    const allNotes = [];
    midi.tracks.forEach(track => {
        track.notes.forEach(n => {
            if (track.channel === 9) return; 
            allNotes.push({
                midi: n.midi,
                // 첫 번째 노트가 0초(startOffset 지점)에 오도록 앞부분 공백 시간을 뺌
                startTime: (n.time - firstNoteTime) + startOffset,
                duration: n.duration,
                name: n.name,
                channel: track.channel 
            });
        });
    });

    allNotes.sort((a, b) => a.startTime - b.startTime);
    const processedNotes = [];

    // Auto-split logic removed. Using channel map or default.
    allNotes.forEach(n => {
        const mapData = BYPASS_CHANNEL_MAP[n.channel];
        if (mapData) {
            processedNotes.push({
                note: n.midi,
                startTime: n.startTime,
                durationTime: n.duration,
                hand: mapData.hand,
                finger: mapData.finger,
                color: mapData.color,
                played: false
            });
        } else {
            processedNotes.push({
                note: n.midi,
                startTime: n.startTime,
                durationTime: n.duration,
                hand: 'right', finger: '', color: '#888', played: false
            });
        }
    });

    notes = processedNotes;
    
    // 마디 시간 재계산 및 공백 제거 적용
    const rawMeasureTimes = calculateMeasureTimes(midi);
    measureTimes = rawMeasureTimes.map(t => t - firstNoteTime).filter(t => t >= -1.0);
    if (measureTimes.length === 0 || measureTimes[0] > 1.0) {
        measureTimes.unshift(0);
    }
    
    const lastNote = notes[notes.length - 1];
    const lastNoteEnd = lastNote ? (lastNote.startTime + lastNote.durationTime) : 0;
    songDuration = lastNoteEnd + 0.5; 
    
    updateSectionDropdown();
    stopGame(true);
    autoFitZoom();
    
    const tsStr = detectedTimeSignature.join('/');
    statusMsg.innerText = `MIDI 분석 완료!\n(BPM: ${detectedBpm}, 박자: ${tsStr})`;
    statusMsg.style.display = 'block';
}

// loadDefaultSong removed

// --- 5. 렌더링 함수 ---

function drawFullHeightBeams(activeBeams) {
    const viewHeight = logicalHeight - keyHeight;
    const keyW = logicalWidth / totalWhiteKeys;
    const bWidth = keyW / 2.5;

    Object.keys(activeBeams).forEach(midi => {
        const info = activeBeams[midi];
        if (info.source === 'input') return;

        const x = getNoteX(midi);
        const beamX = x + (isWhiteKey(midi) ? keyW/2 : keyW*BLACK_KEY_WIDTH_RATIO/2) - (bWidth / 2);
        
        ctx.save();
        ctx.fillStyle = info.color || '#888';
        
        // [최적화] shadowBlur 제거 (태블릿 성능 이슈 해결)
        // 대신 globalCompositeOperation 'lighter'로 빛나는 효과 유지
        if (info.status === 2) {
            // 연주 중: 진하고 강한 빛
            ctx.globalAlpha = 0.6; 
            // ctx.shadowBlur = 15;  <-- 성능 저하 원인 제거
            // ctx.shadowColor = ctx.fillStyle;
        } else {
            // 떨어지는 중: 옅은 농도
            ctx.globalAlpha = 0.3; 
            // ctx.shadowBlur = 0;    
            ctx.globalCompositeOperation = 'lighter'; 
        }
        ctx.fillRect(beamX, 0, bWidth, viewHeight);
        ctx.restore();
    });
}

function drawNotes(currentTime) {
    const viewHeight = logicalHeight - keyHeight;
    const keyW = logicalWidth / totalWhiteKeys;
    
    ctx.textAlign = 'center';
    // ctx.textBaseline은 조건별로 설정합니다.
    
    notes.forEach(n => {
        const showRight = document.getElementById('chk-right').checked;
        const showLeft = document.getElementById('chk-left').checked;
        if(n.hand === 'right' && !showRight) return;
        if(n.hand === 'left' && !showLeft) return;

        const timeDiff = n.startTime - currentTime;
        if (timeDiff + n.durationTime < -1) return;
        if (timeDiff * fallingSpeed > viewHeight) return;

        const y = viewHeight - (timeDiff * fallingSpeed);
        const height = Math.max(n.durationTime * fallingSpeed, 20); 
        const x = getNoteX(n.note);
        const width = isWhiteKey(n.note) ? keyW - 2 : keyW * BLACK_KEY_WIDTH_RATIO;
        
        // [수정] 둥근 모서리(radius) 제거하고 직각 사각형으로 변경
        ctx.beginPath();
        ctx.rect(x, y - height, width, height - 2);
        ctx.save();
        ctx.clip();
        ctx.fillStyle = n.color || '#888';
        ctx.fill();
        ctx.restore();

        // 텍스트 색상 결정 (노트 내부용)
        const innerTextColor = (n.color === COLORS.YELLOW || n.color === COLORS.GREEN) ? '#000' : '#fff';
        const noteName = getNoteName(n.note);
        const centerX = x + width / 2;

        if (n.finger) {
            // 손가락 번호가 있는 경우
            if (height < 35) {
                // [수정] 짧은 노트: 손가락 번호는 내부, 음이름은 외부 상단에 표시
                
                // 1. 손가락 번호 (내부 중앙)
                ctx.fillStyle = innerTextColor;
                ctx.font = 'bold 14px Arial';
                ctx.textBaseline = 'middle';
                ctx.fillText(n.finger, centerX, y - height/2);

                // 2. 음이름 (외부 상단 - 항상 숫자 위에)
                ctx.fillStyle = '#fff'; // 배경이 검정이므로 흰색
                ctx.font = '12px Arial';
                ctx.textBaseline = 'bottom';
                ctx.fillText(noteName, centerX, y - height - 2); 
            } else {
                // 긴 노트: 내부 하단에 둘 다 표시
                ctx.fillStyle = innerTextColor;
                
                // 손가락 번호
                ctx.font = 'bold 20px Arial';
                ctx.textBaseline = 'bottom';
                ctx.fillText(n.finger, centerX, y - 2);
                
                // 음이름
                ctx.font = '16px Arial';
                ctx.fillText(noteName, centerX, y - 22);
            }
        } else {
            // 손가락 번호가 없는 경우
            ctx.fillStyle = innerTextColor;
            if (height < 35) {
                ctx.font = 'bold 14px Arial';
                ctx.textBaseline = 'middle';
                ctx.fillText(noteName, centerX, y - height/2);
            } else {
                ctx.font = 'bold 16px Arial';
                ctx.textBaseline = 'bottom';
                ctx.fillText(noteName, centerX, y - 2);
            }
        }
    });
}

function drawKeyboard(keyVisuals) {
    const y = logicalHeight - keyHeight;
    const keyW = logicalWidth / totalWhiteKeys;

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    // 흰 건반
    let whiteIndex = 0;
    for(let i = startNote; i < endNote; i++) {
        if(isWhiteKey(i)) {
            const x = whiteIndex * keyW;
            const visual = keyVisuals[i];
            
            // 1. 항상 흰색 베이스를 먼저 그림 (파스텔톤 구현을 위해)
            ctx.fillStyle = '#fff';
            ctx.fillRect(x, y, keyW - 1, keyHeight);

            // 2. 시각 효과(색상) 덧칠
            if(visual) {
                ctx.save();
                ctx.fillStyle = visual.color || COLORS.CORRECT;
                
                if (visual.status === 1) {
                    // [수정] 떨어지는 중: 기존 0.25 -> 0.4로 상향
                    ctx.globalAlpha = 0.4; 
                } else {
                    // 연주 중: 진한 원색
                    ctx.globalAlpha = 1.0; 
                }
                ctx.fillRect(x, y, keyW - 1, keyHeight);
                ctx.restore();
            } else {
                // 놓친 노트 표시 (빨간색)
                const missedNote = notes.find(n => n.note === i && n.scoreStatus === 'missed');
                if (missedNote) {
                    ctx.save();
                    ctx.fillStyle = COLORS.MISS;
                    ctx.globalAlpha = 1.0;
                    ctx.fillRect(x, y, keyW - 1, keyHeight);
                    ctx.restore();
                }
            }

            // 건반 테두리 및 텍스트
            ctx.fillStyle = '#000';
            ctx.fillRect(x + keyW - 1, y, 1, keyHeight); // 구분선
            
            ctx.fillStyle = '#000'; // 텍스트 색상 (흰 건반 위 검은 글씨)
            ctx.font = 'bold 12px Arial';
            ctx.fillText(getNoteName(i), x + keyW/2, y + keyHeight - 20);

            // C 건반 옥타브 표시
            if (i % 12 === 0) {
                const octave = (i / 12) - 1; 
                if (octave >= 1 && octave <= 7) {
                    ctx.fillStyle = '#ff0000';
                    ctx.font = 'bold 11px Arial';
                    ctx.fillText(octave, x + keyW/2, y + keyHeight - 7);
                }
            }

            whiteIndex++;
        }
    }

    // 검은 건반
    whiteIndex = 0;
    for(let i = startNote; i < endNote; i++) {
        if(isWhiteKey(i)) {
            whiteIndex++;
        } else {
            const w = keyW * BLACK_KEY_WIDTH_RATIO;
            const x = (whiteIndex * keyW) - (w / 2);
            const h = keyHeight * BLACK_KEY_HEIGHT_RATIO;
            const visual = keyVisuals[i];
            
            if (visual) {
                // [수정] 노트가 활성화(떨어짐/눌림) 상태일 때는 검은색 베이스를 그리지 않음
                // 대신 색상만 그려서 밝게 표현
                ctx.save();
                ctx.fillStyle = visual.color;

                if (visual.status === 1) {
                    // 떨어지는 중: 흰 건반 위에 덧칠해지므로 투명도를 주면 파스텔톤(옅은 색)이 됨
                    ctx.globalAlpha = 0.5; 
                } else {
                    // 연주 중: 진한 원색
                    ctx.globalAlpha = 1.0; 
                }
                ctx.fillRect(x, y, w, h);
                ctx.restore();

                // 텍스트 색상 조정 (밝은 배경에서는 검은색)
                ctx.fillStyle = (visual.color === COLORS.YELLOW || visual.color === COLORS.GREEN) ? '#000' : '#fff';
            } else {
                // 평소 상태: 검은색 베이스
                ctx.fillStyle = '#000';
                ctx.fillRect(x, y, w, h);

                // 놓친 노트 표시
                const missedNote = notes.find(n => n.note === i && n.scoreStatus === 'missed');
                if (missedNote) {
                    ctx.save();
                    ctx.fillStyle = COLORS.MISS;
                    ctx.globalAlpha = 1.0;
                    ctx.fillRect(x, y, w, h);
                    ctx.restore();
                }
                
                // 기본 텍스트 (흰색)
                ctx.fillStyle = '#fff';
            }
            
            ctx.font = '10px Arial';
            const sharpName = getNoteName(i);
            ctx.fillText(sharpName, x + w/2, y + h - 20); 
        }
    }
    
}

// --- 6. 메인 로직 및 줌 ---

// [수정됨] 모드에 따라 화면 중심을 C3, C4, C5로 정렬하는 함수
function alignViewToMode() {
    const containerWidth = gameWrapper.clientWidth;
    // 현재 줌 상태에서의 건반 하나의 너비 계산
    const finalKeyW = logicalWidth / totalWhiteKeys;
    
    // 체크박스 상태 확인
    const chkRight = document.getElementById('chk-right').checked;
    const chkLeft = document.getElementById('chk-left').checked;

    let targetMidi = 60; // 기본: C4 (양손 또는 둘 다 해제 시)

    if (chkRight && !chkLeft) {
        // 오른손만 연습: C5 (72)가 중앙
        targetMidi = 72;
    } else if (!chkRight && chkLeft) {
        // 왼손만 연습: C3 (48)가 중앙
        targetMidi = 48;
    } else {
        // 양손: C4 (60)가 중앙
        targetMidi = 60;
    }
    
    // 타겟 건반(targetMidi)까지의 흰 건반 개수 세기
    let targetWhiteKeyIndex = 0;
    for(let i = startNote; i < targetMidi; i++) {
        if(isWhiteKey(i)) targetWhiteKeyIndex++;
    }
    
    // 타겟 건반의 중앙 X 좌표 (전체 건반 캔버스 기준)
    const targetCenterX = (targetWhiteKeyIndex * finalKeyW) + (finalKeyW / 2);
    
    // 화면 중앙(containerWidth / 2)과 타겟 건반 중앙(targetCenterX)의 차이
    // offset > 0: 타겟이 화면 왼쪽 -> 피아노를 오른쪽으로 밀어야 함
    // offset < 0: 타겟이 화면 오른쪽 -> 피아노를 왼쪽으로 당겨야 함
    const offset = (containerWidth / 2) - targetCenterX;

    // 우선 마진 초기화
    gameContainer.style.marginLeft = '0px';

    if (offset > 0) {
        // 피아노를 오른쪽으로 밀어야 함 (스크롤은 0 이하로 갈 수 없으므로 margin 사용)
        gameContainer.style.marginLeft = offset + 'px';
        gameWrapper.scrollLeft = 0;
    } else {
        // 피아노를 왼쪽으로 당겨야 함 (스크롤 사용)
        const targetScrollLeft = Math.abs(offset);
        gameWrapper.scrollLeft = targetScrollLeft;

        // [중요] 스크롤이 끝에 도달해서 더 이상 갈 수 없는 경우 (줌 아웃 상태 등)
        // 부족한 만큼 마진(음수)을 사용하여 강제로 더 당김
        const currentScroll = gameWrapper.scrollLeft;
        // 목표 스크롤과 실제 스크롤의 차이가 1px 이상 나면 한계에 도달한 것임
        if (Math.abs(currentScroll - targetScrollLeft) > 1) {
            const missingShift = targetScrollLeft - currentScroll;
            gameContainer.style.marginLeft = (-missingShift) + 'px';
        }
    }
}

function resize() {
    // [최적화] 리사이즈 시에도 DPR 제한 적용
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const wrapperRect = gameWrapper.getBoundingClientRect();
    
    if (wrapperRect.width === 0) return;

    if (baseWidth === 1000) { 
        baseWidth = wrapperRect.width;
    }

    const containerWidth = baseWidth * (currentZoom / 100);
    gameContainer.style.width = containerWidth + 'px';

    logicalWidth = containerWidth;
    logicalHeight = wrapperRect.height;

    canvas.width = logicalWidth * dpr;
    canvas.height = logicalHeight * dpr; 
    
    ctx.resetTransform();
    ctx.scale(dpr, dpr);
    
    zoomLevelDisplay.innerText = currentZoom + '%';

    // 리사이즈 시 모드에 따른 정렬 수행 (수정됨)
    alignViewToMode();

    if (!isPlaying) {
        if (isPaused) {
            drawGame(getCurrentTime());
        } else {
            drawKeyboard([]);
        }
    }
}

const resizeObserver = new ResizeObserver(entries => {
    for (let entry of entries) {
        resize();
    }
});
resizeObserver.observe(gameWrapper);

function setZoom(newZoom) {
    if (newZoom < 100) newZoom = 100; 
    if (newZoom > 450) newZoom = 450;

    // 줌 변경 로직 (앵커 제거, 중앙 정렬 우선)
    currentZoom = Math.round(newZoom);
    const newWidth = baseWidth * (currentZoom / 100);
    gameContainer.style.width = newWidth + 'px';
    zoomLevelDisplay.innerText = currentZoom + '%';

    logicalWidth = newWidth;
    logicalHeight = gameWrapper.clientHeight;
    canvas.width = logicalWidth * dpr;
    canvas.height = logicalHeight * dpr;
    ctx.resetTransform();
    ctx.scale(dpr, dpr);

    // 줌 변경 후 모드에 따른 정렬 수행 (수정됨)
    alignViewToMode();
    
    if (!isPlaying) {
        if (isPaused) {
            drawGame(getCurrentTime());
        } else {
            drawKeyboard([]);
        }
    }
}

function autoFitZoom() {
    if (notes.length === 0) return;

    // 자동 핏 로직 (기존 유지)
    let minNote = 108;
    let maxNote = 21;
    notes.forEach(n => {
        if (n.note < minNote) minNote = n.note;
        if (n.note > maxNote) maxNote = n.note;
    });

    minNote = Math.max(21, minNote - 2); 
    maxNote = Math.min(108, maxNote + 2);

    let whiteKeysInFull = 0;
    for(let i=startNote; i<endNote; i++) if(isWhiteKey(i)) whiteKeysInFull++;
    const baseKeyWidth = gameWrapper.clientWidth / whiteKeysInFull;

    let whiteKeysInRange = 0;
    for(let i=minNote; i<=maxNote; i++) if(isWhiteKey(i)) whiteKeysInRange++;
    const rangeWidth = whiteKeysInRange * baseKeyWidth;

    const containerWidth = gameWrapper.clientWidth;
    let scale = (containerWidth / rangeWidth) * 0.95;
    let newZoom = scale * 100;

    newZoom = Math.max(100, Math.min(newZoom, 450));
    
    baseWidth = gameWrapper.clientWidth; 
    
    currentZoom = Math.round(newZoom);
    const newTotalWidth = baseWidth * (currentZoom / 100);
    
    gameContainer.style.width = newTotalWidth + 'px';
    zoomLevelDisplay.innerText = currentZoom + '%';
    
    logicalWidth = newTotalWidth;
    logicalHeight = gameWrapper.clientHeight;
    canvas.width = logicalWidth * dpr;
    canvas.height = logicalHeight * dpr;
    ctx.resetTransform();
    ctx.scale(dpr, dpr);

    // 줌 설정 후 모드에 따른 정렬 수행 (수정됨)
    alignViewToMode();
    
    if (!isPlaying) {
        if (isPaused) {
            drawGame(getCurrentTime());
        } else {
            drawKeyboard([]);
        }
    }
}

// 핀치 줌 이벤트
let initialPinchDistance = null;
let initialZoom = 100;

gameWrapper.addEventListener('touchstart', (e) => {
    if (e.touches.length === 2) {
        e.preventDefault();
        initialPinchDistance = Math.hypot(
            e.touches[0].pageX - e.touches[1].pageX,
            e.touches[0].pageY - e.touches[1].pageY
        );
        initialZoom = currentZoom;
    }
}, { passive: false });

gameWrapper.addEventListener('touchmove', (e) => {
    if (e.touches.length === 2 && initialPinchDistance !== null) {
        e.preventDefault(); 
        const currentDistance = Math.hypot(
            e.touches[0].pageX - e.touches[1].pageX,
            e.touches[0].pageY - e.touches[1].pageY
        );

        if (initialPinchDistance > 0) {
            const scale = currentDistance / initialPinchDistance;
            const newZoom = initialZoom * scale;
            setZoom(newZoom); // 앵커 없이 호출
        }
    }
}, { passive: false });

gameWrapper.addEventListener('touchend', (e) => {
    if (e.touches.length < 2) {
        initialPinchDistance = null;
    }
});

document.getElementById('btn-zoom-in').addEventListener('click', () => { 
    setZoom(currentZoom + 10);
});

document.getElementById('btn-zoom-out').addEventListener('click', () => { 
    setZoom(currentZoom - 10);
});

zoomLevelDisplay.addEventListener('click', () => { 
    autoFitZoom();
});

// 체크박스 변경 시 정렬 업데이트 이벤트 리스너 추가
document.getElementById('chk-right').addEventListener('change', () => {
    alignViewToMode();
});
document.getElementById('chk-left').addEventListener('change', () => {
    alignViewToMode();
});

// --- 7. 오디오 및 게임 루프 ---

function playTone(midi, duration) {
    if(!piano.loaded) return;
    // Volume reduced by 10% (velocity 0.9)
    piano.triggerAttackRelease(Tone.Frequency(midi, "midi").toNote(), duration, undefined, 0.9);
}

function getCurrentTime() {
    if (isPaused) return (pauseTime - startTime) * speed;
    if (!isPlaying) return 0;
    return (audioCtx.currentTime - startTime) * speed;
}

function drawGame(currentTime) {
    ctx.clearRect(0, 0, logicalWidth, logicalHeight);

    // 1. 노트 상태 계산 (Active Beams & Key Visuals 통합)
    const activeBeams = {}; // 노트에 의한 시각 효과 (빔 + 건반)
    const viewHeight = logicalHeight - keyHeight;

    notes.forEach(n => {
        const showRight = document.getElementById('chk-right').checked;
        const showLeft = document.getElementById('chk-left').checked;
        if(n.hand === 'right' && !showRight) return;
        if(n.hand === 'left' && !showLeft) return;

        const timeDiff = n.startTime - currentTime;
        const yTop = viewHeight - (timeDiff * fallingSpeed) - (n.durationTime * fallingSpeed); 
        const yBottom = viewHeight - (timeDiff * fallingSpeed); 
        
        const isPlayingNote = (currentTime >= n.startTime && currentTime < n.startTime + n.durationTime);
        const isFalling = (yBottom > 0 && yTop < viewHeight); 

        // 우선순위: 연주 중(2) > 떨어지는 중(1)
        // 같은 상태라면 먼저 처리된(화면 아래쪽, 시간이 빠른) 노트의 색상을 유지
        const newStatus = isPlayingNote ? 2 : (isFalling ? 1 : 0);
        
        if (newStatus > 0) {
                if (!activeBeams[n.note] || activeBeams[n.note].status < newStatus) {
                activeBeams[n.note] = { status: newStatus, color: n.color, source: 'note' };
            }
        }
    });

    // 2. 렌더링
    drawFullHeightBeams(activeBeams); // 빔 그리기
    drawNotes(currentTime); // 노트 블럭 그리기
    
    // 3. 건반 렌더링 데이터 병합
    // activeBeams(노트 효과) + currentPressedNotes(유저 입력)
    const keyVisuals = { ...activeBeams };
    currentPressedNotes.forEach(n => {
        // 유저 입력은 항상 가장 강한 상태(2)로 표시, 유저 입력 색상 우선
        keyVisuals[n.note] = { status: 2, color: n.color || COLORS.CORRECT, source: 'input' };
    });

    drawKeyboard(keyVisuals); // 건반 그리기
}

function loop() {
    if(!isPlaying) return;
    const currentTime = getCurrentTime();
    
    // 채점 상태 업데이트 (수정됨: 체크박스 해제된 손은 Miss 처리 안함)
    const showRight = document.getElementById('chk-right').checked;
    const showLeft = document.getElementById('chk-left').checked;

    for (let i = nextNoteIndex; i < notes.length; i++) {
        const n = notes[i];
        // 현재 노트가 속한 손이 활성화 상태인지 확인
        const isHandActive = (n.hand === 'right' && showRight) || (n.hand === 'left' && showLeft);

        if (currentTime > n.startTime + timingTolerance && !n.played && n.scoreStatus !== 'missed' && n.scoreStatus !== 'ignored') {
            if (isHandActive) {
                // 활성화된 손인데 안 쳤으면 Miss 처리 (분홍색 변경)
                n.scoreStatus = 'missed';
                n.color = COLORS.MISS;
                score.missed++;
            } else {
                // 비활성화된 손이면 무시 (색상 변경 없음)
                n.scoreStatus = 'ignored';
            }
            nextNoteIndex++;
        } else if (currentTime > n.startTime + n.durationTime + 0.5) {
            nextNoteIndex = i + 1;
        }
    }

    // 오디오 재생
    notes.forEach(n => {
        const playRight = document.getElementById('chk-right').checked;
        const playLeft = document.getElementById('chk-left').checked;
        if(n.hand === 'right' && !playRight) return;
        if(n.hand === 'left' && !playLeft) return;
        
        if (!n.played && currentTime >= n.startTime) {
            playTone(n.note, n.durationTime);
            n.played = true; 
        }
    });

    drawGame(currentTime);
    
    let endTime = songDuration;
    if (currentSection !== null) {
        if (isDefaultSong) {
            const sectionIdx = parseInt(document.getElementById('sel-section').value);
            const beatsPerSection = 16; // 4마디 * 4박자 = 16박자
            const beatDuration = 0.8; // 1박자당 0.8초
            const sectionDuration = beatsPerSection * beatDuration;
            
            const sectionStart = sectionIdx * sectionDuration;
            endTime = sectionStart + sectionDuration + startOffset + 0.1;
        } else {
            const sectionIdx = parseInt(document.getElementById('sel-section').value);
            const groupSize = 4;
            const startMeasureIdx = sectionIdx * groupSize;
            const endMeasureIdx = Math.min(startMeasureIdx + groupSize, measureTimes.length - 1);
            if (measureTimes[endMeasureIdx]) {
                endTime = measureTimes[endMeasureIdx] + startOffset + 0.1; // 구간 끝 여유 시간 1.0초 -> 0.1초로 단축
            }
        }
    }
    
    if (currentTime > endTime) {
        handleSongEnd();
        return;
    }
    animationId = requestAnimationFrame(loop);
}

function handleSongEnd() {
    const repeatSetting = parseInt(document.getElementById('sel-repeat').value);
    if (currentLoop < repeatSetting) {
        currentLoop++;
        resetPlaybackToSectionStart();
        loop();
    } else {
        stopGame(true); // 게임을 완전히 초기화하여 메뉴로 복귀
        statusMsg.innerText = "연습 완료!"; // 완료 메시지 표시
        statusMsg.style.display = 'block';
    }
}

function resetPlaybackToSectionStart() {
    const sectionIdx = parseInt(document.getElementById('sel-section').value);
    let loopStartTime = 0;
    
    if (sectionIdx !== -1) {
        if (isDefaultSong) {
            const beatsPerSection = 16; // 4마디 * 4박자 = 16박자
            const beatDuration = 0.8; // 1박자당 0.8초
            loopStartTime = sectionIdx * beatsPerSection * beatDuration;
        } else {
            const startMeasureIdx = sectionIdx * 4;
            if (startMeasureIdx < measureTimes.length) {
                loopStartTime = measureTimes[startMeasureIdx];
            }
        }
    }
    
    const effectiveStartTime = loopStartTime + startOffset;
    
    notes.forEach(n => {
        if (n.startTime < effectiveStartTime) {
            n.played = true; 
        } else {
            n.played = false; 
        }
    });

    startTime = audioCtx.currentTime - loopStartTime;
}

function updateSectionDropdown() {
    sectionSelect.innerHTML = '<option value="-1">전곡</option>';
    if (isDefaultSong && currentSongSections.length > 0) {
        currentSongSections.forEach((name, idx) => {
            const opt = document.createElement('option');
            opt.value = idx;
            opt.text = name;
            sectionSelect.appendChild(opt);
        });
    } else if (!isDefaultSong && measureTimes.length > 0) {
        // MIDI 파일 로딩 시 (기존 로직 유지)
        const groupSize = 4; 
        const totalMeasures = measureTimes.length - 1;
        const actualLines = Math.ceil(totalMeasures / groupSize);
        const displayLines = Math.max(actualLines, 6);
        
        for(let i=0; i < displayLines; i++) {
            const opt = document.createElement('option');
            opt.value = i; 
            if (i < actualLines) {
                opt.text = `${i+1}째줄`; 
            } else {
                opt.text = `${i+1}째줄 (없음)`;
                opt.disabled = true;
            }
            sectionSelect.appendChild(opt);
        }
    }
}

async function playGame() {
    if (notes.length === 0) {
        alert("MIDI 파일을 업로드해주세요.");
        return;
    }

    await Tone.start();
    if(!audioCtx) {
        audioCtx = Tone.context.rawContext;
        // masterGain is handled by Tone.js destination, but we can keep it if needed for other things
        // or just rely on Tone.js volume
    }
    if(audioCtx.state === 'suspended') audioCtx.resume();

    controlsDiv.classList.add('hidden-controls');

    const sectionIdx = parseInt(document.getElementById('sel-section').value);
    currentSection = (sectionIdx === -1) ? null : sectionIdx;

    if (isPaused) {
        isPaused = false;
        isPlaying = true;
        const now = audioCtx.currentTime;
        startTime += (now - pauseTime);
        
        playBtn.innerText = "⏸ 일시정지";
        statusMsg.style.display = 'none';
        loop();
    } else {
        if(isPlaying) return;
        
        speed = parseFloat(document.getElementById('rng-speed').value);
        resetPlaybackToSectionStart();
        
        isPlaying = true;
        isPaused = false;
        playBtn.innerText = "⏸ 일시정지";
        statusMsg.style.display = 'none';
        loop();
    }
}

function pauseGame() {
    if (!isPlaying) return;
    isPlaying = false;
    isPaused = true;
    cancelAnimationFrame(animationId);
    pauseTime = audioCtx.currentTime;
    playBtn.innerText = "▶ 재생";
    statusMsg.innerText = "일시정지됨\n(화면을 터치하면 다시 시작됩니다)";
    statusMsg.style.display = 'block';
    controlsDiv.classList.remove('hidden-controls');
}

function stopGame(fullReset = true) {
    isPlaying = false;
    isPaused = false;
    cancelAnimationFrame(animationId);
    playBtn.innerText = "▶ 재생";
    if(fullReset) {
        notes.forEach(n => { 
            n.played = false; 
            n.scoreStatus = 'pending'; 
            // 색상 초기화 시 왼손/오른손 구분 적용
            if (n.hand === 'left') {
                n.color = LEFT_FINGER_COLOR_MAP[n.finger] || '#888';
            } else {
                n.color = FINGER_COLOR_MAP[n.finger] || '#888';
            }
        });
        nextNoteIndex = 0;
        score = { correct: 0, missed: 0, total: 0 };
        
        statusMsg.innerText = notes.length > 0 ? "재생 버튼을 눌러 시작하세요" : "MIDI 파일을 업로드하세요";
        statusMsg.style.display = 'block';
        currentLoop = 0;
        
        ctx.clearRect(0, 0, logicalWidth, logicalHeight);
        drawKeyboard([]); // 현재 눌린 키만 그림 (초기화 상태)
    }
    controlsDiv.classList.remove('hidden-controls');
}

playBtn.addEventListener('click', () => { isPlaying ? pauseGame() : playGame(); });
document.getElementById('btn-stop').addEventListener('click', () => stopGame(true));

speedRange.addEventListener('input', (e) => {
    speed = parseFloat(e.target.value);
    speedText.innerText = speed.toFixed(1) + 'x';
});
document.getElementById('sel-repeat').addEventListener('change', (e) => loopCount = parseInt(e.target.value));
sectionSelect.addEventListener('change', () => stopGame(true));

// 클릭/더블클릭 구분 로직 추가
let clickTimeout = null;

document.addEventListener('click', (e) => {
    if (e.target.closest('#controls')) return;
    
    if (clickTimeout) {
        // 타이머가 돌아가는 중에 다시 클릭됨 -> 더블 클릭으로 간주
        clearTimeout(clickTimeout);
        clickTimeout = null;
        stopGame(true); // 게임 중단 및 메인 화면 복귀
    } else {
        // 첫 번째 클릭 -> 타이머 설정
        clickTimeout = setTimeout(() => {
            clickTimeout = null;
            // 싱글 클릭 동작 실행 (250ms 동안 추가 클릭 없으면)
            isPlaying ? pauseGame() : playGame();
        }, 250); // 더블 클릭 간격 감지 시간 (0.25초)
    }
});

// 초기화
resize(); 

// 초기 상태 건반 그리기 (빈 상태)
drawKeyboard([]);