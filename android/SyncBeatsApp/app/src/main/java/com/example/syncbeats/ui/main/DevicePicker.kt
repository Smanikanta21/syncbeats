package com.example.syncbeats.ui.main

import android.net.nsd.NsdServiceInfo
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.Computer
import androidx.compose.material.icons.filled.PhoneIphone
import androidx.compose.material.icons.filled.Smartphone
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.combinedClickable
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.syncbeats.network.NearbyDeviceManager
import com.example.syncbeats.network.PublicDevice
import com.example.syncbeats.network.RetrofitClient
import com.example.syncbeats.theme.AccentPrimary
import com.example.syncbeats.theme.Background
import com.example.syncbeats.theme.Foreground
import com.example.syncbeats.theme.ForegroundMuted
import kotlinx.coroutines.launch

import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties

@OptIn(ExperimentalFoundationApi::class)
@Composable
fun DevicePickerModal(
    onDismissRequest: () -> Unit,
    nearbyDeviceManager: NearbyDeviceManager
) {
    val coroutineScope = rememberCoroutineScope()
    var yourDevices by remember { mutableStateOf<List<PublicDevice>>(emptyList()) }
    var isLoading by remember { mutableStateOf(true) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    val context = LocalContext.current
    val isSyncBeatMode by com.example.syncbeats.network.SocketManager.isSyncBeatMode.collectAsState()
    
    val discoveredPeers by nearbyDeviceManager.discoveredPeers.collectAsState()
    
    LaunchedEffect(Unit) {
        nearbyDeviceManager.start()
        try {
            yourDevices = RetrofitClient.deviceApi.getMyDevices().devices
            isLoading = false
        } catch (e: Exception) {
            errorMessage = e.message ?: "Failed to load devices"
            isLoading = false
        }
    }
    
    DisposableEffect(Unit) {
        onDispose {
            nearbyDeviceManager.stop()
        }
    }

    Dialog(
        onDismissRequest = onDismissRequest,
        properties = DialogProperties(usePlatformDefaultWidth = false)
    ) {
        Surface(
            modifier = Modifier
                .fillMaxWidth(0.9f)
                .fillMaxHeight(0.7f)
                .clip(RoundedCornerShape(24.dp)),
            color = Background,
            tonalElevation = 8.dp
        ) {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(24.dp)
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth().padding(bottom = 16.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = "Sync Output",
                        color = Foreground,
                        fontSize = 22.sp,
                        fontWeight = FontWeight.Bold
                    )
                    IconButton(onClick = {
                        coroutineScope.launch {
                            isLoading = true
                            try {
                                yourDevices = RetrofitClient.deviceApi.getMyDevices().devices
                                isLoading = false
                            } catch (e: Exception) {
                                errorMessage = e.message ?: "Failed to load devices"
                                isLoading = false
                            }
                        }
                    }) {
                        Icon(
                            imageVector = Icons.Default.Refresh,
                            contentDescription = "Refresh",
                            tint = Foreground
                        )
                    }
                }
                
                // SyncBeat Mode Toggle
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(bottom = 24.dp)
                        .background(Color.White.copy(alpha = 0.05f), RoundedCornerShape(12.dp))
                        .clip(RoundedCornerShape(12.dp))
                        .clickable { com.example.syncbeats.network.SocketManager.toggleSyncBeatMode(context) }
                        .padding(16.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = "SyncBeat Mode",
                            color = if (isSyncBeatMode) AccentPrimary else Foreground,
                            fontSize = 16.sp,
                            fontWeight = FontWeight.Bold
                        )
                        Text(
                            text = "Automatically sync playback with all your other online devices.",
                            color = ForegroundMuted,
                            fontSize = 12.sp,
                            modifier = Modifier.padding(top = 4.dp)
                        )
                    }
                    Switch(
                        checked = isSyncBeatMode,
                        onCheckedChange = { com.example.syncbeats.network.SocketManager.toggleSyncBeatMode(context) },
                        colors = SwitchDefaults.colors(checkedThumbColor = AccentPrimary, checkedTrackColor = AccentPrimary.copy(alpha = 0.5f))
                    )
                }
            
            LazyColumn(
                verticalArrangement = Arrangement.spacedBy(24.dp)
            ) {
                // SECTION: Nearby Devices (NSD)
                item {
                    Text(
                        text = "NEARBY DEVICES",
                        color = ForegroundMuted,
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.padding(bottom = 8.dp)
                    )
                }
                
                if (discoveredPeers.isEmpty()) {
                    item {
                        Text(
                            text = "Searching for nearby devices...",
                            color = ForegroundMuted,
                            fontSize = 14.sp
                        )
                    }
                } else {
                    items(discoveredPeers) { peer ->
                        DeviceRow(
                            name = peer.serviceName,
                            icon = Icons.Default.Smartphone,
                            subtitle = null,
                            onClick = {
                                // Request connection later
                                onDismissRequest()
                            }
                        )
                    }
                }
                
                item {
                    Spacer(modifier = Modifier.height(8.dp))
                }
                
                // SECTION: Your Devices (Cloud)
                item {
                    Text(
                        text = "YOUR DEVICES",
                        color = ForegroundMuted,
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.padding(bottom = 8.dp)
                    )
                }
                
                if (isLoading) {
                    item {
                        Box(modifier = Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
                            CircularProgressIndicator(color = AccentPrimary)
                        }
                    }
                } else if (errorMessage != null) {
                    item {
                        Text(
                            text = errorMessage ?: "Error",
                            color = Color.Red,
                            fontSize = 14.sp
                        )
                    }
                } else {
                    val appPrefixes = listOf("IOS-", "MAC-", "ANDROID-", "WINDOWS-", "APP-")
                    val filteredDevices = yourDevices.filter { device ->
                        appPrefixes.any { prefix -> device.device_key.startsWith(prefix) } &&
                        device.isOnline == true
                    }
                    if (filteredDevices.isEmpty()) {
                        item {
                            Text(
                                text = "No devices online.",
                                color = ForegroundMuted,
                                fontSize = 14.sp
                            )
                        }
                    }
                    items(filteredDevices) { device ->
                        val isCurrent = device.device_key == com.example.syncbeats.network.DeviceManager.deviceId
                        DeviceRow(
                            name = getDeviceName(device.device_key),
                            icon = getDeviceIcon(device.device_key),
                            subtitle = if (isCurrent) "This device" else "Online",
                            isCurrent = isCurrent,
                            onClick = {
                                onDismissRequest()
                            }
                        )
                    }
                }
            }
        }
    }
}
}


