/**
 * TimelineAssembler - Firebase Cloud Functions
 * 
 * Server-side functions for the TimelineAssembler media automation tool.
 */

const functions = require('firebase-functions');
const admin = require('firebase-admin');
const { Storage } = require('@google-cloud/storage');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const ffmpeg = require('fluent-ffmpeg');
const path = require('path');
const os = require('os');
const fs = require('fs');
const { GoogleAuth } = require('google-auth-library');
const { google } = require('googleapis');

// Initialize Firebase
admin.initializeApp();

// Initialize Google Cloud Storage
const storage = new Storage();

// Initialize Gemini API
const geminiApiKey = process.env.GEMINI_API_KEY;
const genAI = new GoogleGenerativeAI(geminiApiKey);

/**
 * Process a new media file uploaded to Cloud Storage
 * Extracts metadata, generates thumbnails, and transcodes if needed
 */
exports.processMediaUpload = functions.storage.object().onFinalize(async (object) => {
  const fileBucket = object.bucket;
  const filePath = object.name;
  const contentType = object.contentType;
  
  // Exit if this is not a media file
  if (!contentType.startsWith('video/') && !contentType.startsWith('audio/')) {
    console.log('Not a media file, exiting function');
    return;
  }
  
  // Get project and timeline IDs from the file path structure
  // Expected path: projects/{projectId}/timelines/{timelineId}/media/{fileName}
  const pathSegments = filePath.split('/');
  if (pathSegments.length < 6 || pathSegments[0] !== 'projects' || pathSegments[2] !== 'timelines' || pathSegments[4] !== 'media') {
    console.log('Invalid file path structure');
    return;
  }
  
  const projectId = pathSegments[1];
  const timelineId = pathSegments[3];
  const fileName = pathSegments[5];
  
  console.log(`Processing media upload for project ${projectId}, timeline ${timelineId}: ${fileName}`);
  
  try {
    // Download file to temporary location
    const bucket = storage.bucket(fileBucket);
    const tempFilePath = path.join(os.tmpdir(), fileName);
    
    await bucket.file(filePath).download({ destination: tempFilePath });
    console.log(`Downloaded file to ${tempFilePath}`);
    
    // Extract media metadata using FFmpeg
    const metadata = await extractMediaMetadata(tempFilePath);
    console.log('Extracted metadata:', metadata);
    
    // Generate thumbnail for video files
    let thumbnailUrl = null;
    if (contentType.startsWith('video/')) {
      thumbnailUrl = await generateThumbnail(bucket, filePath, tempFilePath, timelineId);
      console.log('Generated thumbnail:', thumbnailUrl);
    }
    
    // Analyze content with Gemini API
    const contentAnalysis = await analyzeMediaContent(tempFilePath, contentType);
    console.log('Content analysis complete');
    
    // Store asset information in Firestore
    const assetId = `asset-${Date.now()}`;
    await admin.database().ref(`projects/${projectId}/timelines/${timelineId}/assets/${assetId}`).set({
      id: assetId,
      fileName: fileName,
      contentType: contentType,
      storagePath: filePath,
      thumbnailUrl: thumbnailUrl,
      uploadTime: admin.database.ServerValue.TIMESTAMP,
      metadata: {
        ...metadata,
        analysis: contentAnalysis
      }
    });
    
    console.log(`Asset ${assetId} added to timeline ${timelineId}`);
    
    // Clean up temporary files
    fs.unlinkSync(tempFilePath);
    
    return { success: true, assetId };
  } catch (error) {
    console.error('Error processing media upload:', error);
    return { success: false, error: error.message };
  }
});

/**
 * Extract metadata from media file using FFmpeg
 */
async function extractMediaMetadata(filePath) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) {
        return reject(err);
      }
      
      const { format, streams } = metadata;
      const videoStream = streams.find(s => s.codec_type === 'video');
      const audioStream = streams.find(s => s.codec_type === 'audio');
      
      // Extract relevant metadata
      const result = {
        duration: format.duration || 0,
        size: format.size || 0,
        bitrate: format.bit_rate || 0,
        format: format.format_name || '',
      };
      
      // Add video-specific metadata
      if (videoStream) {
        result.video = {
          codec: videoStream.codec_name,
          width: videoStream.width,
          height: videoStream.height,
          frameRate: eval(videoStream.r_frame_rate) || 0,
          bitrate: videoStream.bit_rate || 0,
        };
      }
      
      // Add audio-specific metadata
      if (audioStream) {
        result.audio = {
          codec: audioStream.codec_name,
          channels: audioStream.channels,
          sampleRate: audioStream.sample_rate,
          bitrate: audioStream.bit_rate || 0,
        };
      }
      
      resolve(result);
    });
  });
}

