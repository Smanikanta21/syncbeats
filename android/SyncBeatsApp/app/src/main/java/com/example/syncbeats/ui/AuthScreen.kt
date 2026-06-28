package com.example.syncbeats.ui

import android.os.Build
import androidx.compose.animation.*
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Email
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material.icons.rounded.ArrowForward
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.blur
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.example.syncbeats.R
import com.example.syncbeats.theme.*

@Composable
fun AuthScreen(
    onLoginSuccess: () -> Unit,
    viewModel: AuthViewModel = viewModel()
) {
    var isLogin by remember { mutableStateOf(true) }
    val uiState by viewModel.uiState.collectAsState()

    val context = androidx.compose.ui.platform.LocalContext.current
    LaunchedEffect(uiState.isSuccess) {
        if (uiState.isSuccess) {
            val sessionManager = com.example.syncbeats.data.SessionManager(context)
            if (uiState.token != null) {
                sessionManager.saveAuthToken(uiState.token!!)
            }
            if (uiState.userId != null) {
                sessionManager.saveUserId(uiState.userId!!)
            }
            onLoginSuccess()
        }
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Background)
    ) {
        // Ambient background effect (Optimized: Simple blurred circles)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            Box(
                modifier = Modifier
                    .offset(x = (-50).dp, y = (-50).dp)
                    .size(200.dp)
                    .background(Color.White.copy(alpha = 0.03f), shape = RoundedCornerShape(100.dp))
                    .blur(80.dp)
            )
            Box(
                modifier = Modifier
                    .align(Alignment.BottomEnd)
                    .offset(x = 50.dp, y = 50.dp)
                    .size(250.dp)
                    .background(Color.White.copy(alpha = 0.02f), shape = RoundedCornerShape(125.dp))
                    .blur(100.dp)
            )
        }

        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(24.dp)
                .systemBarsPadding(),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center
        ) {
            // Logo
            Image(
                painter = painterResource(id = R.drawable.ic_logo),
                contentDescription = "SyncBeats Logo",
                modifier = Modifier
                    .size(80.dp)
                    .padding(bottom = 24.dp)
            )

            // Glass Panel containing the forms
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .animateContentSize()
                    .shadow(
                        elevation = 20.dp,
                        shape = RoundedCornerShape(32.dp),
                        ambientColor = Color.Black,
                        spotColor = Color.Black
                    )
                    .clip(RoundedCornerShape(32.dp))
                    .background(GlassBackground)
                    .border(1.dp, GlassBorder, RoundedCornerShape(32.dp))
                    .padding(32.dp)
            ) {
                AnimatedContent(
                    targetState = isLogin,
                    transitionSpec = {
                        slideInHorizontally(
                            initialOffsetX = { fullWidth -> if (targetState) -fullWidth else fullWidth },
                            animationSpec = tween(400)
                        ) togetherWith slideOutHorizontally(
                            targetOffsetX = { fullWidth -> if (targetState) fullWidth else -fullWidth },
                            animationSpec = tween(400)
                        )
                    }, label = "auth_form"
                ) { loginState ->
                    if (loginState) {
                        LoginForm(
                            uiState = uiState,
                            onSwitchToSignup = { 
                                isLogin = false
                                viewModel.clearError() 
                            },
                            onSubmit = { email, password -> viewModel.login(email, password) }
                        )
                    } else {
                        SignupForm(
                            uiState = uiState,
                            onSwitchToLogin = { 
                                isLogin = true
                                viewModel.clearError() 
                            },
                            onSubmit = { name, email, password -> viewModel.register(name, email, password) }
                        )
                    }
                }
            }
        }
    }
}

