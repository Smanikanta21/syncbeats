package com.example.syncbeats.ui.profile


import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Computer
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.PhoneAndroid
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.viewmodel.compose.viewModel
import coil.compose.AsyncImage
import com.example.syncbeats.network.PublicDevice
import com.example.syncbeats.theme.*

@Composable
fun ProfileScreen(
    onBack: () -> Unit,
    viewModel: ProfileViewModel = viewModel()
) {
    val devices by viewModel.devices.collectAsState()
    val user by viewModel.user.collectAsState()
    val isLoading by viewModel.isLoading.collectAsState()
    val error by viewModel.error.collectAsState()

    Scaffold(
        containerColor = Background,
        topBar = {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 48.dp, bottom = 16.dp, start = 16.dp, end = 16.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                IconButton(onClick = onBack) {
                    Icon(
                        imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                        contentDescription = "Back",
                        tint = Foreground
                    )
                }
                Text(
                    text = "Profile",
                    color = Foreground,
                    fontSize = 20.sp,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.padding(start = 8.dp)
                )
            }
        }
    ) { paddingValues ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
                .padding(horizontal = 24.dp)
        ) {
            // Profile Info Header
            Column(
                modifier = Modifier.fillMaxWidth(),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Box(
                    modifier = Modifier
                        .size(100.dp)
                        .clip(CircleShape)
                        .background(AccentPrimary.copy(alpha = 0.2f)),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(
                        imageVector = Icons.Default.Person,
                        contentDescription = "Profile Picture",
                        tint = AccentPrimary,
                        modifier = Modifier.size(48.dp)
                    )
                }
                Spacer(modifier = Modifier.height(16.dp))
                Text(
                    text = user?.name ?: "SyncBeat User",
                    color = Foreground,
                    fontSize = 24.sp,
                    fontWeight = FontWeight.Bold
                )
                Text(
                    text = user?.email ?: "user@example.com",
                    color = ForegroundMuted,
                    fontSize = 14.sp
                )
                Spacer(modifier = Modifier.height(6.dp))
                val isSocketConnected by com.example.syncbeats.network.SocketManager.isConnected.collectAsState()
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.Center
                ) {
                    Box(
                        modifier = Modifier
                            .size(8.dp)
                            .clip(CircleShape)
                            .background(if (isSocketConnected) androidx.compose.ui.graphics.Color.Green else androidx.compose.ui.graphics.Color.Red)
                    )
                    Spacer(modifier = Modifier.width(6.dp))
                    Text(
                        text = if (isSocketConnected) "Server Connected" else "Server Disconnected",
                        color = if (isSocketConnected) androidx.compose.ui.graphics.Color.Green else androidx.compose.ui.graphics.Color.Red,
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Medium
                    )
                }
            }

            Spacer(modifier = Modifier.height(40.dp))

            Text(
                text = "Your Devices",
                color = Foreground,
                fontSize = 18.sp,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.padding(bottom = 16.dp)
            )

            if (isLoading && devices.isEmpty()) {
                Box(modifier = Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(color = AccentPrimary)
                }
            } else if (error != null) {
                Text(text = "Error: $error", color = MaterialTheme.colorScheme.error)
            } else {
                LazyColumn(
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    // Filter only native application devices
                    val appPrefixes = listOf("IOS-", "MAC-", "ANDROID-", "WINDOWS-", "APP-")
                    val filteredDevices = devices.filter { device ->
                        appPrefixes.any { prefix -> device.device_key.startsWith(prefix) }
                    }
                    items(filteredDevices) { device ->
                        DeviceCard(
                            device = device,
                            isCurrentDevice = device.isCurrentDevice ?: (device.device_key == viewModel.currentDeviceId),
                            onPing = { viewModel.pingDevice(device.device_key) }
                        )
                    }
                }
            }
        }
    }
}

