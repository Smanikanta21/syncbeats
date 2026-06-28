package com.example.syncbeats.network

import android.content.Context
import android.net.nsd.NsdManager
import android.net.nsd.NsdServiceInfo
import android.os.Build
import android.util.Log
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import java.net.InetAddress

class NearbyDeviceManager(private val context: Context) {

    private val nsdManager: NsdManager = context.getSystemService(Context.NSD_SERVICE) as NsdManager
    private val serviceType = "_syncbeats-net._tcp."
    private var serviceName = Build.MODEL // Use device model name
    
    private val _discoveredPeers = MutableStateFlow<List<NsdServiceInfo>>(emptyList())
    val discoveredPeers: StateFlow<List<NsdServiceInfo>> = _discoveredPeers.asStateFlow()

    private var registrationListener: NsdManager.RegistrationListener? = null
    private var discoveryListener: NsdManager.DiscoveryListener? = null

    fun start() {
        registerService()
        discoverServices()
        Log.d("NSD", "Started NSD registration and discovery")
    }

    fun stop() {
        stopDiscovery()
        unregisterService()
        localSyncServer?.stop()
        localSyncServer = null
        _discoveredPeers.value = emptyList()
        Log.d("NSD", "Stopped NSD")
    }

    private var localSyncServer: LocalSyncServer? = null

    private fun registerService() {
        // Start local WebSocket server for P2P sync
        localSyncServer = LocalSyncServer(8080)
        localSyncServer?.start()

        val serviceInfo = NsdServiceInfo().apply {
            serviceName = this@NearbyDeviceManager.serviceName
            serviceType = this@NearbyDeviceManager.serviceType
            port = 8080
        }

        registrationListener = object : NsdManager.RegistrationListener {
            override fun onServiceRegistered(NsdServiceInfo: NsdServiceInfo) {
                serviceName = NsdServiceInfo.serviceName
                Log.d("NSD", "Service registered: $serviceName on port ${NsdServiceInfo.port}")
            }

            override fun onRegistrationFailed(serviceInfo: NsdServiceInfo, errorCode: Int) {
                Log.e("NSD", "Registration failed: $errorCode")
            }

            override fun onServiceUnregistered(arg0: NsdServiceInfo) {
                Log.d("NSD", "Service unregistered")
            }

            override fun onUnregistrationFailed(serviceInfo: NsdServiceInfo, errorCode: Int) {
                Log.e("NSD", "Unregistration failed: $errorCode")
            }
        }
        
        try {
            nsdManager.registerService(serviceInfo, NsdManager.PROTOCOL_DNS_SD, registrationListener)
        } catch (e: Exception) {
            Log.e("NSD", "Failed to register service", e)
        }
    }

    private fun discoverServices() {
        discoveryListener = object : NsdManager.DiscoveryListener {
            override fun onDiscoveryStarted(regType: String) {
                Log.d("NSD", "Service discovery started")
            }

            override fun onServiceFound(service: NsdServiceInfo) {
                Log.d("NSD", "Service discovery success: $service")
                if (service.serviceType == serviceType && service.serviceName != serviceName) {
                    nsdManager.resolveService(service, object : NsdManager.ResolveListener {
                        override fun onResolveFailed(serviceInfo: NsdServiceInfo, errorCode: Int) {
                            Log.e("NSD", "Resolve failed: $errorCode")
                        }

                        override fun onServiceResolved(serviceInfo: NsdServiceInfo) {
                            Log.d("NSD", "Resolve Succeeded. $serviceInfo")
                            val currentList = _discoveredPeers.value.toMutableList()
                            if (currentList.none { it.serviceName == serviceInfo.serviceName }) {
                                currentList.add(serviceInfo)
                                _discoveredPeers.value = currentList
                            }
                        }
                    })
                }
            }

            override fun onServiceLost(service: NsdServiceInfo) {
                Log.e("NSD", "service lost: $service")
                val currentList = _discoveredPeers.value.toMutableList()
                currentList.removeAll { it.serviceName == service.serviceName }
                _discoveredPeers.value = currentList
            }

            override fun onDiscoveryStopped(serviceType: String) {
                Log.i("NSD", "Discovery stopped: $serviceType")
            }

            override fun onStartDiscoveryFailed(serviceType: String, errorCode: Int) {
                Log.e("NSD", "Discovery failed: Error code:$errorCode")
                nsdManager.stopServiceDiscovery(this)
            }

            override fun onStopDiscoveryFailed(serviceType: String, errorCode: Int) {
                Log.e("NSD", "Discovery failed: Error code:$errorCode")
                nsdManager.stopServiceDiscovery(this)
            }
        }

        try {
            nsdManager.discoverServices(serviceType, NsdManager.PROTOCOL_DNS_SD, discoveryListener)
        } catch (e: Exception) {
            Log.e("NSD", "Failed to discover services", e)
        }
    }

    private fun unregisterService() {
        registrationListener?.let {
            try {
                nsdManager.unregisterService(it)
            } catch (e: Exception) {
                Log.e("NSD", "Error unregistering service", e)
            }
        }
        registrationListener = null
    }

    private fun stopDiscovery() {
        discoveryListener?.let {
            try {
                nsdManager.stopServiceDiscovery(it)
            } catch (e: Exception) {
                Log.e("NSD", "Error stopping discovery", e)
            }
        }
        discoveryListener = null
    }
}
