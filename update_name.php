<?php
header('Content-Type: application/json');

// Get raw POST payload
$input = json_decode(file_get_contents('php://input'), true);

if (!isset($input['username']) || !isset($input['newName'])) {
    echo json_encode(['success' => false, 'message' => 'Missing required fields']);
    exit;
}

$username = trim($input['username']);
$newName = trim($input['newName']);
$filePath = 'data/users.json';

if (!file_exists($filePath)) {
    echo json_encode(['success' => false, 'message' => 'users.json file not found']);
    exit;
}

// Read and decode JSON file
$jsonContent = file_get_contents($filePath);
$users = json_decode($jsonContent, true);
$userFound = false;

// Find user and update name
foreach ($users as &$user) {
    if (isset($user['username']) && strtolower($user['username']) === strtolower($username)) {
        $user['name'] = $newName;
        $userFound = true;
        break;
    }
}

if ($userFound) {
    // Save updated JSON array back to file with formatted indenting
    if (file_put_contents($filePath, json_encode($users, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE))) {
        echo json_encode(['success' => true, 'message' => 'Display name updated in users.json!']);
    } else {
        echo json_encode(['success' => false, 'message' => 'Failed to write to users.json']);
    }
} else {
    echo json_encode(['success' => false, 'message' => 'User not found in JSON database']);
}
?>