@Composable
fun DeviceCard(
    device: PublicDevice,
    isCurrentDevice: Boolean,
    onPing: () -> Unit
) {
    val isMobile = device.user_agent?.lowercase()?.contains("android") == true || device.user_agent?.lowercase()?.contains("iphone") == true
    val icon = if (isMobile) Icons.Default.PhoneAndroid else Icons.Default.Computer
    
    val isOnline = device.isOnline ?: formatLastSeen(device.last_seen_at).second
    val statusText = if (device.isOnline == true) "Online" else formatLastSeen(device.last_seen_at).first

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(GlassBackground)
            .padding(16.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Box(
            modifier = Modifier
                .size(48.dp)
                .clip(CircleShape)
                .background(AccentPrimary.copy(alpha = 0.15f)),
            contentAlignment = Alignment.Center
        ) {
            Icon(
                imageVector = icon,
                contentDescription = null,
                tint = AccentPrimary,
                modifier = Modifier.size(24.dp)
            )
        }

        Spacer(modifier = Modifier.width(16.dp))

        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = device.name,
                color = Foreground,
                fontSize = 16.sp,
                fontWeight = FontWeight.SemiBold
            )
            
            if (isCurrentDevice) {
                Text(
                    text = "This Device",
                    color = AccentPrimary,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Bold
                )
            } else {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(
                        modifier = Modifier
                            .size(8.dp)
                            .clip(CircleShape)
                            .background(if (isOnline) androidx.compose.ui.graphics.Color.Green else androidx.compose.ui.graphics.Color.Gray)
                    )
                    Spacer(modifier = Modifier.width(4.dp))
                    Text(
                        text = statusText,
                        color = if (isOnline) androidx.compose.ui.graphics.Color.Green else ForegroundMuted,
                        fontSize = 12.sp
                    )
                }
            }
        }

        if (!isCurrentDevice) {
            Button(
                onClick = onPing,
                colors = ButtonDefaults.buttonColors(containerColor = AccentPrimary.copy(alpha = 0.2f), contentColor = AccentPrimary),
                shape = RoundedCornerShape(12.dp)
            ) {
                Text("Ping")
            }
        }
    }
}

private fun formatLastSeen(dateString: String): Pair<String, Boolean> {
    return try {
        // Parse date using standard SimpleDateFormat which works on all API levels
        val format = java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", java.util.Locale.US)
        format.timeZone = java.util.TimeZone.getTimeZone("UTC")
        val date = format.parse(dateString) ?: return Pair("Offline", false)
        
        val now = java.util.Date()
        val diffSeconds = (now.time - date.time) / 1000
        
        if (diffSeconds < 180) {
            Pair("Online", true)
        } else {
            val diffMinutes = diffSeconds / 60
            val diffHours = diffMinutes / 60
            val diffDays = diffHours / 24
            
            val text = when {
                diffMinutes < 60 -> "$diffMinutes minutes ago"
                diffHours < 24 -> "$diffHours hours ago"
                else -> "$diffDays days ago"
            }
            Pair(text, false)
        }
    } catch (e: Exception) {
        // Fallback for differently formatted dates (e.g. without milliseconds)
        try {
            val format = java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", java.util.Locale.US)
            format.timeZone = java.util.TimeZone.getTimeZone("UTC")
            val date = format.parse(dateString) ?: return Pair("Offline", false)
            val now = java.util.Date()
            val diffSeconds = (now.time - date.time) / 1000
            
            if (diffSeconds < 180) {
                return Pair("Online", true)
            } else {
                val diffMinutes = diffSeconds / 60
                val diffHours = diffMinutes / 60
                val diffDays = diffHours / 24
                
                val text = when {
                    diffMinutes < 60 -> "$diffMinutes minutes ago"
                    diffHours < 24 -> "$diffHours hours ago"
                    else -> "$diffDays days ago"
                }
                return Pair(text, false)
            }
        } catch (e2: Exception) {
            Pair("Offline", false)
        }
    }
}