@Composable
fun LoginForm(
    uiState: AuthUiState,
    onSwitchToSignup: () -> Unit,
    onSubmit: (String, String) -> Unit
) {
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var showPassword by remember { mutableStateOf(false) }

    Column(modifier = Modifier.fillMaxWidth()) {
        Text(
            text = "Welcome Back",
            color = Foreground,
            fontSize = 32.sp,
            fontWeight = FontWeight.Black,
            modifier = Modifier.padding(bottom = 8.dp)
        )
        Text(
            text = "Log in to manage your synced sessions.",
            color = ForegroundMuted,
            fontSize = 14.sp,
            modifier = Modifier.padding(bottom = 16.dp)
        )

        if (uiState.error != null) {
            Text(
                text = uiState.error,
                color = Red500,
                fontSize = 14.sp,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(bottom = 16.dp)
                    .background(Red500.copy(alpha = 0.1f), RoundedCornerShape(8.dp))
                    .border(1.dp, Red500.copy(alpha = 0.2f), RoundedCornerShape(8.dp))
                    .padding(12.dp)
            )
        }

        GlassTextField(
            value = email,
            onValueChange = { email = it },
            label = "EMAIL ADDRESS",
            placeholder = "name@email.com",
            icon = Icons.Default.Email,
            keyboardType = KeyboardType.Email
        )

        Spacer(modifier = Modifier.height(24.dp))

        GlassTextField(
            value = password,
            onValueChange = { password = it },
            label = "PASSWORD",
            placeholder = "••••••••",
            icon = Icons.Default.Lock,
            isPassword = true,
            showPassword = showPassword,
            onTogglePassword = { showPassword = !showPassword }
        )

        Spacer(modifier = Modifier.height(8.dp))
        
        Text(
            text = "Forgot?",
            color = ForegroundMuted,
            fontSize = 12.sp,
            fontWeight = FontWeight.Medium,
            modifier = Modifier
                .align(Alignment.End)
                .clickable { /* Handle forgot password */ }
                .padding(4.dp)
        )

        Spacer(modifier = Modifier.height(24.dp))

        PrimaryButton(
            text = if (uiState.isLoading) "Signing in..." else "Sign In", 
            onClick = { onSubmit(email, password) },
            enabled = !uiState.isLoading,
            isLoading = uiState.isLoading
        )

        Spacer(modifier = Modifier.height(24.dp))

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.Center,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(text = "Don't have an account? ", color = ForegroundMuted, fontSize = 14.sp)
            Text(
                text = "Sign up",
                color = Foreground,
                fontSize = 14.sp,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.clickable(
                    interactionSource = remember { MutableInteractionSource() },
                    indication = null,
                    onClick = onSwitchToSignup
                )
            )
        }
    }
}

