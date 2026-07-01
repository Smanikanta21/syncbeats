package com.example.syncbeats.ui.main

import android.content.Context
import android.net.Uri
import androidx.media3.common.MediaItem
import androidx.media3.exoplayer.ExoPlayer
import java.io.File
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import androidx.media3.common.Player
import kotlinx.coroutines.*
import com.example.syncbeats.network.SocketManager
import com.example.syncbeats.network.DeviceManager
import com.example.syncbeats.network.ClockSyncManager

class AudioPlayerManager(private val context: Context) {
    private val exoPlayer: ExoPlayer = ExoPlayer.Builder(context).build()
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    
    private val _isPlaying = MutableStateFlow(false)
    val isPlaying: StateFlow<Boolean> = _isPlaying.asStateFlow()

    private val _currentTrackName = MutableStateFlow<String?>(null)
    val currentTrackName: StateFlow<String?> = _currentTrackName.asStateFlow()

    private val _progress = MutableStateFlow(0f)
    val progress: StateFlow<Float> = _progress.asStateFlow()
    
    private val _currentPositionMs = MutableStateFlow(0L)
    val currentPositionMs: StateFlow<Long> = _currentPositionMs.asStateFlow()
    
    private val _durationMs = MutableStateFlow(0L)
    val durationMs: StateFlow<Long> = _durationMs.asStateFlow()
    
    var isInternalSyncEvent = false

    init {
        exoPlayer.addListener(object : Player.Listener {
            override fun onIsPlayingChanged(isPlaying: Boolean) {
                _isPlaying.value = isPlaying
            }
            override fun onPlaybackStateChanged(playbackState: Int) {
                if (playbackState == Player.STATE_ENDED) {
                    _isPlaying.value = false
                    _currentTrackName.value = null
                }
            }
        })

        scope.launch {
            while (isActive) {
                if (exoPlayer.isPlaying) {
                    val current = exoPlayer.currentPosition
                    val duration = exoPlayer.duration
                    
                    _currentPositionMs.value = current
                    _durationMs.value = if (duration > 0) duration else 0L
                    
                    if (duration > 0) {
                        _progress.value = current.toFloat() / duration.toFloat()
                    }
                }
                delay(100)
            }
        }
        
        setupSyncListeners()
    }
    
    private fun setupSyncListeners() {
        scope.launch {
            SocketManager.playbackScheduleFlow.collect { data ->
                val senderId = data.optString("senderId")
                if (senderId == DeviceManager.deviceId) return@collect
                
                val positionMs = data.optDouble("positionMs")
                val startTime = data.optDouble("startTime")
                
                isInternalSyncEvent = true
                
                val currentServerTime = ClockSyncManager.currentServerTimeMs()
                val timeUntilStart = startTime - currentServerTime
                
                if (timeUntilStart > 0) {
                    // Start time is in the future! Seek now, wait, then play.
                    exoPlayer.seekTo(positionMs.toLong())
                    delay(timeUntilStart.toLong())
                    exoPlayer.play()
                } else {
                    // Start time is in the past (we missed the scheduled time). Catch up.
                    val missedTime = currentServerTime - startTime
                    val targetPositionMs = positionMs + missedTime
                    exoPlayer.seekTo(targetPositionMs.toLong())
                    exoPlayer.play()
                }
                
                isInternalSyncEvent = false
            }
        }
        
        scope.launch {
            SocketManager.playbackPauseFlow.collect { data ->
                val senderId = data.optString("senderId")
                if (senderId == DeviceManager.deviceId) return@collect
                
                val positionMs = data.optDouble("positionMs")
                
                isInternalSyncEvent = true
                
                exoPlayer.seekTo(positionMs.toLong())
                exoPlayer.pause()
                
                isInternalSyncEvent = false
            }
        }
    }

    fun playFile(file: File, trackName: String) {
        val mediaItem = MediaItem.fromUri(Uri.fromFile(file))
        exoPlayer.setMediaItem(mediaItem)
        exoPlayer.prepare()
        exoPlayer.play()
        _currentTrackName.value = trackName
    }

    fun togglePlayPause() {
        if (exoPlayer.isPlaying) {
            exoPlayer.pause()
            if (!isInternalSyncEvent) {
                SocketManager.emitPlaybackPause(context, exoPlayer.currentPosition.toDouble())
            }
        } else {
            if (!isInternalSyncEvent && SocketManager.isSyncBeatMode.value) {
                // If in SyncBeat mode, schedule playback in the future for perfect sync
                val delayMs = 300.0 // 300ms buffer for other devices to receive and seek
                val serverTime = ClockSyncManager.currentServerTimeMs()
                val futureStartTime = serverTime + delayMs
                val position = exoPlayer.currentPosition.toDouble()
                
                val trackUrl = "current_track" // You would use the real track URL/ID here
                SocketManager.emitPlaybackSchedule(context, trackUrl, position, futureStartTime)
                
                // Wait for the delay ourselves to stay perfectly in sync
                scope.launch {
                    isInternalSyncEvent = true
                    delay(delayMs.toLong())
                    exoPlayer.play()
                    isInternalSyncEvent = false
                }
            } else {
                // Not in SyncBeat mode, play instantly
                exoPlayer.play()
            }
        }
    }

    fun release() {
        scope.cancel()
        exoPlayer.release()
    }
}
