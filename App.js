import { StatusBar } from 'expo-status-bar';
import React, { useState, useEffect, useRef } from 'react';
import { 
  StyleSheet, 
  Text, 
  View, 
  TouchableOpacity, 
  ScrollView, 
  SafeAreaView,
  Dimensions,
  Animated,
  PanResponder,
  Alert
} from 'react-native';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import axios from 'axios';
import Constants from 'expo-constants';
import {
  useFonts,
  JetBrainsMono_400Regular,
  JetBrainsMono_500Medium,
  JetBrainsMono_700Bold
} from '@expo-google-fonts/jetbrains-mono';

// Groq API Configuration
const GROQ_CONFIG = {
  API_KEY: Constants.expoConfig?.extra?.groqApiKey || '',
  WHISPER_ENDPOINT: 'https://api.groq.com/openai/v1/audio/transcriptions',
  MODEL: 'whisper-large-v3', // Changed back to full model for better accuracy
  RESPONSE_FORMAT: 'json',
  LANGUAGE: 'en',
};

const { width } = Dimensions.get('window');

// Recording options for better audio quality
const recordingOptions = {
  android: {
    extension: '.m4a',
    outputFormat: Audio.RECORDING_OPTION_ANDROID_OUTPUT_FORMAT_MPEG_4,
    audioEncoder: Audio.RECORDING_OPTION_ANDROID_AUDIO_ENCODER_AAC,
    sampleRate: 44100,
    numberOfChannels: 2,
    bitRate: 128000,
  },
  ios: {
    extension: '.m4a',
    outputFormat: Audio.RECORDING_OPTION_IOS_OUTPUT_FORMAT_MPEG4AAC,
    audioQuality: Audio.RECORDING_OPTION_IOS_AUDIO_QUALITY_HIGH,
    sampleRate: 44100,
    numberOfChannels: 2,
    bitRate: 128000,
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
};

export default function App() {
  // Recording state
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [recordings, setRecordings] = useState([]);
  const [currentRecording, setCurrentRecording] = useState(null);
  const [recording, setRecording] = useState(null);
  
  // Playback state
  const [playingId, setPlayingId] = useState(null);
  const [playbackProgress, setPlaybackProgress] = useState({});
  const [currentSound, setCurrentSound] = useState(null);
  const [playbackPosition, setPlaybackPosition] = useState(0);
  const [playbackDuration, setPlaybackDuration] = useState(0);

  // Transcription state
  const [isTranscribing, setIsTranscribing] = useState(false);
  
  // Animation refs
  const diskRotation = useRef(new Animated.Value(0)).current;
  const diskScale = useRef(new Animated.Value(1)).current;
  
  // Time and date state
  const [currentDate, setCurrentDate] = useState('');
  
  const [fontsLoaded, fontError] = useFonts({
    JetBrainsMono_400Regular,
    JetBrainsMono_500Medium,
    JetBrainsMono_700Bold
  });

  // Setup audio permissions and recording
  useEffect(() => {
    const setupAudio = async () => {
      try {
        const { status } = await Audio.requestPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Permission needed', 'Please grant microphone permission to record audio.');
          return;
        }

        // Build audio mode compatible with recent Expo SDKs
        const mode = {
          allowsRecordingIOS: true,
          playsInSilentModeIOS: true,
          staysActiveInBackground: false,
          shouldDuckAndroid: true,
          playThroughEarpieceAndroid: false,
        };

        // Use new enums if available (SDK 50/51+). Older SDKs will ignore these lines.
        if (Audio.InterruptionModeIOS) {
          mode.interruptionModeIOS = Audio.InterruptionModeIOS.DoNotMix;
        }
        if (Audio.InterruptionModeAndroid) {
          mode.interruptionModeAndroid = Audio.InterruptionModeAndroid.DoNotMix;
        }

        await Audio.setAudioModeAsync(mode);
      } catch (e) {
        console.error('Failed to setup audio:', e);
      }
    };
    setupAudio();
  }, []);

  // Format recording duration for display
  const formatDuration = (seconds) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hours}.${minutes.toString().padStart(2, '0')}.${secs.toString().padStart(2, '0')}`;
  };

  // Update date on mount
  useEffect(() => {
    const updateDate = () => {
      const now = new Date();
      const options = { day: '2-digit', month: 'short' };
      const formattedDate = now.toLocaleDateString('en-US', options).toUpperCase();
      setCurrentDate(formattedDate);
    };

    updateDate();
  }, []);

  // Recording duration timer
  useEffect(() => {
    let interval = null;
    if (isRecording && !isPaused) {
      interval = setInterval(() => {
        setRecordingDuration(prev => prev + 1);
      }, 1000);
    } else if (!isRecording) {
      setRecordingDuration(0);
    }
    return () => clearInterval(interval);
  }, [isRecording, isPaused]);

  // Disk spinning animation
  useEffect(() => {
    if (isRecording && !isPaused) {
      startDiskAnimation();
    } else {
      stopDiskAnimation();
    }
  }, [isRecording, isPaused]);

  const startDiskAnimation = () => {
    diskRotation.setValue(0);
    Animated.loop(
      Animated.timing(diskRotation, {
        toValue: 1,
        duration: 3000,
        useNativeDriver: true,
      })
    ).start();
  };

  const stopDiskAnimation = () => {
    diskRotation.stopAnimation();
  };

  // Audio recording functions
  const startRecording = async () => {
    try {
      if (recording) {
        await recording.stopAndUnloadAsync();
      }

      console.log('Starting recording with improved options...');
      
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const { recording: newRecording } = await Audio.Recording.createAsync(recordingOptions);
      setRecording(newRecording);
      setIsRecording(true);
      setIsPaused(false);
    } catch (error) {
      console.error('Failed to start recording:', error);
      Alert.alert('Recording Error', 'Failed to start recording. Please try again.');
    }
  };

  const pauseRecording = async () => {
    try {
      if (recording && isRecording) {
        if (isPaused) {
          await recording.startAsync();
          setIsPaused(false);
        } else {
          await recording.pauseAsync();
          setIsPaused(true);
        }
      }
    } catch (error) {
      console.error('Failed to pause/resume recording:', error);
    }
  };

  const stopRecording = async () => {
    try {
      if (!recording) return;

      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      
      // Create new recording entry with transcription placeholder
      const newRecording = {
        id: Date.now(),
        duration: formatDuration(recordingDuration),
        transcription: 'Transcribing...',
        time: new Date().toLocaleTimeString('en-US', { 
          hour: '2-digit', 
          minute: '2-digit',
          hour12: true 
        }),
        section: 'Today',
        uri: uri,
        isTranscribing: true
      };

      setRecordings(prev => [newRecording, ...prev]);
      setRecording(null);
      setIsRecording(false);
      setIsPaused(false);
      setRecordingDuration(0);

      // Start transcription in background
      transcribeWithGroq(newRecording);
    } catch (error) {
      console.error('Failed to stop recording:', error);
      Alert.alert('Recording Error', 'Failed to stop recording.');
    }
  };

  const saveCurrentRecording = async () => {
    if (isRecording) {
      await stopRecording();
      Alert.alert('Recording Saved', 'Your recording has been saved successfully!');
    }
  };

  // Playback functions
  const playRecording = async (recording) => {
    try {
      // Stop any currently playing sound
      if (currentSound) {
        await currentSound.unloadAsync();
        setCurrentSound(null);
      }

      // Don't play if no URI
      if (!recording.uri) {
        Alert.alert('Error', 'Recording file not found');
        return;
      }

      // Create and load the sound with volume settings
      const { sound } = await Audio.Sound.createAsync(
        { uri: recording.uri },
        { 
          shouldPlay: true, 
          isLooping: false,
          volume: 1.0,
          rate: 1.0,
          shouldCorrectPitch: true,
          androidImplementation: 'MediaPlayer',
        }
      );
      
      setCurrentSound(sound);
      setPlayingId(recording.id);
      
      // Set volume to maximum after loading
      await sound.setVolumeAsync(1.0);
      
      // Get duration and set up progress tracking
      const status = await sound.getStatusAsync();
      if (status.isLoaded) {
        setPlaybackDuration(status.durationMillis || 0);
      }

      // Set up playback status update
      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded) {
          setPlaybackPosition(status.positionMillis || 0);
          
          // Update progress for this recording
          const progress = status.durationMillis 
            ? (status.positionMillis / status.durationMillis) * 100 
            : 0;
          
          setPlaybackProgress(prev => ({
            ...prev,
            [recording.id]: progress
          }));

          // Stop when finished
          if (status.didJustFinish) {
            setPlayingId(null);
            setPlaybackPosition(0);
            setPlaybackProgress(prev => ({
              ...prev,
              [recording.id]: 0
            }));
          }
        }
      });

    } catch (error) {
      console.error('Error playing recording:', error);
      Alert.alert('Playback Error', 'Could not play the recording');
    }
  };

  const pausePlayback = async () => {
    try {
      if (currentSound) {
        const status = await currentSound.getStatusAsync();
        if (status.isLoaded && status.isPlaying) {
          await currentSound.pauseAsync();
        } else if (status.isLoaded && !status.isPlaying) {
          await currentSound.playAsync();
        }
      }
    } catch (error) {
      console.error('Error pausing playback:', error);
    }
  };

  const stopPlayback = async () => {
    try {
      if (currentSound) {
        await currentSound.stopAsync();
        await currentSound.unloadAsync();
        setCurrentSound(null);
      }
      setPlayingId(null);
      setPlaybackPosition(0);
      setPlaybackProgress({});
    } catch (error) {
      console.error('Error stopping playback:', error);
    }
  };

  // Clean up sound when component unmounts
  useEffect(() => {
    return () => {
      if (currentSound) {
        currentSound.unloadAsync();
      }
    };
  }, [currentSound]);

  // Groq transcription function
  const transcribeWithGroq = async (recording) => {
    try {
      // Debug log for API key
      const apiKey = Constants.expoConfig?.extra?.groqApiKey;
      console.log('API Key available:', !!apiKey);
      console.log('API Key length:', apiKey ? apiKey.length : 0);
      
      // Check if Groq API key is configured
      if (!GROQ_CONFIG.API_KEY || GROQ_CONFIG.API_KEY === 'your-groq-api-key-here') {
        console.log('GROQ_CONFIG.API_KEY:', GROQ_CONFIG.API_KEY);
        setRecordings(prev => 
          prev.map(r => 
            r.id === recording.id 
              ? { ...r, transcription: 'Transcription not available - Groq API key not configured', isTranscribing: false }
              : r
          )
        );
        return;
      }

      // Validate audio file
      if (!recording.uri) {
        throw new Error('Audio file not found');
      }

      const fileInfo = await FileSystem.getInfoAsync(recording.uri);
      if (!fileInfo.exists) {
        throw new Error('Audio file does not exist');
      }

      console.log('Starting Groq transcription for:', recording.uri);
      console.log('File size:', fileInfo.size, 'bytes');
      console.log('File exists:', fileInfo.exists);

      setIsTranscribing(true);

      // Prepare form data for Groq API
      const formData = new FormData();
      
      // Add the audio file
      formData.append('file', {
        uri: recording.uri,
        type: 'audio/m4a',
        name: 'recording.m4a',
      });
      
      // Add required parameters
      formData.append('model', GROQ_CONFIG.MODEL);
      formData.append('response_format', GROQ_CONFIG.RESPONSE_FORMAT);
      formData.append('temperature', '0.0'); // More focused transcription
      
      // Optional language parameter
      if (GROQ_CONFIG.LANGUAGE) {
        formData.append('language', GROQ_CONFIG.LANGUAGE);
      }

      console.log('Sending request to Groq API...');
      console.log('Endpoint:', GROQ_CONFIG.WHISPER_ENDPOINT);
      console.log('Model:', GROQ_CONFIG.MODEL);

      // Make API request to Groq
      const response = await axios.post(
        GROQ_CONFIG.WHISPER_ENDPOINT,
        formData,
        {
          headers: {
            'Authorization': `Bearer ${GROQ_CONFIG.API_KEY}`,
            'Content-Type': 'multipart/form-data',
          },
          timeout: 30000, // 30 second timeout
        }
      );

      console.log('Response status:', response.status);
      console.log('Response data:', response.data);

      // Extract transcription from response
      const transcription = response.data.text || 'No transcription available';
      console.log('Groq transcription successful:', transcription);
      
      // Update the recording with transcription
      setRecordings(prev => 
        prev.map(r => 
          r.id === recording.id 
            ? { ...r, transcription: transcription, isTranscribing: false }
            : r
        )
      );

    } catch (error) {
      console.error('Groq transcription error:', error);
      console.error('Error details:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status,
        request: error.request ? 'Request made but no response' : 'No request made'
      });
      
      let errorMessage = 'Failed to transcribe audio';
      
      if (error.response) {
        const status = error.response.status;
        const apiMessage = error.response.data?.error?.message || 'Unknown API error';
        
        console.log('API Error Response:', error.response.data);
        
        switch (status) {
          case 401:
            errorMessage = 'Invalid Groq API key';
            break;
          case 413:
            errorMessage = 'Audio file too large (max 25MB)';
            break;
          case 429:
            errorMessage = 'API rate limit exceeded';
            break;
          case 400:
            errorMessage = `Bad request: ${apiMessage}`;
            break;
          default:
            errorMessage = `API Error (${status}): ${apiMessage}`;
        }
      } else if (error.request) {
        errorMessage = 'Network error - check internet connection';
      }
      
      // Update with error message
      setRecordings(prev => 
        prev.map(r => 
          r.id === recording.id 
            ? { ...r, transcription: `Transcription failed: ${errorMessage}`, isTranscribing: false }
            : r
        )
      );

      // Show error to user
      Alert.alert('Transcription Failed', errorMessage);
    } finally {
      setIsTranscribing(false);
    }
  };

  // Two-finger gesture handler for disk
  const panResponder = PanResponder.create({
    onStartShouldSetPanResponder: (evt) => evt.nativeEvent.touches.length === 2,
    onMoveShouldSetPanResponder: (evt) => evt.nativeEvent.touches.length === 2,
    onPanResponderGrant: () => {
      if (isRecording && !isPaused) {
        pauseRecording();
        Animated.timing(diskScale, {
          toValue: 0.95,
          duration: 200,
          useNativeDriver: true,
        }).start();
      }
    },
    onPanResponderRelease: () => {
      if (isRecording && isPaused) {
        pauseRecording();
        Animated.timing(diskScale, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }).start();
      }
    },
  });

  // Show loading screen while fonts are loading
  if (!fontsLoaded && !fontError) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <Text style={styles.loadingText}>Loading TP-7...</Text>
      </SafeAreaView>
    );
  }

  // Initial sample recordings for demo
  const sampleRecordings = recordings.length === 0 ? [
    {
      id: 1,
      duration: '00:30',
      transcription: 'Yo mama so fat she hit da quan. For real.',
      time: '11:35 AM',
      section: 'Today'
    },
    {
      id: 2,
      duration: '01:24',
      transcription: "This is a very long transcription to test the read more functionality. It contains multiple sentences and should definitely exceed the 200 character limit that we've set. When this transcription is displayed, it should show only the first few lines and then display a 'Read More' button. When the user taps 'Read More', the full transcription should expand to show all the content. This is exactly what we want to test to ensure our expandable transcription feature is working correctly. The transcription should collapse back when 'Read Less' is tapped.",
      time: '11:35 AM',
      section: 'Today'
    },
    {
      id: 3,
      duration: '00:30',
      transcription: 'Yo mama so fat she hit da quan. For real.',
      time: '11:35 AM',
      section: 'Yesterday'
    },
    {
      id: 4,
      duration: '00:24',
      transcription: "Well I'm a peanut bar and I'm here to say. Your checks will arrive on another day! Another day, another dime, another rh...",
      time: '11:35 AM',
      section: 'Yesterday'
    }
  ] : recordings;

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        
        {/* Main TP-7 Device */}
        <View style={styles.tp7Container}>
          {/* Top Section */}
          <View style={styles.topSection}>
            {/* Top Left Dots */}
            <View style={styles.topLeftDots}>
              <View style={styles.smallDot} />
              <View style={styles.smallDot} />
            </View>

            {/* Top Right Display */}
            <View style={[styles.display, isRecording && styles.displayRecording]}>
              <Text style={[styles.timeText, isRecording && styles.timeTextRecording]}>
                {isRecording || recordingDuration > 0 ? formatDuration(recordingDuration) : '0.00.00'}
              </Text>
              <View style={styles.dateRow}>
                <Text style={styles.dateText}>TODAY</Text>
                <View style={styles.dateBox}>
                  <Text style={styles.dateNumber}>13</Text>
                </View>
              </View>
            </View>

            {/* Orange Square Top Right */}
            <View style={styles.orangeSquareTop} />
          </View>

          {/* Main Content Area */}
          <View style={styles.mainArea}>
            {/* Left Controls */}
            <View style={styles.leftControls}>
              <View style={styles.arrowGroup}>
                <TouchableOpacity style={styles.arrowButton}>
                  <Text style={styles.arrowText}>▲</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.arrowButton}>
                  <Text style={styles.arrowText}>▲</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.spacer} />
              <View style={styles.bottomArrowGroup}>
                <TouchableOpacity style={styles.arrowButton}>
                  <Text style={[styles.arrowText, { transform: [{ rotate: '180deg' }] }]}>▲</Text>
                </TouchableOpacity>
                <Text style={styles.rLabel}>R</Text>
              </View>
            </View>

            {/* Central Disk */}
            <View style={styles.diskContainer} {...panResponder.panHandlers}>
              <Animated.View 
                style={[
                  styles.largeDisk,
                  {
                    transform: [
                      {
                        rotate: diskRotation.interpolate({
                          inputRange: [0, 1],
                          outputRange: ['0deg', '360deg'],
                        }),
                      },
                      { scale: diskScale }
                    ],
                  },
                ]}
              >
                <View style={styles.diskLine} />
                <View style={styles.diskCenter} />
              </Animated.View>
            </View>

            {/* Bottom Left Black Circle */}
            <View style={styles.bottomLeftCircle} />
          </View>

          {/* Bottom Control Section */}
          <View style={styles.bottomControlSection}>
            <TouchableOpacity 
              style={styles.bottomControlButton}
              onPress={isRecording ? stopRecording : startRecording}
            >
              <View style={[
                styles.orangeCircle, 
                { backgroundColor: isRecording ? '#ff3333' : '#f0630d' }
              ]} />
            </TouchableOpacity>
            
            <TouchableOpacity style={styles.bottomControlButton}>
              <Text style={styles.playButton}>▶</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={styles.bottomControlButton}
              onPress={stopRecording}
            >
              <View style={styles.blackSquare} />
            </TouchableOpacity>
            
            <View style={styles.levelIndicator}>
              <View style={styles.levelBars}>
                <View style={[styles.levelBar, { backgroundColor: isRecording ? '#f0630d' : '#e0e0e0' }]} />
                <View style={[styles.levelBar, { backgroundColor: isRecording ? '#f0630d' : '#e0e0e0' }]} />
                <View style={[styles.levelBar, { backgroundColor: isRecording ? '#f0630d' : '#e0e0e0' }]} />
                <View style={[styles.levelBar, { backgroundColor: isRecording ? '#f0630d' : '#e0e0e0' }]} />
                <View style={[styles.levelBar, { backgroundColor: isRecording ? '#f0630d' : '#e0e0e0' }]} />
              </View>
            </View>
          </View>
        </View>

        {/* Save Button */}
        <TouchableOpacity 
          style={[
            styles.saveButton, 
            { 
              backgroundColor: isRecording ? '#ff6b35' : '#cccccc',
              opacity: isRecording ? 1 : 0.5 
            }
          ]}
          onPress={saveCurrentRecording}
          disabled={!isRecording}
        >
          <Text style={[
            styles.saveButtonText,
            { color: isRecording ? 'white' : '#666666' }
          ]}>
            {isRecording ? 'Save Recording' : 'Save'}
          </Text>
        </TouchableOpacity>

        {/* Recordings List */}
        <View style={styles.recordingsSection}>
          <Text style={styles.sectionTitle}>Today</Text>
          {sampleRecordings.filter(r => r.section === 'Today').map((recording) => (
            <RecordingItem 
              key={recording.id} 
              recording={recording} 
              isPlaying={playingId === recording.id}
              progress={playbackProgress[recording.id] || 0}
              onPlay={() => playRecording(recording)}
              onPause={pausePlayback}
            />
          ))}
          
          <Text style={styles.sectionTitle}>Yesterday</Text>
          {sampleRecordings.filter(r => r.section === 'Yesterday').map((recording) => (
            <RecordingItem 
              key={recording.id} 
              recording={recording} 
              isPlaying={playingId === recording.id}
              progress={playbackProgress[recording.id] || 0}
              onPlay={() => playRecording(recording)}
              onPause={pausePlayback}
            />
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const RecordingItem = ({ recording, isPlaying, progress, onPlay, onPause }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const toggleExpanded = () => {
    setIsExpanded(!isExpanded);
  };

  // Simple heuristic: if transcription is longer than ~200 characters, show read more
  const isLongTranscription = recording.transcription && recording.transcription.length > 200;

  return (
    <View style={styles.recordingItem}>
      {/* Top Row: Play button + Progress bar + Duration */}
      <View style={styles.recordingTopRow}>
        <TouchableOpacity 
          style={styles.playIconContainer}
          onPress={recording.uri ? (isPlaying ? onPause : onPlay) : null}
          disabled={!recording.uri}
        >
          <Text style={[
            styles.playIconText,
            !recording.uri && styles.playIconDisabled
          ]}>
            {isPlaying ? "⏸" : "▶"}
          </Text>
        </TouchableOpacity>
        <View style={styles.progressBarContainer}>
          <View 
            style={[
              styles.progressBar, 
              { width: `${progress}%` }
            ]} 
          />
        </View>
        <View style={styles.durationContainer}>
          <Text style={styles.duration}>{recording.duration}</Text>
        </View>
      </View>
      
      {/* Content Row: Transcription + Timestamp */}
      <View style={styles.recordingContentRow}>
        <View style={styles.transcriptionSection}>
          <View style={styles.transcriptionHeader}>
            <Text style={styles.transcriptionLabel}>Transcription</Text>
            {recording.isTranscribing && (
              <Text style={styles.transcribingIndicator}>Processing...</Text>
            )}
          </View>
          <Text 
            style={[
              styles.transcriptionText,
              recording.isTranscribing && styles.transcriptionTextLoading
            ]} 
            numberOfLines={isExpanded ? undefined : 4} 
            ellipsizeMode="tail"
          >
            {recording.transcription}
          </Text>
          {isLongTranscription && !recording.isTranscribing && (
            <TouchableOpacity onPress={toggleExpanded} style={styles.readMoreButton}>
              <Text style={styles.showMore}>
                {isExpanded ? 'Read Less' : 'Read More'}
              </Text>
            </TouchableOpacity>
          )}
        </View>
        <Text style={styles.timestamp}>{recording.time}</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  scrollView: {
    flex: 1,
    paddingHorizontal: 20,
  },
  tp7Container: {
    borderRadius: 16,
    marginVertical: 20,
    borderWidth: 1.189,
    borderColor: '#000000',
    minHeight: 500,
    position: 'relative',
  },
  
  // Top Section
  topSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 20,
    marginTop: 14,
    marginRight: 14,
    paddingHorizontal: 5,
  },
  topLeftDots: {
    flexDirection: 'row',
    gap: 40,
    alignItems: 'center',
    marginTop: 8,
    left: 100,
    top: 30,
  },
  smallDot: {
    width: 8,
    height: 8,
    borderRadius: 5,
    backgroundColor: '#000000',
  },
  display: {
    borderRadius: 4,
    padding: 4,
    borderWidth: 1,
    borderColor: '#000000',
    minWidth: 76,
    backgroundColor: '#ffffff',
  },
  timeText: {
    fontSize: 18,
    fontWeight: '600',
    fontFamily: 'JetBrainsMono_700Bold',
    textAlign: 'center',
    color: '#000000',
    lineHeight: 22,
  },
  displayRecording: {
    borderColor: '#f0630d',
  },
  timeTextRecording: {
    color: '#f0630d',
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  dateText: {
    fontSize: 12,
    fontWeight: 'bold',
    fontFamily: 'JetBrainsMono_700Bold',
    color: '#000000',
  },
  dateBox: {
    backgroundColor: '#000000',
    borderRadius: 2,
    paddingHorizontal: 2,
    paddingVertical: 1,
    minWidth: 12,
    alignItems: 'center',
  },
  dateNumber: {
    fontSize: 12,
    fontWeight: 'bold',
    fontFamily: 'JetBrainsMono_700Bold',
    color: '#ffffff',
  },
  orangeSquareTop: {
    width: 13.077,
    height: 13.077,
    backgroundColor: '#f0630d',
    position: 'absolute',
    top: 76,
    right: 2,
  },

  // Main Area
  mainArea: {
    flex: 1,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
  },
  leftControls: {
    position: 'absolute',
    left: 6,
    top: 0,
    height: '100%',
    width: 16,
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  arrowGroup: {
    alignItems: 'center',
    gap: 2,
  },
  arrowButton: {
    width: 14,
    height: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrowText: {
    fontSize: 16,
    color: '#000000',
    fontFamily: 'JetBrainsMono_700Bold',
  },
  spacer: {
    flex: 1,
  },
  bottomArrowGroup: {
    alignItems: 'center',
    gap: 2,
  },
  rLabel: {
    fontSize: 16,
    color: '#000000',
    fontFamily: 'Inter_400Regular',
    fontWeight: '400',
    transform: [{ rotate: '270deg' }],
  },

  // Central Disk
  diskContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    marginTop: -20,
  },
  largeDisk: {
    width: 312.657,
    height: 312.657,
    borderRadius: 156.328,
    borderWidth: 1,
    borderColor: '#000000',
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  diskLine: {
    position: 'absolute',
    width: 1,
    height: 280,
    backgroundColor: '#000000',
  },
  diskCenter: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#000000',
  },
  bottomLeftCircle: {
    position: 'absolute',
    bottom: 8,
    left: 26,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#000000',
  },

  // Bottom Control Section
  bottomControlSection: {
    flexDirection: 'row',
    height: 123.636,
    borderTopWidth: 1,
    borderTopColor: '#000000',
    marginTop: 20,
  },
  bottomControlButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRightWidth: 1,
    borderRightColor: '#000000',
    paddingVertical: 24.965,
  },
  orangeCircle: {
    width: 15,
    height: 15,
    borderRadius: 7.5,
    backgroundColor: '#f0630d',
  },
  playButton: {
    fontSize: 25,
    color: '#000000',
    fontFamily: 'JetBrainsMono_700Bold',
  },
  blackSquare: {
    width: 15,
    height: 15,
    backgroundColor: '#333333',
  },
  levelIndicator: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRightWidth: 0,
  },
  levelBars: {
    flexDirection: 'row',
    gap: 3,
    alignItems: 'flex-end',
  },
  levelBar: {
    width: 2,
    height: 20,
    backgroundColor: '#e0e0e0',
  },

  // Save Button and Recordings
  saveButton: {
    backgroundColor: '#ff6b35',
    paddingVertical: 15,
    borderRadius: 8,
    marginVertical: 10,
  },
  saveButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
    fontFamily: 'JetBrainsMono_700Bold',
  },
  recordingsSection: {
    marginVertical: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginVertical: 15,
    color: '#333',
    fontFamily: 'JetBrainsMono_700Bold',
  },
  recordingItem: {
    backgroundColor: 'white',
    padding: 8,
    marginBottom: 10,
    borderWidth: 0.5,
    borderColor: '#000000',
    gap: 12,
  },
  recordingTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
  },
  playIconContainer: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  playIconText: {
    color: '#f0630d',
    fontSize: 16,
    fontFamily: 'JetBrainsMono_400Regular',
  },
  playIconDisabled: {
    color: '#cccccc',
  },
  progressBarContainer: {
    flex: 1,
    height: 2,
    backgroundColor: '#eeeeee',
    marginRight: 8,
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#f0630d',
  },
  durationContainer: {
    paddingHorizontal: 6,
  },
  duration: {
    fontSize: 16,
    fontWeight: '600',
    fontFamily: 'JetBrainsMono_700Bold',
    color: '#000000',
  },
  recordingContentRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  transcriptionSection: {
    flex: 1,
    gap: 6,
  },
  transcriptionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#aaaaaa',
    fontFamily: 'JetBrainsMono_700Bold',
    lineHeight: 12,
  },
  transcriptionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  transcribingIndicator: {
    fontSize: 10,
    color: '#f0630d',
    fontFamily: 'JetBrainsMono_500Medium',
    fontStyle: 'italic',
  },
  transcriptionTextLoading: {
    fontStyle: 'italic',
    color: '#666666',
  },
  transcriptionText: {
    fontSize: 16,
    color: '#000000',
    lineHeight: 20,
    fontFamily: 'JetBrainsMono_400Regular',
  },
  showMore: {
    color: '#f0630d',
    fontSize: 14,
    fontWeight: '600',
    fontFamily: 'JetBrainsMono_700Bold',
    lineHeight: 16,
  },
  readMoreButton: {
    marginTop: 4,
    alignSelf: 'flex-start',
  },
  timestamp: {
    fontSize: 12,
    fontWeight: '600',
    color: '#aaaaaa',
    textAlign: 'right',
    fontFamily: 'JetBrainsMono_700Bold',
    lineHeight: 12,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#ffffff',
  },
  loadingText: {
    fontSize: 18,
    fontFamily: 'JetBrainsMono_700Bold',
    color: '#333',
  },
});