/**
 * Generate a thumbnail image from a video file
 */
async function generateThumbnail(bucket, filePath, tempFilePath, timelineId) {
  const thumbnailFilename = `${path.basename(filePath, path.extname(filePath))}_thumb.jpg`;
  const thumbnailTempPath = path.join(os.tmpdir(), thumbnailFilename);
  const thumbnailStoragePath = `projects/${path.dirname(filePath).split('/')[1]}/timelines/${timelineId}/thumbnails/${thumbnailFilename}`;
  
  return new Promise((resolve, reject) => {
    // Generate thumbnail at 25% of the video duration
    ffmpeg(tempFilePath)
      .on('end', async () => {
        try {
          // Upload thumbnail to Cloud Storage
          await bucket.upload(thumbnailTempPath, {
            destination: thumbnailStoragePath,
            metadata: {
              contentType: 'image/jpeg',
            },
          });
          
          // Get public URL for the thumbnail
          const [url] = await bucket.file(thumbnailStoragePath).getSignedUrl({
            action: 'read',
            expires: '01-01-2100',
          });
          
          // Clean up temporary thumbnail file
          fs.unlinkSync(thumbnailTempPath);
          
          resolve(url);
        } catch (error) {
          reject(error);
        }
      })
      .on('error', (err) => {
        reject(err);
      })
      .screenshots({
        timestamps: ['25%'],
        filename: thumbnailFilename,
        folder: os.tmpdir(),
        size: '320x240',
      });
  });
}

/**
 * Analyze media content using Gemini API
 */
async function analyzeMediaContent(filePath, contentType) {
  try {
    // For videos, use a thumbnail frame for analysis
    let imageBuffer;
    
    if (contentType.startsWith('video/')) {
      const thumbnailPath = path.join(os.tmpdir(), `${path.basename(filePath)}_analysis_frame.jpg`);
      
      // Extract a frame from the middle of the video
      await new Promise((resolve, reject) => {
        ffmpeg(filePath)
          .on('end', () => resolve())
          .on('error', (err) => reject(err))
          .screenshots({
            timestamps: ['50%'],
            filename: path.basename(thumbnailPath),
            folder: path.dirname(thumbnailPath),
            size: '640x360',
          });
      });
      
      imageBuffer = fs.readFileSync(thumbnailPath);
      fs.unlinkSync(thumbnailPath);
    } else if (contentType.startsWith('audio/')) {
      // For audio, we'll use a generic audio waveform image
      // In a production system, this could generate a waveform visualization
      return { type: 'audio', description: 'Audio content - waveform analysis not available' };
    } else {
      return { error: 'Unsupported media type for analysis' };
    }
    
    // Use Gemini API to analyze the media content
    const model = genAI.getGenerativeModel({ model: "gemini-pro-vision" });
    
    const result = await model.generateContent({
      contents: [
        {
          role: "user",
          parts: [
            { text: "Analyze this media file and provide structured metadata for a video editing timeline. Include scene description, mood, key visual elements, and suggested timeline placement. Format as JSON." },
            { inlineData: { mimeType: "image/jpeg", data: imageBuffer.toString('base64') } }
          ]
        }
      ]
    });
    
    const responseText = result.response.text();
    
    // Extract JSON from the response (Gemini might wrap it in markdown code blocks)
    const jsonMatch = responseText.match(/```json\n([\s\S]*?)\n```/) || responseText.match(/```\n([\s\S]*?)\n```/);
    
    if (jsonMatch && jsonMatch[1]) {
      try {
        return JSON.parse(jsonMatch[1]);
      } catch (e) {
        console.error('Error parsing JSON from Gemini response:', e);
        return { text: responseText };
      }
    } else {
      return { text: responseText };
    }
  } catch (error) {
    console.error('Error analyzing media content:', error);
    return { error: error.message };
  }
}

/**
 * Auto-assemble a timeline based on available media assets
 */
