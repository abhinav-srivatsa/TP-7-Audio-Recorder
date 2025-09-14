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
import {
  useFonts,
  JetBrainsMono_400Regular,
  JetBrainsMono_500Medium,
  JetBrainsMono_700Bold
} from '@expo-google-fonts/jetbrains-mono';

const { width } = Dimensions.get('window');

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
        }
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: true,
          playsInSilentModeIOS: true,
        });
      } catch (error) {
        console.error('Failed to setup audio:', error);
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

      const { recording: newRecording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
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
      
      // Create new recording entry
      const newRecording = {
        id: Date.now(),
        duration: formatDuration(recordingDuration),
        transcription: 'New recording...',
        time: new Date().toLocaleTimeString('en-US', { 
          hour: '2-digit', 
          minute: '2-digit',
          hour12: true 
        }),
        section: 'Today',
        uri: uri
      };

      setRecordings(prev => [newRecording, ...prev]);
      setRecording(null);
      setIsRecording(false);
      setIsPaused(false);
      setRecordingDuration(0);
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

      // Create and load the sound
      const { sound } = await Audio.Sound.createAsync(
        { uri: recording.uri },
        { shouldPlay: true, isLooping: false }
      );
      
      setCurrentSound(sound);
      setPlayingId(recording.id);
      
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
      duration: '00:24',
      transcription: "Well I'm a peanut bar and I'm here to say. Your checks will arrive on another day! Another day, another dime, another rh...",
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

const RecordingItem = ({ recording, isPlaying, progress, onPlay, onPause }) => (
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
        <Text style={styles.transcriptionLabel}>Transcription</Text>
        <Text style={styles.transcriptionText} numberOfLines={4} ellipsizeMode="tail">
          {recording.transcription}
        </Text>
        {recording.transcription.includes('...') && (
          <TouchableOpacity>
            <Text style={styles.showMore}>Show More</Text>
          </TouchableOpacity>
        )}
      </View>
      <Text style={styles.timestamp}>{recording.time}</Text>
    </View>
  </View>
);

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