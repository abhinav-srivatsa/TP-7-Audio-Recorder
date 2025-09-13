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
          {/* Top Display */}
          <View style={styles.topSection}>
            <View style={styles.topLeft}>
              <View style={styles.dot} />
              <View style={styles.dot} />
            </View>
            <View style={styles.display}>
              <Text style={styles.timeText}>
                {isRecording || recordingDuration > 0 ? formatDuration(recordingDuration) : '0.00.00'}
              </Text>
              <View style={styles.dateRow}>
                <Text style={styles.dateText}>{currentDate}</Text>
                <View style={styles.batteryIcon} />
              </View>
            </View>
          </View>

          {/* Main Disk Area */}
          <View style={styles.diskSection}>
            {/* Left Controls */}
            <View style={styles.leftControls}>
              <TouchableOpacity style={styles.arrowButton}>
                <Text style={styles.arrowText}>▲</Text>
              </TouchableOpacity>
              <Text style={styles.arrowLabel}>A</Text>
              <TouchableOpacity style={styles.arrowButton}>
                <Text style={styles.arrowText}>▼</Text>
              </TouchableOpacity>
              <Text style={styles.arrowLabel}>B</Text>
            </View>

            {/* Central Disk */}
            <View style={styles.diskContainer} {...panResponder.panHandlers}>
              <Animated.View 
                style={[
                  styles.disk,
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
                <View style={styles.centerCircle} />
              </Animated.View>
            </View>

            {/* Right Controls */}
            <View style={styles.rightControls}>
              <TouchableOpacity style={styles.orangeSquare} />
            </View>

            {/* Bottom Left Black Circle */}
            <View style={styles.bottomLeftCircle} />
          </View>

          {/* Control Buttons */}
          <View style={styles.controlSection}>
            <TouchableOpacity 
              style={styles.controlButton}
              onPress={isRecording ? stopRecording : startRecording}
            >
              <View style={[
                styles.recordButton, 
                { backgroundColor: isRecording ? '#ff3333' : '#ff6b35' }
              ]} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.controlButton}>
              <Text style={styles.playButton}>▶</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={styles.controlButton}
              onPress={stopRecording}
            >
              <View style={styles.stopButton} />
            </TouchableOpacity>
            <View style={styles.rightSection}>
              <View style={styles.verticalLines}>
                <View style={[styles.line, { backgroundColor: isRecording ? '#ff6b35' : '#ddd' }]} />
                <View style={[styles.line, { backgroundColor: isRecording ? '#ff6b35' : '#ddd' }]} />
                <View style={[styles.line, { backgroundColor: isRecording ? '#ff6b35' : '#ddd' }]} />
                <View style={[styles.line, { backgroundColor: isRecording ? '#ff6b35' : '#ddd' }]} />
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
            <RecordingItem key={recording.id} recording={recording} />
          ))}
          
          <Text style={styles.sectionTitle}>Yesterday</Text>
          {sampleRecordings.filter(r => r.section === 'Yesterday').map((recording) => (
            <RecordingItem key={recording.id} recording={recording} />
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const RecordingItem = ({ recording }) => (
  <View style={styles.recordingItem}>
    <View style={styles.recordingHeader}>
      <TouchableOpacity style={styles.playIcon}>
        <Text style={styles.playIconText}>▶</Text>
      </TouchableOpacity>
      <Text style={styles.duration}>{recording.duration}</Text>
    </View>
    <Text style={styles.transcriptionLabel}>Transcription</Text>
    <Text style={styles.transcriptionText}>{recording.transcription}</Text>
    {recording.transcription.includes('...') && (
      <TouchableOpacity>
        <Text style={styles.showMore}>Show More</Text>
      </TouchableOpacity>
    )}
    <Text style={styles.timestamp}>{recording.time}</Text>
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
    backgroundColor: '#f8f8f8',
    borderRadius: 20,
    marginVertical: 20,
    padding: 20,
    borderWidth: 2,
    borderColor: '#333',
    minHeight: 500,
  },
  topSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 15,
    paddingHorizontal: 2,
  },
  topLeft: {
    flexDirection: 'row',
    gap: 10,
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#333',
  },
  display: {
    borderRadius: 8,
    padding: 8,
    borderWidth: 1,
    borderColor: '#333',
    minWidth: 88,
  },
  timeText: {
    fontSize: 16,
    fontWeight: 'bold',
    fontFamily: 'JetBrainsMono_700Bold',
    textAlign: 'center',
    marginBottom: 4,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  dateText: {
    fontSize: 10,
    fontWeight: 'bold',
    fontFamily: 'JetBrainsMono_700Bold',
  },
  batteryIcon: {
    width: 12,
    height: 8,
    backgroundColor: '#333',
    borderRadius: 1,
    marginLeft: 5,
  },
  diskSection: {
    position: 'relative',
    alignItems: 'center',
    marginVertical: 15,
    height: 280,
  },
  leftControls: {
    position: 'absolute',
    left: -8,
    top: -12,
    transform: [{ translateY: -40 }],
    alignItems: 'center',
    gap: 8,
    zIndex: 2,
  },
  arrowButton: {
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrowText: {
    fontSize: 16,
    color: '#333',
    fontFamily: 'JetBrainsMono_700Bold',
  },
  arrowLabel: {
    fontSize: 16,
    color: '#333',
    fontWeight: 'bold',
    fontFamily: 'JetBrainsMono_700Bold',
  },
  rightControls: {
    position: 'absolute',
    right: 0,
    top: '10%',
    transform: [{ translateY: -10 }],
  },
  orangeSquare: {
    width: 16,
    height: 16,
    backgroundColor: '#ff6b35',
  },
  diskContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  disk: {
    width: 310,
    height: 310,
    borderRadius: 300,
    backgroundColor: '#f0f0f0',
    borderWidth: 2,
    borderColor: '#333',
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  diskLine: {
    position: 'absolute',
    width: 2,
    height: 240,
    backgroundColor: '#333',
  },
  centerCircle: {
    width: 80,
    height: 80,
    borderRadius: 80,
    backgroundColor: '#f0f0f0',
    borderWidth: 2,
    borderColor: '#333',
  },
  bottomLeftCircle: {
    position: 'absolute',
    bottom: -30,
    left: 10,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#333',
  },
  controlSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 40,
    paddingTop: 20,
    borderTopWidth: 2,
    borderTopColor: '#333',
    height: 80,
  },
  controlButton: {
    flex: 1,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    borderRightWidth: 2,
    borderRightHeight: '100%',
    borderRightColor: '#333',
  },
  recordButton: {
    width: 24,
    height: 24,
    borderRadius: 24,
    paddingLeft: 24,
    backgroundColor: '#ff6b35',
  },
  playButton: {
    fontSize: 24,
    color: '#333',
    fontFamily: 'JetBrainsMono_700Bold',
  },
  stopButton: {
    width: 20,
    height: 20,
    backgroundColor: '#333',
  },
  rightSection: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  verticalLines: {
    flexDirection: 'row',
    gap: 3,
  },
  line: {
    width: 2,
    height: 20,
    backgroundColor: '#ddd',
  },
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
    borderRadius: 8,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'black',
  },
  recordingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  playIcon: {
    marginRight: 8,
  },
  playIconText: {
    color: '#ff6b35',
    fontSize: 18,
    fontFamily: 'JetBrainsMono_400Regular',
  },
  duration: {
    fontSize: 16,
    fontWeight: 'bold',
    fontFamily: 'JetBrainsMono_700Bold',
  },
  transcriptionLabel: {
    fontSize: 12,
    color: '#AAAAAA',
    marginBottom: 4,
    fontFamily: 'JetBrainsMono_400Regular',
  },
  transcriptionText: {
    fontSize: 14,
    color: 'black',
    lineHeight: 20,
    marginBottom: 8,
    fontFamily: 'JetBrainsMono_400Regular',
  },
  showMore: {
    color: '#ff6b35',
    fontSize: 14,
    fontWeight: '500',
    fontFamily: 'JetBrainsMono_500Medium',
    marginBottom: 2,
    marginTop: 6,
  },
  timestamp: {
    fontSize: 12,
    color: '#999',
    textAlign: 'right',
    fontFamily: 'JetBrainsMono_400Regular',
  },
});