@Composable
fun SignupForm(
    uiState: AuthUiState,
    onSwitchToLogin: () -> Unit,
    onSubmit: (String, String, String) -> Unit
) {
    var name by remember { mutableStateOf("") }
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var showPassword by remember { mutableStateOf(false) }

    Column(modifier = Modifier.fillMaxWidth()) {
        Text(
            text = "Join SyncBeats",
            color = Foreground,
            fontSize = 32.sp,
            fontWeight = FontWeight.Black,
            modifier = Modifier.padding(bottom = 8.dp)
        )
        Text(
            text = "Create an account to start syncing audio.",
            color = ForegroundMuted,
            fontSize = 14.sp,
            modifier = Modifier.padding(bottom = 16.dp)
        )

        if (uiState.error != null) {
            Text(
                text = uiState.error,
                color = Red500,
                fontSize = 14.sp,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(bottom = 16.dp)
                    .background(Red500.copy(alpha = 0.1f), RoundedCornerShape(8.dp))
                    .border(1.dp, Red500.copy(alpha = 0.2f), RoundedCornerShape(8.dp))
                    .padding(12.dp)
            )
        }

        GlassTextField(
            value = name,
            onValueChange = { name = it },
            label = "FULL NAME",
            placeholder = "Your Name",
            icon = Icons.Default.Person
        )

        Spacer(modifier = Modifier.height(16.dp))

        GlassTextField(
            value = email,
            onValueChange = { email = it },
            label = "EMAIL ADDRESS",
            placeholder = "name@email.com",
            icon = Icons.Default.Email,
            keyboardType = KeyboardType.Email
        )

        Spacer(modifier = Modifier.height(16.dp))

        GlassTextField(
            value = password,
            onValueChange = { password = it },
            label = "PASSWORD",
            placeholder = "Min. 8 characters",
            icon = Icons.Default.Lock,
            isPassword = true,
            showPassword = showPassword,
            onTogglePassword = { showPassword = !showPassword }
        )

        Spacer(modifier = Modifier.height(24.dp))

        PrimaryButton(
            text = if (uiState.isLoading) "Creating account..." else "Create Account", 
            onClick = { onSubmit(name, email, password) },
            enabled = !uiState.isLoading,
            isLoading = uiState.isLoading
        )

        Spacer(modifier = Modifier.height(24.dp))

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.Center,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(text = "Already have an account? ", color = ForegroundMuted, fontSize = 14.sp)
            Text(
                text = "Sign in",
                color = Foreground,
                fontSize = 14.sp,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.clickable(
                    interactionSource = remember { MutableInteractionSource() },
                    indication = null,
                    onClick = onSwitchToLogin
                )
            )
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun GlassTextField(
    value: String,
    onValueChange: (String) -> Unit,
    label: String,
    placeholder: String,
    icon: ImageVector,
    keyboardType: KeyboardType = KeyboardType.Text,
    isPassword: Boolean = false,
    showPassword: Boolean = false,
    onTogglePassword: (() -> Unit)? = null
) {
    Column {
        Text(
            text = label,
            color = ForegroundMuted,
            fontSize = 10.sp,
            fontWeight = FontWeight.Bold,
            letterSpacing = 1.sp,
            modifier = Modifier.padding(start = 4.dp, bottom = 4.dp)
        )
        
        OutlinedTextField(
            value = value,
            onValueChange = onValueChange,
            modifier = Modifier.fillMaxWidth(),
            placeholder = { Text(text = placeholder, color = ForegroundMuted.copy(alpha = 0.5f)) },
            leadingIcon = {
                Icon(
                    imageVector = icon,
                    contentDescription = null,
                    tint = ForegroundMuted
                )
            },
            trailingIcon = if (isPassword) {
                {
                    IconButton(onClick = { onTogglePassword?.invoke() }) {
                        Icon(
                            imageVector = if (showPassword) Icons.Default.VisibilityOff else Icons.Default.Visibility,
                            contentDescription = "Toggle Password",
                            tint = ForegroundMuted
                        )
                    }
                }
            } else null,
            singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = keyboardType),
            visualTransformation = if (isPassword && !showPassword) PasswordVisualTransformation() else VisualTransformation.None,
            shape = RoundedCornerShape(16.dp),
            colors = OutlinedTextFieldDefaults.colors(
                focusedTextColor = Foreground,
                unfocusedTextColor = Foreground,
                cursorColor = Foreground,
                focusedBorderColor = AccentPrimary,
                unfocusedBorderColor = GlassBorder,
                focusedContainerColor = Color.White.copy(alpha = 0.05f),
                unfocusedContainerColor = Color.White.copy(alpha = 0.02f)
            )
        )
    }
}

@Composable
fun PrimaryButton(text: String, onClick: () -> Unit, enabled: Boolean = true, isLoading: Boolean = false) {
    Button(
        onClick = onClick,
        enabled = enabled,
        modifier = Modifier
            .fillMaxWidth()
            .height(56.dp)
            .shadow(
                elevation = 10.dp,
                shape = RoundedCornerShape(16.dp),
                ambientColor = Color.White.copy(alpha = 0.1f),
                spotColor = Color.White.copy(alpha = 0.2f)
            ),
        shape = RoundedCornerShape(16.dp),
        colors = ButtonDefaults.buttonColors(
            containerColor = Foreground,
            contentColor = Background
        )
    ) {
        Row(
            horizontalArrangement = Arrangement.Center,
            verticalAlignment = Alignment.CenterVertically
        ) {
            if (isLoading) {
                CircularProgressIndicator(
                    color = Background,
                    strokeWidth = 2.dp,
                    modifier = Modifier.size(20.dp)
                )
                Spacer(modifier = Modifier.width(8.dp))
            }
            Text(
                text = text,
                fontWeight = FontWeight.Bold,
                fontSize = 16.sp
            )
            if (!isLoading) {
                Spacer(modifier = Modifier.width(8.dp))
                Icon(
                    imageVector = Icons.Rounded.ArrowForward,
                    contentDescription = null,
                    modifier = Modifier.size(20.dp)
                )
            }
        }
    }
}
