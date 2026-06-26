package com.example.syncbeats.ui.profile

import android.util.Log
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.syncbeats.network.PublicDevice
import com.example.syncbeats.network.RetrofitClient
import com.example.syncbeats.network.SocketManager
import com.example.syncbeats.network.DeviceManager
import com.example.syncbeats.network.User
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

class ProfileViewModel : ViewModel() {
    private val _user = MutableStateFlow<User?>(null)
    val user: StateFlow<User?> = _user

    private val _devices = MutableStateFlow<List<PublicDevice>>(emptyList())
    val devices: StateFlow<List<PublicDevice>> = _devices

    private val _isLoading = MutableStateFlow(false)
    val isLoading: StateFlow<Boolean> = _isLoading

    private val _error = MutableStateFlow<String?>(null)
    val error: StateFlow<String?> = _error

    val currentDeviceId = DeviceManager.deviceId

    init {
        fetchDevices()
        SocketManager.connect()
    }

    fun fetchDevices() {
        viewModelScope.launch {
            _isLoading.value = true
            _error.value = null
            try {
                // Fetch User Profile
                try {
                    val meResponse = RetrofitClient.authApi.getMe()
                    _user.value = meResponse.user
                } catch (e: Exception) {
                    Log.e("ProfileViewModel", "Failed to fetch user", e)
                }

                // Fetch Devices
                val response = RetrofitClient.deviceApi.getMyDevices()
                _devices.value = response.devices
            } catch (e: Exception) {
                Log.e("ProfileViewModel", "Failed to fetch devices", e)
                _error.value = e.message ?: "Unknown error"
            } finally {
                _isLoading.value = false
            }
        }
    }

    fun pingDevice(deviceKey: String) {
        SocketManager.pingDevice(deviceKey)
    }

    override fun onCleared() {
        super.onCleared()
        // Optionally disconnect if it's strictly tied to this ViewModel
        // SocketManager.disconnect()
    }
}