exports.autoAssembleTimeline = functions.https.onCall(async (data, context) => {
  // Ensure user is authenticated
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated to use this function');
  }
  
  const { projectId, timelineId, strategy, groupBy, addTransitions } = data;
  
  if (!projectId || !timelineId) {
    throw new functions.https.HttpsError('invalid-argument', 'Project ID and Timeline ID are required');
  }
  
  try {
    // Get the timeline data
    const timelineSnapshot = await admin.database().ref(`projects/${projectId}/timelines/${timelineId}`).once('value');
    const timeline = timelineSnapshot.val();
    
    if (!timeline) {
      throw new functions.https.HttpsError('not-found', `Timeline ${timelineId} not found`);
    }
    
    // Get all assets for this timeline
    const assetsSnapshot = await admin.database().ref(`projects/${projectId}/timelines/${timelineId}/assets`).once('value');
    const assets = [];
    
    assetsSnapshot.forEach(childSnapshot => {
      assets.push(childSnapshot.val());
    });
    
    if (assets.length === 0) {
      throw new functions.https.HttpsError('failed-precondition', 'No assets found for this timeline');
    }
    
    // Sort assets based on the selected strategy
    let sortedAssets;
    switch (strategy) {
      case 'chronological':
        // Sort by uploadTime if timestamp is not available
        sortedAssets = assets.sort((a, b) => {
          const aTime = a.metadata.timestamp ? new Date(a.metadata.timestamp) : new Date(a.uploadTime);
          const bTime = b.metadata.timestamp ? new Date(b.metadata.timestamp) : new Date(b.uploadTime);
          return aTime - bTime;
        });
        break;
      case 'semantic':
        // Use Gemini API to determine semantic ordering (simplified for this example)
        sortedAssets = assets;
        break;
      default:
        sortedAssets = assets;
    }
    
    // Group assets if requested
    let groupedAssets = sortedAssets;
    if (groupBy) {
      // Group assets by the specified property in metadata or analysis
      const groups = {};
      for (const asset of sortedAssets) {
        let groupKey = 'unknown';
        
        // Try to find the groupBy property in various locations
        if (asset.metadata && asset.metadata[groupBy]) {
          groupKey = asset.metadata[groupBy];
        } else if (asset.metadata && asset.metadata.analysis && asset.metadata.analysis[groupBy]) {
          groupKey = asset.metadata.analysis[groupBy];
        }
        
        if (!groups[groupKey]) {
          groups[groupKey] = [];
        }
        groups[groupKey].push(asset);
      }
      
      // Flatten grouped assets back into an array, preserving group order
      groupedAssets = Object.values(groups).flat();
    }
    
    // Create tracks and clips
    const tracks = [
      {
        id: `track-${Date.now()}`,
        type: 'video',
        clips: []
      }
    ];
    
    let currentTime = 0;
    for (const asset of groupedAssets) {
      const clipDuration = asset.metadata.duration || 5; // Default to 5 seconds if duration not available
      
      const clip = {
        id: `clip-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        assetId: asset.id,
        startTime: currentTime,
        endTime: currentTime + clipDuration,
        inPoint: 0,
        outPoint: clipDuration,
        transitions: {
          in: null,
          out: null
        }
      };
      
      // Add transitions if requested
      if (addTransitions && tracks[0].clips.length > 0) {
        const transitionDuration = Math.min(1.0, clipDuration / 4); // Limit transition to 1/4 of clip duration, max 1 second
        
        clip.transitions.in = {
          type: 'dissolve',
          duration: transitionDuration
        };
      }
      
      tracks[0].clips.push(clip);
      currentTime += clipDuration;
    }
    
    // Update the timeline with the new tracks
    const updates = {
      tracks: tracks,
      duration: currentTime,
      modified: admin.database.ServerValue.TIMESTAMP
    };
    
    await admin.database().ref(`projects/${projectId}/timelines/${timelineId}`).update(updates);
    
    return { 
      success: true, 
      message: `Timeline assembled with ${groupedAssets.length} clips`,
      tracks: tracks, 
      duration: currentTime 
    };
  } catch (error) {
    console.error('Error auto-assembling timeline:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Export a timeline as an Edit Decision List (EDL)
 */
exports.exportTimelineEDL = functions.https.onCall(async (data, context) => {
  // Ensure user is authenticated
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated to use this function');
  }
  
  const { projectId, timelineId, format, destination } = data;
  
  if (!projectId || !timelineId) {
    throw new functions.https.HttpsError('invalid-argument', 'Project ID and Timeline ID are required');
  }
  
  try {
    // Get the timeline data
    const timelineSnapshot = await admin.database().ref(`projects/${projectId}/timelines/${timelineId}`).once('value');
    const timeline = timelineSnapshot.val();
    
    if (!timeline) {
      throw new functions.https.HttpsError('not-found', `Timeline ${timelineId} not found`);
    }
    
    if (!timeline.tracks || timeline.tracks.length === 0) {
      throw new functions.https.HttpsError('failed-precondition', 'Timeline has no tracks or clips');
    }
    
    // Generate EDL content based on the format
    let edlContent = '';
    
    switch (format) {
      case 'CMX3600':
        edlContent = generateCMX3600EDL(timeline);
        break;
      default:
        throw new functions.https.HttpsError('invalid-argument', `Unsupported EDL format: ${format}`);
    }
    
    // Create a file in Cloud Storage
    const edlFileName = `${timeline.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_${Date.now()}.edl`;
    const bucket = storage.bucket(process.env.FIREBASE_STORAGE_BUCKET);
    const edlFilePath = `projects/${projectId}/timelines/${timelineId}/exports/${edlFileName}`;
    const tempFilePath = path.join(os.tmpdir(), edlFileName);
    
    // Write EDL content to temporary file
    fs.writeFileSync(tempFilePath, edlContent);
    
    // Upload to Cloud Storage
    await bucket.upload(tempFilePath, {
      destination: edlFilePath,
      metadata: {
        contentType: 'text/plain',
      },
    });
    
    // Get the download URL
    const [downloadUrl] = await bucket.file(edlFilePath).getSignedUrl({
      action: 'read',
      expires: '01-01-2100',
    });
    
    // Clean up temporary file
    fs.unlinkSync(tempFilePath);
    
    // If Google Drive destination is specified, also save to Drive
    let driveFileId = null;
    if (destination && destination.type === 'googleDrive' && destination.folderId) {
      driveFileId = await saveToGoogleDrive(tempFilePath, edlFileName, edlContent, destination.folderId);
    }
    
    // Record the export in the timeline's history
    const historyRef = admin.database().ref(`projects/${projectId}/timelines/${timelineId}/exportHistory`).push();
    await historyRef.set({
      id: historyRef.key,
      timestamp: admin.database.ServerValue.TIMESTAMP,
      format: format,
      url: downloadUrl,
      driveFileId: driveFileId
    });
    
    return { 
      success: true, 
      url: downloadUrl,
      driveFileId: driveFileId
    };
  } catch (error) {
    console.error('Error exporting timeline EDL:', error);
    throw new functions.https.HttpsError('internal', error.message);
  }
});

/**
 * Generate a CMX3600 format EDL
 */
function generateCMX3600EDL(timeline) {
  let edl = `TITLE: ${timeline.name}\n`;
  edl += `FCM: NON-DROP FRAME\n\n`;
  
  let eventNumber = 1;
  
  for (const track of timeline.tracks) {
    for (const clip of track.clips) {
      // Format timecodes
      const formatTC = (seconds) => {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = Math.floor(seconds % 60);
        const f = Math.floor((seconds % 1) * (timeline.framerate || 24));
        return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}:${f.toString().padStart(2, '0')}`;
      };
      
      const sourceStart = formatTC(clip.inPoint);
      const sourceEnd = formatTC(clip.outPoint);
      const recordStart = formatTC(clip.startTime);
      const recordEnd = formatTC(clip.endTime);
      
      edl += `${eventNumber.toString().padStart(3, '0')}  AX       V     C        ${sourceStart} ${sourceEnd} ${recordStart} ${recordEnd}\n`;
      edl += `* FROM CLIP NAME: ${clip.assetId}\n\n`;
      
      eventNumber++;
    }
  }
  
  return edl;
}

/**
 * Save a file to Google Drive
 */
async function saveToGoogleDrive(filePath, fileName, content, folderId) {
  // Use Application Default Credentials
  const auth = new GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/drive.file']
  });
  
  const drive = google.drive({ version: 'v3', auth });
  
  // Create a temporary file if one was not provided
  let tempFilePath = filePath;
  let cleanupTemp = false;
  
  if (!filePath) {
    tempFilePath = path.join(os.tmpdir(), fileName);
    fs.writeFileSync(tempFilePath, content);
    cleanupTemp = true;
  }
  
  try {
    // Upload file to Google Drive
    const response = await drive.files.create({
      requestBody: {
        name: fileName,
        mimeType: 'text/plain',
        parents: [folderId]
      },
      media: {
        mimeType: 'text/plain',
        body: fs.createReadStream(tempFilePath)
      }
    });
    
    // Clean up if we created a temporary file
    if (cleanupTemp) {
      fs.unlinkSync(tempFilePath);
    }
    
    return response.data.id;
  } catch (error) {
    console.error('Error saving to Google Drive:', error);
    
    // Clean up if we created a temporary file
    if (cleanupTemp && fs.existsSync(tempFilePath)) {
      fs.unlinkSync(tempFilePath);
    }
    
    throw error;
  }
}