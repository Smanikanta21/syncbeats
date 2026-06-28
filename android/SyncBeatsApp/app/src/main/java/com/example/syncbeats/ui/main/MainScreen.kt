package com.example.syncbeats.ui.main

import androidx.compose.animation.*
import androidx.compose.animation.core.*
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.text.input.ImeAction
import androidx.lifecycle.viewmodel.compose.viewModel
import coil.compose.AsyncImage
import com.example.syncbeats.network.SearchResult
import com.example.syncbeats.theme.*

enum class IslandState {
    COMPACT,
    PLAYER_EXPANDED,
    SEARCH_EXPANDED
}

@Composable
fun MainScreen(
    viewModel: SearchViewModel = viewModel(),
    audioPlayer: AudioPlayerManager,
    onNavigateToProfile: () -> Unit = {}
) {
    var isSyncBeatMode by remember { mutableStateOf(false) }
    var searchQuery by remember { mutableStateOf("") }
    
    var showFullScreenPlayer by remember { mutableStateOf(false) }
    var showDevicePicker by remember { mutableStateOf(false) }
    val context = androidx.compose.ui.platform.LocalContext.current
    val nearbyManager = remember { com.example.syncbeats.network.NearbyDeviceManager(context) }
    
    val searchResults by viewModel.searchResults.collectAsState()
    val isLoading by viewModel.isLoading.collectAsState()
    val downloadingIds by viewModel.downloadingIds.collectAsState()
    val isPlaying by audioPlayer.isPlaying.collectAsState()
    val currentTrackName by audioPlayer.currentTrackName.collectAsState()
    val progress by audioPlayer.progress.collectAsState()
    val currentPositionMs by audioPlayer.currentPositionMs.collectAsState()
    val durationMs by audioPlayer.durationMs.collectAsState()
    val recentlyAdded by viewModel.recentlyAdded.collectAsState()

    LaunchedEffect(searchQuery) {
        if (searchQuery.isNotEmpty()) {
            kotlinx.coroutines.delay(200) // Fast 200ms debounce for live typing
            viewModel.search(searchQuery)
        } else {
            viewModel.search("") // Clear results instantly when empty
        }
    }

    LaunchedEffect(Unit) {
        com.example.syncbeats.network.SocketManager.trackSetFlow.collect { data ->
            val senderId = data.optString("senderId")
            if (senderId != com.example.syncbeats.network.DeviceManager.deviceId) {
                val trackData = data.optJSONObject("track")
                if (trackData != null) {
                    val trackId = trackData.optString("id")
                    val title = trackData.optString("title")
                    val artist = trackData.optString("artist")
                    val thumbnail = trackData.optString("thumbnailURL")
                    val duration = trackData.optString("duration")
                    
                    val result = com.example.syncbeats.network.SearchResult(
                        id = trackId,
                        title = title,
                        artist = artist,
                        duration = duration,
                        thumbnail = thumbnail
                    )
                    
                    audioPlayer.isInternalSyncEvent = true
                    viewModel.downloadAndPlay(result) { file ->
                        audioPlayer.playFile(file, result.title)
                        audioPlayer.isInternalSyncEvent = false
                    }
                }
            }
        }
    }

    Scaffold(
        containerColor = Background,
        floatingActionButton = {
            if (isSyncBeatMode) {
                FloatingActionButton(
                    onClick = { /* Open Sync Bottom Sheet */ },
                    containerColor = AccentPrimary,
                    contentColor = Background,
                    modifier = Modifier.shadow(16.dp, CircleShape, ambientColor = AccentPrimary, spotColor = AccentPrimary)
                ) {
                    Icon(imageVector = Icons.Default.Devices, contentDescription = "Sync Now")
                }
            }
        }
    ) { paddingValues ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(bottom = paddingValues.calculateBottomPadding())
                .background(Background)
        ) {
            // Main Content Area
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(top = 24.dp) // Normal spacing now that island is gone
            ) {
                // Header
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 24.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = "My Library",
                        color = Foreground,
                        fontSize = 28.sp,
                        fontWeight = FontWeight.Black
                    )

                    Box(
                        modifier = Modifier
                            .size(40.dp)
                            .clip(CircleShape)
                            .background(GlassBackground)
                            .clickable { onNavigateToProfile() },
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(
                            imageVector = Icons.Default.Person,
                            contentDescription = "Profile",
                            tint = Foreground,
                            modifier = Modifier.size(24.dp)
                        )
                    }
                }

                Spacer(modifier = Modifier.height(24.dp))

                // Main Content
                LibraryTab(
                    searchQuery = searchQuery,
                    searchResults = searchResults,
                    isLoading = isLoading,
                    downloadingIds = downloadingIds,
                    recentlyAdded = recentlyAdded,
                    onSearchQueryChange = { searchQuery = it },
                    onSearchSubmit = {
                        viewModel.search(searchQuery)
                    },
                    onPlayResult = { result ->
                        audioPlayer.isInternalSyncEvent = false
                        viewModel.downloadAndPlay(result) { file ->
                            audioPlayer.playFile(file, result.title)
                            
                            val audioUrl = "http://192.168.29.61:4000/search/youtube/download?videoId=${result.id}"
                            com.example.syncbeats.network.SocketManager.emitTrackSet(
                                context,
                                result.id,
                                result.title,
                                result.artist,
                                result.thumbnail,
                                result.duration,
                                audioUrl
                            )
                        }
                    }
                )
            }

            // MiniPlayer (Fixed at bottom)
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(bottom = 16.dp),
                verticalArrangement = Arrangement.Bottom
            ) {
                MiniPlayer(
                    isPlaying = isPlaying,
                    progress = progress,
                    currentTrackName = currentTrackName,
                    onTogglePlayPause = { audioPlayer.togglePlayPause() },
                    onExpand = { showFullScreenPlayer = true }
                )
            }
            
            if (showFullScreenPlayer) {
                FullScreenPlayerSheet(
                    isPlaying = isPlaying,
                    progress = progress,
                    currentPositionMs = currentPositionMs,
                    durationMs = durationMs,
                    currentTrackName = currentTrackName,
                    onTogglePlayPause = { audioPlayer.togglePlayPause() },
                    onDismissRequest = { showFullScreenPlayer = false },
                    onOpenDevicePicker = { showDevicePicker = true }
                )
            }
            
            if (showDevicePicker) {
                DevicePickerSheet(
                    onDismissRequest = { showDevicePicker = false },
                    nearbyDeviceManager = nearbyManager
                )
            }
        }
    }
}