@Composable
private fun DeviceRow(
    name: String,
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    subtitle: String?,
    isCurrent: Boolean = false,
    onClick: () -> Unit
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Icon(
            imageVector = icon,
            contentDescription = null,
            tint = Foreground,
            modifier = Modifier.size(24.dp)
        )
        
        Spacer(modifier = Modifier.width(16.dp))
        
        Column(modifier = Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = name,
                    color = Foreground,
                    fontSize = 16.sp,
                    fontWeight = FontWeight.Medium
                )
                
                if (isCurrent) {
                    Spacer(modifier = Modifier.width(8.dp))
                    Box(
                        modifier = Modifier
                            .clip(RoundedCornerShape(4.dp))
                            .background(AccentPrimary.copy(alpha = 0.2f))
                            .padding(horizontal = 6.dp, vertical = 2.dp)
                    ) {
                        Text(
                            text = "Current",
                            color = AccentPrimary,
                            fontSize = 10.sp,
                            fontWeight = FontWeight.Bold
                        )
                    }
                }
            }
            
            if (subtitle != null) {
                Text(
                    text = subtitle,
                    color = ForegroundMuted,
                    fontSize = 12.sp
                )
            }
        }
        
        Icon(
            imageVector = Icons.Default.ChevronRight,
            contentDescription = null,
            tint = ForegroundMuted,
            modifier = Modifier.size(20.dp)
        )
    }
}

private fun getDeviceName(key: String): String {
    val parts = key.split("-")
    if (parts.size >= 2) {
        return "${parts[0].replaceFirstChar { it.uppercase() }}'s ${parts[1].replaceFirstChar { it.uppercase() }}"
    }
    return key
}

private fun getDeviceIcon(key: String): androidx.compose.ui.graphics.vector.ImageVector {
    val lower = key.lowercase()
    if (lower.contains("iphone") || lower.contains("ios")) return Icons.Default.PhoneIphone
    if (lower.contains("mac") || lower.contains("desktop")) return Icons.Default.Computer
    if (lower.contains("android")) return Icons.Default.Smartphone
    return Icons.Default.Computer
}
