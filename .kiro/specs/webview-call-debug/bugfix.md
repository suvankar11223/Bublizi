# Bugfix Requirements Document

## Introduction

Calls are failing for Google signup users due to WebView JavaScript not executing inside `call.html`. While the WebView successfully loads the HTML page and the call infrastructure (socket connections, navigation, URL building) works correctly, the JavaScript code inside the WebView never runs. This prevents WebRTC peer connections from being established, leaving users unable to see or hear each other during calls.

The bug manifests as a complete absence of `[WebView Console]` logs, indicating that the JavaScript execution environment inside the WebView is either blocked or not properly initialized. This is a critical issue affecting all call functionality for Google-authenticated users.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN a call is initiated between two Google signup users THEN the WebView loads call.html but JavaScript inside the WebView does not execute

1.2 WHEN the WebView loads call.html THEN no `[WebView Console]` logs appear in the terminal output

1.3 WHEN JavaScript fails to execute in the WebView THEN the socket.io connection from call.html is never established

1.4 WHEN JavaScript fails to execute in the WebView THEN WebRTC peer connections are never created

1.5 WHEN WebRTC connections fail to establish THEN users see a blank or frozen screen instead of video feeds

1.6 WHEN WebRTC connections fail to establish THEN users cannot hear each other during the call

### Expected Behavior (Correct)

2.1 WHEN a call is initiated between two Google signup users THEN the WebView SHALL load call.html and execute all JavaScript code inside it

2.2 WHEN the WebView loads call.html THEN the system SHALL display `[WebView Console]` logs including the initial "SCRIPT LOADED" message

2.3 WHEN JavaScript executes in the WebView THEN the system SHALL establish a socket.io connection from call.html to the backend

2.4 WHEN JavaScript executes in the WebView THEN the system SHALL create WebRTC peer connections between the two users

2.5 WHEN WebRTC connections are established THEN the system SHALL display video feeds for both users

2.6 WHEN WebRTC connections are established THEN the system SHALL enable audio communication between users

### Unchanged Behavior (Regression Prevention)

3.1 WHEN call initiation occurs THEN the system SHALL CONTINUE TO generate correct MongoDB IDs (24 characters)

3.2 WHEN users connect to a call THEN the system SHALL CONTINUE TO establish socket connections successfully

3.3 WHEN an incoming call is received THEN the system SHALL CONTINUE TO trigger the incoming call notification

3.4 WHEN users accept a call THEN the system SHALL CONTINUE TO navigate both users to callScreen

3.5 WHEN call URLs are built THEN the system SHALL CONTINUE TO generate valid URLs (1024 characters)

3.6 WHEN the CallScreen component loads THEN the system SHALL CONTINUE TO display the `[CallScreen] ========== WEBVIEW MESSAGE ==========` log

3.7 WHEN a call ends THEN the system SHALL CONTINUE TO properly terminate with the `endCall` message

3.8 WHEN WebView configuration is set THEN the system SHALL CONTINUE TO include mixedContentMode, thirdPartyCookiesEnabled, and other existing props

3.9 WHEN navigation errors occur THEN the system SHALL CONTINUE TO use `router.canGoBack()` check to prevent crashes
