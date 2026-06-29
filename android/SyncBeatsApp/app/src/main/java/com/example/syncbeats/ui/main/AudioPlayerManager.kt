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
    
    var currentTrackId: String? = null
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
                    currentTrackId = null
                } else if (playbackState == Player.STATE_READY) {
                    SocketManager.emitClientReady(context, true)
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
            SocketManager.isSyncBeatMode.collect { isSyncMode ->
                if (isSyncMode) {
                    kotlinx.coroutines.delay(500)
                    if (exoPlayer.playbackState == Player.STATE_READY) {
                        SocketManager.emitClientReady(context, true)
                    }
                }
            }
        }
        
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

    fun playFile(file: File, trackId: String, trackName: String) {
        SocketManager.emitClientReady(context, false)
        currentTrackId = trackId
        val mediaItem = MediaItem.fromUri(Uri.fromFile(file))
        exoPlayer.setMediaItem(mediaItem)
        exoPlayer.prepare()
        
        // Only autoplay if we are not in SyncBeats mode, or if we are the ones who initiated
        if (!SocketManager.isSyncBeatMode.value) {
            exoPlayer.play()
        }
        
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
                // Let the server coordinate the synchronized start time based on all devices' readiness
                SocketManager.emitPlaybackPlay(context)
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
    
    fun pauseLocalForSync() {
        if (exoPlayer.isPlaying) {
            exoPlayer.pause()
        }
    }
}
