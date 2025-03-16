document.addEventListener('DOMContentLoaded', () => {
    const videoUrlInput = document.getElementById('videoUrl');
    const getTranscriptBtn = document.getElementById('getTranscript');
    const searchTranscriptInput = document.getElementById('searchTranscript');
    const downloadTranscriptBtn = document.getElementById('downloadTranscript');
    const copyTranscriptBtn = document.getElementById('copyTranscript');
    const transcriptContainer = document.getElementById('transcript');
    const videoThumbnail = document.getElementById('videoThumbnail');
    const playerContainer = document.createElement('div');
    playerContainer.id = 'player';
    videoThumbnail.appendChild(playerContainer);
    const videoTitle = document.getElementById('videoTitle');
    const channelName = document.getElementById('channelName');
    const loadingSpinner = document.querySelector('.loading-spinner');
    const errorDiv = document.getElementById('error');

    let currentTranscript = [];
    let player = null;

    function initYouTubePlayer(videoId) {
        if (!window.YT) {
            const tag = document.createElement('script');
            tag.src = 'https://www.youtube.com/iframe_api';
            const firstScriptTag = document.getElementsByTagName('script')[0];
            firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
        }

        window.onYouTubeIframeAPIReady = () => {
            player = new YT.Player('player', {
                height: '315',
                width: '560',
                videoId: videoId,
                events: {
                    'onStateChange': onPlayerStateChange
                }
            });
        };
    }

    function onPlayerStateChange(event) {
        if (event.data === YT.PlayerState.PLAYING) {
            startHighlightingTranscript();
        } else {
            stopHighlightingTranscript();
        }
    }

    let highlightInterval;
    function startHighlightingTranscript() {
        highlightInterval = setInterval(() => {
            const currentTime = player.getCurrentTime();
            highlightCurrentTranscriptLine(currentTime);
        }, 100);
    }

    function stopHighlightingTranscript() {
        clearInterval(highlightInterval);
    }

    function highlightCurrentTranscriptLine(currentTime) {
        const lines = document.querySelectorAll('.transcript-line');
        lines.forEach(line => line.classList.remove('active'));

        const currentLine = currentTranscript.findIndex((line, index) => {
            const nextLine = currentTranscript[index + 1];
            return currentTime >= line.start && (!nextLine || currentTime < nextLine.start);
        });

        if (currentLine !== -1) {
            const activeLine = lines[currentLine];
            activeLine.classList.add('active');
            activeLine.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }

    function showError(message) {
        errorDiv.textContent = message;
        errorDiv.classList.remove('hidden');
        showLoading(false);
        setTimeout(() => errorDiv.classList.add('hidden'), 5000);
        // Reset UI elements when there's an error
        transcriptContainer.innerHTML = '';
        videoThumbnail.innerHTML = '';
        videoTitle.textContent = '';
        channelName.textContent = '';
    }

    function showLoading(show) {
        const videoInfo = document.querySelector('.video-info');
        const transcriptControls = document.querySelector('.transcript-controls');
        
        if (show) {
            loadingSpinner.classList.remove('hidden');
            transcriptContainer.classList.add('hidden');
            videoInfo.classList.add('hidden');
            transcriptControls.classList.add('hidden');
            errorDiv.classList.add('hidden');
        } else {
            loadingSpinner.classList.add('hidden');
            if (currentTranscript && currentTranscript.length > 0) {
                transcriptContainer.classList.remove('hidden');
                videoInfo.classList.remove('hidden');
                transcriptControls.classList.remove('hidden');
            }
        }
    }

    function getVideoId(url) {
        try {
            const urlObj = new URL(url);
            if (urlObj.hostname === 'youtu.be') {
                return urlObj.pathname.slice(1);
            }
            if (urlObj.hostname === 'www.youtube.com' || urlObj.hostname === 'youtube.com') {
                const videoId = urlObj.searchParams.get('v');
                if (videoId) return videoId;
            }
        } catch (error) {
            return null;
        }
        return null;
    }

    function formatTime(seconds) {
        if (typeof seconds !== 'number' || isNaN(seconds)) return '0:00';
        const minutes = Math.floor(seconds / 60);
        const actualSeconds = Math.floor(seconds % 60);
        return `${minutes}:${actualSeconds.toString().padStart(2, '0')}`;
    }

    async function fetchVideoInfo(videoId) {
        try {
            const response = await fetch(`/api/video-info?videoId=${videoId}`);
            if (!response.ok) throw new Error('Failed to fetch video info');
            const data = await response.json();
            
            initYouTubePlayer(videoId);            
            videoTitle.textContent = data.title;
            channelName.textContent = data.channelTitle;
        } catch (error) {
            showError('Error fetching video information');
        }
    }

    async function fetchTranscript(videoId) {
        try {
            showLoading(true);
            errorDiv.classList.add('hidden');
            transcriptContainer.innerHTML = '';
            currentTranscript = [];
            
            const response = await fetch(`/api/transcript?videoId=${videoId}`);
            const data = await response.json();
            
            if (!response.ok) {
                if (data.error && data.error.includes('Transcript is disabled')) {
                    throw new Error('Transcripts are disabled for this video. Please try a different video.');
                }
                throw new Error(data.error || 'Failed to fetch transcript');
            }
            
            if (!Array.isArray(data) || data.length === 0) {
                throw new Error('No transcript available for this video. The video might not have captions enabled.');
            }
            
            currentTranscript = data;
            await fetchVideoInfo(videoId);
            displayTranscript(data);
        } catch (error) {
            showError(error.message || 'Error fetching transcript. Make sure the video has captions available.');
            document.querySelector('.video-info').classList.add('hidden');
            document.querySelector('.transcript-controls').classList.add('hidden');
            transcriptContainer.classList.add('hidden');
        } finally {
            showLoading(false);
        }
    }

    function displayTranscript(transcript, searchQuery = '') {
        const highlightText = (text, query) => {
            if (!query) return text;
            const regex = new RegExp(`(${query})`, 'gi');
            return text.replace(regex, '<mark>$1</mark>');
        };
        if (!transcript || transcript.length === 0) {
            transcriptContainer.innerHTML = '<p class="no-transcript">No transcript available</p>';
            transcriptContainer.classList.remove('hidden');
            showLoading(false);
            return;
        }

        transcriptContainer.innerHTML = transcript
            .map(line => `
                <div class="transcript-line" data-start="${line.start}">
                    <span class="timestamp" role="button" title="Jump to this timestamp">${formatTime(line.start)}</span>
                    <span class="text">${highlightText(line.text, searchQuery)}</span>
                </div>
            `).join('');

        // Add click handlers for timestamps
        document.querySelectorAll('.timestamp').forEach(timestamp => {
            timestamp.addEventListener('click', () => {
                const start = parseFloat(timestamp.parentElement.dataset.start);
                if (player) {
                    player.seekTo(start);
                    player.playVideo();
                }
            });
        });
        transcriptContainer.classList.remove('hidden');
        showLoading(false);
    }

    function searchTranscript(query) {
        const searchResults = document.getElementById('searchResults');
        searchResults.innerHTML = '';
        if (!currentTranscript.length) {
            showError('No transcript available to search');
            return;
        }

        if (!query) {
            displayTranscript(currentTranscript, '');
            return;
        }

        const filteredTranscript = currentTranscript.filter(line =>
            line.text.toLowerCase().includes(query.toLowerCase())
        );

        if (filteredTranscript.length === 0) {
            transcriptContainer.innerHTML = '<p class="no-results">No results found</p>';
        } else {
            displayTranscript(filteredTranscript, query);
            searchResults.innerHTML = `Found ${filteredTranscript.length} matches`;
        }
    }

    function downloadTranscript() {
        if (!currentTranscript.length) {
            showError('No transcript available to download');
            return;
        }

        const text = currentTranscript
            .map(line => `${formatTime(line.start)} - ${line.text}`)
            .join('\n');

        const blob = new Blob([text], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'transcript.txt';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    async function copyTranscript() {
        if (!currentTranscript.length) {
            showError('No transcript available to copy');
            return;
        }

        const text = currentTranscript
            .map(line => `${formatTime(line.start)} - ${line.text}`)
            .join('\n');

        try {
            await navigator.clipboard.writeText(text);
            showError('Transcript copied to clipboard!');
        } catch (error) {
            showError('Failed to copy transcript');
        }
    }

    getTranscriptBtn.addEventListener('click', () => {
        const url = videoUrlInput.value.trim();
        const videoId = getVideoId(url);

        if (!url) {
            showError('Please enter a YouTube URL');
            return;
        }

        if (!videoId) {
            showError('Invalid YouTube URL');
            return;
        }

        fetchTranscript(videoId);
    });

    videoUrlInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            getTranscriptBtn.click();
        }
    });

    searchTranscriptInput.addEventListener('input', (e) => {
        searchTranscript(e.target.value.trim());
    });

    function exportToExcel() {
        if (!currentTranscript.length) {
            showError('No transcript available to export');
            return;
        }

        const workbook = XLSX.utils.book_new();
        const data = currentTranscript.map(line => ({
            'Timestamp': formatTime(line.start),
            'Time (seconds)': line.start,
            'Text': line.text
        }));

        const worksheet = XLSX.utils.json_to_sheet(data);
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Transcript');

        // Auto-size columns
        const maxWidth = data.reduce((w, r) => Math.max(w, r.Text.length), 10);
        const wscols = [
            { wch: 10 },  // Timestamp column
            { wch: 10 },  // Time in seconds
            { wch: Math.min(maxWidth, 100) }  // Text column, max 100 characters width
        ];
        worksheet['!cols'] = wscols;

        XLSX.writeFile(workbook, 'transcript.xlsx');
    }

    downloadTranscriptBtn.addEventListener('click', downloadTranscript);
    document.getElementById('exportExcel').addEventListener('click', exportToExcel);
    copyTranscriptBtn.addEventListener('click', copyTranscript);
});