@Composable
fun DynamicIslandPlayer(
    islandState: IslandState,
    searchQuery: String,
    searchResults: List<SearchResult>,
    isLoading: Boolean,
    downloadingIds: Set<String>,
    isPlaying: Boolean,
    currentTrackName: String?,
    isSyncBeatMode: Boolean,
    onToggleExpanded: () -> Unit,
    onCollapse: () -> Unit,
    onPlayResult: (SearchResult) -> Unit,
    onTogglePlayPause: () -> Unit,
    onToggleSyncBeatMode: () -> Unit
) {
    val configuration = androidx.compose.ui.platform.LocalConfiguration.current
    val screenWidth = configuration.screenWidthDp.dp

    // ── Single spring config for ALL animations (symmetrical open/close) ──
    val islandSpring = spring<Float>(dampingRatio = 0.75f, stiffness = 400f)
    val dpSpring = spring<androidx.compose.ui.unit.Dp>(dampingRatio = 0.75f, stiffness = 400f)

    // ── Container shape animations ──
    val animatedWidth by animateDpAsState(
        targetValue = if (islandState != IslandState.COMPACT) screenWidth - 16.dp else 130.dp,
        animationSpec = dpSpring,
        label = "width"
    )
    val animatedHeight by animateDpAsState(
        targetValue = when (islandState) {
            IslandState.SEARCH_EXPANDED -> 420.dp
            IslandState.PLAYER_EXPANDED -> 220.dp
            IslandState.COMPACT -> 36.dp
        },
        animationSpec = dpSpring,
        label = "height"
    )
    val cornerRadius by animateFloatAsState(
        targetValue = if (islandState != IslandState.COMPACT) 32f else 18f,
        animationSpec = islandSpring,
        label = "corner"
    )

    // ── Content alpha animations (staggered crossfade) ──
    val playerAlpha by animateFloatAsState(
        targetValue = if (islandState == IslandState.PLAYER_EXPANDED) 1f else 0f,
        animationSpec = tween(
            durationMillis = if (islandState == IslandState.PLAYER_EXPANDED) 250 else 100,
            delayMillis = if (islandState == IslandState.PLAYER_EXPANDED) 150 else 0,
            easing = FastOutSlowInEasing
        ),
        label = "playerAlpha"
    )
    val searchAlpha by animateFloatAsState(
        targetValue = if (islandState == IslandState.SEARCH_EXPANDED) 1f else 0f,
        animationSpec = tween(
            durationMillis = if (islandState == IslandState.SEARCH_EXPANDED) 250 else 100,
            delayMillis = if (islandState == IslandState.SEARCH_EXPANDED) 150 else 0,
            easing = FastOutSlowInEasing
        ),
        label = "searchAlpha"
    )
    val compactAlpha by animateFloatAsState(
        targetValue = if (islandState == IslandState.COMPACT) 1f else 0f,
        animationSpec = tween(
            durationMillis = if (islandState == IslandState.COMPACT) 100 else 250,
            delayMillis = if (islandState == IslandState.COMPACT) 0 else 150,
            easing = FastOutSlowInEasing
        ),
        label = "compactAlpha"
    )

    // Auto-collapse after 5 seconds if player expanded
    LaunchedEffect(islandState) {
        if (islandState == IslandState.PLAYER_EXPANDED) {
            kotlinx.coroutines.delay(5000)
            onCollapse()
        }
    }

    Box(
        modifier = Modifier.fillMaxWidth(),
        contentAlignment = Alignment.TopCenter
    ) {
        Box(
            modifier = Modifier
                .width(animatedWidth)
                .height(animatedHeight)
                .clip(RoundedCornerShape(cornerRadius.dp))
                .background(Color.Black)
                .clickable(
                    interactionSource = remember { androidx.compose.foundation.interaction.MutableInteractionSource() },
                    indication = null,
                    onClick = { onToggleExpanded() }
                )
        ) {
            // ── Compact content layer ──
            if (compactAlpha > 0f) {
                Row(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(horizontal = 10.dp)
                        .alpha(compactAlpha),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Box(
                        modifier = Modifier
                            .size(22.dp)
                            .clip(CircleShape)
                            .background(AccentPrimary.copy(alpha = 0.25f)),
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(
                            imageVector = if (isPlaying) Icons.Default.Pause else Icons.Default.MusicNote,
                            contentDescription = null,
                            tint = AccentPrimary,
                            modifier = Modifier.size(13.dp)
                        )
                    }

                    // SyncBeat Icon in Compact Mode
                    Box(
                        modifier = Modifier
                            .size(22.dp)
                            .clip(CircleShape)
                            .clickable { onToggleSyncBeatMode() },
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(
                            imageVector = Icons.Default.Devices,
                            contentDescription = "SyncBeat Mode",
                            tint = if (isSyncBeatMode) AccentPrimary else ForegroundMuted,
                            modifier = Modifier.size(14.dp)
                        )
                    }

                    // Waveform bars
                    if (isPlaying) {
                        Row(
                            horizontalArrangement = Arrangement.spacedBy(2.5.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            repeat(3) { i ->
                                val infiniteTransition = rememberInfiniteTransition(label = "wave$i")
                                val barHeight by infiniteTransition.animateFloat(
                                    initialValue = 4f,
                                    targetValue = 12f,
                                    animationSpec = infiniteRepeatable(
                                        animation = tween(400, delayMillis = i * 120, easing = FastOutSlowInEasing),
                                        repeatMode = RepeatMode.Reverse
                                    ),
                                    label = "bar$i"
                                )
                                Box(
                                    modifier = Modifier
                                        .width(2.5.dp)
                                        .height(barHeight.dp)
                                        .clip(RoundedCornerShape(1.5.dp))
                                        .background(AccentPrimary)
                                )
                            }
                        }
                    } else {
                        // Static bars when paused
                        Row(
                            horizontalArrangement = Arrangement.spacedBy(2.5.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            repeat(3) {
                                Box(
                                    modifier = Modifier
                                        .width(2.5.dp)
                                        .height(4.dp)
                                        .clip(RoundedCornerShape(1.5.dp))
                                        .background(AccentPrimary)
                                )
                            }
                        }
                    }
                }
            }

            // ── Expanded content layer ──
            if (playerAlpha > 0f) {
                Column(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(start = 20.dp, end = 20.dp, top = 36.dp, bottom = 16.dp)
                        .alpha(playerAlpha),
                    verticalArrangement = Arrangement.SpaceBetween
                ) {
                    // Top: Album art + song info
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Box(
                            modifier = Modifier
                                .size(48.dp)
                                .clip(RoundedCornerShape(12.dp))
                                .background(AccentPrimary.copy(alpha = 0.15f)),
                            contentAlignment = Alignment.Center
                        ) {
                            Icon(
                                imageVector = Icons.Default.MusicNote,
                                contentDescription = null,
                                tint = AccentPrimary,
                                modifier = Modifier.size(24.dp)
                            )
                        }

                        Spacer(modifier = Modifier.width(14.dp))

                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                text = currentTrackName ?: "Not Playing",
                                color = Foreground,
                                fontSize = 15.sp,
                                fontWeight = FontWeight.SemiBold,
                                maxLines = 1
                            )
                            Text(
                                text = "SyncBeats",
                                color = ForegroundMuted,
                                fontSize = 12.sp
                            )
                        }

                        IconButton(onClick = onToggleSyncBeatMode, modifier = Modifier.size(40.dp)) {
                            Icon(
                                imageVector = Icons.Default.Devices,
                                contentDescription = "SyncBeat Mode",
                                tint = if (isSyncBeatMode) AccentPrimary else ForegroundMuted,
                                modifier = Modifier.size(24.dp)
                            )
                        }
                    }

                    // Middle: Progress bar
                    LinearProgressIndicator(
                        progress = { 0f },
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(3.dp)
                            .clip(RoundedCornerShape(1.5.dp)),
                        color = Foreground,
                        trackColor = Color.White.copy(alpha = 0.08f),
                    )

                    // Bottom: Controls
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceEvenly,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        IconButton(onClick = { /* Previous */ }, modifier = Modifier.size(40.dp)) {
                            Icon(
                                imageVector = Icons.Default.SkipPrevious,
                                contentDescription = "Previous",
                                tint = Foreground,
                                modifier = Modifier.size(24.dp)
                            )
                        }
                        IconButton(
                            onClick = { onTogglePlayPause() },
                            modifier = Modifier
                                .size(46.dp)
                                .clip(CircleShape)
                                .background(Foreground)
                        ) {
                            Icon(
                                imageVector = if (isPlaying) Icons.Default.Pause else Icons.Default.PlayArrow,
                                contentDescription = "Play/Pause",
                                tint = Color.Black,
                                modifier = Modifier.size(26.dp)
                            )
                        }
                        IconButton(onClick = { /* Next */ }, modifier = Modifier.size(40.dp)) {
                            Icon(
                                imageVector = Icons.Default.SkipNext,
                                contentDescription = "Next",
                                tint = Foreground,
                                modifier = Modifier.size(24.dp)
                            )
                        }
                    }
                }
            }

            // ── Search Results content layer ──
            if (searchAlpha > 0f) {
                Column(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(top = 36.dp, start = 16.dp, end = 16.dp, bottom = 16.dp)
                        .alpha(searchAlpha)
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth().padding(bottom = 12.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        IconButton(onClick = { onToggleExpanded() }, modifier = Modifier.size(32.dp)) {
                            Icon(
                                imageVector = Icons.Default.ArrowBack,
                                contentDescription = "Back",
                                tint = Foreground,
                                modifier = Modifier.size(20.dp)
                            )
                        }
                        Text(
                            text = "Results for \"$searchQuery\"",
                            color = Foreground,
                            fontSize = 16.sp,
                            fontWeight = FontWeight.Bold,
                            modifier = Modifier.padding(start = 8.dp)
                        )
                    }

                    // Results
                    if (isLoading) {
                        Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                            CircularProgressIndicator(color = AccentPrimary)
                        }
                    } else if (searchResults.isEmpty()) {
                        Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                            Text("No results found.", color = ForegroundMuted)
                        }
                    } else {
                        androidx.compose.foundation.lazy.LazyColumn(
                            modifier = Modifier.fillMaxSize(),
                            verticalArrangement = Arrangement.spacedBy(12.dp)
                        ) {
                            items(searchResults.size) { index ->
                                val result = searchResults[index]
                                    Row(
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .clip(RoundedCornerShape(16.dp))
                                            .background(Color.White.copy(alpha = 0.05f))
                                            .clickable(enabled = !downloadingIds.contains(result.id)) { onPlayResult(result) }
                                            .padding(12.dp),
                                        verticalAlignment = Alignment.CenterVertically
                                    ) {
                                    Box(
                                        modifier = Modifier
                                            .size(40.dp)
                                            .clip(RoundedCornerShape(8.dp))
                                            .background(AccentPrimary.copy(alpha = 0.2f)),
                                        contentAlignment = Alignment.Center
                                    ) {
                                        AsyncImage(
                                            model = result.thumbnail,
                                            contentDescription = null,
                                            modifier = Modifier.fillMaxSize(),
                                            contentScale = androidx.compose.ui.layout.ContentScale.Crop
                                        )
                                    }
                                    Column(modifier = Modifier.weight(1f).padding(horizontal = 12.dp)) {
                                        Text(result.title, color = Foreground, fontSize = 14.sp, fontWeight = FontWeight.SemiBold, maxLines = 1)
                                        Text(result.artist, color = ForegroundMuted, fontSize = 12.sp, maxLines = 1)
                                    }
                                    if (downloadingIds.contains(result.id)) {
                                        CircularProgressIndicator(
                                            color = AccentPrimary,
                                            modifier = Modifier.size(20.dp),
                                            strokeWidth = 2.dp
                                        )
                                    } else {
                                        Icon(
                                            imageVector = Icons.Default.Download,
                                            contentDescription = "Download & Play",
                                            tint = ForegroundMuted,
                                            modifier = Modifier.size(20.dp)
                                        )
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun LibraryTab(
    searchQuery: String,
    searchResults: List<SearchResult>,
    isLoading: Boolean,
    downloadingIds: Set<String>,
    recentlyAdded: List<SearchResult>,
    onSearchQueryChange: (String) -> Unit,
    onSearchSubmit: () -> Unit,
    onPlayResult: (SearchResult) -> Unit
) {
    val focusManager = LocalFocusManager.current

    Column(modifier = Modifier.fillMaxSize().padding(horizontal = 24.dp)) {
        // Search Bar
        OutlinedTextField(
            value = searchQuery,
            onValueChange = onSearchQueryChange,
            modifier = Modifier.fillMaxWidth(),
            placeholder = { Text(text = "Search YouTube for songs...", color = ForegroundMuted) },
            leadingIcon = {
                Icon(imageVector = Icons.Default.Search, contentDescription = null, tint = ForegroundMuted)
            },
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
            keyboardActions = KeyboardActions(onSearch = {
                focusManager.clearFocus()
                onSearchSubmit()
            }),
            shape = RoundedCornerShape(16.dp),
            colors = OutlinedTextFieldDefaults.colors(
                focusedContainerColor = GlassBackground,
                unfocusedContainerColor = GlassBackground,
                focusedBorderColor = AccentPrimary,
                unfocusedBorderColor = GlassBorder,
                focusedTextColor = Foreground,
                unfocusedTextColor = Foreground
            )
        )
        
        Spacer(modifier = Modifier.height(32.dp))

        if (searchQuery.isNotEmpty()) {
            Text(
                text = "Results for \"$searchQuery\"",
                color = Foreground,
                fontSize = 18.sp,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.padding(bottom = 16.dp)
            )

            if (isLoading) {
                Box(modifier = Modifier.fillMaxWidth().weight(1f), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(color = AccentPrimary)
                }
            } else if (searchResults.isEmpty()) {
                Box(modifier = Modifier.fillMaxWidth().weight(1f), contentAlignment = Alignment.Center) {
                    Text("No results found.", color = ForegroundMuted)
                }
            } else {
                androidx.compose.foundation.lazy.LazyColumn(
                    modifier = Modifier.fillMaxWidth().weight(1f),
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    items(searchResults.size) { index ->
                        val result = searchResults[index]
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(16.dp))
                                .background(Color.White.copy(alpha = 0.05f))
                                .clickable(enabled = !downloadingIds.contains(result.id)) { onPlayResult(result) }
                                .padding(12.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Box(
                                modifier = Modifier
                                    .size(40.dp)
                                    .clip(RoundedCornerShape(8.dp))
                                    .background(AccentPrimary.copy(alpha = 0.2f)),
                                contentAlignment = Alignment.Center
                            ) {
                                AsyncImage(
                                    model = result.thumbnail,
                                    contentDescription = null,
                                    modifier = Modifier.fillMaxSize(),
                                    contentScale = androidx.compose.ui.layout.ContentScale.Crop
                                )
                            }
                            Column(modifier = Modifier.weight(1f).padding(horizontal = 12.dp)) {
                                Text(result.title, color = Foreground, fontSize = 14.sp, fontWeight = FontWeight.SemiBold, maxLines = 1)
                                Text(result.artist, color = ForegroundMuted, fontSize = 12.sp, maxLines = 1)
                            }
                            if (downloadingIds.contains(result.id)) {
                                CircularProgressIndicator(
                                    color = AccentPrimary,
                                    modifier = Modifier.size(20.dp),
                                    strokeWidth = 2.dp
                                )
                            } else {
                                Icon(
                                    imageVector = Icons.Default.Download,
                                    contentDescription = "Download & Play",
                                    tint = ForegroundMuted,
                                    modifier = Modifier.size(20.dp)
                                )
                            }
                        }
                    }
                }
            }
        } else {
            // Import Actions
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                LibraryActionCard(
                    title = "Spotify",
                    subtitle = "Connect",
                    icon = Icons.Default.LibraryMusic,
                    onClick = { /* Spotify Connect */ },
                    modifier = Modifier.weight(1f)
                )
                LibraryActionCard(
                    title = "Upload",
                    subtitle = "Local Files",
                    icon = Icons.Default.UploadFile,
                    onClick = { /* Upload Files */ },
                    modifier = Modifier.weight(1f)
                )
            }

            Spacer(modifier = Modifier.height(16.dp))
            
            // Apple Music (Coming Soon)
            LibraryActionCard(
                title = "Apple Music",
                subtitle = "Coming Soon",
                icon = Icons.Default.QueueMusic,
                onClick = { },
                modifier = Modifier.fillMaxWidth(),
                enabled = false
            )

            Spacer(modifier = Modifier.height(32.dp))

            Text(
                text = "Recently Added Songs",
                color = Foreground,
                fontSize = 18.sp,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.padding(bottom = 16.dp)
            )

            if (recentlyAdded.isEmpty()) {
                Box(modifier = Modifier.fillMaxWidth().weight(1f), contentAlignment = Alignment.Center) {
                    Text("No offline tracks yet.", color = ForegroundMuted)
                }
            } else {
                androidx.compose.foundation.lazy.LazyColumn(
                    modifier = Modifier.fillMaxWidth().weight(1f),
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    items(recentlyAdded.size) { index ->
                        val result = recentlyAdded[index]
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(16.dp))
                                .background(Color.White.copy(alpha = 0.05f))
                                .clickable { onPlayResult(result) }
                                .padding(12.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Box(
                                modifier = Modifier
                                    .size(40.dp)
                                    .clip(RoundedCornerShape(8.dp))
                                    .background(AccentPrimary.copy(alpha = 0.2f)),
                                contentAlignment = Alignment.Center
                            ) {
                                AsyncImage(
                                    model = result.thumbnail,
                                    contentDescription = null,
                                    modifier = Modifier.fillMaxSize(),
                                    contentScale = androidx.compose.ui.layout.ContentScale.Crop
                                )
                            }
                            Column(modifier = Modifier.weight(1f).padding(horizontal = 12.dp)) {
                                Text(result.title, color = Foreground, fontSize = 14.sp, fontWeight = FontWeight.SemiBold, maxLines = 1)
                                Text(result.artist, color = ForegroundMuted, fontSize = 12.sp, maxLines = 1)
                            }
                            Icon(
                                imageVector = Icons.Default.PlayArrow,
                                contentDescription = "Play",
                                tint = AccentPrimary,
                                modifier = Modifier.size(20.dp)
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun LibraryActionCard(
    title: String, 
    subtitle: String, 
    icon: androidx.compose.ui.graphics.vector.ImageVector, 
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true
) {
    Box(
        modifier = modifier
            .clip(RoundedCornerShape(24.dp))
            .background(if (enabled) GlassBackground else Color.White.copy(alpha = 0.02f))
            .border(1.dp, if (enabled) GlassBorder else Color.Transparent, RoundedCornerShape(24.dp))
            .clickable(enabled = enabled, onClick = onClick)
            .padding(16.dp)
    ) {
        Column {
            Icon(
                imageVector = icon, 
                contentDescription = null, 
                tint = if (enabled) AccentPrimary else ForegroundMuted,
                modifier = Modifier.size(32.dp).padding(bottom = 8.dp)
            )
            Text(
                text = title,
                color = if (enabled) Foreground else ForegroundMuted,
                fontSize = 16.sp,
                fontWeight = FontWeight.Bold
            )
            Text(
                text = subtitle,
                color = ForegroundMuted,
                fontSize = 12.sp
            )
        }
    }
}

