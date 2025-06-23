import React, { useState, useEffect, useRef } from 'react';
import { useDrag, useDrop } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { DndProvider } from 'react-dnd';
import TimelineAssembler from '../TimelineAssembler';

// Styles
const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    backgroundColor: '#1e1e1e',
    color: '#f0f0f0',
    fontFamily: 'sans-serif',
  },
  header: {
    padding: '10px 20px',
    borderBottom: '1px solid #333',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    fontSize: '1.2rem',
    fontWeight: 'bold',
  },
  controls: {
    display: 'flex',
    gap: '10px',
  },
  button: {
    backgroundColor: '#2a2a2a',
    border: '1px solid #444',
    color: '#f0f0f0',
    padding: '5px 10px',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '0.9rem',
  },
  primaryButton: {
    backgroundColor: '#0066cc',
    border: '1px solid #0055aa',
  },
  timeline: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  timeRuler: {
    height: '30px',
    backgroundColor: '#2a2a2a',
    borderBottom: '1px solid #333',
    position: 'relative',
    overflow: 'hidden',
  },
  timeMarker: {
    position: 'absolute',
    top: 0,
    height: '100%',
    borderLeft: '1px solid #888',
    fontSize: '0.7rem',
    paddingLeft: '2px',
    color: '#888',
  },
  tracksContainer: {
    flex: 1,
    overflow: 'auto',
    position: 'relative',
  },
  trackHeader: {
    width: '150px',
    backgroundColor: '#2a2a2a',
    borderRight: '1px solid #333',
    position: 'sticky',
    left: 0,
    zIndex: 10,
  },
  track: {
    height: '80px',
    backgroundColor: '#2a2a2a',
    borderBottom: '1px solid #333',
    display: 'flex',
  },
  trackContent: {
    flex: 1,
    position: 'relative',
    minHeight: '80px',
    backgroundColor: '#252525',
  },
  clip: {
    position: 'absolute',
    height: '70%',
    top: '15%',
    backgroundColor: '#0066cc',
    borderRadius: '4px',
    cursor: 'pointer',
    overflow: 'hidden',
    boxSizing: 'border-box',
    border: '1px solid rgba(255, 255, 255, 0.1)',
  },
  clipTitle: {
    padding: '4px',
    fontSize: '0.8rem',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  mediaPanel: {
    width: '250px',
    backgroundColor: '#2a2a2a',
    borderLeft: '1px solid #333',
    padding: '10px',
    display: 'flex',
    flexDirection: 'column',
  },
  mediaItem: {
    padding: '8px',
    margin: '4px 0',
    backgroundColor: '#333',
    borderRadius: '4px',
    cursor: 'grab',
  },
  playhead: {
    position: 'absolute',
    top: 0,
    width: '2px',
    height: '100%',
    backgroundColor: 'red',
    zIndex: 100,
  },
  timeDisplay: {
    padding: '0 10px',
    fontSize: '0.9rem',
  },
};

// Time conversion utilities
const formatTime = (seconds) => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 100);
  
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
};

// Clip component (draggable)
const Clip = ({ clip, pixelsPerSecond, onSelect }) => {
  const [{ isDragging }, dragRef] = useDrag({
    type: 'CLIP',
    item: { id: clip.id, type: 'CLIP' },
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  });
  
  const clipWidth = (clip.endTime - clip.startTime) * pixelsPerSecond;
  const clipLeft = clip.startTime * pixelsPerSecond;
  
  return (
    <div
      ref={dragRef}
      style={{
        ...styles.clip,
        width: `${clipWidth}px`,
        left: `${clipLeft}px`,
        opacity: isDragging ? 0.5 : 1,
      }}
      onClick={() => onSelect(clip)}
    >
      <div style={styles.clipTitle}>{clip.assetId}</div>
    </div>
  );
};

// Track component
const Track = ({ track, pixelsPerSecond, onSelectClip }) => {
  const [{ isOver }, dropRef] = useDrop({
    accept: 'MEDIA_ITEM',
    drop: (item, monitor) => {
      // Calculate drop position in the timeline
      const dropResult = monitor.getClientOffset();
      // Implementation would convert pixel position to time
      console.log(`Dropped media item ${item.id} on track ${track.id} at position ${dropResult.x}`);
    },
    collect: (monitor) => ({
      isOver: monitor.isOver(),
    }),
  });
  
  return (
    <div style={styles.track}>
      <div style={styles.trackHeader}>
        <div style={{ padding: '8px' }}>{track.type} Track</div>
      </div>
      <div
        ref={dropRef}
        style={{
          ...styles.trackContent,
          backgroundColor: isOver ? '#353535' : '#252525',
        }}
      >
        {track.clips && track.clips.map((clip) => (
          <Clip
            key={clip.id}
            clip={clip}
            pixelsPerSecond={pixelsPerSecond}
            onSelect={onSelectClip}
          />
        ))}
      </div>
    </div>
  );
};

