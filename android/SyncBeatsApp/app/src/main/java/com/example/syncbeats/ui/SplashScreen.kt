package com.example.syncbeats.ui

import androidx.compose.animation.core.*
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.draw.scale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.syncbeats.theme.Background
import com.example.syncbeats.theme.Foreground
import kotlinx.coroutines.delay

@Composable
fun SplashScreen(onNavigateToNext: (Boolean) -> Unit) {
    var isVisible by remember { mutableStateOf(false) }
    val context = androidx.compose.ui.platform.LocalContext.current

    // Start visibility animation
    LaunchedEffect(Unit) {
        isVisible = true
        // Delay for the animation and splash screen duration
        delay(3000)
        val isLoggedIn = com.example.syncbeats.data.SessionManager(context).isLoggedIn()
        onNavigateToNext(isLoggedIn)
    }

    // Infinite transition for spinning and pulsing
    val infiniteTransition = rememberInfiniteTransition(label = "splash")
    
    val rotation by infiniteTransition.animateFloat(
        initialValue = 0f,
        targetValue = 360f,
        animationSpec = infiniteRepeatable(
            animation = tween(2000, easing = LinearEasing),
            repeatMode = RepeatMode.Restart
        ),
        label = "rotation"
    )

    // Pulse animation mimicking a beat
    val scale by infiniteTransition.animateFloat(
        initialValue = 0.9f,
        targetValue = 1.1f,
        animationSpec = infiniteRepeatable(
            animation = tween(400, easing = FastOutSlowInEasing),
            repeatMode = RepeatMode.Reverse
        ),
        label = "pulse"
    )

    // Initial fade in for the whole screen
    val alphaAnim = animateFloatAsState(
        targetValue = if (isVisible) 1f else 0f,
        animationSpec = tween(durationMillis = 1000),
        label = "alpha"
    )

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Background)
            .alpha(alphaAnim.value),
        contentAlignment = Alignment.Center
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center
        ) {
            // Using a simple compose icon for now, later we can use a drawn disc icon or the actual logo
            // A disc icon can be represented by a circle with a dot, but we'll use a generic icon or draw it
            Box(
                modifier = Modifier
                    .size(100.dp)
                    .scale(scale)
                    .rotate(rotation),
                contentAlignment = Alignment.Center
            ) {
                // Outer ring
                androidx.compose.foundation.Canvas(modifier = Modifier.fillMaxSize()) {
                    drawCircle(
                        color = Foreground,
                        style = androidx.compose.ui.graphics.drawscope.Stroke(width = 8.dp.toPx()),
                        alpha = 0.8f
                    )
                    // Inner ring
                    drawCircle(
                        color = Foreground,
                        radius = size.minDimension / 4,
                        style = androidx.compose.ui.graphics.drawscope.Stroke(width = 4.dp.toPx()),
                        alpha = 0.4f
                    )
                    // Center dot
                    drawCircle(
                        color = Foreground,
                        radius = size.minDimension / 10,
                        alpha = 0.9f
                    )
                }
            }

            Spacer(modifier = Modifier.height(32.dp))

            Text(
                text = "SyncBeats",
                color = Foreground,
                fontSize = 32.sp,
                fontWeight = FontWeight.Black,
                letterSpacing = 2.sp
            )
        }
    }
}
