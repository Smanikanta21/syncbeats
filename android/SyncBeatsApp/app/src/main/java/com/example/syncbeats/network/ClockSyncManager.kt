package com.example.syncbeats.network

import android.util.Log
import io.socket.client.Socket
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import org.json.JSONObject

object ClockSyncManager {
    private const val TAG = "ClockSyncManager"
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    
    private var socket: Socket? = null
    private var pingJob: Job? = null
    
    private val _isSynced = MutableStateFlow(false)
    val isSynced: StateFlow<Boolean> = _isSynced.asStateFlow()
    
    private val offsets = mutableListOf<Double>()
    
    // Average clock offset (server time = local time + offset)
    var clockOffset: Double = 0.0
        private set

    fun startSyncing(socket: Socket) {
        this.socket = socket
        this.offsets.clear()
        _isSynced.value = false
        
        socket.on("sync:pong") { args ->
            if (args.isNotEmpty()) {
                val data = args[0] as? JSONObject
                if (data != null) {
                    val t0 = data.optDouble("t0")
                    val t1 = data.optDouble("t1")
                    val t2 = data.optDouble("t2")
                    val t3 = System.currentTimeMillis().toDouble()
                    
                    if (!t0.isNaN() && !t1.isNaN() && !t2.isNaN()) {
                        val rtt = (t3 - t0) - (t2 - t1)
                        val offset = ((t1 - t0) + (t2 - t3)) / 2.0
                        
                        // Only accept pings with reasonable RTT (< 500ms) to avoid massive jitter
                        if (rtt < 500) {
                            offsets.add(offset)
                            if (offsets.size > 10) {
                                offsets.removeAt(0)
                            }
                            
                            // Use median of recent offsets for stability
                            val sorted = offsets.sorted()
                            clockOffset = sorted[sorted.size / 2]
                            
                            if (offsets.size >= 3 && !_isSynced.value) {
                                _isSynced.value = true
                                Log.d(TAG, "Clock synchronized. Offset: $clockOffset ms")
                            }
                        }
                    }
                }
            }
        }
        
        // Initial burst of pings to get sync quickly
        pingJob?.cancel()
        pingJob = scope.launch {
            for (i in 0 until 5) {
                sendPing()
                delay(200)
            }
            // Background slow ping to keep clock drift in check (every 10 seconds)
            while (isActive) {
                delay(10000)
                sendPing()
            }
        }
    }
    
    fun stopSyncing() {
        pingJob?.cancel()
        pingJob = null
        _isSynced.value = false
        socket?.off("sync:pong")
        socket = null
    }
    
    private fun sendPing() {
        val t0 = System.currentTimeMillis().toDouble()
        val payload = JSONObject().apply {
            put("t0", t0)
        }
        socket?.emit("sync:ping", payload)
    }
    
    // Returns the current synchronized server time in milliseconds
    fun currentServerTimeMs(): Double {
        val localTime = System.currentTimeMillis().toDouble()
        return localTime + clockOffset
    }
}