// Media item component (draggable)
const MediaItem = ({ asset }) => {
  const [{ isDragging }, dragRef] = useDrag({
    type: 'MEDIA_ITEM',
    item: { id: asset.id, type: 'MEDIA_ITEM', asset },
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  });
  
  return (
    <div
      ref={dragRef}
      style={{
        ...styles.mediaItem,
        opacity: isDragging ? 0.5 : 1,
      }}
    >
      {asset.metadata.name || asset.id}
    </div>
  );
};

// Time ruler component
const TimeRuler = ({ duration, pixelsPerSecond, scrollPosition }) => {
  const markers = [];
  const interval = 5; // Mark every 5 seconds
  
  for (let time = 0; time <= duration; time += interval) {
    markers.push(
      <div
        key={time}
        style={{
          ...styles.timeMarker,
          left: `${time * pixelsPerSecond}px`,
        }}
      >
        {formatTime(time)}
      </div>
    );
  }
  
  return (
    <div style={styles.timeRuler}>
      {markers}
    </div>
  );
};

/**
 * TimelineEditor Component
 * 
 * Main editor interface for the TimelineAssembler
 */
const TimelineEditor = ({ timelineId, firebaseConfig }) => {
  const [timeline, setTimeline] = useState(null);
  const [assets, setAssets] = useState([]);
  const [selectedClip, setSelectedClip] = useState(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [pixelsPerSecond, setPixelsPerSecond] = useState(50);
  const [scrollPosition, setScrollPosition] = useState(0);
  
  const tracksContainerRef = useRef(null);
  const playheadRef = useRef(null);
  const assemblerRef = useRef(null);
  
  // Initialize TimelineAssembler
  useEffect(() => {
    const initAssembler = async () => {
      const assembler = new TimelineAssembler({
        projectId: 'your-project-id', // In production, this would be passed as a prop
        credentials: firebaseConfig,
        geminiApiKey: 'your-gemini-api-key', // In production, this would be securely configured
      });
      
      assemblerRef.current = assembler;
      
      try {
        const timeline = await assembler.getTimeline(timelineId);
        setTimeline(timeline.data);
        
        // Fetch assets (in a real implementation)
        // const assets = await fetchAssets(timeline.id);
        // setAssets(assets);
        
        // Mock assets for demonstration
        setAssets([
          {
            id: 'asset-1',
            metadata: {
              name: 'Interview Shot 1',
              duration: 15,
              timestamp: '2025-06-23T10:00:00Z',
              scene: 'interview',
            }
          },
          {
            id: 'asset-2',
            metadata: {
              name: 'B-Roll City',
              duration: 8,
              timestamp: '2025-06-23T11:30:00Z',
              scene: 'b-roll',
            }
          },
          {
            id: 'asset-3',
            metadata: {
              name: 'Product Close-up',
              duration: 12,
              timestamp: '2025-06-23T14:15:00Z',
              scene: 'product',
            }
          }
        ]);
      } catch (error) {
        console.error('Error loading timeline:', error);
      }
    };
    
    initAssembler();
  }, [timelineId, firebaseConfig]);
  
  // Handle playback
  useEffect(() => {
    let animationFrame;
    const startTime = Date.now();
    const initialTime = currentTime;
    
    const updatePlayhead = () => {
      if (!isPlaying) return;
      
      const elapsed = (Date.now() - startTime) / 1000;
      const newTime = initialTime + elapsed;
      
      if (timeline && newTime <= timeline.duration) {
        setCurrentTime(newTime);
        animationFrame = requestAnimationFrame(updatePlayhead);
      } else {
        setIsPlaying(false);
      }
    };
    
    if (isPlaying) {
      animationFrame = requestAnimationFrame(updatePlayhead);
    }
    
    return () => {
      if (animationFrame) {
        cancelAnimationFrame(animationFrame);
      }
    };
  }, [isPlaying, currentTime, timeline]);
  
  // Update scroll position when tracks container is scrolled
  useEffect(() => {
    const handleScroll = () => {
      if (tracksContainerRef.current) {
        setScrollPosition(tracksContainerRef.current.scrollLeft);
      }
    };
    
    const container = tracksContainerRef.current;
    if (container) {
      container.addEventListener('scroll', handleScroll);
      return () => {
        container.removeEventListener('scroll', handleScroll);
      };
    }
  }, []);
  
  // Toggle play/pause
  const togglePlayback = () => {
    setIsPlaying(!isPlaying);
  };
  
  // Seek to a specific time
  const seekToTime = (time) => {
    setCurrentTime(time);
    setIsPlaying(false);
  };
  
  // Handle zoom in/out
  const zoomIn = () => {
    setPixelsPerSecond(pixelsPerSecond * 1.2);
  };
  
  const zoomOut = () => {
    setPixelsPerSecond(Math.max(10, pixelsPerSecond / 1.2));
  };
  
  // Handle auto-assembly
  const handleAutoAssemble = async () => {
    if (!assemblerRef.current || !timeline) return;
    
    try {
      const timelineObj = await assemblerRef.current.getTimeline(timelineId);
      await timelineObj.autoAssemble({
        strategy: 'chronological',
        groupBy: 'scene',
        addTransitions: true
      });
      
      // Refresh the timeline
      const updatedTimeline = await assemblerRef.current.getTimeline(timelineId);
      setTimeline(updatedTimeline.data);
    } catch (error) {
      console.error('Error auto-assembling timeline:', error);
    }
  };
  
  // Handle EDL export
  const handleExportEDL = async () => {
    if (!assemblerRef.current || !timeline) return;
    
    try {
      const timelineObj = await assemblerRef.current.getTimeline(timelineId);
      const edlUrl = await timelineObj.exportEDL({
        format: 'CMX3600',
        destination: {
          type: 'googleDrive',
          folderId: 'your-drive-folder-id' // In production, this would be configurable
        }
      });
      
      // Provide feedback to the user
      alert(`EDL exported successfully. Download URL: ${edlUrl}`);
    } catch (error) {
      console.error('Error exporting EDL:', error);
    }
  };
  
  if (!timeline) {
    return <div>Loading timeline...</div>;
  }
  
  return (
    <DndProvider backend={HTML5Backend}>
      <div style={styles.container}>
        <div style={styles.header}>
          <div style={styles.title}>{timeline.name}</div>
          <div style={styles.timeDisplay}>
            {formatTime(currentTime)} / {formatTime(timeline.duration)}
          </div>
          <div style={styles.controls}>
            <button 
              style={styles.button} 
              onClick={zoomOut}
            >
              Zoom Out
            </button>
            <button 
              style={styles.button} 
              onClick={zoomIn}
            >
              Zoom In
            </button>
            <button 
              style={{...styles.button, ...styles.primaryButton}} 
              onClick={togglePlayback}
            >
              {isPlaying ? 'Pause' : 'Play'}
            </button>
            <button 
              style={styles.button} 
              onClick={handleAutoAssemble}
            >
              Auto-Assemble
            </button>
            <button 
              style={styles.button} 
              onClick={handleExportEDL}
            >
              Export EDL
            </button>
          </div>
        </div>
        
        <div style={styles.timeline}>
          <TimeRuler 
            duration={timeline.duration} 
            pixelsPerSecond={pixelsPerSecond}
            scrollPosition={scrollPosition}
          />
          
          <div style={{ display: 'flex', flex: 1 }}>
            <div 
              ref={tracksContainerRef}
              style={styles.tracksContainer}
            >
              {/* Playhead */}
              <div 
                ref={playheadRef}
                style={{
                  ...styles.playhead,
                  left: `${currentTime * pixelsPerSecond}px`,
                }}
              />
              
              {/* Tracks */}
              {timeline.tracks && timeline.tracks.map((track) => (
                <Track
                  key={track.id}
                  track={track}
                  pixelsPerSecond={pixelsPerSecond}
                  onSelectClip={setSelectedClip}
                />
              ))}
            </div>
            
            {/* Media Panel */}
            <div style={styles.mediaPanel}>
              <h3>Media Assets</h3>
              <p>Drag assets to timeline:</p>
              
              {assets.map((asset) => (
                <MediaItem key={asset.id} asset={asset} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </DndProvider>
  );
};

export default TimelineEditor;